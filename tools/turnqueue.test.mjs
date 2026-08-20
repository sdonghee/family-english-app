/**
 * tools/turn-queue.test.mjs
 * ----------------------------------------------------------------------------
 * 회귀 테스트: **아이가 한 말이 사라지지 않는다.**
 *
 * 왜 이 테스트가 있나:
 *   Live API 는 연결을 열어두기 때문에 아이가 언제 말해도 서버가 받았습니다.
 *   한 턴씩 주고받는 방식으로 바꾸면서, 선생님 대답을 기다리는 1~3초 사이에
 *   아이가 한 말을 **아무 표시 없이 버리는** 구멍이 생겼습니다.
 *   (chatSession.sendActivityStart 가 _busy 일 때 false 를 돌려주면,
 *    마이크는 계속 오디오를 보내는데 받는 곳이 없어 통째로 사라집니다.
 *    아이는 분명히 말했는데 아무 반응이 없고, 화면에는 아무 흔적도 안 남습니다.)
 *
 * 이 테스트를 깨는 법 (구멍이 되살아났는지 확인용):
 *   chatSession.js 의 sendActivityStart 를 아래로 되돌리면 반드시 실패합니다.
 *     if (!this.isLive || this._activityOpen || this._busy) return false;
 *
 * 실행:  node tools/turn-queue.test.mjs
 * ----------------------------------------------------------------------------
 */

import { readFileSync } from 'node:fs';
import { ChatSession, LiveState } from '../web_app/src/chatSession.js';
import { AUDIO, COST } from '../web_app/src/config.js';
import { MicStream } from '../web_app/src/mic.js';
import { SilenceGate, GateState } from '../web_app/src/gate.js';
import { measureSpeech, shouldSendAudio } from '../web_app/src/speechEnergy.js';
import parseTurnModule from '../api/_parseTurn.js';
import * as faceModule from '../web_app/src/avatarFace.js';
import personaModule from '../api/_persona.js';
const { parseTurnText, HEARD_RE } = parseTurnModule;
const { endOfSpeechMs, FAMILY_PROFILES, MIN_END_OF_SPEECH_MS } = personaModule;

/* ── 아주 작은 검사 도구 (외부 라이브러리 없이) ─────────────────────────── */

let failures = 0;
function check(label, ok, detail = '') {
  if (ok) {
    console.log(`  ✅ ${label}`);
  } else {
    failures++;
    console.log(`  ❌ ${label}${detail ? `\n       → ${detail}` : ''}`);
  }
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/* ── 가짜 서버 ──────────────────────────────────────────────────────────
   /api/talk 은 일부러 느리게(200ms) 대답합니다. 그 사이에 아이가 또 말하는
   상황을 만들어야 하기 때문입니다. 실제로도 1~3초가 걸립니다.            */

function installFakeServer({ talkDelayMs = 200, ttsOk = true } = {}) {
  const calls = { session: 0, talk: [], tts: [] };

  globalThis.fetch = async (url, opts) => {
    const body = JSON.parse(opts?.body || '{}');

    if (String(url).endsWith('/api/session')) {
      calls.session++;
      return jsonResponse(200, { mode: 'turn-based', endOfSpeechMs: 900, profile: { id: body.profileId } });
    }

    if (String(url).endsWith('/api/talk')) {
      calls.talk.push(body);
      await sleep(talkDelayMs);
      const n = calls.talk.length;
      return jsonResponse(200, { userText: `heard-${n}`, reply: `reply-${n}`, toolCalls: [] });
    }

    if (String(url).endsWith('/api/tts')) {
      calls.tts.push(body);
      if (!ttsOk) return jsonResponse(502, { error: 'tts_all_models_failed', hint: 'TTS 모델에 모두 접근하지 못했습니다.' });
      // 0.2초짜리 무음 PCM16 24kHz
      const samples = new Int16Array(AUDIO.OUTPUT_SAMPLE_RATE / 5);
      return jsonResponse(200, {
        audio: Buffer.from(samples.buffer).toString('base64'),
        sampleRate: AUDIO.OUTPUT_SAMPLE_RATE,
      });
    }

    throw new Error(`테스트에 없는 주소입니다: ${url}`);
  };

  return calls;
}

function jsonResponse(status, obj) {
  return { ok: status >= 200 && status < 300, status, json: async () => obj };
}

/**
 * 사람이 말하는 것처럼 생긴 PCM 을 만듭니다.
 *
 * ⚠️ 예전에는 `new Int16Array(n).fill(1000)` — 즉 **꼼짝도 않는 상수값**이었습니다.
 *    그건 소리가 아니라 직류입니다. 사람 목소리는 음절마다 크게 출렁이고
 *    앞뒤에 반드시 조용한 구간이 있습니다.
 *
 *    가짜 데이터가 진짜와 다르면, 테스트는 통과하는데 앱은 고장납니다.
 *    실제로 "말소리가 들어 있나" 검사를 붙이자마자 이 상수값이 전부
 *    걸러졌습니다 — 검사가 옳았고 가짜 데이터가 틀렸던 겁니다.
 */
function speechLikePcm(totalSamples, { quietLead = 0.15 } = {}) {
  const pcm = new Int16Array(totalSamples);
  const lead = Math.floor(totalSamples * quietLead);
  for (let i = 0; i < totalSamples; i++) {
    const inSpeech = i >= lead && i < totalSamples - lead;
    // 음절: 약 5Hz 로 크기가 출렁입니다
    const syllable = inSpeech ? 0.35 + 0.65 * Math.abs(Math.sin((i / 16000) * Math.PI * 5)) : 0;
    const amp = inSpeech ? 0.06 * syllable : 0.0025;   // 말할 때 0.06, 쉴 때 밑소음
    pcm[i] = Math.round(amp * Math.SQRT2 * 32768 * Math.sin(i * 0.31));
  }
  return pcm;
}

/** 0.5초짜리 말소리 한 덩어리 (base64 PCM16 16kHz 조각들) */
function utteranceFrames(sampleCount = AUDIO.INPUT_SAMPLE_RATE / 2) {
  const pcm = speechLikePcm(sampleCount);
  return [Buffer.from(pcm.buffer).toString('base64')];
}

/** 아무도 말하지 않은 방 (게이트가 잘못 열렸을 때 올라가던 그 덩어리) */
function roomNoiseFrames(seconds = 20, rms = 0.005) {
  const n = AUDIO.INPUT_SAMPLE_RATE * seconds;
  const pcm = new Int16Array(n);
  for (let i = 0; i < n; i++) {
    pcm[i] = Math.round(rms * Math.SQRT2 * 32768 * Math.sin(i * 0.17));
  }
  return [Buffer.from(pcm.buffer).toString('base64')];
}

/** 마이크가 하는 일을 그대로 흉내냅니다: start → 오디오 → end */
function speak(session, frames = utteranceFrames()) {
  session.sendActivityStart();
  for (const f of frames) session.sendAudio(f);
  return session.sendActivityEnd();
}

async function newSession(handlers = {}, opts = {}) {
  const calls = installFakeServer(opts);
  const seen = { states: [], teacher: [], user: [], audioChunks: 0, turns: 0 };

  const session = new ChatSession({
    onState: (s, info) => seen.states.push({ state: s, info }),
    onTeacherText: (t) => seen.teacher.push(t),
    onUserText: (t) => seen.user.push(t),
    onAudio: () => { seen.audioChunks++; },
    onTurnComplete: () => { seen.turns++; },
    ...handlers,
  });

  // isResume: true → 첫 인사 턴을 건너뜁니다 (테스트가 세려는 턴만 남깁니다)
  await session.connect('p_child1', { isResume: true });
  return { session, calls, seen };
}

/* ═══════════════════════════════════════════════════════════════════════════
   1. 핵심: 대답을 기다리는 동안 한 말이 사라지지 않는다
   ═══════════════════════════════════════════════════════════════════════════ */

async function testNothingIsSwallowed() {
  console.log('\n[1] 선생님이 대답하는 동안 아이가 또 말해도 사라지지 않는가');

  const { session, calls, seen } = await newSession();

  check('연결됐다', session.isLive, `state=${session.state}`);

  // 첫 번째 발화
  const first = speak(session);
  check('첫 발화가 받아들여졌다', first === true);

  // 아직 서버가 대답하는 중(200ms)인 시점에 두 번째 발화
  await sleep(50);
  check('아직 왕복 중이다', session._busy === true, '테스트 전제가 깨졌습니다 (talkDelay를 늘리세요)');

  const second = speak(session);
  check('기다리는 동안 한 말도 받아들여졌다 (여기가 회귀 지점)', second === true,
        'sendActivityEnd 가 false 를 돌려줬습니다 = 아이 말이 조용히 버려졌습니다');

  // 두 턴이 모두 끝날 때까지
  await sleep(600);

  check('/api/talk 이 두 번 호출됐다', calls.talk.length === 2,
        `실제 호출: ${calls.talk.length}번. 1번이면 두 번째 발화가 버려진 것입니다.`);
  check('두 번 모두 오디오를 실어 보냈다',
        calls.talk.every((c) => typeof c.audio === 'string' && c.audio.length > 100),
        JSON.stringify(calls.talk.map((c) => (c.audio ? `audio(${c.audio.length})` : `text(${c.text})`))));
  check('선생님이 두 번 대답했다', seen.teacher.length === 2, seen.teacher.join(' | '));
  check('턴 완료가 두 번 보고됐다', seen.turns === 2, `turns=${seen.turns}`);
  check('밀린 것이 남아 있지 않다', session._pendingFrames === null);

  await session.disconnect();
}

/* ═══════════════════════════════════════════════════════════════════════════
   2. 밀렸다는 사실이 화면에 보이는가 (조용한 처리 금지)
   ═══════════════════════════════════════════════════════════════════════════ */

async function testQueueIsVisible() {
  console.log('\n[2] 말이 밀렸다는 사실을 화면에 알리는가');

  const { session, seen } = await newSession();

  speak(session);
  await sleep(50);
  speak(session);
  await sleep(600);

  const notified = seen.states.some(
    (s) => s.state === LiveState.LIVE && typeof s.info?.message === 'string' && s.info.message.includes('잠깐만요')
  );
  check('"잠깐만요" 안내가 화면으로 나갔다', notified,
        '밀린 사실을 아무에게도 알리지 않으면, 반응이 늦는 이유를 부모가 알 수 없습니다.');

  await session.disconnect();
}

/* ═══════════════════════════════════════════════════════════════════════════
   3. 너무 짧은 소리는 여전히 걸러진다 (문 닫는 소리로 요금이 나가면 안 됨)
   ═══════════════════════════════════════════════════════════════════════════ */

async function testShortNoiseStillDropped() {
  console.log('\n[3] 0.3초 미만의 소리는 보내지 않는가');

  const { session, calls } = await newSession();

  const accepted = speak(session, utteranceFrames(AUDIO.INPUT_SAMPLE_RATE * 0.1)); // 0.1초
  check('짧은 소리는 거절됐다', accepted === false);

  await sleep(300);
  check('/api/talk 을 부르지 않았다', calls.talk.length === 0, `호출 ${calls.talk.length}번`);

  await session.disconnect();
}

/* ═══════════════════════════════════════════════════════════════════════════
   4. TTS 가 실패하면 반드시 눈에 보이게 알린다
   ═══════════════════════════════════════════════════════════════════════════ */

async function testTtsFailureIsVisible() {
  console.log('\n[4] 목소리를 못 불러왔을 때 조용히 넘어가지 않는가');

  const { session, seen } = await newSession({}, { ttsOk: false });

  speak(session);
  await sleep(400);

  const badge = seen.states.find((s) => s.info?.fallback === 'browser-tts');
  check('폴백 상태를 화면에 알렸다', !!badge,
        '이걸 빠뜨리면 선생님 목소리가 바뀌었는데도 화면은 멀쩡해 보입니다.');
  check('선생님 대사 자체는 그대로 나왔다', seen.teacher.length === 1, seen.teacher.join(' | '));

  await session.disconnect();
}

/* ═══════════════════════════════════════════════════════════════════════════
   5. 정상 경로에서 오디오가 아바타/재생기 쪽으로 흘러가는가
   ═══════════════════════════════════════════════════════════════════════════ */

async function testAudioReachesPlayer() {
  console.log('\n[5] 만들어진 음성이 재생기·아바타로 흘러가는가');

  const { session, seen } = await newSession();

  speak(session);
  await sleep(400);

  // 0.2초 음성을 0.1초 단위로 쪼개므로 2조각이 나와야 합니다
  check('오디오 조각이 전달됐다', seen.audioChunks === 2, `조각 수=${seen.audioChunks}`);

  await session.disconnect();
}

/* ═══════════════════════════════════════════════════════════════════════════
 * [6] 선생님이 자기 말을 아이 말로 되받지 않는다
 *
 * 2026-08-16 실제 사고:
 *   아이 말풍선에 "REPLY: I'm ready whenever you are! What did you do today?"
 *   가 그대로 찍히고, 선생님이 그 말에 대답하며 혼자 대화를 이어갔습니다.
 *
 * 원인:
 *   api/talk.js 의 `/^\s*HEARD:\s*(.*)$/im` 에서 `\s` 가 줄바꿈을 포함해,
 *   HEARD 가 비어 있으면 다음 줄(REPLY 줄) 전체를 아이 말로 잡아갔습니다.
 *
 * 이 테스트를 깨는 법 (구멍이 되살아났는지 확인용):
 *   api/_parseTurn.js 의 HEARD_RE 를 /^\s*HEARD:\s*(.*)$/im 으로 되돌리면
 *   6-1 이 반드시 실패합니다.
 * ═══════════════════════════════════════════════════════════════════════════ */

function testHeardNeverStealsReplyLine() {
  console.log('\n[6] 선생님 대사가 아이 말로 둔갑하지 않는가');

  /* 6-1 사고 당시의 그 입력 그대로 */
  const crash = parseTurnText({
    rawText: "HEARD:\nREPLY: I'm ready whenever you are! What did you do today?",
    userText: '',
    hasAudio: true,
  });
  check(
    '빈 HEARD 가 다음 줄을 훔쳐가지 않는다',
    crash.heard === '',
    `heard=${JSON.stringify(crash.heard)}`
  );
  check(
    '선생님 대사에는 접두사가 남지 않는다',
    crash.reply === "I'm ready whenever you are! What did you do today?",
    `reply=${JSON.stringify(crash.reply)}`
  );
  check(
    '말소리가 없었다는 사실을 화면에 알릴 수 있다',
    crash.heardEmpty === true,
    `heardEmpty=${crash.heardEmpty}`
  );

  /* 6-2 정상적인 턴은 그대로 통과해야 합니다.
        (아이 말을 지우는 건 어떤 경우에도 감수할 수 없는 대가입니다) */
  const normal = parseTurnText({
    rawText: 'HEARD: I goed to the park\nREPLY: You went to the park! That sounds fun.',
    userText: '',
    hasAudio: true,
  });
  check(
    '아이가 한 말이 문법 교정 없이 그대로 남는다',
    normal.heard === 'I goed to the park',
    `heard=${JSON.stringify(normal.heard)}`
  );
  check('정상 턴은 빈 발화로 취급되지 않는다', normal.heardEmpty === false);

  /* 6-3 모델이 형식을 아예 안 지킨 경우 —
        아이 말을 버리지 말고, 전체를 선생님 대사로 살려야 합니다. */
  const freeform = parseTurnText({
    rawText: 'That sounds fun! Tell me more.',
    userText: '',
    hasAudio: true,
  });
  check(
    '형식을 안 지켜도 대사는 살아남는다',
    freeform.reply === 'That sounds fun! Tell me more.',
    `reply=${JSON.stringify(freeform.reply)}`
  );
  check(
    '형식 미준수를 빈 발화로 오해하지 않는다',
    freeform.heardEmpty === false,
    `heardEmpty=${freeform.heardEmpty}`
  );

  /* 6-4 글자로 보낸 턴은 아이가 친 글자가 그대로 남아야 합니다. */
  const typed = parseTurnText({
    rawText: 'REPLY: Nice to meet you too!',
    userText: 'hello teacher',
    hasAudio: false,
  });
  check(
    '글자로 보낸 턴은 아이가 친 글자를 유지한다',
    typed.heard === 'hello teacher',
    `heard=${JSON.stringify(typed.heard)}`
  );

  /* 6-5 어떤 경로로든 형식 딱지가 묻은 글자는 아이 말로 내보내지 않습니다. */
  const tainted = parseTurnText({
    rawText: 'HEARD: REPLY: hello there\nREPLY: Hi!',
    userText: '',
    hasAudio: true,
  });
  check(
    '형식 딱지가 묻은 글자는 아이 말풍선에 안 나간다',
    !/^\s*(HEARD|REPLY)\s*:/i.test(tainted.heard),
    `heard=${JSON.stringify(tainted.heard)}`
  );

  /* 6-6 ⚠️ 여기가 진짜 핵심입니다.
        위 6-1 은 parseTurnText 안의 **이중 안전장치**("딱지가 묻었으면 버린다")
        가 대신 막아주기 때문에, 정규식을 옛날 것으로 되돌려도 통과해 버립니다.
        실제로 확인해 봤고, 통과했습니다. 그건 테스트가 아니라 장식입니다.

        그래서 정규식 자체를 따로 검사합니다. 안전장치는 최후의 방어선이지
        정규식이 틀려도 된다는 뜻이 아닙니다. 두 겹 다 성해야 합니다. */
  const m = "HEARD:\nREPLY: hello".match(HEARD_RE);
  check(
    'HEARD 정규식이 줄바꿈을 절대 넘지 않는다',
    !!m && m[1] === '',
    `캡처=${JSON.stringify(m && m[1])} — \\s 는 줄바꿈을 포함합니다. [^\\S\\r\\n] 를 쓰세요.`
  );
}

/* ═══════════════════════════════════════════════════════════════════════════
 * [7] 목사님이 말을 하면, 그 말이 반드시 서버까지 간다
 *
 * 2026-08-16 실제 사고:
 *   "내 말은 인식하지 못하고, 내가 하지도 않은 말을 혼자 만들어내면서
 *    대화를 이어간다. 두 번째부터는 더 안 된다."
 *
 * 계측으로 밝혀진 원인 (세 겹이었습니다):
 *   ① 유지문턱(sustain)이 밑소음보다 **아래**에 있어서, 한 번 열린 마이크가
 *      영원히 안 닫힘 → activity:'end' 가 안 나감 → 한 마디도 서버에 안 감.
 *   ② 소음 추정기가 **아래로만** 배움. 방이 문턱보다 시끄러워지면 갱신 기회가
 *      영영 안 와서 추정치가 굳어버림.
 *   ③ 소음이 고르면 변동폭이 0 으로 수렴해 문턱 사이 간격이 사라지고,
 *      그 틈에 밑소음이 그대로 앉음 → 첫 문장 뒤로 계속 열린 채 먹통.
 *
 * 이 테스트는 **실제 mic.js / gate.js** 를 돌립니다. 로직을 복제하지 않습니다.
 * ═══════════════════════════════════════════════════════════════════════════ */

const FRAME_MS = (AUDIO.FRAME_SAMPLES / AUDIO.INPUT_SAMPLE_RATE) * 1000;

/** 지정한 세기(RMS)를 갖는 한 프레임 */
function micFrame(rms, phase) {
  const f = new Float32Array(AUDIO.FRAME_SAMPLES);
  const amp = rms * Math.SQRT2;
  for (let i = 0; i < f.length; i++) f[i] = amp * Math.sin((i + phase) * 0.05);
  return f;
}

/**
 * 방에서 실제로 벌어지는 일을 마이크에 흘려넣고,
 * 서버로 나간 턴이 몇 개인지 셉니다.
 */
function runMic({ ambient, voice, turns, endOfSpeech }) {
  let t = 0;
  let phase = 0;
  let open = false;
  let openFrames = 0;
  const got = [];

  const mic = new MicStream({
    onAudioFrame: () => { if (open) openFrames++; },
    onActivity: (kind) => {
      if (kind === 'start') { open = true; openFrames = 0; }
      else { open = false; got.push(openFrames * FRAME_MS); }
    },
    onLevel: () => {},
    onStreamedMs: () => {},
    now: () => t,
  });
  mic.running = true;
  mic.utterancePeak = 0;
  if (endOfSpeech) mic.setEndOfSpeechMs(endOfSpeech);

  const feed = (ms, rms, speech) => {
    const n = Math.round(ms / FRAME_MS);
    for (let i = 0; i < n; i++) {
      const lv = speech ? rms * (i % 4 === 3 ? 0.35 : 1) : rms;
      mic._handleFrame(micFrame(lv, (phase += 7)));
      t += FRAME_MS;
    }
  };

  feed(6000, ambient, false);              // 앱을 켜고 조용히 기다림
  for (let k = 0; k < turns; k++) {
    feed(2500, voice, true);               // 한 문장
    feed(6000, ambient, false);            // 선생님이 대답하는 동안
  }
  feed(5000, ambient, false);
  return got;
}

function testEveryUtteranceReachesServer() {
  console.log('\n[7] 말을 하면 반드시 서버까지 가는가 (실제 mic.js/gate.js)');

  /* 7-1 조용한 방부터 시끄러운 방까지, 큰 목소리와 작은 목소리 모두.
         ⚠️ 되돌리기 **실제로 해 봤습니다.** (2026-08-16)
            · sustainThreshold → `onset * 0.55`            → 5건 실패 ✔ 잡힘
            · noiseCeiling 의 `Math.max(dev, floor*0.12)`
              → 그냥 `this.noiseDev` 로                     → 4건 실패 ✔ 잡힘
            · sustainThreshold 에 `Math.min(onset*0.9, …)` 상한 도로 추가
              → **통과**. 이 상한은 애초에 범인이 아니었습니다. 기록을 고쳤습니다. */
  const AMBIENTS = [0.0010, 0.0030, 0.0050, 0.0080, 0.0120];
  const VOICES = [0.05, 0.02];
  const N = 4;

  const misses = [];
  for (const ambient of AMBIENTS) {
    for (const voice of VOICES) {
      const got = runMic({ ambient, voice, turns: N });
      if (got.length !== N) {
        misses.push(`밑소음 ${ambient.toFixed(4)} / 목소리 ${voice.toFixed(3)} → ${got.length}/${N}`);
      }
    }
  }
  check(
    `${AMBIENTS.length * VOICES.length}가지 방에서 ${N}번 말하면 ${N}번 다 서버로 간다`,
    misses.length === 0,
    misses.join('  |  ')
  );

  /* 7-2 게이트가 열린 채 굳지 않는가.
         닫히지 않으면 턴 하나가 통째로 정체 감시 시간(20초)까지 부풀어 오릅니다. */
  const long = runMic({ ambient: 0.0050, voice: 0.05, turns: 4 });
  const bloated = long.filter((ms) => ms > 15000);
  check(
    '턴 하나가 20초짜리 소음 덩어리로 부풀지 않는다',
    bloated.length === 0,
    `부푼 턴: ${bloated.map((m) => Math.round(m) + 'ms').join(', ')} — 게이트가 안 닫히고 있습니다`
  );

  /* 7-3 두 번째 턴부터 먹통이 되지 않는가 (목사님이 겪으신 그 증상).
         정체 해제가 **최고음**을 소음으로 학습하면(옛 코드) 여기서 죽습니다. */
  const many = runMic({ ambient: 0.0050, voice: 0.05, turns: 6 });
  check(
    '여섯 번 연달아 말해도 여섯 번 다 간다 (두 번째부터 먹통 아님)',
    many.length === 6,
    `서버가 받은 횟수 = ${many.length}`
  );
}

/* ═══════════════════════════════════════════════════════════════════════════
 * [8] 긴 문장이 조각나지 않는다
 *
 * "짧은 문장 또는 단어는 이해하는데 긴 문장은 이해 못하네."
 *
 * 비원어민은 문장 한복판에서 단어를 찾느라 2~3초씩 멈춥니다.
 * 말끝대기가 그보다 짧으면 한 문장이 여러 조각으로 잘려 나가고,
 * 선생님은 첫 조각만 듣고 대답을 시작합니다.
 * ═══════════════════════════════════════════════════════════════════════════ */

function testLongSentenceStaysWhole() {
  console.log('\n[8] 긴 문장이 한 덩어리로 가는가');

  /* 목사님이 실제로 하신 문장:
     "Because today Sunday, ... I'm pastor, ... so I should be preaching twice time." */
  const SENTENCE = [
    { ms: 2200, speech: true },
    { ms: 1800, speech: false },
    { ms: 1400, speech: true },
    { ms: 2600, speech: false },   // 여기가 문제였던 멈춤
    { ms: 3200, speech: true },
  ];

  function speakSentence(endOfSpeech) {
    let t = 0, phase = 0, open = false, openFrames = 0;
    const got = [];
    const mic = new MicStream({
      onAudioFrame: () => { if (open) openFrames++; },
      onActivity: (k) => {
        if (k === 'start') { open = true; openFrames = 0; }
        else { open = false; got.push(openFrames * FRAME_MS); }
      },
      onLevel: () => {}, onStreamedMs: () => {}, now: () => t,
    });
    mic.running = true;
    mic.utterancePeak = 0;
    mic.setEndOfSpeechMs(endOfSpeech);

    const feed = (ms, rms, speech) => {
      const n = Math.round(ms / FRAME_MS);
      for (let i = 0; i < n; i++) {
        mic._handleFrame(micFrame(speech ? rms * (i % 4 === 3 ? 0.35 : 1) : rms, (phase += 7)));
        t += FRAME_MS;
      }
    };
    feed(6000, 0.003, false);
    for (const s of SENTENCE) feed(s.ms, s.speech ? 0.05 : 0.003, s.speech);
    feed(6000, 0.003, false);
    return got;
  }

  /* 8-1 ⚠️ 되돌리기 확인: api/_persona.js 의 ADULT_TUNING.intermediate
         silenceDurationMs 를 1100 으로 되돌리면 여기서 반드시 실패합니다.
         (1100ms 에서는 3조각으로 잘립니다) */
  const dadWait = endOfSpeechMs(FAMILY_PROFILES.p_dad);
  const pieces = speakSentence(dadWait);
  check(
    `'아빠' 실제 설정(${dadWait}ms)에서 긴 문장이 한 덩어리로 간다`,
    pieces.length === 1,
    `${pieces.length}조각으로 잘렸습니다 (${pieces.map((m) => Math.round(m) + 'ms').join(', ')}) — ` +
      `조각나면 선생님이 첫 조각만 듣고 대답합니다`
  );

  /* 8-2 어떤 가족도 문장이 조각나는 속도로는 못 자르게 되어 있는가 */
  const tooFast = Object.values(FAMILY_PROFILES)
    .filter((p) => endOfSpeechMs(p) < MIN_END_OF_SPEECH_MS)
    .map((p) => `${p.name}=${endOfSpeechMs(p)}ms`);
  check(
    `모든 가족의 말끝대기가 하한(${MIN_END_OF_SPEECH_MS}ms) 이상이다`,
    tooFast.length === 0,
    tooFast.join(', ')
  );

  /* 8-3 그렇다고 짧은 대답이 못 가면 안 됩니다 (고치다가 반대쪽을 깨는 것 방지) */
  const shortAnswer = runMic({ ambient: 0.003, voice: 0.05, turns: 3, endOfSpeech: dadWait });
  check(
    '짧은 대답도 여전히 잘 간다',
    shortAnswer.length === 3,
    `서버가 받은 횟수 = ${shortAnswer.length}`
  );
}

/* ═══════════════════════════════════════════════════════════════════════════
 * [9] 아무도 말하지 않았으면 서버에 보내지 않는다
 *
 * 이것이 "하지 않은 말을 지어낸다"를 막는 마지막 방어선입니다.
 * api/talk.js 는 모델에게 "학생이 한 말을 받아쓰라"고 명령합니다.
 * 잡음만 올려보내면 모델은 시키는 대로 **없는 말을 지어냅니다.**
 * ═══════════════════════════════════════════════════════════════════════════ */

function pcmFrom(segments) {
  const out = [];
  let phase = 0;
  for (const s of segments) {
    const n = Math.round((AUDIO.INPUT_SAMPLE_RATE * s.ms) / 1000);
    const buf = new Int16Array(n);
    for (let i = 0; i < n; i++) {
      const wob = s.speech ? (Math.floor(i / 1600) % 4 === 3 ? 0.3 : 1) : 1;
      buf[i] = Math.round(s.rms * wob * Math.SQRT2 * 32768 * Math.sin((phase += 0.05)));
    }
    out.push(buf);
  }
  return out;
}

function testSilenceIsNeverSentToTheModel() {
  console.log('\n[9] 아무 말도 안 했으면 서버에 안 보내는가');

  const NOISE_ONLY = [
    ['아무도 말 안 한 방 20초', [{ ms: 20000, rms: 0.005, speech: false }]],
    ['아무도 말 안 한 방 45초', [{ ms: 45000, rms: 0.005, speech: false }]],
    ['에어컨 도는 방 20초', [{ ms: 20000, rms: 0.012, speech: false }]],
    ['완전한 무음 10초', [{ ms: 10000, rms: 0, speech: false }]],
  ];
  for (const [name, segs] of NOISE_ONLY) {
    const v = shouldSendAudio(pcmFrom(segs), AUDIO.INPUT_SAMPLE_RATE);
    check(`${name} → 안 보낸다`, v.ok === false, `말소리 ${Math.round(v.speechMs)}ms 로 쟀습니다`);
  }

  /* 9-2 ⭐ 반대쪽이 훨씬 중요합니다.
         아이 말을 지우는 건 어떤 경우에도 감수할 수 없는 대가입니다.
         조용한 목소리, 한 단어 대답, 멈춤이 많은 긴 문장 — 전부 살아야 합니다. */
  const REAL_SPEECH = [
    ['"Yes." 한 마디', [{ ms: 700, rms: 0.004, speech: false }, { ms: 500, rms: 0.05, speech: true }, { ms: 700, rms: 0.004, speech: false }]],
    ['조용조용 말하는 4살', [{ ms: 700, rms: 0.003, speech: false }, { ms: 900, rms: 0.015, speech: true }, { ms: 700, rms: 0.003, speech: false }]],
    ['멈춤 많은 긴 문장', [{ ms: 1000, rms: 0.005, speech: false }, { ms: 2200, rms: 0.05, speech: true }, { ms: 2600, rms: 0.005, speech: false }, { ms: 1400, rms: 0.05, speech: true }, { ms: 2600, rms: 0.005, speech: false }, { ms: 3200, rms: 0.05, speech: true }]],
    ['시끄러운 방에서 말함', [{ ms: 1000, rms: 0.012, speech: false }, { ms: 2000, rms: 0.06, speech: true }, { ms: 1000, rms: 0.012, speech: false }]],
  ];
  for (const [name, segs] of REAL_SPEECH) {
    const frames = pcmFrom(segs);
    const v = shouldSendAudio(frames, AUDIO.INPUT_SAMPLE_RATE);
    const m = measureSpeech(frames, AUDIO.INPUT_SAMPLE_RATE);
    check(
      `${name} → 반드시 보낸다`,
      v.ok === true,
      `말소리를 ${Math.round(m.speechMs)}ms 로 쟀습니다 — 사람 말을 버리고 있습니다`
    );
  }
}

async function testRoomNoiseNeverReachesTalkApi() {
  console.log('\n[10] 잡음 덩어리가 /api/talk 까지 흘러가지 않는가');

  const notices = [];
  const { session, calls } = await newSession({
    onState: (_s, info) => { if (info?.message) notices.push(info.message); },
  });

  const sent = speak(session, roomNoiseFrames(20));
  await sleep(60);

  check('잡음만 든 20초는 보내지 않았다', sent === false);
  check(
    '/api/talk 을 부르지 않았다 (지어낼 기회를 안 준다)',
    calls.talk.length === 0,
    `실제 호출 ${calls.talk.length}번`
  );
  check(
    '왜 안 보냈는지 화면에 알렸다 (조용한 폴백 금지)',
    notices.some((m) => /말소리|주변 소리/.test(m)),
    `화면에 나간 안내: ${JSON.stringify(notices)}`
  );

  /* 그리고 바로 다음에 진짜로 말하면 정상 동작해야 합니다 */
  const ok = speak(session);
  await sleep(300);
  check('그 다음에 진짜로 말하면 정상으로 간다', ok === true && calls.talk.length === 1);
}

/* ═══════════════════════════════════════════════════════════════════════════
 * [11] 정체 감시(워치독)가 돈 뒤에도 귀가 살아 있는가
 *
 * 왜 따로 만들었나 — 되돌리기 검증에서 구멍이 드러났습니다.
 *   `_guardStuckOpen` 을 옛날처럼 `burstPeak * 0.6`(사람이 낸 **최고음**의 60%)
 *   으로 되돌렸는데 테스트 [7]이 그냥 통과했습니다. 게이트가 이제 잘 닫혀서
 *   워치독이 **아예 한 번도 안 돌았기** 때문입니다.
 *   즉 [7]은 워치독 경로를 전혀 지키지 못하고 있었습니다.
 *
 * 그래서 워치독이 **반드시 돌 수밖에 없는** 상황을 만듭니다:
 *   TV가 켜져 있거나 아이들이 25초 내내 떠드는 방. 게이트는 정당하게 계속
 *   열려 있고, 20초(MAX_CONTINUOUS_STREAM_MS)를 넘겨 워치독이 발동합니다.
 *   그 **직후에** 목사님이 평소 목소리로 말합니다. 들려야 합니다.
 *
 * 옛 코드는 여기서 밑소음을 0.05×0.6 = 0.030 으로 학습해 시작문턱을
 * 0.044 까지 올려버립니다. 평소 목소리(0.022)는 영영 문턱을 못 넘습니다.
 * → "두 번째부터는 잘 인식이 안 되네"의 또 다른 경로입니다.
 * ═══════════════════════════════════════════════════════════════════════════ */

/* ═══════════════════════════════════════════════════════════════════════════
 * [12] 2026-08-18 사고 — "아주 큰소리로 대화해야 이해한다"
 *
 * 목사님 신고 그대로:
 *   "아주 큰소리로 대화해야 이해하고, 긴문장은 전혀 받아들이지 못해,
 *    단어나 짧은 문장만 이해해"
 *
 * 원인은 gate.js 의 _rescueNoiseStats 였습니다. 소음 통계 갱신이 4초 넘게
 * 없으면 "이번 구간의 가장 조용한 순간"을 밑소음으로 받아들였는데, 사람이
 * 4초 넘게 이어서 말하면 **그 조용한 순간이 사람 목소리**였습니다.
 * 계측: 6초 연속 발화 뒤 시작문턱 0.00679 → 0.04677 (6.9배).
 *
 * ⚠️ 되돌리기 확인 방법:
 *    _rescueNoiseStats 를 되살리고 process() 의 else 가지를 복구하면
 *    12-1 과 12-2 가 반드시 실패합니다. 실패하지 않으면 이 테스트는 장식입니다.
 * ═══════════════════════════════════════════════════════════════════════════ */

function testThresholdNeverLearnsTheHumanVoice() {
  console.log('\n[12] 오래 말해도 문턱이 사람 목소리 위로 올라가지 않는가');

  const NORMAL_VOICE = 0.025;   // 보통 대화 목소리 RMS
  const ROOM = 0.004;           // 조용한 거실 밑소음

  function freshGate() {
    return new SilenceGate({
      noiseDevK: COST.NOISE_DEV_K,
      minSpeechRms: COST.MIN_SPEECH_RMS,
      maxSpeechRms: COST.MAX_SPEECH_RMS,
      silenceTailMs: COST.SILENCE_TAIL_MS,
      maxContinuousStreamMs: COST.MAX_CONTINUOUS_STREAM_MS,
    });
  }

  /** 일정한 세기의 소리를 ms 만큼 흘려넣습니다. */
  function pour(g, t0, level, ms, jitter = 0.12) {
    let t = t0;
    for (let i = 0; i < Math.round(ms / FRAME_MS); i++) {
      g.process(Math.max(0, level * (1 + (Math.random() * 2 - 1) * jitter)), t);
      t += FRAME_MS;
    }
    return t;
  }

  /* 12-1 ── 6초 연속 발화 뒤에도 보통 목소리로 마이크가 열려야 합니다. */
  {
    const g = freshGate();
    let t = pour(g, 0, ROOM, 3000);
    t = pour(g, t, NORMAL_VOICE, 6000, 0.10);   // 쉬지 않고 6초 말하기
    t = pour(g, t, ROOM, 3000);
    const onset = g.onsetThreshold();
    check(
      `6초 연속 발화 뒤에도 보통 목소리(${NORMAL_VOICE})가 문턱을 넘는다`,
      NORMAL_VOICE > onset,
      `시작문턱이 ${onset.toFixed(5)} 까지 올라갔습니다. ` +
      `이러면 소리를 질러야만 마이크가 열립니다. (gate.js 의 소음 학습을 의심하세요)`,
    );
  }

  /* 12-2 ── 정체 감시(20초)가 발동한 뒤에도 마찬가지여야 합니다. */
  {
    const g = freshGate();
    let t = pour(g, 0, ROOM, 3000);
    t = pour(g, t, 0.030, COST.MAX_CONTINUOUS_STREAM_MS + 1500, 0.05);  // TV 소음
    const onset = g.onsetThreshold();
    check(
      `정체 감시 발동 뒤에도 보통 목소리(${NORMAL_VOICE})가 문턱을 넘는다`,
      NORMAL_VOICE > onset,
      `시작문턱이 ${onset.toFixed(5)}. _guardStuckOpen 이 사람 목소리를 소음으로 배웠습니다.`,
    );
  }

  /* 12-3 ── 문턱 천장 자체가 사람 목소리 아래에 있어야 합니다.
             이건 위 두 검사의 **근본 보증**입니다. 천장이 목소리 위로
             올라가면 어떤 학습 사고든 다시 마이크를 먹통으로 만듭니다. */
  check(
    `문턱 천장(MAX_SPEECH_RMS=${COST.MAX_SPEECH_RMS})이 보통 목소리보다 낮다`,
    COST.MAX_SPEECH_RMS < NORMAL_VOICE,
    `천장이 ${COST.MAX_SPEECH_RMS} 입니다. 보통 목소리(${NORMAL_VOICE})보다 낮아야 ` +
    `소음 추정이 아무리 어긋나도 마이크가 살아 있습니다.`,
  );

  /* 12-4 ── 히스테리시스가 절대 뒤집히지 않아야 합니다.
             유지문턱 > 시작문턱 이면 게이트가 열리는 즉시 꼬리로 떨어져서
             무슨 말을 해도 짧은 조각으로만 잘립니다. 천장을 도입했을 때
             실제로 이 일이 났습니다 (시작 0.01800 < 유지 0.02448). */
  {
    let worst = null;
    for (const noise of [0.001, 0.004, 0.009, 0.015, 0.03, 0.05]) {
      for (const duck of [1, 2, 3.5]) {
        const g = freshGate();
        let t = pour(g, 0, noise, 8000);
        g.setDuck(duck);
        const onset = g.onsetThreshold();
        const sustain = g.sustainThreshold();
        if (sustain >= onset) worst = { noise, duck, onset, sustain };
      }
    }
    check(
      '어떤 소음·duck 조합에서도 유지문턱이 시작문턱보다 낮다',
      worst === null,
      worst && `밑소음 ${worst.noise}, duck ${worst.duck} 에서 ` +
        `시작 ${worst.onset.toFixed(5)} ≤ 유지 ${worst.sustain.toFixed(5)} — 히스테리시스가 뒤집혔습니다.`,
    );
  }
}

function testEarsSurviveTheWatchdog() {
  console.log('\n[11] 워치독이 돌 때 무엇을 소음으로 배우는가');

  const gate = new SilenceGate({
    noiseDevK: COST.NOISE_DEV_K,
    minSpeechRms: COST.MIN_SPEECH_RMS,
    maxSpeechRms: COST.MAX_SPEECH_RMS,
    tailMs: 800,
    maxContinuousStreamMs: COST.MAX_CONTINUOUS_STREAM_MS,
    noiseStarvedMs: COST.NOISE_STARVED_MS,
    enabled: true,
  });

  /* 워치독이 실제로 발동한 순간의 게이트 상태를 그대로 재현합니다.
     사람이 25초 동안 말했고(최고음 0.05), 그 사이 가장 조용한 순간은
     단어 사이의 쉼(0.006)이었던 상황. */
  gate.reset();
  gate.state = GateState.SPEAKING;
  gate.streamStartedAt = 0;
  gate.lastLoudAt = 25_000;
  gate.burstPeak = 0.05;
  gate.burstFloor = 0.006;
  /* 2026-08-18(세 번째). 워치독이 읽는 값이 burstFloor 에서 **시간 창의
     바닥값**으로 바뀌었습니다. 그래서 여기도 창을 채워 줍니다.
     안 채우면 워치독이 아무것도 못 배워서, 되돌려도 통과하는 장식 테스트가 됩니다.
     @see gate.js _observeAmbient */
  gate.ambientMin = 0.006;
  gate.noiseFloor = 0.003;

  const fired = gate._guardStuckOpen(25_000);
  check(
    '25초 넘게 열려 있으면 워치독이 실제로 닫는다',
    fired === true,
    `_guardStuckOpen 이 ${fired} 를 돌려줬습니다 — 안 돌면 아래 검사가 무의미합니다`
  );

  const learned = gate.noiseFloor;
  const onsetAfter = gate.onsetThreshold();

  /* 핵심: 무엇을 배웠는가.
     - 바닥(0.006)을 배우면 밑소음은 0.007 언저리 → 평소 목소리가 잘 들립니다.
     - 최고음의 60%(0.030)를 배우면 시작문턱이 0.044 까지 올라가서
       평소 목소리(0.022)가 영영 문턱을 못 넘습니다. */
  check(
    '사람이 낸 최고음이 아니라 가장 조용했던 순간을 배운다',
    learned < 0.012,
    `배운 밑소음 = ${learned.toFixed(5)} (바닥 0.006 기준이면 0.007 언저리, ` +
      `최고음 0.05 의 60% 를 배우면 0.030) ` +
      `⚠️ 되돌리기 확인: gate.js 의 _guardStuckOpen 에서 \`floor * 1.15\` 를 ` +
      `\`this.burstPeak * 0.6\` 으로 되돌리면 여기서 반드시 실패합니다.`
  );

  const NORMAL_VOICE = 0.022;
  check(
    '워치독이 돈 뒤에도 평소 목소리가 문턱을 넘는다',
    NORMAL_VOICE > onsetAfter,
    `평소 목소리 ${NORMAL_VOICE} vs 시작문턱 ${onsetAfter.toFixed(5)} — ` +
      `문턱이 더 높으면 이 방에서는 두 번째 턴부터 아무 말도 안 들립니다`
  );

  /* 왜 이걸 mic.js 통째로가 아니라 게이트 단위로 검사하는가 — 계측 결과입니다.
     _rescueNoiseStats 가 소음 구간 도중에 밑소음을 올려버려서 게이트가 TAIL 로
     내려갔다 올라오고, 그때마다 streamStartedAt 이 초기화됩니다. 그래서 실제
     방 소리로는 20초가 절대 안 쌓이고 워치독이 발동하지 못합니다.
     (계측: TV 0.015~0.05 를 25초 넣어도 "열린지" 가 400ms 를 안 넘었습니다)
     워치독은 이제 마지막 안전망일 뿐입니다. 그러니 안전망이 걸렸을 때
     무엇을 배우는지를 여기서 직접 검사합니다. 방 소리로 흉내 내려 하면
     되돌려도 실패하지 않는 **장식 테스트**가 됩니다. 실제로 그렇게 만들어
     봤다가 옛 코드로 되돌려도 통과해서 이 방식으로 바꿨습니다. */
}

/* ═══════════════════════════════════════════════════════════════════════════
 * [13] 2026-08-18 (세 번째) — "여러 턴 대화하면 점점 못 알아듣는다"
 *
 * 목사님 신고 그대로: 말을 안 알아듣는다 / 문장이 중간에 끊긴다 /
 * 선생님이 말을 지어낸다 / 느리다. 넷 다 **한 가지 원인**에서 나옵니다.
 *
 * 위 [7][8][12] 가 왜 이걸 못 잡았는가 — 파형이 틀렸기 때문입니다.
 * 그 테스트들은 세기가 **거의 평평한** 소리를 씁니다. 실제 사람 말은
 * 음절마다(약 280ms) 세기가 크게 꺼집니다. 그리고 [7][8][12] 는 한두 턴만
 * 봅니다. 이 병은 **턴이 쌓이면서** 문턱이 조금씩 기어오르는 병입니다.
 *
 * 그래서 여기서만:
 *   ① 음절 포락선이 있는 파형을 쓰고   ② 8턴을 이어서 돌립니다.
 *
 * ⚠️ 되돌리기 확인 방법 (실제로 되돌려 보고 확인한 것만 적습니다):
 *    _rescueNoiseStats / _guardStuckOpen 의 `this.ambientFloor()` 를
 *    예전처럼 `this.burstFloor` 로 되돌리면 아래 13-2, 13-3 이
 *    신고된 증상 그대로("시작 0 · 끝 0, 그때 시작문턱 0.01800") 실패합니다.
 *    실패하지 않으면 이 테스트는 장식입니다.
 *
 *    한때 process() 에 `&& this.state !== GateState.SPEAKING` 를 붙이는 것도
 *    고침의 일부라고 적어 두었는데, 되돌려 봤더니 **아무 테스트도 안 깨졌습니다.**
 *    그래서 그 조건은 코드에서 뺐습니다. @see gate.js process()
 * ═══════════════════════════════════════════════════════════════════════════ */

function testThresholdDoesNotDriftOverManyTurns() {
  console.log('\n[13] 여러 턴 대화해도 문턱이 기어오르지 않는가 (음절이 있는 진짜 파형)');

  const ROOM = 0.0035;        // 조용한 집
  const ADULT = 0.032;        // 어른 보통 목소리
  const QUIET_CHILD = 0.012;  // 조용조용 말하는 4살

  /* 돌릴 때마다 숫자가 달라지면 "고쳤다"를 증명할 수 없습니다. 씨앗을 고정합니다. */
  let seed = 20260818;
  const rnd = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296);

  function freshGate() {
    return new SilenceGate({
      noiseDevK: COST.NOISE_DEV_K,
      minSpeechRms: COST.MIN_SPEECH_RMS,
      maxSpeechRms: COST.MAX_SPEECH_RMS,
      silenceTailMs: COST.SILENCE_TAIL_MS,
      maxContinuousStreamMs: COST.MAX_CONTINUOUS_STREAM_MS,
      noiseStarvedMs: COST.NOISE_STARVED_MS,
    });
  }

  /** 사람 말: 280ms 주기로 세기가 30% 까지 꺼집니다. 이게 이 테스트의 핵심입니다. */
  function speak(g, t0, peak, ms) {
    let t = t0, starts = 0, ends = 0;
    for (let i = 0; i < Math.round(ms / FRAME_MS); i++) {
      const syl = 0.30 + 0.70 * Math.pow(Math.abs(Math.cos((Math.PI * i * FRAME_MS) / 280)), 0.7);
      const r = g.process(Math.max(0, peak * syl * (1 + (rnd() * 2 - 1) * 0.12)), t);
      if (r.activity === 'start') starts++;
      if (r.activity === 'end') ends++;
      t += FRAME_MS;
    }
    return { t, starts, ends };
  }

  function room(g, t0, ms) {
    let t = t0, starts = 0, ends = 0;
    for (let i = 0; i < Math.round(ms / FRAME_MS); i++) {
      const r = g.process(Math.max(0, ROOM * (1 + (rnd() * 2 - 1) * 0.25)), t);
      if (r.activity === 'start') starts++;
      if (r.activity === 'end') ends++;
      t += FRAME_MS;
    }
    return { t, starts, ends };
  }

  /** 한 턴 = 앞 침묵 + 말 + 뒤 침묵(꼬리보다 길게). */
  function turn(g, t, peak, speechMs) {
    let starts = 0, ends = 0, r;
    r = room(g, t, 1200); t = r.t;
    r = speak(g, t, peak, speechMs); t = r.t; starts += r.starts; ends += r.ends;
    r = room(g, t, COST.SILENCE_TAIL_MS + 1200); t = r.t; starts += r.starts; ends += r.ends;
    return { t, starts, ends };
  }

  /* 13-1 ── 8턴을 이어서 말해도 매 턴이 **딱 한 덩어리**로 잡혀야 합니다.
             조각나면 → 선생님이 반토막 문장을 받고 나머지를 지어냅니다.
             아예 안 잡히면 → 말을 해도 아무 일도 안 일어납니다. */
  {
    const g = freshGate();
    let t = 0;
    const bad = [];
    for (let i = 1; i <= 8; i++) {
      const r = turn(g, t, ADULT, 4000);
      t = r.t;
      if (r.starts !== 1 || r.ends !== 1) {
        bad.push(`${i}턴: 시작 ${r.starts}·끝 ${r.ends} (문턱 ${g.onsetThreshold().toFixed(5)})`);
      }
    }
    check(
      '어른이 8턴 이어서 말해도 매 턴이 한 덩어리로 잡힌다',
      bad.length === 0,
      `어긋난 턴 — ${bad.join(' / ')}  ` +
      `말한 만큼 안 잡히면 선생님은 못 받은 부분을 지어냅니다.`,
    );
  }

  /* 13-2 ── 8턴 뒤에도 문턱이 **조용한 아이 목소리 아래**에 있어야 합니다.
             비율("1.5배 이내")로 재면 안 됩니다. 첫 턴부터 이미 높아져 있으면
             비율은 멀쩡해 보이는데 아이는 여전히 안 들립니다. 실제로 그렇게
             써 봤다가 되돌려도 통과해서 절대값 기준으로 바꿨습니다.
             계측(고치기 전): 1턴 0.00590 → 2턴부터 천장 0.01800 에 눌러붙음. */
  {
    const g = freshGate();
    let t = 0;
    t = turn(g, t, ADULT, 4000).t;
    const first = g.onsetThreshold();
    for (let i = 0; i < 7; i++) t = turn(g, t, ADULT, 4000).t;
    const last = g.onsetThreshold();
    check(
      `어른이 8턴 말해도 시작문턱이 조용한 아이 목소리(${QUIET_CHILD}) 아래에 남는다`,
      last < QUIET_CHILD,
      `첫 턴 ${first.toFixed(5)} → 8턴 뒤 ${last.toFixed(5)}. ` +
      `아빠가 말할수록 문턱이 올라가서, 옆에 있던 아이가 점점 안 들리게 됩니다.`,
    );
  }

  /* 13-3 ── 어른이 실컷 말한 뒤에 조용한 아이가 말해도 들려야 합니다.
             이 집의 실제 상황입니다(아빠가 말하고 4살이 대답). 고치기 전에는
             문턱이 0.018 이라 0.012 인 아이는 마이크를 **아예 못 열었습니다.** */
  {
    const g = freshGate();
    let t = 0;
    for (let i = 0; i < 6; i++) t = turn(g, t, ADULT, 4000).t;
    const onset = g.onsetThreshold();
    const r = turn(g, t, QUIET_CHILD, 3000);
    check(
      `어른이 6턴 말한 뒤에도 조용한 4살(${QUIET_CHILD})의 말이 잡힌다`,
      r.starts === 1 && r.ends === 1,
      `시작 ${r.starts}·끝 ${r.ends}, 그때 시작문턱 ${onset.toFixed(5)}. ` +
      `문턱이 아이 목소리 위면 아이는 아무리 말해도 화면이 반응하지 않습니다.`,
    );
  }

  /* 13-4 ── 12초짜리 긴 문장이 통째로 가야 합니다.
             [8] 이 이미 보지만, 거긴 첫 턴이고 파형이 평평합니다.
             여기서는 **4턴 대화한 뒤** 음절이 있는 파형으로 봅니다. */
  {
    for (const [peak, who] of [[ADULT, '어른'], [QUIET_CHILD, '조용한 아이']]) {
      const g = freshGate();
      let t = 0;
      for (let i = 0; i < 4; i++) t = turn(g, t, peak, 3000).t;
      const r = turn(g, t, peak, 12_000);
      check(
        `4턴 대화한 뒤 ${who}의 12초 긴 문장이 한 덩어리로 간다`,
        r.starts === 1 && r.ends === 1,
        `조각 ${r.starts}개 · 끝신호 ${r.ends}개 — 문장이 잘리면 선생님이 나머지를 지어냅니다.`,
      );
    }
  }
}

/* ═══════════════════════════════════════════════════════════════════════════ */

/* ═══════════════════════════════════════════════════════════════════════════ */

/**
 * [19] 2026-08-19 — "계속 문장만 고치고 Tell me more about it! 만 한다"
 *
 * 화면이 이 문장으로 도배됐습니다:
 *      Ah, you mean "I was very impressed by his sermon.". Tell me more about it!
 *      ... (연속 5번)
 *
 * 원인: 교정 카드를 Gemini **함수 호출**로 받았습니다. REST generateContent 에서
 * 모델이 함수를 부르면 응답에 함수 호출만 있고 **글자가 없습니다**(함수 결과를
 * 받은 뒤 말할 생각이므로). 그런데 이 앱은 무상태 REST 라 그 왕복이 없습니다.
 * → 매 턴 대사가 비었고, 서버 안전망 문장이 **주력이 되어** 대화가 죽었습니다.
 *
 * 해법: 함수 호출을 걷어내고 FIX:/WORD: 줄로 **같은 응답 안에서** 받습니다.
 */
function testTeachingComesBackWithTheReplyNotAsFunctionCall() {
  console.log('\n[19] 가르치기가 대사와 **같은 응답**으로 오는가');

  const talkSrc = readFileSync(new URL('../api/talk.js', import.meta.url), 'utf8');

  check(
    '요청에 함수 호출(tools)을 싣지 않는다',
    !/bodyData\.tools\s*=/.test(talkSrc),
    'tools 를 실으면 모델이 함수만 부르고 대사를 비웁니다'
  );
  check(
    '프롬프트가 FIX / WORD 줄을 요구한다',
    /FIX: <학생이 한 말>/.test(talkSrc) && /WORD: <가르칠 단어>/.test(talkSrc),
    '지시가 없으면 모델이 교정을 아예 안 보냅니다'
  );
  check('REPLY 를 비우지 말라고 못박는다', /절대 비우지 말 것/.test(talkSrc));

  const full = parseTurnText({
    rawText: [
      'HEARD: I visited three islands.',
      'REPLY: Three islands! Which one did you like most?',
      'FIX: I visited three islands. || I visited three islands: Kauai, Oahu, and Maui. || 섬 이름을 붙이면 자연스럽습니다.',
      'WORD: island hopping || 섬 여행 || We went island hopping.',
    ].join('\n'),
    hasAudio: true,
  });
  check('교정 카드가 만들어진다', full.toolCalls.some((c) => c.name === 'correct_sentence'));
  check('단어 카드가 만들어진다', full.toolCalls.some((c) => c.name === 'teach_word'));
  check(
    '대사에 FIX/WORD 줄이 새어들어가지 않는다',
    !/FIX:|WORD:|\|\|/.test(full.reply),
    `reply="${full.reply}" — 선생님이 이걸 소리내어 읽게 됩니다`
  );
  check('대사는 비어 있지 않다', full.reply.length > 0);

  const chatOnly = parseTurnText({
    rawText: 'HEARD: It was peaceful.\nREPLY: That peaceful feeling is why people love Hawaii. What stayed with you most?',
    hasAudio: true,
  });
  check('교정 없는 턴도 정상 처리된다', chatOnly.toolCalls.length === 0 && chatOnly.reply.length > 0);

  const noop = parseTurnText({
    rawText: 'HEARD: I am fine.\nREPLY: Good!\nFIX: I am fine. || I am fine. || 같음',
    hasAudio: true,
  });
  check('원문과 고친 문장이 같으면 카드를 안 띄운다', noop.toolCalls.length === 0);

  check(
    '같은 틀을 반복하지 말라는 지시가 있다',
    /Tell me more about it/.test(talkSrc) && /반복하지 마세요/.test(talkSrc)
  );
  check(
    '매 턴 교정하지 말라는 지시가 있다',
    /꼭 필요할 때만/.test(talkSrc) && /매 턴 고치지 마세요/.test(talkSrc)
  );
}

/* ═══════════════════════════════════════════════════════════════════════════ */

/**
 * [20] 2026-08-19 — "아바타도 좀 외모에 신경써주면 좋겠어."
 *
 * 얼굴을 구+원뿔+상자 조립에서 **깎아 만드는 방식**으로 바꿨습니다.
 * 만드는 동안 같은 종류의 실수를 여러 번 반복했으므로 못을 박아 둡니다.
 *
 *   ① 눈알을 눈대중 좌표에 뒀더니 살 **속에** 묻혀 눈이 아예 안 보였다.
 *   ② 입 구멍을 삼각형 단위로 도려냈더니 가장자리가 **톱니 상어이빨**.
 *   ③ 피부의 모프만 움직이고 입술 판을 잊어서 **입술이 다문 채**였다.
 *   ④ 좌우 부호를 `x>=0?1:-1` 로 나눠서 입술이 가운데서 **뚫고** 지나갔다.
 *   ⑤ 시작할 때마다 readyplayer.me 를 20초씩 두 번 기다렸다(늘 실패했다).
 */
function testFaceIsSculptedNotAssembled() {
  console.log('\n[20] 아바타 얼굴이 제대로 깎여 있는가');

  const faceSrc = readFileSync(new URL('../web_app/src/avatarFace.js', import.meta.url), 'utf8');
  const av3dSrc = readFileSync(new URL('../web_app/src/avatar3d.js', import.meta.url), 'utf8');

  /* ⚠️ 숫자를 여기 베껴 적으면 안 됩니다. 소스가 바뀌어도 검사는 옛날
        숫자로 통과해 버립니다. **소스에서 직접 읽어옵니다.** */
  const readNum = (re, label) => {
    const m = faceSrc.match(re);
    if (!m) throw new Error(`avatarFace.js 에서 ${label} 를 못 찾았습니다`);
    return parseFloat(m[1]);
  };
  const EYE_X = readNum(/const EYE_X = ([0-9.]+)/, 'EYE_X');
  const EYE_Y = readNum(/const EYE_Y = ([0-9.]+)/, 'EYE_Y');
  const EYE_R = readNum(/x: EYE_X, y: EYE_Y, r: ([0-9.]+)/, '눈알 반지름');
  const EYE_BACK = readNum(/surfaceAt\(EYE_X, EYE_Y\)\.z - ([0-9.]+)/, '눈알 깊이');

  const skin = faceModule.surfaceAt(EYE_X, EYE_Y);
  const corneaZ = skin.z - EYE_BACK + EYE_R;
  check(
    '눈알 앞면이 피부보다 앞에 있다',
    corneaZ > skin.z,
    `피부 z=${skin.z.toFixed(3)} · 각막 z=${corneaZ.toFixed(3)} — 눈이 얼굴 속에 묻힙니다`
  );
  check(
    '그렇다고 눈이 튀어나오지도 않는다',
    corneaZ - skin.z < 0.08,
    `${(corneaZ - skin.z).toFixed(3)} 만큼 나왔습니다 — 고글처럼 보입니다`
  );

  let worst = 0;
  for (const [x, y] of [[0.17, 0.29], [0.33, 0.35], [0.49, 0.26], [0, -0.17], [0, -0.455]]) {
    const p = faceModule.surfaceAt(x, y);
    worst = Math.max(worst, Math.abs(p.x - x), Math.abs(p.y - y));
  }
  check('표면 찾기가 목표 좌표로 수렴한다', worst < 0.002, `가장 큰 오차 ${worst.toFixed(4)}`);

  const cutA = readNum(/CUT_A = ([0-9.]+)/, 'CUT_A');
  const cutB = readNum(/CUT_B = ([0-9.]+)/, 'CUT_B');
  const lipA = readNum(/LIP_A = ([0-9.]+)/, 'LIP_A');
  const lipB = readNum(/LIP_B = ([0-9.]+)/, 'LIP_B');
  check(
    '입술 판이 도려낸 구멍보다 크다',
    lipA > cutA && lipB > cutB,
    `도려냄 ${cutA}×${cutB} · 입술 ${lipA}×${lipB} — 작으면 톱니 가장자리가 드러납니다`
  );
  check(
    '삼각형 세 점이 모두 안에 들 때만 지운다',
    /insideOne\(a\)\s*&&\s*insideOne\(b\)\s*&&\s*insideOne\(c\)/.test(faceSrc),
    '무게중심으로 지우면 구멍이 타원 밖으로 삐져나옵니다'
  );
  check(
    '표정을 넣는 setMorph 가 두 메시를 함께 건드린다',
    /setMorph\(index, value\)[\s\S]{0,500}headMesh\.morphTargetInfluences[\s\S]{0,300}lipMesh\.morphTargetInfluences/.test(faceSrc),
    '한쪽만 움직이면 턱은 벌어지는데 입술은 다문 채로 남습니다'
  );
  check(
    'avatar3d 가 setMorph 를 쓴다 (influences 를 직접 안 만진다)',
    /face\.setMorph\(MORPH\.JAW/.test(av3dSrc) && !/this\._fb\.influences\[/.test(av3dSrc),
    'influences 를 직접 만지면 입술 판이 빠집니다'
  );
  check(
    '좌우 부호가 한가운데에서 부드럽게 0 이 된다',
    /const sgn = Math\.max\(-1, Math\.min\(1, x \/ [0-9.]+\)\)/.test(faceSrc),
    'x>=0?1:-1 로 나누면 오므릴 때 입술이 가운데서 서로를 뚫습니다'
  );
  check(
    '주소를 안 넣으면 외부 모델을 받으러 가지 않는다',
    /if \(this\.opts\.modelUrl\) \{/.test(av3dSrc),
    '기본값으로 readyplayer.me 를 부르면 시작이 40초 늦어집니다(늘 실패했습니다)'
  );
  check(
    '법선 이음매를 지운다',
    /weldNormals\(geo\)/.test(faceSrc) && /weldNormals\(hairGeo\)/.test(faceSrc),
    '안 지우면 이마 한가운데에 세로줄이 하나 그어집니다'
  );
}

/* ═══════════════════════════════════════════════════════════════════════════ */

/**
 * [21] 2026-08-20 — "목소리는 여자인데 얼굴은 남자야."
 *
 * 선생님 목소리는 여성인데 얼굴이 남성으로 보였습니다.
 * 사람이 성별을 읽는 신호는 정해져 있습니다. 그 신호들을 **숫자로**
 * 못박아 둡니다. 나중에 누가 얼굴을 손보다가 이 값을 되돌리면
 * 다시 남자 얼굴이 되므로, 눈으로 보기 전에 여기서 걸려야 합니다.
 *
 *   ① 머리 길이  — 가장 강한 신호. 짧으면 무조건 남자로 읽힙니다.
 *   ② 턱선       — 각지고 넓으면 남자, 좁고 둥글면 여자.
 *   ③ 눈썹뼈     — 튀어나오면 남자. 여자는 이마가 매끈합니다.
 */
function testFaceReadsAsFemale() {
  console.log('\n[21] 아바타가 여성으로 보이는가');

  const faceSrc = readFileSync(new URL('../web_app/src/avatarFace.js', import.meta.url), 'utf8');

  /* ① 긴 머리가 실제로 어깨까지 내려와야 합니다. */
  check(
    '어깨까지 오는 긴 머리가 있다',
    /function buildLongHair\(/.test(faceSrc) && /headInner\.add\(longHair\)/.test(faceSrc),
    '머리가 짧으면 얼굴을 아무리 깎아도 남자로 보입니다'
  );
  const botY = parseFloat((faceSrc.match(/const BOT_Y = (-[0-9.]+)/) || [])[1]);
  check(
    '머리끝이 턱보다 한참 아래까지 내려온다',
    botY < -1.5,
    `BOT_Y=${botY} — 턱끝이 약 -0.85 이므로 -1.5 보다 아래여야 '긴 머리'입니다`
  );
  const aFront = parseFloat((faceSrc.match(/const A_FRONT = ([0-9.]+)/) || [])[1]);
  check(
    '그렇다고 머리가 얼굴을 덮지는 않는다',
    aFront > 0.6,
    `A_FRONT=${aFront} — 너무 작으면 앞머리가 눈·볼을 가립니다`
  );

  /* ② 턱선을 **실제로 재서** 확인합니다.
        광대 높이의 폭 대비 턱 높이의 폭이 충분히 좁아야 계란형입니다. */
  const widthAt = (y) => {
    let w = 0;
    for (let i = 0; i <= 160; i++) {
      const phi = (i / 160) * Math.PI;
      for (let j = 0; j < 200; j++) {
        const th = (j / 200) * Math.PI * 2;
        const p = faceModule.sculptedPoint(
          Math.sin(phi) * Math.cos(th), Math.cos(phi), Math.sin(phi) * Math.sin(th)
        );
        if (Math.abs(p.y - y) < 0.03) w = Math.max(w, Math.abs(p.x));
      }
    }
    return w;
  };
  const cheek = widthAt(-0.10);
  const jaw = widthAt(-0.62);
  const ratio = jaw / cheek;
  check(
    '턱이 광대보다 확실히 좁다 (계란형)',
    ratio < 0.60,
    `턱/광대 = ${ratio.toFixed(3)} (광대 ${cheek.toFixed(3)}, 턱 ${jaw.toFixed(3)}) — 0.60 이상이면 각진 남자 턱입니다`
  );

  /* ③ 눈썹뼈가 낮아야 합니다. */
  const browBone = parseFloat(
    (faceSrc.match(/blob\(v, sx \* 0\.290, 0\.2\d+, 0\.640, 0\.35, 0, 0\.05, 1, ([0-9.]+)/) || [])[1]
  );
  check(
    '눈썹뼈가 튀어나오지 않는다',
    browBone < 0.04,
    `눈두덩 = ${browBone} — 0.04 이상이면 남자 눈썹뼈입니다`
  );
  const jawAngle = parseFloat(
    (faceSrc.match(/blob\(v, sx \* 0\.430, -0\.560, 0\.090, 0\.3\d*, sx, -0\.15, 0\.15, ([0-9.]+)/) || [])[1]
  );
  check(
    '턱각(하악각)이 각지지 않는다',
    jawAngle < 0.02,
    `턱각 = ${jawAngle} — 각지면 곧바로 남자 얼굴이 됩니다`
  );

  /* ④ 눈꺼풀 색은 **계산**해야 합니다.
        손으로 적어두면 피부색을 바꿀 때 눈 감을 때마다 주황 렌즈가 씌워집니다. */
  check(
    '눈꺼풀 색을 피부색에서 계산한다',
    /skinColorAt\(sx \* EYE\.x, EYE\.y/.test(faceSrc),
    '색을 손으로 적어두면 피부색을 바꿀 때 눈꺼풀만 따로 놀아 주황 렌즈처럼 보입니다'
  );
}

async function main() {
  console.log('════════════════════════════════════════════════════════');
  console.log(' 한 턴씩 주고받는 대화 — 회귀 테스트');
  console.log('════════════════════════════════════════════════════════');

  await testNothingIsSwallowed();
  await testQueueIsVisible();
  await testShortNoiseStillDropped();
  await testTtsFailureIsVisible();
  await testAudioReachesPlayer();
  testHeardNeverStealsReplyLine();

  /* 2026-08-16 사고 — 아래 넷은 목사님이 실제로 겪으신 증상을 그대로 재현합니다.
     [7]  두 번째 턴부터 먹통      [8]  긴 문장이 조각남
     [9]  침묵을 모델에게 보냄     [10] 방 소음이 /api/talk 까지 도달 */
  testEveryUtteranceReachesServer();
  testLongSentenceStaysWhole();
  testSilenceIsNeverSentToTheModel();
  await testRoomNoiseNeverReachesTalkApi();
  testEarsSurviveTheWatchdog();

  /* 2026-08-18 사고 — "아주 큰소리로 대화해야 이해한다" */
  testThresholdNeverLearnsTheHumanVoice();

  /* 2026-08-18 (세 번째) — "여러 턴 대화하면 점점 못 알아듣는다" */
  testThresholdDoesNotDriftOverManyTurns();

  /* 2026-08-19 — "계속 문장만 고치고 Tell me more about it! 만 한다" */
  testTeachingComesBackWithTheReplyNotAsFunctionCall();

  /* 2026-08-19 — "아바타도 좀 외모에 신경써주면 좋겠어" */
  testFaceIsSculptedNotAssembled();

  /* 2026-08-20 — "목소리는 여자인데 얼굴은 남자야" */
  testFaceReadsAsFemale();

  console.log('\n════════════════════════════════════════════════════════');
  if (failures === 0) {
    console.log(' 전부 통과했습니다.');
  } else {
    console.log(` 실패 ${failures}건.`);
  }
  console.log('════════════════════════════════════════════════════════');
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((err) => {
  console.error('테스트가 예외로 죽었습니다:', err);
  process.exit(1);
});
