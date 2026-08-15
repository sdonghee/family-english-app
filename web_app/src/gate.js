/**
 * web_app/src/gate.js
 * ----------------------------------------------------------------------------
 * 침묵 게이트 — 이 앱의 요금을 결정하는 순수 로직.
 *
 * 브라우저 API를 전혀 쓰지 않습니다. 그래서 Node에서 그대로 불러와
 * 실제 코드를 테스트할 수 있습니다 (scripts/test-audio.mjs).
 * 예전에는 테스트가 이 로직을 따로 복제해서 검증했는데,
 * 그 탓에 실제 코드의 버그를 테스트가 못 잡는 일이 있었습니다.
 *
 * 판단 기준은 고정 임계값이 아니라 **주변 소음 대비**입니다.
 *   고정값이 높으면 → 조용조용 말하는 4살 아이를 못 잡음
 *   고정값이 낮으면 → 거실 생활소음을 발화로 잡아 요금이 계속 나감
 *
 * 상태 기계:
 *   IDLE ──(소음 대비 크게)──▶ SPEAKING ──(작아짐)──▶ TAIL ──(2.4초)──▶ IDLE
 *                                 ▲                     │
 *                                 └──(다시 크게)────────┘
 * ----------------------------------------------------------------------------
 */

export const GateState = { IDLE: 'idle', SPEAKING: 'speaking', TAIL: 'tail' };

export class SilenceGate {
  /**
   * @param {object} opts
   * @param {number} opts.noiseDevK             소음 변동폭에 곱하는 계수 (클수록 소음에 둔감)
   * @param {number} opts.minSpeechRms          발화 임계값의 하한
   * @param {number} opts.maxSpeechRms          발화 임계값의 상한
   * @param {number} opts.silenceTailMs         말이 끝난 뒤 침묵을 계속 보낼 시간
   * @param {number} opts.maxContinuousStreamMs 이 시간 넘게 계속 열려 있으면 생활소음으로 판단
   * @param {boolean} [opts.enabled=true]       false면 항상 전송
   */
  constructor(opts) {
    this.noiseDevK = opts.noiseDevK ?? 4;
    this.minSpeechRms = opts.minSpeechRms;
    this.maxSpeechRms = opts.maxSpeechRms;
    this.silenceTailMs = opts.silenceTailMs;
    this.maxContinuousStreamMs = opts.maxContinuousStreamMs;
    this.enabled = opts.enabled !== false;

    this.reset();
  }

  reset() {
    this.state = GateState.IDLE;
    /**
     * 선생님이 말하는 동안 발화 판정 문턱을 몇 배로 올릴지.
     *
     * 마이크를 아예 꺼버리면 **끼어들 방법이 사라집니다.**
     * (서버 자동 감지를 껐기 때문에, 끼어들려면 마이크가 열려 있어야 합니다)
     * 그래서 끄는 대신 문턱만 올립니다 —
     * 스피커에서 새어 들어온 선생님 목소리로는 안 열리지만,
     * 바로 앞에서 말하는 사람 목소리로는 열립니다.
     */
    this.duckFactor = 1;
    /** 주변 소음의 평균 */
    this.noiseFloor = 0.002;
    /** 주변 소음의 변동폭 (평균에서 얼마나 출렁이는지) */
    this.noiseDev = 0.0005;
    /**
     * 스피커에서 마이크로 새어 들어오는 선생님 목소리의 크기 (**진단용**).
     * 문턱 계산에는 쓰지 않습니다 — @see observeEcho
     */
    this.echoFloor = 0;
    this.tailStartedAt = 0;
    this.streamStartedAt = 0;
    this.burstPeak = 0;
  }

  /**
   * 스피커에서 마이크로 새어 들어오는 양을 **재기만** 합니다.
   *
   * ⚠️ 이 값으로 문턱을 조절하지 않습니다. 그렇게 만들어 봤는데, 사람이
   *    말하는 동안에도 값이 따라 올라가서 **아이 목소리를 쫓아가 문턱을
   *    올려버렸습니다.** 아이가 아무리 말해도 아무 일도 일어나지 않는,
   *    가장 나쁜 종류의 고장이었습니다. 소리 크기만으로 "이건 스피커고
   *    저건 사람"을 가르는 건 신뢰할 수 없습니다.
   *
   *    그래서 지금은 **진단용 숫자로만** 씁니다. 에코를 실제로 막는 건
   *    안전 모드(선생님이 말할 때 마이크를 닫음)이고, 그게 기본값입니다.
   *    이 숫자는 "이어폰을 쓰면 좋아집니다" 같은 안내를 하고, 내보내기
   *    파일에 원인을 남기는 데 씁니다.
   */
  observeEcho(level) {
    const rate = 0.05;
    this.echoFloor += rate * (level - this.echoFloor);
    this.echoFloor = Math.max(0, Math.min(0.12, this.echoFloor));
  }

  /**
   * 지금 프레임 기준 발화 시작 임계값.
   *
   * 선생님이 말하는 동안에는 duck 배수만큼 올라갑니다.
   * ⚠️ **고정 배수**입니다. 마이크에 들어오는 소리를 보고 적응시키지 않습니다.
   *    적응시켜 봤더니 사람이 말하는 동안 그 목소리를 따라 올라가서,
   *    아이가 아무리 말해도 문턱을 못 넘는 상태가 됐습니다.
   *    예측 가능한 고정값이 훨씬 안전합니다.
   */
  onsetThreshold() {
    const base = this.baseThreshold();
    if (this.duckFactor <= 1) return base;

    // 상한이 없으면 시끄러운 거실에서 base 가 이미 높기 때문에(≈0.026)
    // 3.5를 곱하면 0.09가 되어 어른이 크게 말해도 문턱을 못 넘습니다.
    // "에코를 막으려다 사람이 아예 말을 못 하게" 되는 게 원래 버그였습니다.
    return Math.min(base * this.duckFactor, this.maxSpeechRms * 1.5);
  }

  /**
   * duck을 걸기 **전**의 임계값 = 소음 평균 + 변동폭 × K
   *
   * 평균만 쓰면 안 됩니다. 생활소음은 출렁이기 때문에, 평균(0.005)을 기준으로
   * 잡으면 봉우리(0.009)가 계속 발화로 잡혀 게이트가 닫히지 않습니다.
   *
   * 소음 통계도 반드시 이 값을 기준으로 갱신합니다. duck이 걸린 문턱을
   * 기준으로 삼으면 선생님 목소리가 전부 "소음"으로 학습되어, 말이 끝난
   * 뒤에도 문턱이 올라간 채로 남아 조용조용 말하는 아이를 못 잡습니다.
   */
  baseThreshold() {
    const estimate = this.noiseFloor + this.noiseDev * this.noiseDevK;
    return Math.min(this.maxSpeechRms, Math.max(this.minSpeechRms, estimate));
  }

  /** 선생님이 말하는 동안 문턱을 올립니다 (1 = 평소, 3~4 = 끼어들기만 허용) */
  setDuck(factor) {
    this.duckFactor = Math.max(1, Number(factor) || 1);
  }

  /**
   * 강제로 발화 구간을 엽니다 ("✋ 나도 말할래요" 버튼용).
   * 사용자가 말하겠다고 명시적으로 눌렀으므로 소리 크기와 무관하게 엽니다.
   * @returns {boolean} 새로 열렸으면 true (서버에 activityStart를 보내야 함)
   */
  forceOpen(now) {
    if (this.state !== GateState.IDLE) return false;
    this.state = GateState.SPEAKING;
    this.streamStartedAt = now;
    this.tailStartedAt = now;
    this.burstPeak = 0;
    return true;
  }

  /**
   * 소음 통계 갱신.
   *
   * 발화로 보이지 않는 프레임(임계값 미만)만 반영합니다.
   * 상태가 IDLE일 때만 갱신하면, 소음 때문에 게이트가 계속 열려 있는 동안에는
   * 학습할 기회가 없어서 영영 빠져나오지 못합니다.
   * 반대로 목소리까지 반영하면 게이트가 영영 안 열립니다. 그 사이를 취합니다.
   */
  _updateNoiseStats(level) {
    const rate = 0.02; // 시간상수 약 4초
    const diff = level - this.noiseFloor;
    this.noiseFloor += rate * diff;
    this.noiseDev += rate * (Math.abs(diff) - this.noiseDev);

    this.noiseFloor = Math.max(0.0002, Math.min(0.04, this.noiseFloor));
    this.noiseDev = Math.max(0.0001, Math.min(0.02, this.noiseDev));
  }

  /**
   * 한 프레임을 판정합니다.
   *
   * @param {number} level 이 프레임의 RMS (0~1)
   * @param {number} now   현재 시각 (ms)
   * @returns {{send:boolean, flushPreroll:boolean, speech:boolean, state:string, activity:string|null}}
   *   send         - 이 프레임을 서버로 보낼지
   *   flushPreroll - 모아둔 선행 버퍼를 먼저 흘려보낼지 (말 시작 순간)
   *   speech       - 사람이 말하는 중으로 볼지 (유휴 판정용)
   *   state        - 현재 상태
   *   activity     - 'start' | 'end' | null
   *                  ⭐ 이 신호가 이 앱에서 가장 중요합니다.
   *                  침묵을 잘라 보내면서 서버에게 아무 말도 안 하면,
   *                  서버는 끊긴 조각들을 **하나의 긴 발화로 이어붙입니다.**
   *                  그래서 예전에 한 말이 계속 따라붙고 턴이 영영 안 끝납니다.
   *                  말이 시작되고 끝나는 순간을 우리가 직접 알려줘야 합니다.
   */
  process(level, now) {
    const onset = this.onsetThreshold();

    // 발화로 보이지 않는 프레임은 어느 상태에서든 소음 통계에 반영합니다.
    // ⚠️ 기준은 duck을 걸기 전 값입니다 (baseThreshold 주석 참고).
    if (level < this.baseThreshold()) this._updateNoiseStats(level);

    // 히스테리시스: 시작 기준보다 낮은 값까지는 계속 말하는 것으로 인정합니다.
    // 시작/유지 기준이 같으면 경계에서 상태가 떨리고, 그때마다 타이머가
    // 초기화되어 게이트가 영영 안 닫힙니다.
    const sustain = onset * 0.55;

    switch (this.state) {
      case GateState.IDLE: {
        // 게이트를 꺼도 상태 기계는 그대로 돌려야 합니다.
        // activity 신호는 게이트와 무관하게 반드시 나가야 하기 때문입니다.
        // (서버 자동 VAD를 껐으므로 이 신호가 없으면 대화 자체가 안 됩니다)
        if (level > onset) {
          this.state = GateState.SPEAKING;
          this.streamStartedAt = now;
          this.burstPeak = level;
          // 말 시작 직전 오디오를 먼저 보내 첫 음절을 살립니다
          return {
            send: true, flushPreroll: true, speech: true,
            state: this.state, activity: 'start',
          };
        }
        return {
          send: !this.enabled, flushPreroll: false, speech: false,
          state: this.state, activity: null,
        };
      }

      case GateState.SPEAKING: {
        this.burstPeak = Math.max(this.burstPeak, level);
        const speech = level > sustain;
        if (!speech) {
          this.state = GateState.TAIL;
          this.tailStartedAt = now;
        }
        const closed = this._guardStuckOpen(now);
        return {
          send: true, flushPreroll: false, speech,
          state: this.state, activity: closed ? 'end' : null,
        };
      }

      case GateState.TAIL: {
        this.burstPeak = Math.max(this.burstPeak, level);

        // 이어서 말하는지는 **시작 기준(onset)** 으로 봅니다.
        // sustain으로 하면 히스테리시스가 사라져, 생활소음만으로도
        // 꼬리 타이머가 계속 초기화되어 게이트가 닫히지 않습니다.
        // 조용히 말하는 아이는 onset 자체가 소음 대비로 낮게 잡히므로 괜찮습니다.
        if (level > onset) {
          this.state = GateState.SPEAKING;
          const closed = this._guardStuckOpen(now);
          // guard가 방금 닫았을 수도 있으므로 실제 상태를 보고 판단합니다.
          return {
            send: true,
            flushPreroll: false,
            speech: this.state === GateState.SPEAKING,
            state: this.state,
            activity: closed ? 'end' : null,
          };
        }

        if (now - this.tailStartedAt >= this.silenceTailMs) {
          // 말이 끝났다고 판단 → 서버에 알리고 전송 중단 (요금 정지)
          this.state = GateState.IDLE;
          return { send: true, flushPreroll: false, speech: false, state: this.state, activity: 'end' };
        }

        const closed2 = this._guardStuckOpen(now);
        return {
          send: true, flushPreroll: false, speech: false,
          state: this.state, activity: closed2 ? 'end' : null,
        };
      }

      default:
        this.state = GateState.IDLE;
        return { send: false, flushPreroll: false, speech: false, state: this.state, activity: null };
    }
  }

  /**
   * 마지막 안전장치.
   *
   * 사람이 말하면 반드시 중간에 쉬는 구간이 생깁니다. 정해진 시간 넘게
   * 한 번도 안 끊기고 계속 열려 있다면 사람 말이 아니라 생활소음
   * (TV·에어컨·환풍기)일 가능성이 큽니다. 그대로 두면 아무도 말하지 않는데
   * 요금만 계속 나갑니다. → 소음 기준을 올리고 게이트를 닫습니다.
   */
  _guardStuckOpen(now) {
    if (now - this.streamStartedAt < this.maxContinuousStreamMs) return false;

    // 이번 구간의 최대 음량을 소음으로 간주 → 다음부터는 이보다 커야 발화
    this.noiseFloor = Math.min(0.04, Math.max(this.noiseFloor, this.burstPeak * 0.6));
    this.noiseDev = Math.min(0.02, Math.max(this.noiseDev, this.burstPeak * 0.1));
    this.state = GateState.IDLE;
    this.burstPeak = 0;
    return true;
  }

  /**
   * 말이 끝났다고 볼 때까지 기다리는 시간.
   * 서버가 아니라 우리가 판단하므로, 학습자 수준에 맞게 바꿉니다.
   * (4살은 단어를 떠올리며 오래 멈춥니다)
   */
  setEndOfSpeechMs(ms) {
    if (Number.isFinite(ms) && ms > 200) this.silenceTailMs = ms;
  }

  /**
   * 강제로 닫습니다 (선생님이 말할 때 등).
   * @returns {boolean} 열려 있다가 닫혔으면 true — 서버에 activityEnd를 보내야 합니다
   */
  close() {
    const wasOpen = this.state !== GateState.IDLE;
    this.state = GateState.IDLE;
    this.burstPeak = 0;
    return wasOpen;
  }
}
