/**
 * tools/gate-measure.mjs
 * ----------------------------------------------------------------------------
 * 게이트 문턱이 실제로 어떤 숫자를 갖는지 **계측**합니다. 추측 금지.
 *
 * 증상(목사님 말 그대로):
 *   "아주 큰소리로 대화해야 이해하고, 긴문장은 전혀 받아들이지 못해,
 *    단어나 짧은 문장만 이해해"
 *
 * 실제 gate.js 를 그대로 돌려서, 문턱이 턴을 거듭하며 올라가는지 봅니다.
 * ----------------------------------------------------------------------------
 */

import { SilenceGate, GateState } from '../web_app/src/gate.js';

const FRAME_MS = 80;             // FRAME_SAMPLES 1280 / 16000 * 1000
const OPTS = {
  noiseDevK: 4,
  minSpeechRms: 0.0045,
  maxSpeechRms: 0.018,
  silenceTailMs: 1800,           // _persona.js MIN_END_OF_SPEECH_MS
  maxContinuousStreamMs: 20_000,
  noiseStarvedMs: 4_000,
};

const fmt = (n) => Number(n).toFixed(5);

function snap(g, label) {
  return `${label.padEnd(22)} noiseFloor=${fmt(g.noiseFloor)} noiseDev=${fmt(g.noiseDev)} ` +
         `onset=${fmt(g.onsetThreshold())} sustain=${fmt(g.sustainThreshold())}`;
}

/** 한 구간을 프레임 단위로 흘려보냅니다. @returns 시작/끝 신호 개수 */
function feed(g, t0, level, ms, jitter = 0.15, log = null) {
  let t = t0;
  let starts = 0, ends = 0;
  const n = Math.round(ms / FRAME_MS);
  for (let i = 0; i < n; i++) {
    // 실제 마이크는 프레임마다 값이 출렁입니다. 고정값만 넣으면 현실과 다릅니다.
    const lv = Math.max(0, level * (1 + (Math.random() * 2 - 1) * jitter));
    const r = g.process(lv, t);
    if (r.activity === 'start') starts++;
    if (r.activity === 'end') ends++;
    if (log) log.push({ t, lv, state: r.state, activity: r.activity });
    t += FRAME_MS;
  }
  return { t, starts, ends };
}

/**
 * 한 턴: 조용 → 말 → 조용.
 * words: [{level, ms}] 형태. 단어 사이에는 gapMs 만큼 밑소음이 들어갑니다.
 */
function speakTurn(g, t0, { noise, words, gapMs = 120, preQuietMs = 1500, postQuietMs = 3000 }) {
  let t = t0, starts = 0, ends = 0;
  ({ t } = feed(g, t, noise, preQuietMs));
  for (let i = 0; i < words.length; i++) {
    const r1 = feed(g, t, words[i].level, words[i].ms);
    t = r1.t; starts += r1.starts; ends += r1.ends;
    if (i < words.length - 1) {
      const r2 = feed(g, t, noise, gapMs);
      t = r2.t; starts += r2.starts; ends += r2.ends;
    }
  }
  const r3 = feed(g, t, noise, postQuietMs);
  t = r3.t; starts += r3.starts; ends += r3.ends;
  return { t, starts, ends };
}

function makeGate() {
  const g = new SilenceGate(OPTS);
  return g;
}

/* ── 시나리오 1: 조용한 방, 보통 목소리로 짧은 단어 5턴 ────────────────── */
function scenario(name, { noise, words, turns = 5, gapMs = 120 }) {
  const g = makeGate();
  let t = 0;
  console.log(`\n──── ${name} ────`);
  console.log(`  밑소음 ${fmt(noise)} / 말소리 ${fmt(words[0].level)} ` +
              `(말소리는 밑소음의 ${(words[0].level / noise).toFixed(1)}배)`);
  console.log('  ' + snap(g, '시작 전'));
  for (let i = 1; i <= turns; i++) {
    const r = speakTurn(g, t, { noise, words, gapMs });
    t = r.t;
    const ok = r.starts > 0 && r.ends > 0;
    console.log(`  턴 ${i}: 시작 ${r.starts}회 · 끝 ${r.ends}회  ${ok ? '' : '  ← 말을 못 잡음!'}`);
    console.log('  ' + snap(g, `턴 ${i} 뒤`));
  }
}

const NOISE = 0.0040;   // 조용한 거실
const NOISY = 0.0090;   // 시끄러운 거실

/* 짧은 단어 */
const SHORT = [{ level: 0.025, ms: 700 }];

/* 긴 문장: 단어 8개, 사이사이에 짧은 쉼 */
const LONG = Array.from({ length: 8 }, () => ({ level: 0.025, ms: 550 }));

/* 조용조용 말하기 */
const QUIET_SPEECH = [{ level: 0.010, ms: 700 }];

scenario('조용한 방 · 보통 목소리 · 짧은 단어', { noise: NOISE, words: SHORT });
scenario('조용한 방 · 보통 목소리 · 긴 문장',   { noise: NOISE, words: LONG });
scenario('조용한 방 · 작은 목소리 · 짧은 단어', { noise: NOISE, words: QUIET_SPEECH });
scenario('시끄러운 방 · 보통 목소리 · 긴 문장', { noise: NOISY, words: LONG });

/* ── 시나리오 5: 긴 문장 안에서 몇 조각으로 잘리는지 ────────────────────── */
console.log('\n──── 긴 문장이 몇 조각으로 잘리는가 ────');
for (const gapMs of [80, 160, 240, 400, 800, 1600, 2400]) {
  const g = makeGate();
  let t = 0;
  // 첫 턴으로 소음 통계를 안정시킵니다
  ({ t } = speakTurn(g, t, { noise: NOISE, words: SHORT }));
  const r = speakTurn(g, t, { noise: NOISE, words: LONG, gapMs });
  console.log(`  단어 사이 쉼 ${String(gapMs).padStart(4)}ms → 발화 시작 ${r.starts}회 / 끝 ${r.ends}회` +
              `  (1회면 한 문장, 여러 번이면 문장이 그만큼 조각남)`);
}

/* ── 시나리오 6: _rescueNoiseStats 가 사람 목소리를 소음으로 배우는가 ──── */
console.log('\n──── 4초 넘게 쉬지 않고 말하면 어떻게 되는가 ────');
{
  const g = makeGate();
  let t = 0;
  ({ t } = speakTurn(g, t, { noise: NOISE, words: SHORT }));
  console.log('  ' + snap(g, '평범한 한 턴 뒤'));
  // 6초 동안 끊지 않고 말하기 (쉼 없음)
  ({ t } = feed(g, t, NOISE, 1500));
  const r = feed(g, t, 0.025, 6000, 0.10);
  t = r.t;
  ({ t } = feed(g, t, NOISE, 3000));
  console.log('  ' + snap(g, '6초 연속 발화 뒤'));
  console.log(`  → 이 문턱에서 보통 목소리(0.02500)가 게이트를 열 수 있는가: ` +
              `${0.025 > g.onsetThreshold() ? '예' : '아니오 ← 여기서 소리를 질러야 함'}`);
}

/* ── 시나리오 7: _guardStuckOpen 이 발동한 뒤 ──────────────────────────── */
console.log('\n──── 20초 연속 소음(TV 등)으로 정체 감시가 발동한 뒤 ────');
{
  const g = makeGate();
  let t = 0;
  ({ t } = speakTurn(g, t, { noise: NOISE, words: SHORT }));
  console.log('  ' + snap(g, '평범한 한 턴 뒤'));
  const r = feed(g, t, 0.030, 21000, 0.05);   // 21초 연속 소음
  t = r.t;
  console.log(`  정체 감시 발동 ${r.ends}회`);
  console.log('  ' + snap(g, '발동 뒤'));
  console.log(`  → 보통 목소리(0.02500)로 다시 열리는가: ` +
              `${0.025 > g.onsetThreshold() ? '예' : '아니오 ← 여기서 소리를 질러야 함'}`);
  ({ t } = feed(g, t, NOISE, 10000));
  console.log('  ' + snap(g, '조용히 10초 지난 뒤'));
  console.log(`  → 10초 뒤 회복되었는가: ${0.025 > g.onsetThreshold() ? '예' : '아니오'}`);
}
