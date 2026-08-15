/**
 * web_app/src/chatSession.js
 * ----------------------------------------------------------------------------
 * liveSession.js 를 대체합니다. **바깥에서 보이는 모양은 똑같습니다.**
 *
 * 왜 갈아끼웠나:
 *   Gemini Live API(실시간 음성)가 이 계정에서 열리지 않는 것을 확인했습니다.
 *   Live API 는 WebSocket 을 열어두고 오디오를 계속 흘려보내는 방식인데,
 *   여기서는 그걸 **한 턴씩 주고받는 방식**으로 바꿉니다.
 *
 *      아이 말(오디오 모음) ──▶ /api/talk  ──▶ 받아쓴 말 + 선생님 대사
 *                                  │
 *                        선생님 대사 ──▶ /api/tts ──▶ 24kHz PCM
 *                                                        │
 *                                                   player.js (그대로)
 *
 * ⭐ 왜 클래스 이름과 신호(onAudio/onTeacherText/...)를 그대로 뒀나:
 *   app.js·player.js·avatar3d.js 가 전부 이 규격에 맞춰져 있습니다.
 *   규격을 유지하면 3D 아바타 874줄과 립싱크를 **한 줄도 건드리지 않아도**
 *   됩니다. 이름을 바꾸는 순간 고장날 수 있는 지점이 수십 개 늘어납니다.
 *
 * ⚠️ Live API 시절과 달라진 점 (알고 있어야 하는 것):
 *   - 진짜 '끼어들기'는 없습니다. 선생님 대사가 이미 통째로 만들어진 뒤에
 *     재생되기 때문입니다. ✋ 버튼은 재생을 끊는 것으로 동작합니다.
 *   - 대화 맥락을 이제 **이 파일이** 들고 있습니다. 서버가 기억하지 않습니다.
 * ----------------------------------------------------------------------------
 */

import { AUDIO } from './config.js';

/** 세션 상태 — liveSession.js 와 같은 값을 씁니다 (app.js가 이 이름으로 비교합니다) */
export const LiveState = {
  IDLE: 'idle',
  CONNECTING: 'connecting',
  LIVE: 'live',
  RECONNECTING: 'reconnecting',
  ERROR: 'error',
};

/* ═══════════════════════════════════════════════════════════════════════════
   오디오 형식 변환
   ═══════════════════════════════════════════════════════════════════════════ */

/** base64 → Uint8Array */
function b64ToBytes(b64) {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

/** Uint8Array → base64 (큰 배열에서 스택이 터지지 않게 조각내서 처리) */
function bytesToB64(bytes) {
  let bin = '';
  const CHUNK = 0x8000;
  for (let i = 0; i < bytes.length; i += CHUNK) {
    bin += String.fromCharCode.apply(null, bytes.subarray(i, i + CHUNK));
  }
  return btoa(bin);
}

/**
 * 마이크가 보내준 PCM16 조각들을 하나의 WAV 파일로 묶습니다.
 *
 * 왜 WAV 로 감싸나:
 *   Gemini 에 오디오를 올릴 때는 형식을 알려줘야 합니다. 헤더 없는 생 PCM 을
 *   보내면 샘플레이트를 모르니 목소리가 느려지거나 빨라진 채로 인식됩니다.
 *   WAV 헤더 44바이트만 붙이면 그 문제가 사라집니다.
 */
function framesToWavBase64(frames, sampleRate) {
  let total = 0;
  for (const f of frames) total += f.length;

  const buffer = new ArrayBuffer(44 + total * 2);
  const view = new DataView(buffer);
  const writeStr = (off, s) => { for (let i = 0; i < s.length; i++) view.setUint8(off + i, s.charCodeAt(i)); };

  writeStr(0, 'RIFF');
  view.setUint32(4, 36 + total * 2, true);
  writeStr(8, 'WAVE');
  writeStr(12, 'fmt ');
  view.setUint32(16, 16, true);        // fmt 청크 크기
  view.setUint16(20, 1, true);         // PCM
  view.setUint16(22, 1, true);         // mono
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true); // 초당 바이트
  view.setUint16(32, 2, true);         // 블록 정렬
  view.setUint16(34, 16, true);        // 비트 깊이
  writeStr(36, 'data');
  view.setUint32(40, total * 2, true);

  let off = 44;
  for (const f of frames) {
    for (let i = 0; i < f.length; i++) { view.setInt16(off, f[i], true); off += 2; }
  }
  return bytesToB64(new Uint8Array(buffer));
}

/* ═══════════════════════════════════════════════════════════════════════════
   세션
   ═══════════════════════════════════════════════════════════════════════════ */

export class ChatSession {
  /**
   * @param {object} handlers  liveSession.js 와 동일한 규격
   * @param {(pcm16: Int16Array) => void}            handlers.onAudio
   * @param {(text: string, final: boolean) => void} handlers.onUserText
   * @param {(text: string, final: boolean) => void} handlers.onTeacherText
   * @param {(name: string, args: object) => object} handlers.onToolCall
   * @param {() => void}                             handlers.onInterrupted
   * @param {() => void}                             handlers.onTurnComplete
   * @param {(state: string, info?: object) => void} handlers.onState
   * @param {(ms: number) => void}                   handlers.onVadConfig
   * @param {(text: string) => void}                 handlers.onLadderStep
   */
  constructor(handlers) {
    this.h = handlers || {};

    this.state = LiveState.IDLE;
    this.profileId = null;
    this.context = {};

    /* Live API 시절 세션 재개용 핸들. 이제는 항상 null 입니다.
       app.js 가 진단 화면에서 이 값을 읽으므로 필드는 남겨둡니다. */
    this.resumeHandle = null;

    /** 이번 발화 동안 모은 마이크 조각들 (Int16Array 배열) */
    this._frames = [];
    /** 지금 "말하는 중"으로 열려 있는지. 중복 start / 고아 end 를 막습니다. */
    this._activityOpen = false;
    /** 서버 왕복이 진행 중인지. 겹쳐 보내면 대답이 뒤섞입니다. */
    this._busy = false;

    /**
     * 왕복이 도는 동안(1~3초) 아이가 한 말을 담아두는 곳.
     *
     * ⚠️ 여기가 이 파일에서 가장 위험한 지점입니다.
     *    Live API 때는 연결이 열려 있어서 언제 말해도 서버가 받았습니다.
     *    지금은 한 번에 한 턴만 돌기 때문에, 대답을 기다리는 사이에 한 말을
     *    그냥 버리기 쉽습니다. 그런데 아이는 **분명히 말했는데 아무 반응이 없는**
     *    상황을 만나고, 부모도 화면만 봐서는 원인을 알 수 없습니다.
     *    (예전에 하드코딩 폴백이 조용히 끼어들어서 고친 프롬프트가 한 번도
     *     실행되지 않았던 사고와 같은 종류입니다.)
     *    그래서 버리지 않고 모아뒀다가, 지금 턴이 끝나면 곧바로 이어서 보냅니다.
     */
    this._pendingFrames = null;

    /** 대화 맥락. Live API 때는 서버가 기억했지만 이제 여기서 들고 있습니다. */
    this._history = [];

    /** 턴이 영영 안 끝나는 것을 막는 워치독 */
    this._watchdog = null;

    /** TTS 가 실패해서 브라우저 음성으로 때우고 있는 중인지 */
    this._usingBrowserVoice = false;
  }

  get isLive() {
    return this.state === LiveState.LIVE;
  }

  _setState(state, info) {
    this.state = state;
    this.h.onState?.(state, info);
  }

  /* ── 연결 ────────────────────────────────────────────────────────────── */

  async connect(profileId, context = {}) {
    this.profileId = profileId;
    this.context = context || {};
    this._setState(LiveState.CONNECTING);
    this.h.onLadderStep?.('선생님을 준비하고 있어요...');

    let info;
    try {
      const res = await fetch('/api/session', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ profileId, context: this.context }),
      });
      info = await res.json().catch(() => ({}));

      if (!res.ok) {
        /* ⚠️ 조용히 넘어가지 않습니다. 서버가 준 hint 를 그대로 화면에 올립니다.
           예전에 "토큰 발급 실패 (500)" 만 떠서 원인을 찾는 데 한참 걸렸습니다. */
        this._setState(LiveState.ERROR, {
          message: info?.hint || info?.message || `서버 오류 (${res.status})`,
          status: res.status,
        });
        return false;
      }
    } catch (err) {
      this._setState(LiveState.ERROR, {
        message: `서버에 연결하지 못했습니다: ${err?.message || err}`,
      });
      return false;
    }

    // 아이마다 "말이 끝났다"고 볼 때까지 기다리는 시간이 다릅니다 (서버가 정함)
    if (Number.isFinite(info?.endOfSpeechMs)) {
      this.h.onVadConfig?.(info.endOfSpeechMs);
    }

    this._setState(LiveState.LIVE, info);

    /* 처음 연결이면 선생님이 먼저 인사합니다.
       재연결(isResume)일 때는 하지 않습니다 — 같은 인사를 반복하면
       아이 눈에는 앱이 고장난 것처럼 보입니다. */
    if (!this.context.isResume) {
      void this._runTurn({
        seedText: '(The student just joined the call. Greet them warmly in one short line and ask one easy question.)',
        silentUser: true,
      });
    }
    return true;
  }

  async disconnect({ keepContext = false } = {}) {
    clearTimeout(this._watchdog);
    this._watchdog = null;
    this._activityOpen = false;
    this._frames = [];
    this._pendingFrames = null;
    this._busy = false;
    if (!keepContext) this._history = [];
    this._setState(LiveState.IDLE);
  }

  /** 대화 맥락을 비웁니다 (단계가 바뀌었을 때 등) */
  resetContext() {
    this._history = [];
  }

  /* ── 마이크에서 오는 신호 ──────────────────────────────────────────── */

  /**
   * "지금부터 말합니다".
   * @returns {boolean} 실제로 받아들였는지 (app.js 가 진단 숫자를 셉니다)
   */
  sendActivityStart() {
    if (!this.isLive || this._activityOpen) return false;
    /* 왜 _busy 여도 받아들이나:
       선생님 대답을 기다리는 사이에도 아이는 말을 합니다. 여기서 막으면
       마이크는 계속 오디오를 보내는데 받는 곳이 없어서 통째로 사라집니다.
       받아두고 지금 턴이 끝난 뒤에 이어서 보냅니다. */
    this._activityOpen = true;
    this._frames = [];
    return true;
  }

  /** 마이크 조각 (base64 PCM16 16kHz) */
  sendAudio(base64Pcm) {
    if (!this._activityOpen) return false;
    try {
      const bytes = b64ToBytes(base64Pcm);
      this._frames.push(new Int16Array(bytes.buffer, bytes.byteOffset, bytes.byteLength >> 1));
    } catch (err) {
      console.warn('[chat] 마이크 조각을 해석하지 못했습니다', err);
      return false;
    }
    return true;
  }

  /** "말이 끝났습니다" → 여기서 한 턴이 실제로 돌아갑니다. */
  sendActivityEnd() {
    if (!this._activityOpen) return false;
    this._activityOpen = false;

    const frames = this._frames;
    this._frames = [];

    let total = 0;
    for (const f of frames) total += f.length;

    /* 너무 짧으면 보내지 않습니다. 문 닫는 소리 한 번에 요금이 나가고,
       선생님이 "Sorry?" 만 반복하게 됩니다. (0.3초 미만) */
    if (total < AUDIO.INPUT_SAMPLE_RATE * 0.3) return false;

    /* 앞 턴이 아직 안 끝났으면 버리지 않고 모아둡니다. @see this._pendingFrames */
    if (this._busy) {
      this._stashPending(frames);
      return true;
    }

    void this._runTurn({ frames });
    return true;
  }

  /**
   * 대답을 기다리는 동안 들어온 말을 모아둡니다.
   * 여러 번 말했으면 이어붙입니다 ("I like..." (뜸) "...apples" 는 한 문장입니다).
   * 다만 무한정 쌓으면 요청이 너무 커지므로 최근 15초만 남깁니다.
   */
  _stashPending(frames) {
    const MAX_SAMPLES = AUDIO.INPUT_SAMPLE_RATE * 15;
    const merged = [...(this._pendingFrames || []), ...frames];

    let total = 0;
    for (const f of merged) total += f.length;
    while (merged.length > 1 && total > MAX_SAMPLES) {
      total -= merged.shift().length;   // 오래된 것부터 버립니다
    }

    this._pendingFrames = merged;

    /* 눈에 보이게 알립니다. 말없이 삼키면 아이는 두 번 말하게 되고,
       부모는 "말했는데 왜 대답이 없냐"의 원인을 못 찾습니다. */
    this._setState(LiveState.LIVE, { message: '방금 한 말도 들었어요. 잠깐만요.' });
  }

  /** 힌트 버튼·키보드로 글자를 보낼 때 */
  sendText(text) {
    const clean = String(text || '').trim();
    if (!clean || !this.isLive) return false;
    void this._runTurn({ seedText: clean });
    return true;
  }

  /* ── 한 턴 ───────────────────────────────────────────────────────────── */

  /**
   * @param {object}  opts
   * @param {Int16Array[]} [opts.frames]      아이가 말한 오디오
   * @param {string}  [opts.seedText]         오디오 대신 보낼 글자
   * @param {boolean} [opts.silentUser]       화면에 사용자 발화로 표시하지 않음(인사 등)
   */
  async _runTurn({ frames, seedText, silentUser = false }) {
    if (this._busy) return;
    this._busy = true;

    /* 왜: 서버가 응답을 영영 안 주면 앱이 "생각 중" 상태에 갇힙니다.
       Live API 때 onend 가 안 오는 사고를 겪었으므로, 모든 비동기 경로에
       워치독을 겁니다. 그리고 발동했다는 사실을 반드시 로그에 남깁니다. */
    clearTimeout(this._watchdog);
    this._watchdog = setTimeout(() => {
      console.warn('[chat] 워치독 발동 — 한 턴이 25초 안에 끝나지 않았습니다');
      this._busy = false;
      this._setState(LiveState.LIVE, { message: '응답이 너무 늦어요. 다시 말해 주세요.' });
      this.h.onTurnComplete?.();
    }, 25_000);

    try {
      const payload = {
        profileId: this.profileId,
        context: this.context,
        history: this._history.slice(-12),
      };
      if (frames && frames.length) {
        payload.audio = framesToWavBase64(frames, AUDIO.INPUT_SAMPLE_RATE);
        payload.audioMimeType = 'audio/wav';
      } else {
        payload.text = seedText || '';
      }

      const res = await fetch('/api/talk', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = await res.json().catch(() => ({}));

      if (!res.ok) {
        console.error('[chat] /api/talk 실패', res.status, data);
        this._setState(LiveState.LIVE, {
          message: data?.hint || `선생님이 대답하지 못했어요 (${res.status})`,
          error: true,
        });
        return;
      }

      // 1) 아이가 한 말 (자막·기록용)
      const heard = String(data.userText || seedText || '').trim();
      if (heard && !silentUser) {
        this.h.onUserText?.(heard, true);
        this._history.push({ role: 'user', text: heard });
      }

      // 2) 교육 도구 (단어 카드 등). 동기 함수입니다.
      for (const call of data.toolCalls || []) {
        try { this.h.onToolCall?.(call.name, call.args); }
        catch (err) { console.warn('[chat] 도구 실행 실패', call.name, err); }
      }

      // 3) 선생님 대사 — 소리보다 **먼저** 자막을 띄웁니다.
      //    TTS 왕복이 1초 남짓 걸리는데, 그동안 화면이 비어 있으면
      //    아이는 앱이 멈춘 줄 압니다.
      const reply = String(data.reply || '').trim();
      if (!reply) return;

      this.h.onTeacherText?.(reply, true);
      this._history.push({ role: 'teacher', text: reply });

      // 4) 소리로 바꿔서 재생
      await this._speak(reply);

    } catch (err) {
      console.error('[chat] 턴 처리 중 오류', err);
      this._setState(LiveState.LIVE, { message: `오류가 났어요: ${err?.message || err}`, error: true });
    } finally {
      clearTimeout(this._watchdog);
      this._watchdog = null;
      this._busy = false;
      this.h.onTurnComplete?.();

      /* 기다리는 동안 아이가 한 말이 있으면 곧바로 이어서 처리합니다.
         ⚠️ 여기서 바로 부르면 턴이 길어질수록 호출이 안쪽으로 계속 쌓입니다.
            한 박자 뒤로 미뤄서 평평하게 만듭니다. */
      const pending = this._pendingFrames;
      this._pendingFrames = null;
      if (pending && this.isLive) {
        setTimeout(() => { void this._runTurn({ frames: pending }); }, 0);
      }
    }
  }

  /* ── 목소리 ──────────────────────────────────────────────────────────── */

  async _speak(text) {
    try {
      const res = await fetch('/api/tts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text, profileId: this.profileId }),
      });
      const data = await res.json().catch(() => ({}));

      if (!res.ok || !data.audio) {
        console.error('[chat] /api/tts 실패', res.status, data);
        this._fallbackToBrowserVoice(text, data?.hint || `TTS 오류 (${res.status})`);
        return;
      }

      /* 정상 경로로 돌아왔으면 폴백 배지를 내립니다. */
      if (this._usingBrowserVoice) {
        this._usingBrowserVoice = false;
        this._setState(LiveState.LIVE, { message: '선생님 목소리가 돌아왔어요.' });
      }

      /* base64 PCM16 → Int16Array.
         ⚠️ sampleRate 가 24000 이 아니면 목소리가 느려지거나 다람쥐처럼
            들립니다. 다르면 재생하지 말고 알려주는 편이 낫습니다. */
      if (data.sampleRate && data.sampleRate !== AUDIO.OUTPUT_SAMPLE_RATE) {
        console.warn(
          `[chat] TTS 샘플레이트가 ${data.sampleRate}Hz 입니다. ` +
          `재생기는 ${AUDIO.OUTPUT_SAMPLE_RATE}Hz 를 기대합니다.`
        );
      }

      const bytes = b64ToBytes(data.audio);
      const pcm16 = new Int16Array(bytes.buffer, bytes.byteOffset, bytes.byteLength >> 1);

      /* 재생기가 커서로 이어붙여 예약하므로 통째로 넘겨도 끊기지 않습니다.
         다만 아바타 립싱크가 조각마다 갱신되므로 잘라서 넘깁니다.
         (0.1초 = 2400 샘플) */
      const CHUNK = AUDIO.OUTPUT_SAMPLE_RATE / 10;
      for (let i = 0; i < pcm16.length; i += CHUNK) {
        this.h.onAudio?.(pcm16.subarray(i, Math.min(i + CHUNK, pcm16.length)));
      }
    } catch (err) {
      console.error('[chat] TTS 요청 실패', err);
      this._fallbackToBrowserVoice(text, String(err?.message || err));
    }
  }

  /**
   * Gemini TTS 가 안 될 때의 최후 수단.
   *
   * ⚠️ **반드시 눈에 보이게 알립니다.** 말없이 대신 대답하는 폴백은
   *    버그보다 나쁩니다. 예전에 하드코딩 오프라인 응답이 조용히 끼어들어서,
   *    고친 프롬프트가 한 번도 실행되지 않았는데 아무도 몰랐습니다.
   */
  _fallbackToBrowserVoice(text, reason) {
    if (!this._usingBrowserVoice) {
      this._usingBrowserVoice = true;
      this._setState(LiveState.LIVE, {
        message: '선생님 목소리를 못 불러와서 기본 목소리로 읽고 있어요.',
        fallback: 'browser-tts',
        reason,
      });
    }

    if (typeof speechSynthesis === 'undefined') return;
    try {
      const u = new SpeechSynthesisUtterance(text);
      u.lang = 'en-US';
      u.rate = 0.95;
      speechSynthesis.cancel();
      speechSynthesis.speak(u);
    } catch (err) {
      console.warn('[chat] 브라우저 음성도 실패했습니다', err);
    }
  }
}

/* 이름을 바꾸면 app.js 가 못 찾습니다. 옛 이름도 함께 내보냅니다. */
export { ChatSession as LiveSession };
