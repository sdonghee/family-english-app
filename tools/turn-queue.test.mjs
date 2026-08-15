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
import { AUDIO } from '../web_app/src/config.js';

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

/** 0.5초짜리 말소리 한 덩어리 (base64 PCM16 16kHz 조각들) */
function utteranceFrames(sampleCount = AUDIO.INPUT_SAMPLE_RATE / 2) {
  const pcm = new Int16Array(sampleCount).fill(1000);
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
