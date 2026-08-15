/**
 * web_app/src/mic.js
 * ----------------------------------------------------------------------------
 * 마이크 캡처 + 침묵 게이트.
 *
 * 여기가 이 앱의 요금을 결정하는 곳입니다.
 *
 * Gemini Live는 "흘려보낸 오디오"만큼 과금합니다. 그런데 영어 학습 대화는
 * 침묵이 절반 이상입니다 (단어 떠올리기, 생각하기, 선생님 말 듣기).
 * 그 침묵을 안 보내면 입력 요금이 그대로 반토막 이하로 떨어집니다.
 *
 * 다만 무작정 끊으면 안 됩니다:
 *   - 말이 시작되는 첫 음절이 잘리면 안 됨      → 선행 버퍼(preroll)로 해결
 *   - 서버가 "말 끝났음"을 감지해야 함           → 꼬리 침묵(tail)은 보내줌
 *
 * 상태 기계:
 *   IDLE ──(에너지↑)──▶ SPEAKING ──(에너지↓)──▶ TAIL ──(2.4초)──▶ IDLE
 *                          ▲                      │
 *                          └────(에너지↑)─────────┘
 * ----------------------------------------------------------------------------
 */

import { AUDIO, COST } from './config.js';
import { SilenceGate, GateState } from './gate.js';

/**
 * "진짜 말"로 인정하는 최소 발화 시간.
 *
 * 이만큼 소리가 이어지기 전에는 서버에 **아무것도 알리지 않고** 오디오를
 * 손에 들고만 있습니다. 확정되면 들고 있던 걸 한꺼번에 보내고,
 * 확정되지 않으면 통째로 버립니다.
 *
 * 왜 필요한가: 서버 자동 감지를 껐기 때문에 activityStart/End 가 곧
 * "대답해"라는 신호입니다. 문 닫는 소리 0.08초에 선생님이 대답해버리면
 * 대화를 계속 끊고 들어옵니다. 게다가 이제 선생님이 말하는 동안에도
 * 마이크가 열려 있으므로(끼어들기 모드), 이 경로는 매 문장마다 열립니다.
 *
 * ⚠️ 이 값은 **아주 인색하게** 잡아야 합니다.
 *    아이 말을 삼키는 것이 소음에 한 번 대답하는 것보다 훨씬 나쁩니다.
 *    소음에 대답하면 아이는 웃고 넘어가지만, 말을 삼키면 아이는 몇 번을
 *    말해도 아무 반응이 없는 앱 앞에 앉아 있게 되고 원인도 알 수 없습니다.
 *
 *    160ms = 80ms 프레임 2개. 걸러내려는 건 딱 하나 — **한 프레임짜리
 *    충격음**(문 닫는 소리, 책상 두드리는 소리)입니다. 그보다 조금이라도
 *    이어지는 소리는 전부 통과시킵니다.
 *
 *    처음에 200ms(=3프레임)로 잡았다가, 짧은 한 단어("Cat!")가 통째로
 *    사라지는 걸 검사에서 잡아냈습니다. 게이트가 TAIL로 내려가면 speech가
 *    false가 되어 카운터가 멈추기 때문입니다. 2프레임이면 그 함정에 걸리는
 *    실제 발화가 사실상 없습니다.
 */
const MIN_UTTERANCE_MS = 160;

/** 확정을 기다리며 들고 있을 수 있는 최대 오디오 (이만큼 지나면 소음으로 판단) */
const MAX_HOLD_MS = 1200;

/**
 * 확정 시간을 셀 때, 그 소리가 **자기 자신의 최고음 대비** 얼마나 유지되는지.
 *
 * 이게 없으면 확정 기준이 사실상 무력합니다. 게이트의 발화 판정선은
 * 주변 소음 기준이라 아주 낮습니다(예: 0.0045). 그래서 문 닫는 소리(0.09)의
 * **잔향 꼬리**(0.0025, 최고음의 3%)도 "말하는 중"으로 세어져서,
 * 두 프레임이면 그대로 확정되어 버립니다.
 *
 * 사람 말은 소리가 붙어 있는 동안 최고음에서 크게 떨어지지 않지만,
 * 충격음은 한 프레임 만에 −25dB 이하로 곤두박질칩니다. 그 차이를 봅니다.
 * 0.15 ≈ −16dB.
 */
const SUSTAIN_RATIO = 0.15;

/**
 * 선생님이 말하는 동안 발화 문턱을 몇 배로 올릴지.
 * 스피커에서 새어 들어오는 소리는 대개 직접 말하는 소리보다 훨씬 작습니다.
 */
const DUCK_FACTOR = 3.5;
import { float32ToPcm16, int16ToBytes, bytesToBase64, rms, resamplePcm16 } from './pcm.js';

/** AudioWorklet 프로세서 코드. Blob URL로 넣어서 파일 의존성을 없앱니다. */
const WORKLET_SRC = `
class FrameCollector extends AudioWorkletProcessor {
  constructor(options) {
    super();
    this.frameSize = options.processorOptions.frameSize;
    this.buffer = new Float32Array(this.frameSize);
    this.filled = 0;
  }
  process(inputs) {
    const input = inputs[0];
    if (!input || !input[0]) return true;
    const channel = input[0];
    for (let i = 0; i < channel.length; i++) {
      this.buffer[this.filled++] = channel[i];
      if (this.filled === this.frameSize) {
        // 복사해서 보냅니다 (transfer하면 다음 프레임에서 버퍼가 사라짐)
        this.port.postMessage(this.buffer.slice(0));
        this.filled = 0;
      }
    }
    return true;
  }
}
registerProcessor('frame-collector', FrameCollector);
`;

export class MicStream {
  /**
   * @param {object} opts
   * @param {(base64Pcm: string) => void} opts.onAudioFrame  전송할 오디오 프레임
   * @param {(level: number, speaking: boolean) => void} [opts.onLevel] 마이크 레벨 표시용
   * @param {(ms: number) => void} [opts.onStreamedMs] 실제로 전송한 시간 누적 (요금 계산)
   * @param {(kind: 'start'|'end') => void} [opts.onActivity] 말의 시작/끝 신호
   */
  constructor(opts) {
    this.onAudioFrame = opts.onAudioFrame;
    this.onLevel = opts.onLevel || (() => {});
    this.onStreamedMs = opts.onStreamedMs || (() => {});
    this.onActivity = opts.onActivity || (() => {});
    /**
     * 시계. 테스트에서 시간을 직접 흘려보내기 위한 이음새입니다.
     * (실제 앱에서는 항상 Date.now 입니다)
     */
    this.now = opts.now || (() => Date.now());

    this.audioContext = null;
    this.mediaStream = null;
    this.workletNode = null;
    this.sourceNode = null;

    this.running = false;
    /** 반이중(안전) 모드에서 선생님이 말할 때 true → 아예 전송하지 않음 */
    this.suppressed = false;
    /**
     * 탭이 가려져 있음. suppressed 와 **반드시 분리해야** 합니다.
     *
     * 예전에는 둘이 같은 변수였습니다. 그래서 탭을 가린 뒤 선생님 음성이
     * 다 재생되면 onSpeakingChange(false)가 억제를 풀어버렸고, 보이지도 않는
     * 탭에서 생활소음이 계속 집계되어 아이의 하루 한도를 갉아먹었습니다.
     */
    this.pageHidden = false;
    /** 선생님이 지금 말하는 중인지 (스피커 누출을 관찰할 구간) */
    this.teacherSpeaking = false;

    this.prerollFrames = [];
    this.lastSpeechAt = 0;

    /**
     * 발화 확정 대기 상태.
     * 게이트는 열렸지만 아직 "진짜 말"인지 확인되지 않은 구간입니다.
     * 이 동안의 오디오는 heldFrames 에 들고만 있고 서버로 보내지 않습니다.
     */
    this.pendingOpen = false;
    this.heldFrames = [];
    this.confirmedMs = 0;
    this.heldMs = 0;
    /** 들고 있는 구간의 최고 음량 (충격음과 사람 말을 구분하는 기준) */
    this.heldPeak = 0;
    /** 서버에 "말 시작"을 알린 상태인지 (고아 end 방지) */
    this.serverOpen = false;
    /** 지금 보내고 있는 발화의 최대 음량 (진단용) */
    this.utterancePeak = 0;

    /**
     * duck 을 푸는 데 두는 지연.
     * 실사 영상(Simli) 모드에서는 소리가 우리 재생기가 아니라 Simli의
     * <audio>에서 나옵니다. 재생기 기준으로 "말 끝남"을 판단하면 실제
     * 스피커에서는 아직 선생님 목소리가 나오는 중이라, 그 꼬리를 낮아진
     * 문턱으로 잡아 선생님이 자기 목소리에 대답하게 됩니다.
     */
    this.duckReleaseMs = 150;
    this._duckTimer = null;

    /**
     * 침묵 게이트 (순수 로직 — gate.js).
     * 브라우저 API에 의존하지 않으므로 Node에서 그대로 테스트합니다.
     */
    this.gate = new SilenceGate({
      noiseDevK: COST.NOISE_DEV_K,
      minSpeechRms: COST.MIN_SPEECH_RMS,
      maxSpeechRms: COST.MAX_SPEECH_RMS,
      silenceTailMs: COST.SILENCE_TAIL_MS,
      maxContinuousStreamMs: COST.MAX_CONTINUOUS_STREAM_MS,
      enabled: COST.SILENCE_GATE_ENABLED,
    });

    this.frameMs = (AUDIO.FRAME_SAMPLES / AUDIO.INPUT_SAMPLE_RATE) * 1000; // 80ms
    this.maxPrerollFrames = Math.max(1, Math.ceil(COST.PREROLL_MS / this.frameMs));

    /** 브라우저가 16kHz AudioContext를 못 만들면 여기서 리샘플 */
    this.needsResample = false;
    this.actualSampleRate = AUDIO.INPUT_SAMPLE_RATE;
  }

  async start() {
    if (this.running) return;

    this.mediaStream = await navigator.mediaDevices.getUserMedia({
      audio: {
        // 스피커로 들을 때 에코를 브라우저가 먼저 걸러줍니다.
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true,
        channelCount: 1,
      },
      video: false,
    });

    // 16kHz로 직접 열면 리샘플링이 아예 필요 없습니다.
    try {
      this.audioContext = new AudioContext({ sampleRate: AUDIO.INPUT_SAMPLE_RATE });
    } catch {
      this.audioContext = new AudioContext();
    }
    if (this.audioContext.state === 'suspended') {
      await this.audioContext.resume();
    }

    this.actualSampleRate = this.audioContext.sampleRate;
    this.needsResample = this.actualSampleRate !== AUDIO.INPUT_SAMPLE_RATE;
    if (this.needsResample) {
      console.warn(
        `[mic] 브라우저가 ${AUDIO.INPUT_SAMPLE_RATE}Hz를 거부했습니다 ` +
        `(실제 ${this.actualSampleRate}Hz). JS에서 리샘플합니다.`
      );
    }

    // 실제 컨텍스트 레이트에 맞춰 프레임 크기를 조정 (항상 80ms 단위 유지)
    const frameSize = Math.round((this.actualSampleRate * this.frameMs) / 1000);

    const blobUrl = URL.createObjectURL(new Blob([WORKLET_SRC], { type: 'application/javascript' }));
    try {
      await this.audioContext.audioWorklet.addModule(blobUrl);
    } finally {
      URL.revokeObjectURL(blobUrl);
    }

    this.sourceNode = this.audioContext.createMediaStreamSource(this.mediaStream);
    this.workletNode = new AudioWorkletNode(this.audioContext, 'frame-collector', {
      numberOfInputs: 1,
      numberOfOutputs: 0,
      processorOptions: { frameSize },
    });

    this.workletNode.port.onmessage = (event) => this._handleFrame(event.data);
    this.sourceNode.connect(this.workletNode);

    this.running = true;
    this.teacherSpeaking = false;
    this.gate.reset();
    this.prerollFrames = [];
    this._discardHeld();
    this.serverOpen = false;
    this.lastSpeechAt = this.now();
  }

  /**
   * 다른 앱/탭에 갔다가 돌아왔을 때 AudioContext를 되살립니다.
   * iOS는 백그라운드로 가면 AudioContext를 suspended로 바꾸고,
   * 돌아와도 자동으로 재개되지 않아서 마이크가 죽은 채로 남습니다.
   */
  async resume() {
    if (this.audioContext && this.audioContext.state === 'suspended') {
      try {
        await this.audioContext.resume();
      } catch (err) {
        console.warn('[mic] AudioContext 재개 실패', err);
      }
    }
  }

  /**
   * 선생님이 말하는 동안 마이크를 어떻게 다룰지.
   *
   * @param {boolean} teacherSpeaking
   * @param {'barge'|'mute'} mode
   *   barge — 문턱만 올립니다. 스피커에서 새어 나온 선생님 목소리로는 안 열리지만
   *           앞에서 직접 말하면 열립니다. **끼어들 수 있습니다.** (기본)
   *   mute  — 완전히 끕니다. 에코가 심한 환경에서만.
   *           이 모드에서는 선생님 말이 끝날 때까지 말할 수 없습니다.
   */
  setTeacherSpeaking(teacherSpeaking, mode = 'barge') {
    this.teacherSpeaking = !!teacherSpeaking;
    if (mode === 'barge') {
      // 마이크는 계속 열어둡니다. 문턱만 올려서 에코를 걸러냅니다.
      // ⚠️ pageHidden 은 절대 건드리지 않습니다 (숨긴 탭이 되살아납니다).
      this.suppressed = false;
      this._setDuck(teacherSpeaking ? DUCK_FACTOR : 1);
      return;
    }

    // ── mute 모드 (안전 모드) ────────────────────────────────────────
    this._cancelDuckTimer();
    this.gate.setDuck(1);
    if (this.suppressed === teacherSpeaking) return;
    this.suppressed = teacherSpeaking;

    if (teacherSpeaking) this._closeHard();
  }

  /** 탭이 가려짐/돌아옴. 선생님 발화 억제와 **별개**로 관리합니다. */
  setPageHidden(hidden) {
    if (this.pageHidden === !!hidden) return;
    this.pageHidden = !!hidden;
    if (this.pageHidden) this._closeHard();
  }

  /** 예전 이름 (mute 모드로 동작) */
  setSuppressed(suppressed) {
    this.setTeacherSpeaking(suppressed, 'mute');
  }

  /** 지금 마이크가 막혀 있는지 (선생님 발화 억제 또는 탭 숨김) */
  _muted() {
    return this.suppressed || this.pageHidden;
  }

  /** 열려 있던 걸 즉시 닫고, 필요하면 서버에 end 를 알립니다. */
  _closeHard() {
    const wasOpen = this.gate.close();
    // 서버에 start 를 알린 적 있을 때만 end 를 보냅니다 (고아 end 방지)
    if (wasOpen && this.serverOpen) {
      this.serverOpen = false;
      this.onActivity('end');
    }
    this._discardHeld();
    this.prerollFrames = [];
    this.onLevel(0, false);
  }

  _discardHeld() {
    this.pendingOpen = false;
    this.heldFrames = [];
    this.confirmedMs = 0;
    this.heldMs = 0;
    this.heldPeak = 0;
  }

  /** duck 을 걸거나(즉시) 풉니다(지연). @see duckReleaseMs */
  _setDuck(factor) {
    this._cancelDuckTimer();
    if (factor > 1) {
      this.gate.setDuck(factor);
      return;
    }
    if (this.duckReleaseMs > 0) {
      this._duckTimer = setTimeout(() => {
        this._duckTimer = null;
        this.gate.setDuck(1);
      }, this.duckReleaseMs);
      return;
    }
    this.gate.setDuck(1);
  }

  _cancelDuckTimer() {
    if (this._duckTimer) { clearTimeout(this._duckTimer); this._duckTimer = null; }
  }

  /**
   * duck 을 푸는 지연 시간. 실사 영상 모드는 스피커 소리가 우리 재생기보다
   * 늦게 끝나므로 길게 잡습니다.
   */
  setDuckReleaseMs(ms) {
    this.duckReleaseMs = Math.max(0, Math.min(2000, Number(ms) || 0));
  }

  /**
   * "끼어들기" — 사용자가 지금 말하겠다고 명시적으로 누른 경우.
   * 소리 크기와 무관하게 발화 구간을 열고, 확정 대기 없이 바로 흘려보냅니다.
   */
  forceSpeak() {
    this._cancelDuckTimer();
    this.gate.setDuck(1);
    this.suppressed = false;
    // 탭이 가려진 상태에서 누를 수는 없지만, 눌렸다면 열어주는 게 맞습니다
    this.pageHidden = false;

    const opened = this.gate.forceOpen(this.now());
    if (!opened && this.serverOpen) return false; // 이미 열려 있고 서버도 앎

    // 들고 있던 것 + 선행 버퍼를 확정 없이 즉시 내보냅니다
    this.pendingOpen = false;
    const frames = [...this.prerollFrames, ...this.heldFrames];
    this.heldFrames = [];
    this.prerollFrames = [];
    this.confirmedMs = MIN_UTTERANCE_MS;
    this.heldMs = 0;

    this.serverOpen = true;
    this.onActivity('start');
    for (const frame of frames) this._send(frame);
    this.lastSpeechAt = this.now();
    return true;
  }

  /** 마지막으로 사람이 말한 시각 이후 흐른 시간 (유휴 자동 종료 판단용) */
  msSinceLastSpeech() {
    return this.now() - this.lastSpeechAt;
  }

  _handleFrame(float32Frame) {
    if (!this.running) return;

    const level = rms(float32Frame);

    if (this._muted()) {
      this.onLevel(0, false);
      return;
    }

    // 선생님이 말하는 동안 마이크에 들어오는 소리 = 스피커 누출.
    // **진단 숫자로만** 씁니다 (문턱 계산에는 절대 쓰지 않습니다).
    // 내보내기 파일에 "이어폰을 쓰세요"라고 알려줄 근거가 됩니다.
    if (this.teacherSpeaking && this.gate.state === GateState.IDLE) {
      this.gate.observeEcho(level);
    }

    const now = this.now();
    const decision = this.gate.process(level, now);

    if (decision.speech) this.lastSpeechAt = now;

    /* ── 1. 게이트가 막 열렸다 → 아직 서버에는 알리지 않습니다 ────────
       진짜 말인지 MIN_UTTERANCE_MS 동안 확인부터 합니다.
       그 사이 오디오는 손에 들고만 있습니다 (로컬이라 요금 0원).        */
    if (decision.activity === 'start') {
      this.pendingOpen = true;
      this.confirmedMs = 0;
      this.heldMs = 0;
      this.heldPeak = 0;
      this.heldFrames = decision.flushPreroll ? this.prerollFrames : [];
      this.prerollFrames = [];
    }

    if (this.pendingOpen) {
      this.heldFrames.push(float32Frame);
      this.heldMs += this.frameMs;
      this.heldPeak = Math.max(this.heldPeak, level);
      // 소리가 "이어지고 있는지"는 자기 자신의 최고음 대비로 봅니다.
      // 게이트의 발화 판정선만 쓰면 충격음의 잔향까지 말로 세어집니다.
      if (decision.speech && level >= this.heldPeak * SUSTAIN_RATIO) {
        this.confirmedMs += this.frameMs;
      }

      if (this.confirmedMs >= MIN_UTTERANCE_MS) {
        /* ⭐ 확정. 순서가 중요합니다 — "말 시작"을 **오디오보다 먼저**.
              반대로 하면 첫 음절이 발화 구간 밖으로 나가 버려집니다.     */
        this.pendingOpen = false;
        this.serverOpen = true;
        // 이 발화가 얼마나 컸는지 기록해 둡니다.
        // 나중에 "이건 사람인가 스피커 누출인가"를 가릴 때 씁니다.
        this.utterancePeak = this.heldPeak;
        this.onActivity('start');
        for (const frame of this.heldFrames) this._send(frame);
        this.heldFrames = [];
        this.heldMs = 0;
        this.onLevel(level, true);
        return;
      }

      if (decision.activity === 'end' || this.heldMs >= MAX_HOLD_MS) {
        // 말이 아니었습니다 (문 닫는 소리, 의자 끄는 소리, 스피커 에코).
        // 서버는 이런 게 있었는지조차 모릅니다 → 선생님이 대답하지 않습니다.
        //
        // ⚠️ 여기서 화면에 "듣고 있어요"를 띄우면 안 됩니다.
        //    방금 지운 소리를 들은 척하면, 아이는 말했는데 아무 대답이 없는
        //    이유를 알 수 없고 부모도 진단 화면에서 원인을 못 찾습니다.
        this._discardHeld();
        this.gate.close();
        this.onLevel(level, false);
        return;
      }

      // 아직 판단 중 — 화면에는 "듣고 있어요"로 보여줍니다 (반응이 없으면 불안합니다)
      this.onLevel(level, true);
      return;
    }

    /* ── 2. 이미 확정된 발화가 진행 중 ──────────────────────────────── */
    if (this.serverOpen) this.utterancePeak = Math.max(this.utterancePeak, level);
    if (decision.send && this.serverOpen) {
      this._send(float32Frame);
    } else {
      // 전송하지 않는 동안에도 선행 버퍼에는 계속 담아둡니다 (로컬이라 무료)
      this.prerollFrames.push(float32Frame);
      if (this.prerollFrames.length > this.maxPrerollFrames) {
        this.prerollFrames.shift();
      }
    }

    // 말의 끝은 마지막 오디오까지 보낸 뒤에 알립니다
    if (decision.activity === 'end' && this.serverOpen) {
      this.serverOpen = false;
      this.onActivity('end');
    }

    this.onLevel(level, decision.state !== GateState.IDLE);
  }

  /** 말이 끝났다고 볼 때까지 기다리는 시간 (학습자 수준에 맞춰 조정) */
  setEndOfSpeechMs(ms) {
    this.gate.setEndOfSpeechMs(ms);
  }

  /**
   * 서버가 아는 "발화 구간"이 열려 있는지.
   *
   * 확정 대기 중(pendingOpen)은 아직 서버에 알리지 않았으므로 false 입니다.
   * 재연결 시 이 값을 보고 activityStart 를 다시 보낼지 정합니다.
   */
  isSpeaking() {
    return this.serverOpen;
  }

  /** 아직 확정되지 않은 채 들고 있는 오디오가 있는지 (재연결 판단용) */
  hasHeldAudio() {
    return this.pendingOpen && this.heldFrames.length > 0;
  }

  /**
   * 지금 열려 있는 발화 구간을 정상적으로 닫습니다.
   * 텍스트로 말을 걸 때처럼, 음성 발화를 먼저 마무리해야 하는 경우에 씁니다.
   * (그냥 세션 쪽만 닫으면 마이크는 계속 열린 줄 알고 오디오를 흘려보내는데,
   *  그 오디오는 발화 구간 밖이라 서버가 통째로 버립니다 — 말이 사라집니다)
   */
  closeActivity() {
    const wasOpen = this.gate.close();
    this._discardHeld();
    if (wasOpen && this.serverOpen) {
      this.serverOpen = false;
      this.onActivity('end');
      return true;
    }
    this.serverOpen = false;
    return false;
  }

  _send(float32Frame) {
    let pcm16 = float32ToPcm16(float32Frame);
    if (this.needsResample) {
      pcm16 = resamplePcm16(pcm16, this.actualSampleRate, AUDIO.INPUT_SAMPLE_RATE);
    }
    const base64 = bytesToBase64(int16ToBytes(pcm16));
    this.onAudioFrame(base64);
    this.onStreamedMs(this.frameMs);
  }

  async stop() {
    this.running = false;
    this._cancelDuckTimer();
    this.gate.close();
    this.prerollFrames = [];
    this._discardHeld();
    this.serverOpen = false;

    try { this.workletNode?.port?.close(); } catch {}
    try { this.workletNode?.disconnect(); } catch {}
    try { this.sourceNode?.disconnect(); } catch {}
    this.mediaStream?.getTracks().forEach((t) => t.stop());
    if (this.audioContext && this.audioContext.state !== 'closed') {
      try { await this.audioContext.close(); } catch {}
    }

    this.workletNode = null;
    this.sourceNode = null;
    this.mediaStream = null;
    this.audioContext = null;
  }
}
