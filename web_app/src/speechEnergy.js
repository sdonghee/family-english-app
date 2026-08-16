/**
 * web_app/src/speechEnergy.js
 * ----------------------------------------------------------------------------
 * "이 오디오 안에 사람 말이 정말로 들어 있나?"를 재는 자.
 *
 * 왜 필요한가 — 2026-08-16 계측으로 밝혀진 사고의 마지막 고리입니다.
 *
 *   침묵 게이트가 잘못 열려 있으면, 아무도 말하지 않은 **방 안 소음 20초**가
 *   통째로 서버에 올라갑니다. 그런데 api/talk.js 는 모델에게
 *   "학생이 방금 한 말을 받아쓰라"고 **명령**합니다. temperature 는 1.0 입니다.
 *   모델은 잡음에서 아무것도 못 듣지만, 시키는 대로 그럴듯한 문장을 하나
 *   **지어냅니다.** 그리고 자기가 지어낸 말에 대답합니다.
 *
 *   → 목사님이 보신 "내가 하지도 않은 말을 만들어내서 혼자 대화한다"가
 *     정확히 이 경로였습니다.
 *
 * 그래서 보내기 **전에** 우리가 먼저 재 봅니다. 말소리가 없으면 안 보냅니다.
 * 안 보낼 때는 반드시 화면에 알립니다 — 이 프로젝트에서 조용한 폴백은 금지입니다.
 * 말없이 삼키면 목사님은 "왜 아무 반응이 없지?" 하고 원인을 영영 못 찾습니다.
 *
 * 브라우저 API를 쓰지 않는 순수 함수입니다. Node에서 그대로 검사합니다.
 * ----------------------------------------------------------------------------
 */

/** 20ms 단위로 잘라서 봅니다 (음절 하나보다 짧은 단위) */
const CHUNK_MS = 20;

/**
 * 이 오디오에서 **말소리로 볼 만한 구간**이 몇 ms 인지 잽니다.
 *
 * 고정 임계값을 쓰지 않습니다. 기기마다 마이크 감도가 다르고 방마다 소음이
 * 달라서, 고정값은 그 방 그 기기에서만 맞는 숫자가 됩니다.
 * 대신 **이 녹음 자신의 조용한 부분**을 기준으로 삼습니다:
 *   조용한 쪽 20% 지점을 밑소음으로 보고, 그보다 뚜렷하게 큰 구간만 셉니다.
 *
 * @param {Array<Int16Array>} frames  16-bit PCM 조각들
 * @param {number} sampleRate         초당 표본 수 (16000)
 * @returns {{speechMs:number, totalMs:number, floor:number, peak:number}}
 */
export function measureSpeech(frames, sampleRate) {
  const chunkSamples = Math.max(1, Math.round((sampleRate * CHUNK_MS) / 1000));

  /* 1) 전체를 20ms 조각으로 훑으며 각 조각의 세기(RMS)를 구합니다.
        조각 경계가 frame 경계와 안 맞으므로 프레임을 가로질러 셉니다. */
  const levels = [];
  let acc = 0;
  let n = 0;
  for (const f of frames) {
    for (let i = 0; i < f.length; i++) {
      const v = f[i] / 32768;
      acc += v * v;
      if (++n === chunkSamples) {
        levels.push(Math.sqrt(acc / n));
        acc = 0;
        n = 0;
      }
    }
  }
  if (n > 0) levels.push(Math.sqrt(acc / n));

  const totalMs = (levels.length * chunkSamples * 1000) / sampleRate;
  if (levels.length < 3) return { speechMs: 0, totalMs, floor: 0, peak: 0 };

  /* 2) 이 녹음 자신의 밑소음 = 조용한 쪽 20% 지점.
        평균을 쓰면 안 됩니다. 말소리가 평균을 끌어올려서,
        정작 말이 많이 든 녹음일수록 기준이 높아지는 거꾸로가 됩니다. */
  const sorted = [...levels].sort((a, b) => a - b);
  const floor = sorted[Math.floor(sorted.length * 0.2)];
  const peak = sorted[sorted.length - 1];

  /* 3) 말소리 판정선.
        - 밑소음의 3배를 넘어야 합니다 (소음이 출렁이는 것과 구분).
        - 그리고 최고음의 15%는 넘어야 합니다 (녹음 전체가 조용할 때,
          밑소음의 3배라 해도 여전히 아무 말도 아닐 수 있습니다).
        - 마지막으로 절대 하한. 완전한 무음(전부 0)에서 floor가 0이 되면
          3배도 0이라 모든 조각이 "말소리"가 되어버립니다. */
  const cut = Math.max(floor * 3, peak * 0.15, 0.004);

  let loud = 0;
  for (const lv of levels) if (lv > cut) loud++;

  return {
    speechMs: (loud * chunkSamples * 1000) / sampleRate,
    totalMs,
    floor,
    peak,
  };
}

/**
 * 서버로 보낼 만한 녹음인지 판단합니다.
 *
 * 0.35초는 "yes", "no", "apple" 한 마디가 들어갈 만한 가장 짧은 길이입니다.
 * 이보다 적으면 사람이 말한 게 아니라고 봅니다.
 *
 * @returns {{ok:boolean, reason:string, speechMs:number, totalMs:number}}
 */
export function shouldSendAudio(frames, sampleRate, minSpeechMs = 350) {
  const m = measureSpeech(frames, sampleRate);
  if (m.speechMs >= minSpeechMs) {
    return { ok: true, reason: '', speechMs: m.speechMs, totalMs: m.totalMs };
  }
  return {
    ok: false,
    reason:
      m.totalMs > 5000
        ? '주변 소리만 들어왔어요. 마이크 가까이서 다시 말해 주세요.'
        : '말소리가 잘 안 잡혔어요. 한 번만 다시 말해 주세요.',
    speechMs: m.speechMs,
    totalMs: m.totalMs,
  };
}
