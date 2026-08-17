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

import { ChatSession, LiveState } from '../web_app/src/chatSession.js';
import { AUDIO, COST } from '../web_app/src/config.js';
import { MicStream } from '../web_app/src/mic.js';
import { SilenceGate, GateState } from '../web_app/src/gate.js';
import { measureSpeech, shouldSendAudio } from '../web_app/src/speechEnergy.js';
import parseTurnModule from '../api/_parseTurn.js';
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

/* ═══════════════════════════════════════════════════════════════════════════ */

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
