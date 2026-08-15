/**
 * web_app/src/liveSession.js
 * ----------------------------------------------------------------------------
 * Gemini Live API 세션 관리자.
 *
 * 흐름:
 *   1) 서버에서 ephemeral token을 받아옵니다 (프롬프트/도구는 서버가 잠금)
 *   2) WebSocket으로 연결
 *   3) 마이크 오디오를 흘려보내고, 음성/자막/도구호출을 받아 처리
 *   4) 유휴 상태가 길어지면 끊고, 다시 말하면 세션을 이어붙임(resume)
 *
 * ⚠️ 반드시 지켜야 할 것들 (공식 문서의 함정들):
 *   - realtimeInput에 `media` 키를 쓰면 안 됩니다. `audio`/`text`를 써야 합니다.
 *   - 서버 이벤트 하나에 오디오와 자막이 같이 올 수 있습니다. 전부 순회해야 합니다.
 *   - function calling은 동기입니다. 도구 응답을 보내기 전까지 모델이 말을 안 합니다.
 *     → 도구 핸들러에서 절대 await/네트워크 호출을 하지 마세요.
 *   - 세션은 약 10분이면 끊깁니다. sessionResumption으로 이어야 합니다.
 * ----------------------------------------------------------------------------
 */
 
import { base64ToBytes, bytesToInt16 } from './pcm.js';
import { AUDIO } from './config.js';
 
/** SDK를 CDN에서 불러옵니다. 한 곳이 죽어도 되게 후보를 여러 개 둡니다. */
const SDK_SOURCES = [
  'https://esm.sh/@google/genai@2.15.0',
  'https://cdn.jsdelivr.net/npm/@google/genai@2.15.0/+esm',
  'https://esm.run/@google/genai@2.15.0',
];
 
let sdkPromise = null;
 
async function loadSdk() {
  if (sdkPromise) return sdkPromise;
 
  sdkPromise = (async () => {
    let lastError;
    for (const url of SDK_SOURCES) {
      try {
        const mod = await import(/* @vite-ignore */ url);
        if (mod?.GoogleGenAI) {
          console.info('[live] SDK 로드 성공:', url);
          return mod;
        }
        lastError = new Error('GoogleGenAI export 없음');
      } catch (err) {
        console.warn('[live] SDK 로드 실패:', url, err?.message);
        lastError = err;
      }
    }
    throw new Error(
      'Gemini SDK를 불러올 수 없습니다. 인터넷 연결을 확인해 주세요. ' +
      `(${lastError?.message || 'unknown'})`
    );
  })();
 
  return sdkPromise;
}
 
/** connect()가 이 시간 안에 끝나지 않으면 포기합니다. */
const CONNECT_TIMEOUT_MS = 15_000;
 
/**
 * 절대 끝나지 않을 수 있는 약속에 시간 제한을 겁니다.
 *
 * Gemini SDK의 live.connect()는 setupComplete를 기다리는데, 소켓이 그 전에
 * 죽으면 그 약속은 영영 resolve도 reject도 되지 않습니다. 그대로 두면
 * 앱의 재연결 플래그가 영구히 잠겨 통화가 끝날 때까지 복구되지 않습니다.
 *
 * ⚠️ 타임아웃 이후 뒤늦게 성공한 세션만 닫아야 합니다.
 *    "아직 대입 안 된 세션은 닫는다" 식으로 판단하면, 이 콜백이 race보다
 *    먼저 실행되기 때문에 **정상 연결도 즉시 닫혀** 앱이 전혀 작동하지 않습니다.
 *
 * @param {Promise<any>} promise
 * @param {number} ms
 * @param {string} message
 * @param {(value:any)=>void} [onLateSuccess] 타임아웃 후 도착한 값을 정리하는 콜백
 */
/**
 * 인식 결과 조각을 버퍼에 이어붙입니다.
 *
 * 서버는 보통 **늘어난 부분만**(delta) 보냅니다. 그런데 끼어들기가 나거나
 * 인식이 수정될 때는 **지금까지 전체**를 다시 보내기도 합니다.
 * 그걸 그냥 += 하면 같은 말이 두 번 붙습니다.
 *   "I like" + "I like apples" → "I likeI like apples"
 * 이게 화면에 "내가 한 말이 반복되서" 보이는 가장 직접적인 형태입니다.
 *
 * 그래서 새 조각이 지금 버퍼로 시작하면(= 전체를 다시 보낸 것) 이어붙이지
 * 않고 통째로 교체합니다.
 */
export function appendTranscriptChunk(buffer, chunk) {
  if (!chunk) return buffer;
  if (!buffer) return chunk;
  // 전체를 다시 보낸 경우
  if (chunk.startsWith(buffer)) return chunk;
  // ⚠️ "끝이 겹치면 합친다"는 규칙은 **넣지 않습니다.**
  //    처음엔 넣었다가, 같은 말을 세 번 하면 두 번으로 줄어드는 걸
  //    발견했습니다("I like apples" ×3 → ×2). 따라 말하기 연습에서
  //    세 번 반복은 아주 흔합니다.
  //    말이 두 번 보이는 것보다 **한 말이 사라지는 게 훨씬 나쁩니다.**
  //    진짜 재전송은 위의 startsWith 로 대부분 잡히고, 남는 건
  //    app.js 의 중복 합치기가 화면 단계에서 처리합니다.
  return buffer + chunk;
}
 
export function withTimeout(promise, ms, message, onLateSuccess) {
  let timer;
  let timedOut = false;
 
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => {
      timedOut = true;
      reject(new Error(message));
    }, ms);
  });
 
  promise
    .then((value) => {
      if (timedOut && value) onLateSuccess?.(value);
    })
    .catch(() => {});
 
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}
 
/** 세션 상태 */
export const LiveState = {
  IDLE: 'idle',
  CONNECTING: 'connecting',
  LIVE: 'live',
  RECONNECTING: 'reconnecting',
  ERROR: 'error',
};
 
export class LiveSession {
  /**
   * 이 모델에서 실제로 통한 설정 사다리 단계 (클래스 전체가 공유).
   * 한 번 찾으면 이후 접속은 곧바로 그 단계에서 시작합니다.
   */
  static _workingRung = 0;
 
  /**
   * @param {object} handlers
   * @param {(pcm16: Int16Array) => void}      handlers.onAudio        선생님 음성 조각
   * @param {(text: string, final: boolean) => void} handlers.onUserText    내가 한 말 (자막)
   * @param {(text: string, final: boolean) => void} handlers.onTeacherText 선생님 말 (자막)
   * @param {(name: string, args: object) => object} handlers.onToolCall   교육 도구 (동기!)
   * @param {() => void}                       handlers.onInterrupted  내가 끼어들었을 때
   * @param {() => void}                       handlers.onTurnComplete 선생님 한 턴 끝
   * @param {(state: string, info?: object) => void} handlers.onState
   */
  constructor(handlers) {
    this.h = handlers;
 
    this.session = null;
    this.state = LiveState.IDLE;
    this.profileId = null;
    this.model = null;
 
    /** 세션을 이어붙이기 위한 핸들 */
    this.resumeHandle = null;
    /** 서버가 곧 끊는다고 알려줬는지 */
    this.goingAway = false;
 
    /** 자막 누적 버퍼 (조각으로 오기 때문에 이어붙여야 함) */
    this._userBuffer = '';
    this._teacherBuffer = '';
 
    this._closedByUs = false;
    this._reconnectAttempts = 0;
 
    /**
     * 소켓 세대 번호.
     * 이전 소켓의 close/error 이벤트가 한 박자 늦게 도착해서
     * 지금 살아있는 소켓을 죽여버리는 사고를 막습니다.
     */
    this._connGen = 0;
 
    /**
     * 지금 서버에 "말하는 중"이라고 알린 상태인지.
     *
     * 이 짝이 어긋나면 대화가 통째로 망가집니다:
     *   start 없이 오디오를 보내면 → 서버가 그 소리를 어디에 붙일지 모릅니다
     *   start 없이 end만 보내면    → 프로토콜 오류로 세션이 끊길 수 있습니다
     * 그래서 여기서 상태를 들고 있으면서 중복/고아 신호를 막습니다.
     */
    this._activityOpen = false;
  }
 
  _setState(state, info) {
    this.state = state;
    this.h.onState?.(state, info);
  }
 
  /**
   * 세션을 엽니다.
   * @param {string} profileId
   * @param {object} context  { recentSummary, knownWords, todayMission }
   */
  async connect(profileId, context = {}) {
    if (this.state === LiveState.CONNECTING || this.state === LiveState.LIVE) return;
 
    this.profileId = profileId;
    this._closedByUs = false;
    // 새 소켓은 아무것도 모릅니다. 이전 세션의 발화 상태를 물려받으면 안 됩니다.
    this._activityOpen = false;
    /**
     * ⚠️ 인식 버퍼도 반드시 비웁니다.
     *
     * 예전에는 disconnect() 에서만 비웠습니다. 그런데 소켓이 우리가 아니라
     * **서버 쪽 사정으로 끊기면**(세션 시간 제한, goAway, 네트워크 끊김)
     * disconnect() 가 호출되지 않습니다. 그러면 아직 turnComplete 를 못 받은
     * 인식 결과가 버퍼에 그대로 남고, 다음 세션의 첫 인식 결과가 거기에
     * 이어붙습니다. 화면에는 **아까 한 말이 다시 나타나서** 이번 말 앞에
     * 붙습니다. ("내가 한 말이 반복되서 인식" / "하지 않은 말이 계속 추가")
     */
    this._userBuffer = '';
    this._teacherBuffer = '';
    this._setState(LiveState.CONNECTING);
 
    // ── 1. 서버에서 임시 토큰 받기 ─────────────────────────────────────
    const res = await fetch('/api/live-token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ profileId, context }),
    });
 
    const payload = await res.json().catch(() => ({}));
 
    if (!res.ok || !payload.token) {
      /* 서버가 내려준 hint 를 **반드시** 사람이 읽는 메시지로 씁니다.
         예전에는 "토큰 발급 실패 (500)" 만 보여줬는데, 실제 원인은
         Vercel 환경변수 이름 오타(GEMINI_API_KE — 끝에 Y 가 빠짐)였습니다.
         숫자만 봐서는 알 방법이 없어 한참을 엉뚱한 곳에서 헤맸습니다. */
      const message = payload.hint || payload.message || `토큰 발급 실패 (${res.status})`;
      const err = new Error(message);
      /* 설정이 잘못된 경우(키 없음·키 오류)는 몇 번을 다시 해도 똑같습니다.
         호출한 쪽이 재시도를 **멈출 수 있도록** 표시해 둡니다.
         이게 없으면 마이크 프레임마다 토큰을 다시 받으러 가서
         초당 수십 번 실패하는 무한 루프가 됩니다. */
      err.permanent = res.status >= 400 && res.status < 600 && res.status !== 429;
      this._setState(LiveState.ERROR, { message });
      throw err;
    }
 
    this.model = payload.model;
    // 서버가 알려준 "말 끝 판단 대기 시간"을 위로 전달합니다
    if (payload.endOfSpeechMs) this.h.onVadConfig?.(payload.endOfSpeechMs);
 
    // ── 2. Live API 연결 ─────────────────────────────────────────────
    const { GoogleGenAI } = await loadSdk();
 
    const ai = new GoogleGenAI({
      apiKey: payload.token,
      // ephemeral token은 v1alpha에서만 동작합니다.
      httpOptions: { apiVersion: 'v1alpha' },
    });
 
    /* 설정(프롬프트/도구/음성)을 서버에서 받아 그대로 setup 프레임에 실어 보냅니다.
       (예전에는 토큰에 잠겨 있었지만, 그 방식이 field_mask 오류를 일으켰습니다) */
    const baseConfig = {
      ...(payload.config || {}),
      sessionResumption: this.resumeHandle ? { handle: this.resumeHandle } : {},
    };
 
    /* ⚠️ 설정 사다리(config ladder).
     *
     * Live API 는 모델·버전에 따라 **지원하지 않는 설정 필드**가 있고,
     * 그런 필드가 하나라도 있으면 연결을 통째로 거부합니다(INVALID_ARGUMENT).
     * 어느 필드가 문제인지 오류만 봐서는 알 수 없습니다.
     *
     * 그래서 거부당하면 의심스러운 순서대로 하나씩 빼고 다시 시도합니다.
     * 성공하면 어떤 것을 뺐을 때 됐는지 콘솔과 진단 화면에 남깁니다.
     * 이렇게 하면 **배포 한 번으로** 원인을 찾을 수 있습니다.
     * (배포하고 → 안 되고 → 또 고치고 를 반복하지 않으려는 장치입니다)
     */
    const LADDER = [
      { label: '전체 설정', strip: (c) => c },
      { label: 'thinkingConfig 제거', strip: (c) => { const x = { ...c }; delete x.thinkingConfig; return x; } },
      { label: '+ inputAudioTranscription 단순화', strip: (c) => {
          const x = { ...c }; delete x.thinkingConfig;
          if (x.inputAudioTranscription) x.inputAudioTranscription = {};
          return x; } },
      { label: '+ contextWindowCompression 제거', strip: (c) => {
          const x = { ...c }; delete x.thinkingConfig; delete x.contextWindowCompression;
          if (x.inputAudioTranscription) x.inputAudioTranscription = {};
          return x; } },
      { label: '+ temperature 제거', strip: (c) => {
          const x = { ...c }; delete x.thinkingConfig; delete x.contextWindowCompression;
          delete x.temperature;
          if (x.inputAudioTranscription) x.inputAudioTranscription = {};
          return x; } },
      { label: '+ tools 제거 (가르치기 카드 없이)', strip: (c) => {
          const x = { ...c }; delete x.thinkingConfig; delete x.contextWindowCompression;
          delete x.temperature; delete x.tools;
          if (x.inputAudioTranscription) x.inputAudioTranscription = {};
          return x; } },
      { label: '최소 설정 (음성만)', strip: (c) => ({
          responseModalities: ['AUDIO'],
          systemInstruction: c.systemInstruction,
          speechConfig: c.speechConfig,
          realtimeInputConfig: c.realtimeInputConfig,
          sessionResumption: c.sessionResumption,
        }) },
    ];
 
    /* 한 번 성공한 단계는 기억해서, 다음 접속부터는 곧바로 그 단계로 갑니다.
       (매번 실패부터 시작하면 접속이 느려집니다)                        */
    const startAt = LiveSession._workingRung ?? 0;
    const config = LADDER[startAt].strip(baseConfig);
 
    // 이 소켓의 세대 번호. 콜백은 자기 세대일 때만 동작합니다.
    const gen = ++this._connGen;
    const isCurrent = () => gen === this._connGen;
 
    try {
      // ⚠️ SDK의 live.connect()는 setupComplete를 기다리는데, 그 약속은
      //    소켓이 그 전에 죽어도 **영원히 resolve/reject 되지 않습니다**.
      //    (만료된 토큰, 1007 설정 거부, 핸드셰이크 중 네트워크 끊김)
      //    그대로 두면 app.js의 reconnecting 플래그가 영구히 true로 남아
      //    통화가 끝날 때까지 다시는 연결되지 않습니다. 반드시 타임아웃을 겁니다.
      const session = await withTimeout(this._connectWithLadder(ai, LADDER, baseConfig, startAt, {
          onopen: () => {
            if (!isCurrent()) return;
            this._reconnectAttempts = 0;
            this.goingAway = false;
            // ⚠️ 여기서 LIVE로 바꾸면 안 됩니다.
            //    onopen은 WebSocket이 열린 시점이고, connect()는 setupComplete
            //    이후에야 resolve됩니다. 그 사이(100~300ms)에 LIVE라고 알리면
            //    session이 아직 없어서 첫 마디가 그대로 버려집니다.
          },
          onmessage: (message) => {
            if (!isCurrent()) return;
            this._handleMessage(message);
          },
          onerror: (err) => {
            if (!isCurrent()) return;
            console.error('[live] 에러', err);
            // 에러가 났는데 소켓 참조를 남겨두면, 재연결 시 그 소켓이
            // 주인을 잃은 채 계속 열려 있게 됩니다(= 계속 과금).
            try { this.session?.close(); } catch {}
            this.session = null;
            this._setState(LiveState.ERROR, { message: err?.message || '연결 오류' });
          },
          onclose: (event) => {
            if (!isCurrent()) return;
            console.info('[live] 연결 종료', event?.reason || '');
            this.session = null;
            if (!this._closedByUs) {
              this._setState(LiveState.IDLE, { reason: event?.reason });
            }
          },
        }), CONNECT_TIMEOUT_MS, '서버 응답이 없어 연결을 포기했습니다 (15초)',
        // 타임아웃 후 뒤늦게 열린 소켓은 주인이 없으므로 닫아줍니다 (계속 과금 방지)
        (late) => { try { late.close(); } catch {} });
 
      // 연결하는 동안 사용자가 통화를 끊었거나 다른 세션이 시작됐다면
      // 이 소켓은 주인이 없습니다. 그냥 두면 요금이 계속 나갑니다.
      if (!isCurrent() || this._closedByUs) {
        try { session.close(); } catch {}
        return;
      }
 
      this.session = session;
      // session이 실제로 쓸 수 있게 된 지금이 LIVE입니다.
      this._setState(LiveState.LIVE);
    } catch (err) {
      // 이미 통화가 끝났거나 더 새로운 연결이 진행 중이면 조용히 무시합니다.
      // (안 그러면 프로필 화면에 엉뚱한 에러가 뜹니다)
      if (!isCurrent() || this._closedByUs) return;
      const message = this._explainConnectError(err);
      this._setState(LiveState.ERROR, { message });
      throw new Error(message);
    }
  }
 
  /**
   * 설정 사다리를 타고 내려가며 연결을 시도합니다.
   *
   * 설정이 거부됐을 때(INVALID_ARGUMENT / 1007)만 다음 단계로 내려갑니다.
   * 인증 실패·네트워크 오류 같은 건 설정 문제가 아니므로 즉시 포기합니다.
   * (그런 걸로 사다리를 다 타면 원인을 더 헷갈리게 만듭니다)
   */
  async _connectWithLadder(ai, ladder, baseConfig, startAt, callbacks) {
    let lastErr = null;
 
    for (let i = startAt; i < ladder.length; i++) {
      const rung = ladder[i];
      const cfg = rung.strip(baseConfig);
      try {
        const session = await ai.live.connect({
          model: this.model,
          config: cfg,
          callbacks,
        });
 
        // 성공. 이 단계를 기억해서 다음 접속은 곧바로 여기서 시작합니다.
        if (LiveSession._workingRung !== i) {
          LiveSession._workingRung = i;
          if (i > 0) {
            console.warn(
              `[live] 설정 사다리: "${rung.label}" 단계에서 연결 성공. ` +
              '이 모델이 위 단계의 설정 필드를 지원하지 않습니다.'
            );
          }
        }
        this.activeConfigLabel = rung.label;
        return session;
      } catch (err) {
        lastErr = err;
        const raw = String(err?.message || err);
        const isConfigRejection =
          /INVALID_ARGUMENT|field_mask|1007|invalid/i.test(raw);
 
        if (!isConfigRejection) throw err;   // 설정 문제가 아니면 바로 포기
 
        console.warn(`[live] 설정 거부됨 (${rung.label}) → 다음 단계 시도: ${raw.slice(0, 160)}`);
      }
    }
 
    throw lastErr || new Error('모든 설정 조합이 거부되었습니다');
  }
 
  _explainConnectError(err) {
    const raw = String(err?.message || err);
    if (/1007|invalid|INVALID_ARGUMENT/i.test(raw)) {
      return `세션 설정이 거부되었습니다. 모델(${this.model})이 이 설정을 지원하지 않을 수 있습니다. (${raw})`;
    }
    if (/401|403|UNAUTHENTICATED|PERMISSION/i.test(raw)) {
      return '인증에 실패했습니다. 토큰이 만료되었을 수 있습니다. 다시 시도해 주세요.';
    }
    if (/network|failed to fetch|ECONN/i.test(raw)) {
      return '네트워크 연결을 확인해 주세요.';
    }
    return raw;
  }
 
  /**
   * 서버 메시지 처리.
   * 한 이벤트에 여러 종류가 동시에 들어올 수 있으므로 순서대로 전부 확인합니다.
   */
  _handleMessage(message) {
    // ── 세션 이어붙이기 핸들 갱신 ──────────────────────────────────
    if (message.sessionResumptionUpdate) {
      const update = message.sessionResumptionUpdate;
      if (update.resumable && update.newHandle) {
        this.resumeHandle = update.newHandle;
      }
    }
 
    // ── 서버가 곧 연결을 끊는다고 알려줌 ───────────────────────────
    if (message.goAway) {
      this.goingAway = true;
      console.info('[live] 서버가 곧 연결을 종료합니다', message.goAway.timeLeft);
    }
 
    // ── 교육 도구 호출 (동기로 즉시 응답해야 함) ───────────────────
    if (message.toolCall?.functionCalls?.length) {
      const responses = [];
      for (const call of message.toolCall.functionCalls) {
        let result;
        try {
          // ⚠️ 여기서 절대 await 하지 마세요. 모델이 그동안 말을 못 합니다.
          result = this.h.onToolCall?.(call.name, call.args || {}) || { ok: true };
        } catch (err) {
          console.error('[live] 도구 처리 실패', call.name, err);
          result = { ok: false, error: String(err?.message || err) };
        }
        responses.push({ id: call.id, name: call.name, response: result });
      }
      try {
        this.session?.sendToolResponse({ functionResponses: responses });
      } catch (err) {
        console.error('[live] 도구 응답 전송 실패', err);
      }
    }
 
    const content = message.serverContent;
    if (!content) return;
 
    // ── 내가 끼어들었음 → 예약된 음성 전부 폐기 ────────────────────
    if (content.interrupted) {
      this._teacherBuffer = '';
      // ⚠️ 사용자 버퍼도 비워야 합니다.
      //    끼어들기가 나면 turnComplete가 안 올 수 있는데, 그러면
      //    이전 발화가 버퍼에 남아 다음 말에 계속 붙습니다.
      //    ("내가 하지 않은 말이 계속 추가되는" 증상의 원인)
      this._flushUserBuffer();
      this.h.onInterrupted?.();
    }
 
    // ── 내가 한 말 (음성인식 결과) ─────────────────────────────────
    if (content.inputTranscription?.text) {
      this._userBuffer = appendTranscriptChunk(this._userBuffer, content.inputTranscription.text);
      this.h.onUserText?.(this._userBuffer, false);
    }
 
    // ── 선생님이 한 말 (자막) ──────────────────────────────────────
    if (content.outputTranscription?.text) {
      this._teacherBuffer = appendTranscriptChunk(
        this._teacherBuffer, content.outputTranscription.text
      );
      this.h.onTeacherText?.(this._teacherBuffer, false);
    }
 
    // ── 선생님 음성 조각 ──────────────────────────────────────────
    // ⚠️ message.data 는 SDK의 **getter** 로, modelTurn.parts 안의 오디오를
    //    이어붙여 돌려줍니다. 둘 다 처리하면 같은 소리가 두 번 재생됩니다.
    //    (음성이 겹쳐 들리고 사용량도 2배로 계산됩니다) → 반드시 else if.
    if (typeof message.data === 'string' && message.data.length) {
      this._emitAudio(message.data);
    } else if (content.modelTurn?.parts?.length) {
      for (const part of content.modelTurn.parts) {
        // inlineData가 오디오일 때만 (텍스트 파트가 섞여올 수 있음)
        if (part.inlineData?.data && /audio/i.test(part.inlineData.mimeType || 'audio')) {
          this._emitAudio(part.inlineData.data);
        }
      }
    }
 
    // ── 턴 종료 ──────────────────────────────────────────────────
    if (content.turnComplete) {
      this._flushUserBuffer();
      if (this._teacherBuffer.trim()) {
        this.h.onTeacherText?.(this._teacherBuffer.trim(), true);
      }
      this._teacherBuffer = '';
      this.h.onTurnComplete?.();
    }
  }
 
  _emitAudio(base64) {
    try {
      const pcm16 = bytesToInt16(base64ToBytes(base64));
      if (pcm16.length) this.h.onAudio?.(pcm16);
    } catch (err) {
      console.warn('[live] 오디오 디코딩 실패', err);
    }
  }
 
  /** 마이크 프레임 전송 (base64 PCM16 16kHz) */
  sendAudio(base64Pcm) {
    if (this.state !== LiveState.LIVE || !this.session) return;
    try {
      this.session.sendRealtimeInput({
        audio: { data: base64Pcm, mimeType: `audio/pcm;rate=${AUDIO.INPUT_SAMPLE_RATE}` },
      });
    } catch (err) {
      // 세션이 이미 닫힌 경우 — 조용히 무시하고 재연결 로직이 처리하게 함
      if (!/closed|CLOSING/i.test(String(err?.message))) {
        console.warn('[live] 오디오 전송 실패', err);
      }
    }
  }
 
  /**
   * 말의 시작을 서버에 알립니다.
   *
   * 서버 자동 VAD를 끄고 우리가 직접 신호를 보냅니다.
   * 침묵을 잘라 보내면서 자동 VAD에 맡기면, 서버는 끊긴 조각을 전부
   * 이어붙여 하나의 발화로 취급해 턴이 영영 끝나지 않습니다.
   *
   * @returns {boolean} **실제로 서버에 보냈으면** true.
   *   이미 열려 있어 아무것도 안 보냈으면 false 입니다.
   *   호출부가 이 값으로 진단 숫자를 세기 때문에, "열려 있다"가 아니라
   *   "보냈다"를 뜻해야 start/end 짝이 맞습니다. (예전에는 중복 호출에도
   *   true 를 돌려줘서, ✋ 를 두 번 누르면 진단 화면이 "턴이 안 닫히고
   *   있습니다"라고 거짓 경고를 냈습니다)
   */
  sendActivityStart() {
    if (this.state !== LiveState.LIVE || !this.session) return false;
    if (this._activityOpen) return false;   // 이미 열려 있으면 중복 전송 금지
 
    // 새 발화가 시작되므로 앞 발화의 자막을 여기서 확정합니다.
    // (끝날 때 확정하면, 늦게 도착하는 인식 결과가 새 버퍼에 들어가
    //  같은 문장이 두 줄로 쪼개집니다)
    this._flushUserBuffer();
 
    try {
      this.session.sendRealtimeInput({ activityStart: {} });
      this._activityOpen = true;
      return true;
    } catch (err) {
      console.warn('[live] activityStart 실패', err);
      return false;
    }
  }
 
  /** 말이 끝났음을 알립니다 → 서버가 응답을 시작합니다 */
  sendActivityEnd() {
    if (this.state !== LiveState.LIVE || !this.session) return false;
    if (!this._activityOpen) return false;  // 시작하지 않았으면 끝낼 것도 없음
 
    this._activityOpen = false;
    try {
      this.session.sendRealtimeInput({ activityEnd: {} });
      return true;
    } catch (err) {
      console.warn('[live] activityEnd 실패', err);
      return false;
    }
  }
 
  /** 지금 서버에 "말하는 중"이라고 알린 상태인지 */
  get isActivityOpen() {
    return this._activityOpen;
  }
 
  _flushUserBuffer() {
    const text = this._userBuffer.trim();
    this._userBuffer = '';
    if (text) this.h.onUserText?.(text, true);
  }
 
  /**
   * 텍스트로 말 걸기 (키보드 입력, 롤플레이 시작 등)
   *
   * ⚠️ 서버 자동 감지를 껐기 때문에, 발화 구간 **밖으로** 보낸 입력은
   *    버려지거나 다음 발화에 들러붙습니다. 들러붙으면 입력한 문장이
   *    다음에 말한 내용과 합쳐져서, 하지도 않은 말이 붙은 것처럼 보입니다.
   *    그래서 반드시 시작/끝으로 감싸서 하나의 완결된 턴으로 보냅니다.
   */
  sendText(text) {
    if (this.state !== LiveState.LIVE || !this.session || !text?.trim()) return;
    try {
      // ⚠️ 여기서 발화 구간을 닫으려면 **마이크 쪽에도 알려야** 합니다.
      //    세션만 닫으면 마이크는 계속 열린 줄 알고 오디오를 흘려보내는데,
      //    그건 구간 밖이라 서버가 버립니다 (= 말하던 문장이 사라집니다).
      //    그래서 호출부(app.js)가 mic.closeActivity()를 먼저 부릅니다.
      //    여기서는 혹시 남아 있을 구간만 정리합니다.
      this.sendActivityEnd();
      this.sendActivityStart();
      this.session.sendRealtimeInput({ text: text.trim() });
      this.sendActivityEnd();
    } catch (err) {
      console.warn('[live] 텍스트 전송 실패', err);
    }
  }
 
  /** 세션 종료. 대화 맥락(resumeHandle)은 유지합니다. */
  async disconnect({ keepContext = true } = {}) {
    this._closedByUs = true;
    // 말하던 도중에 끊겼다면, 화면에 보이던 내 말을 기록으로 남겨줍니다
    this._flushUserBuffer();
    this._activityOpen = false;
    if (!keepContext) this.resumeHandle = null;
 
    // 이 소켓의 콜백을 은퇴시킵니다.
    // 늦게 도착하는 close 이벤트가 다음 소켓을 죽이지 않게 하기 위해서입니다.
    this._connGen++;
 
    try { this.session?.close(); } catch {}
    this.session = null;
    this._teacherBuffer = '';
    this._setState(LiveState.IDLE);
  }
 
  /** 대화 맥락까지 완전히 초기화 */
  resetContext() {
    this.resumeHandle = null;
  }
 
  get isLive() {
    return this.state === LiveState.LIVE && !!this.session;
  }
}
