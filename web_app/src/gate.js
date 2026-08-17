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
    /** 이 시간 동안 소음 통계 갱신이 한 번도 없으면 추정기가 굶은 것으로 봅니다 */
    this.noiseStarvedMs = opts.noiseStarvedMs ?? 4000;
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
    /**
     * 이번 발화 구간에서 관찰된 **가장 조용한** 순간.
     *
     * 게이트가 안 닫히고 계속 열려 있을 때, 그걸 붙잡고 있는 범인은
     * 최고음이 아니라 **바닥에 깔린 소음**입니다. 그래서 최고음이 아니라
     * 이 값을 보고 소음 기준을 다시 잡습니다. @see _guardStuckOpen
     */
    this.burstFloor = Infinity;
    /**
     * 소음 통계를 마지막으로 갱신한 시각. 0 이면 아직 모름.
     * 이 값이 오래 멈춰 있으면 추정기가 굶고 있다는 뜻입니다. @see _rescueNoiseStats
     */
    this.lastNoiseUpdateAt = 0;

    /* 방의 조용한 바닥값을 재는 **게이트와 무관한** 창(窓).
     * @see _observeAmbient — 왜 이게 따로 필요한지 그 주석에 적어 두었습니다. */
    this.ambientMin = Infinity;
    this.ambientPrevMin = Infinity;
    this.ambientWindowStartedAt = 0;
  }

  /**
   * 방의 밑바닥 소리를 **게이트 상태와 상관없이** 계속 지켜봅니다.
   *
   * ⚠️ 2026-08-18(세 번째). 이게 왜 따로 필요한지가 이번 진단의 핵심입니다.
   *
   *    구조(_rescueNoiseStats)와 정체감시(_guardStuckOpen)는 지금까지
   *    **burstFloor** — "이번에 열린 구간에서 가장 조용했던 순간" — 을 방의
   *    소음으로 받아들였습니다. 그런데 그 구간은 **사람이 말해서 열린 구간**
   *    입니다. 즉 그 안의 가장 조용한 순간도 여전히 **사람 목소리**입니다.
   *
   *    계측 (조용한 방 0.0035, 어른 0.032, 6초 발화):
   *        구조 발동 → 밑소음 0.00235 → **0.01557**
   *        (0.01557 은 방 소리가 아니라 말하는 사람의 가장 작은 음절입니다)
   *        조용한 아이(0.014)로 해도 0.00241 → 0.00686 으로 뜁니다.
   *    → 이렇게 부풀린 밑소음이 다음 턴으로 넘어가며 문턱을 천장(0.018)까지
   *      밀어 올렸습니다. 앞서 고친 "말하는 중 학습 금지"만으로는 이 경로가
   *      그대로 남아 증상이 계속됐습니다.
   *
   * 그래서 방의 바닥값은 **말하는 구간이 아니라 시간 창으로** 잽니다.
   * 최근 10~20초 안의 최솟값입니다. 사람은 20초를 한 번도 안 쉬고 말하지
   * 않으므로, 이 창에는 반드시 "아무도 말 안 하던 순간"이 들어 있습니다.
   * (정말로 20초를 쉬지 않고 나는 소리라면 그건 사람이 아니라 생활소음이고,
   *  그건 _guardStuckOpen 이 20초에 받아냅니다. 창 길이를 거기 맞춰 둡니다.)
   *
   * 구현은 반쪽 창 두 개입니다. 배열을 들고 있지 않아도 되고,
   * 창이 넘어갈 때 값이 통째로 사라지지 않습니다.
   */
  _observeAmbient(level, now) {
    const half = this.maxContinuousStreamMs / 2;
    if (this.ambientWindowStartedAt === 0) this.ambientWindowStartedAt = now;
    if (now - this.ambientWindowStartedAt >= half) {
      this.ambientPrevMin = this.ambientMin;
      this.ambientMin = Infinity;
      this.ambientWindowStartedAt = now;
    }
    if (level < this.ambientMin) this.ambientMin = level;
  }

  /** 최근 창에서 관찰된 방의 바닥값. 아직 모르면 현재 추정치를 씁니다. */
  ambientFloor() {
    const m = Math.min(this.ambientMin, this.ambientPrevMin);
    return Number.isFinite(m) ? m : this.noiseFloor;
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
    return Math.min(this.maxSpeechRms, Math.max(this.minSpeechRms, this.noiseCeiling()));
  }

  /**
   * 주변 소음이 실제로 닿는 꼭대기.
   *
   * ⚠️ 2026-08-16, 세 번째 고장. 여기가 가장 깊은 원인이었습니다.
   *
   *    소음이 **아주 고르면**(선풍기·에어컨·공기청정기처럼) 변동폭 추정치가
   *    0 으로 수렴해 하한(0.0001)에 붙어버립니다. 그러면 소음 꼭대기와
   *    소음 평균이 사실상 같아지고, 시작문턱과 유지문턱 사이의 간격이
   *    사라집니다. 그 좁은 틈 **한가운데에 밑소음이 그대로 앉습니다.**
   *
   *    계측된 실제 숫자 (밑소음 0.00497 인 방):
   *        유지문턱 0.00486  <  밑소음 0.00497  <  시작문턱 0.00540
   *
   *    → 소음만으로는 게이트가 안 열립니다. 그런데 사람이 한 번 말해서
   *      열리고 나면, 그 다음부터는 소음이 유지문턱을 계속 넘어서
   *      **영원히 안 닫힙니다.** 첫 문장은 잘 가고, 두 번째부터 먹통이 되는
   *      "두 번째 턴부터 인식이 안 된다"가 정확히 이것이었습니다.
   *
   * 그래서 변동폭에 **밑소음에 비례한 최소 폭**을 보장합니다. 소음이 아무리
   * 고르게 들려도 판단 여유를 그 위에 남겨둡니다.
   */
  noiseCeiling() {
    const dev = Math.max(this.noiseDev, this.noiseFloor * 0.12);
    return this.noiseFloor + dev * this.noiseDevK;
  }

  /**
   * 말이 **이어지고 있다**고 볼 하한 (히스테리시스).
   *
   * ⚠️ 2026-08-16, 여기서 앱 전체가 멈추는 고장이 났습니다.
   *
   *    예전에는 그냥 `onset * 0.55` 였습니다. 그런데 onset 은 minSpeechRms
   *    (0.0045)로 바닥이 막혀 있어서, 조용한 방에서도 하한이 0.00248 로
   *    **고정**됩니다. 실제 거실의 밑소음은 0.003 안팎입니다.
   *
   *    → 밑소음이 하한보다 커서, 한 번 열린 게이트가 **영원히 안 닫혔습니다.**
   *      게이트가 안 닫히면 activity:'end' 가 안 나가고, 그러면
   *      chatSession 은 한 턴을 **아예 서버로 보내지 않습니다.**
   *      목사님이 말을 해도 아무 일도 일어나지 않는, 가장 나쁜 고장이었습니다.
   *      (Node 계측으로 재현: 밑소음 0.0025 이상이면 턴이 0개)
   *
   *    그래서 하한은 반드시 **지금 추정한 소음 꼭대기보다 위**에 있어야 합니다.
   *
   * ⚠️ 정정 (되돌리기 검증으로 확인한 것).
   *    처음 고칠 때 여기에 `onset * 0.9` 상한을 걸었다가 나중에 지웠고,
   *    "그 상한이 범인이었다"고 적어 두었습니다. **틀린 기록이었습니다.**
   *    상한을 도로 넣고 회귀 테스트를 돌려 보니 그냥 통과했습니다.
   *    noiseCeiling 이 제자리에 있으면 nc·0.85 ≤ onset·0.9 라서 상한이
   *    걸릴 일이 아예 없습니다. 없어도 되는 코드였을 뿐, 고친 것은 아닙니다.
   *
   *    실제로 고친 곳은 noiseCeiling 의 **상대 하한**입니다.
   *    그 한 줄을 빼면 회귀 테스트 [7]이 4건 실패합니다. @see noiseCeiling
   *    간격이 모자라면 하한을 내릴 게 아니라 **시작문턱을 올려야** 합니다.
   */
  sustainThreshold() {
    const onset = this.onsetThreshold();
    // 소음 꼭대기의 85% — 소음보다는 위, 시작문턱보다는 아래.
    const want = Math.max(onset * 0.55, this.noiseCeiling() * 0.85);

    /* ⚠️ 2026-08-18. 위 정정 기록("상한은 걸릴 일이 없다")이 **다시 틀렸습니다.**
     *
     *    maxSpeechRms 천장(0.018)을 도입하자 onset 은 천장에 눌려 멈추는데
     *    noiseCeiling 은 계속 올라갑니다. 그러면 처음으로 nc·0.85 > onset 이
     *    됩니다. 계측된 실제 숫자:
     *        시작문턱 0.01800  <  유지문턱 0.02448
     *
     *    유지문턱이 시작문턱보다 높으면 히스테리시스가 **뒤집힙니다.**
     *    게이트가 열리는 순간(level > onset) 그 값이 이미 sustain 아래라서
     *    곧바로 TAIL 로 떨어지고, 꼬리 시간만 지나면 닫힙니다.
     *    → 무슨 말을 해도 짧은 조각으로만 잘립니다.
     *      "긴문장은 전혀 받아들이지 못해"가 이 모양으로 재발합니다.
     *
     *    그래서 유지문턱은 **반드시 시작문턱보다 아래**로 자릅니다.
     *    소음 꼭대기를 못 넘겨서 게이트가 안 닫히는 경우는
     *    _guardStuckOpen(20초)과 speechEnergy.js 가 받아냅니다.
     *    "안 닫히는 것"은 회복 경로가 있지만, "열리자마자 닫히는 것"은 없습니다.
     */
    return Math.min(want, onset * 0.9);
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
    this.burstFloor = Infinity;
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
   * 굶주린 추정기를 구조합니다.
   *
   * ⚠️ 2026-08-16, 두 번째 고장. 위의 _updateNoiseStats 는 **문턱보다 조용한
   *    프레임에서만** 돌아갑니다. 그러니까 소음 추정치는 **아래로만 배우고
   *    위로는 못 배웁니다.**
   *
   *    거실 밑소음이 문턱(minSpeechRms = 0.0045)보다 커지는 순간,
   *    문턱 아래로 내려오는 프레임이 **단 하나도 없게 됩니다.** 갱신 기회가
   *    영영 오지 않고, 추정치는 처음 값 0.002 에 그대로 굳습니다.
   *    게이트는 아무도 말하지 않아도 계속 열려 있고, activity:'end' 는
   *    영영 안 나갑니다. (계측으로 확인: 밑소음 0.0050 → 40프레임 내내 갱신 0회)
   *
   * 그래서 "한동안 갱신이 한 번도 없었다"를 병으로 보고, 그때는
   * **이번 구간에서 관찰된 가장 조용한 순간(burstFloor)** 을 밑소음으로
   * 받아들입니다.
   *
   * ⚠️ 2026-08-18. 이 함수를 한 번 통째로 지웠다가 되돌렸습니다. 기록해 둡니다.
   *
   *    "아주 큰소리로 대화해야 이해한다"는 신고를 받고, 6초 연속 발화를
   *    합성해 돌려보니 문턱이 0.0068 → 0.0468 로 뛰었습니다. 범인으로 보고
   *    지웠더니 회귀 테스트 [7]이 3건 무너졌습니다 — 굶주림이 되살아난 것입니다.
   *
   *    다시 보니 **제 합성음이 틀렸습니다.** 6초 내내 세기가 평평한 소리를
   *    넣었는데, 실제 사람 말은 단어와 음절 사이에서 세기가 크게 꺼집니다
   *    (테스트 [7]/[8]의 파형은 320ms마다 35%까지 떨어집니다).
   *    그런 파형에서는 burstFloor 가 진짜로 낮게 잡혀서 이 구조가 안전합니다.
   *
   *    진짜 문제는 이 함수가 아니라 **문턱에 천장이 없었던 것**이었습니다.
   *    학습이 어디로 튀든 문턱이 사람 목소리 위로 올라갈 수 있었던 게 병입니다.
   *    그래서 maxSpeechRms 를 0.055 → 0.018 로 내려 천장을 박았습니다.
   *    이제 이 함수가 무엇을 배우든 문턱은 0.018 을 못 넘고,
   *    보통 목소리(0.02~0.05)는 **언제나** 마이크를 엽니다. @see config.js
   *
   *    교훈: 합성 신호로 계측할 때는 **그 신호가 실제와 닮았는지부터** 의심할 것.
   *    닮지 않은 입력으로 잰 숫자는 계측이 아니라 잘 꾸민 추측입니다.
   */
  _rescueNoiseStats(now) {
    if (this.lastNoiseUpdateAt === 0) { this.lastNoiseUpdateAt = now; return; }
    if (now - this.lastNoiseUpdateAt < this.noiseStarvedMs) return;
    this.lastNoiseUpdateAt = now;

    /* ⚠️ 2026-08-18(세 번째). 예전에는 여기가 burstFloor 였습니다.
     *    그건 **말하는 사람의 가장 작은 음절**이라서, 구조할 때마다 밑소음이
     *    사람 목소리 쪽으로 끌려 올라갔습니다(0.0024 → 0.0156, 턴마다 1회).
     *    방의 바닥값은 시간 창으로 재야 합니다. @see _observeAmbient */
    const quiet = this.ambientFloor();
    if (!(quiet > this.noiseFloor)) return;

    /* ⚠️ 2026-08-18. 여기에도 천장을 겁니다 (_guardStuckOpen 과 같은 이유).
     *    이 구조 하나만으로 문턱이 사람 목소리 위로 올라가는 일은 없어야 합니다.
     *    maxSpeechRms(0.018)는 보통 대화 목소리(0.02~0.05)보다 **아래**입니다. */
    const cap = this.maxSpeechRms;
    this.noiseFloor = Math.min(0.04, cap, quiet);
    this.noiseDev = Math.min(0.02, cap * 0.15, Math.max(this.noiseDev, quiet * 0.15));
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
    // 방의 바닥값은 게이트가 열렸든 닫혔든 항상 잽니다. @see _observeAmbient
    this._observeAmbient(level, now);

    const onset = this.onsetThreshold();

    /* 소음 통계 갱신.
     *
     * ⚠️ 2026-08-18(세 번째). **여기는 범인이 아니었습니다.** 헛짚은 기록을
     *    남겨 둡니다. 안 남기면 다음 사람이 똑같이 헛짚습니다.
     *
     *    의심: baseThreshold 가 천장(0.018)에 눌러붙어 있으면, 0.018 아래인
     *    프레임은 **그게 사람 말이어도** 소음으로 학습된다. 사람 말은 음절
     *    사이에서 세기가 꺼지므로 말하는 내내 그런 프레임이 생긴다.
     *    계측도 그럴듯했습니다 — 어른이 5턴 말하는 동안 말하는 중에만 33개
     *    프레임이 학습됐고 그중 최댓값이 0.01796 이었습니다.
     *
     *    그래서 `&& this.state !== GateState.SPEAKING` 을 붙여 봤습니다.
     *    조용한 아이가 2턴 만에 먹통이던 것이 6턴까지 버텼습니다. 좋아 보였죠.
     *    **하지만 그건 증상을 늦춘 것이지 원인을 고친 게 아니었습니다.**
     *
     *    진짜 원인은 _rescueNoiseStats / _guardStuckOpen 이 방의 소음이랍시고
     *    **말하는 사람의 가장 작은 음절(burstFloor)** 을 배우던 것이었습니다.
     *    그쪽을 시간 창(ambientFloor)으로 바꾸고 나니, 이 조건은 **있으나
     *    없으나 숫자가 같았습니다.** 조용한 방·거실(TV)·아주 시끄러운 거실
     *    세 곳에서 8턴씩 돌려 소수점 다섯 자리까지 대조했습니다.
     *    되돌리기 검증에서도 이 조건만 되돌리면 테스트가 **하나도 안 깨집니다.**
     *
     *    그래서 도로 뺐습니다. 값을 못 하는 조건을 남겨 두면, 다음에 문제가
     *    생겼을 때 "이건 이미 막아 뒀는데" 하고 엉뚱한 데를 보게 됩니다.
     *    @see _observeAmbient — 실제로 고친 곳
     *
     * 발화로 보이지 않는 프레임은 어느 상태에서든 소음 통계에 반영합니다.
     * ⚠️ 기준은 duck 을 걸기 **전** 값(baseThreshold)입니다. duck 이 걸린 문턱을
     *    기준으로 삼으면 선생님 목소리가 전부 소음으로 학습됩니다. @see baseThreshold
     */
    if (level < this.baseThreshold()) {
      this._updateNoiseStats(level);
      this.lastNoiseUpdateAt = now;
    } else {
      // 갱신 기회가 아예 안 오는 방(밑소음 > 문턱)에서는 추정기가 굶습니다.
      // ⚠️ 이 가지를 지웠다가 회귀 테스트 [7]이 3건 무너져 되돌렸습니다.
      //    @see _rescueNoiseStats 의 2026-08-18 기록
      this._rescueNoiseStats(now);
    }

    // 히스테리시스: 시작 기준보다 낮은 값까지는 계속 말하는 것으로 인정합니다.
    // 시작/유지 기준이 같으면 경계에서 상태가 떨리고, 그때마다 타이머가
    // 초기화되어 게이트가 영영 안 닫힙니다.
    // ⚠️ 다만 이 값이 밑소음보다 낮으면 그것대로 영영 안 닫힙니다. @see sustainThreshold
    const sustain = this.sustainThreshold();

    switch (this.state) {
      case GateState.IDLE: {
        // 게이트를 꺼도 상태 기계는 그대로 돌려야 합니다.
        // activity 신호는 게이트와 무관하게 반드시 나가야 하기 때문입니다.
        // (서버 자동 VAD를 껐으므로 이 신호가 없으면 대화 자체가 안 됩니다)
        if (level > onset) {
          this.state = GateState.SPEAKING;
          this.streamStartedAt = now;
          this.burstPeak = level;
          this.burstFloor = level;
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
        this.burstFloor = Math.min(this.burstFloor, level);
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
        this.burstFloor = Math.min(this.burstFloor, level);

        // 이어서 말하는지는 **시작 기준(onset)** 으로 봅니다.
        // sustain으로 하면 히스테리시스가 사라져, 생활소음만으로도
        // 꼬리 타이머가 계속 초기화되어 게이트가 닫히지 않습니다.
        // 조용히 말하는 아이는 onset 자체가 소음 대비로 낮게 잡히므로 괜찮습니다.
        if (level > onset) {
          this.state = GateState.SPEAKING;
          /* 방금 쉬었다가 다시 말했다 = 사람입니다.
             정체 감시 타이머를 여기서 다시 겁니다.
             감시의 목적은 "한 번도 안 쉬고 계속 나는 소리"를 잡는 것이지
             길게 말하는 사람을 자르는 것이 아닙니다. 예전에는 이 초기화가
             없어서, 쉬어가며 길게 말하면 누적 시간에 걸려 문장이 잘렸습니다. */
          this.streamStartedAt = now;
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

    /* 게이트를 붙잡고 있던 범인은 **바닥에 깔린 소음**입니다.
     *
     * ⚠️ 예전에는 여기서 `burstPeak * 0.6` 을 소음으로 학습했습니다.
     *    최고음의 60% — 즉 **사람이 낸 가장 큰 목소리의 60%** 를 문턱으로
     *    삼는다는 뜻입니다. 한 번 이게 걸리면 그 뒤로는 아무리 말해도
     *    문턱을 못 넘습니다. "두 번째 턴부터 말을 못 알아듣는다"의 정체가
     *    이것이었습니다. 소음을 배우려다 사람 목소리를 배워버린 겁니다.
     *
     * 이번 구간의 **가장 조용한 순간**을 소음으로 봅니다. 그 위로 살짝만
     * 올리면 밑소음으로는 안 열리고, 사람 목소리로는 여전히 열립니다.
     */
    /* ⚠️ 2026-08-18. 여기에도 천장이 필요합니다.
     *
     *    계측: 정체 감시가 한 번 발동하면 시작문턱이 0.0067 → 0.0443 으로
     *    뛰었고, 조용히 10초를 기다려도 0.0274 에서 안 내려왔습니다.
     *    그 사이 보통 목소리(0.025)로는 마이크가 아예 안 열립니다.
     *
     *    바닥값만 배우니 안전하다고 생각했지만, 20초 동안 **사람이 계속
     *    말한 경우**에는 그 바닥값도 사람 목소리입니다. 그래서 학습 결과가
     *    문턱 천장(maxSpeechRms)을 넘지 않도록 자릅니다. 소음이 정말 그보다
     *    크면 게이트는 계속 열리겠지만, 그건 speechEnergy.js 가 걸러냅니다.
     *    **마이크가 먹통이 되는 것보다는 낫습니다.**
     */
    const cap = this.maxSpeechRms;
    // ⚠️ 여기도 burstFloor 가 아니라 시간 창의 바닥값입니다. 같은 이유입니다.
    //    @see _observeAmbient
    const floor = this.ambientFloor();
    this.noiseFloor = Math.min(0.04, cap, Math.max(this.noiseFloor, floor * 1.15));
    this.noiseDev = Math.min(0.02, cap * 0.15, Math.max(this.noiseDev, floor * 0.15));
    this.state = GateState.IDLE;
    this.burstPeak = 0;
    this.burstFloor = Infinity;
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
    this.burstFloor = Infinity;
    return wasOpen;
  }
}
