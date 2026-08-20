
/**
 * api/talk.js
 * ----------------------------------------------------------------------------
 * 한 턴의 대화를 처리합니다. Live API 를 대체하는 핵심 파일입니다.
 *
 *   들어오는 것: 아이가 방금 말한 오디오(WAV base64) 또는 글자
 *   나가는 것:   { userText: 알아들은 말, reply: 선생님 대사, toolCalls: [...] }
 *
 * 왜 STT 를 브라우저에 맡기지 않았나 (중요):
 *   브라우저 SpeechRecognition 은 모바일에서 onresult/onend 가 **에러도 없이
 *   그냥 안 오는** 경우가 있습니다. 그리고 한국 아이가 하는 영어를 아주 못
 *   알아듣습니다. 대신 오디오를 그대로 Gemini 에 올려서 "알아듣기"와 "대답하기"를
 *   한 번에 시킵니다. 모델이 맥락을 알기 때문에 "lice"를 rice 로 알아듣습니다.
 *   요청 횟수도 한 턴에 한 번이라 더 쌉니다.
 *
 * ⚠️ 클라이언트에서 정규식으로 인식 결과를 "고쳐주지" 않습니다.
 *    예전에 light→right, he don't→he doesn't 같은 무조건 치환이 있었는데,
 *    멀쩡한 영어를 망가뜨렸고 **가르쳐야 할 실수 자체를 지워버렸습니다.**
 *    교정은 맥락을 아는 쪽(모델)이 합니다.
 * ----------------------------------------------------------------------------
 */
 
'use strict';
 
const { guard } = require('./_guard');
const {
  FAMILY_PROFILES,
  TOOL_DEFS,
  buildChildInstruction,
  buildAdultInstruction,
} = require('./_persona');
const { CHILD_STAGES, getStage } = require('./_stages');
const { parseTurnText } = require('./_parseTurn');
 
/* 대화용 텍스트 모델 후보. 앞에서부터 시도합니다. */
const TEXT_MODELS = [
  process.env.GEMINI_TALK_MODEL,
  'gemini-3.6-flash',
  'gemini-2.5-flash',
].filter(Boolean);
 
/**
 * 마지막으로 성공한 모델. **매 턴의 지연을 줄이기 위한 것입니다.**
 *
 * 왜: 앞 후보가 이 API 키에서 안 열리면, 그 실패한 왕복이 **매 턴마다**
 *     통째로 더해집니다. 아이는 그만큼 계속 기다립니다.
 *     한 번 성공한 모델을 기억해 두고 다음부터 그것부터 시도합니다.
 *
 * 모듈 스코프라 서버 인스턴스가 살아 있는 동안만 유지됩니다(그걸로 충분합니다).
 * 응답에 model 을 그대로 실어 보내므로 화면에서 어느 모델이 답했는지 보입니다.
 */
let lastGoodModel = '';
 
function modelOrder() {
  if (!lastGoodModel) return TEXT_MODELS;
  return [lastGoodModel, ...TEXT_MODELS.filter((m) => m !== lastGoodModel)];
}
 
/** live-token.js 와 같은 정화 로직. 이 값들은 시스템 프롬프트에 들어갑니다. */
function sanitizeContext(raw) {
  const clean = (s, max) =>
    typeof s === 'string'
      ? s.replace(/[\u0000-\u001F\u007F]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max)
      : '';
 
  return {
    recentSummary: clean(raw?.recentSummary, 600),
    todayMission: clean(raw?.todayMission, 120),
    currentFrame: clean(raw?.currentFrame, 80),
    isResume: raw?.isResume === true,
    canRead:
      raw?.canRead === true ? true
      : raw?.canRead === false ? false
      : raw?.canRead === 'partial' ? 'partial'
      : undefined,
    knownWords: Array.isArray(raw?.knownWords)
      ? raw.knownWords.filter((w) => typeof w === 'string').map((w) => clean(w, 60)).filter(Boolean).slice(0, 60)
      : [],
    stage: Number.isFinite(Number(raw?.stage))
      ? Math.max(0, Math.min(CHILD_STAGES.length - 1, Math.floor(Number(raw.stage))))
      : undefined,
  };
}
 
/** 이름 목록 → 함수 선언 (원래 _persona.buildTools 와 같은 모양) */
function toolsFor(profile, stage) {
  const names = profile.kind === 'child'
    ? stage.tools
    : ['teach_word', 'correct_sentence', 'log_progress'];
  const functionDeclarations = names.map((n) => TOOL_DEFS[n]).filter(Boolean);
  return functionDeclarations.length ? [{ functionDeclarations }] : undefined;
}
 
/**
 * 이전 대화를 Gemini contents 형식으로 바꿉니다.
 *
 * 왜 클라이언트가 들고 있나:
 *   Live API 는 연결이 살아 있는 동안 맥락을 서버가 기억했지만, 이제는
 *   요청이 매번 독립적입니다. 그래서 최근 몇 턴을 매번 같이 보냅니다.
 *   전부 보내면 토큰 요금이 계속 늘기 때문에 최근 것만 자릅니다.
 */
/**
 * 지난 대화 기록에서 **고장난 시절의 대사**를 걸러냅니다.
 *
 * ⚠️ 2026-08-19 — "고쳤는데도 Nice one! 이 계속 나온다"
 *
 * 서버 코드를 고쳐도 증상이 그대로였습니다. 원인은 코드가 아니라 **기록**이었습니다.
 * 고장난 시절에 쌓인 대사가 기록에 남아 매 턴 모델에게 함께 전달되고,
 * 모델은 그걸 보고 "이 선생님은 이렇게 말하는구나" 하고 **말투를 흉내냅니다.**
 *
 *   기록: "Ah, you mean — She is 6 years old now. Nice one!"
 *   → 새 코드가 만들지 않는 문장인데도 모델이 똑같이 지어냅니다.
 *
 * 게다가 그 대사들은 원래 **학생이 했을 법한 말**이라, 모델이 그걸
 * 학생 발화로 착각해 "하지 않은 말"을 이어서 만들어냅니다.
 *
 * 그래서 기록을 서버로 받을 때 그 흔적을 지웁니다.
 * 사용자가 "대화 초기화"를 누르지 않아도 스스로 회복되어야 합니다.
 */
const BROKEN_ECHO_PATTERNS = [
  /Nice one!/i,                       // 옛 안전망 꼬리표
  /^\s*Ah, you mean\s*—/i,            // 옛 안전망 recast (대시 형태)
  /^\s*That was really good!\s*Keep going\.\s*$/i, // 조각 턴에 붙던 빈 칭찬
];
 
function isBrokenEcho(text) {
  return BROKEN_ECHO_PATTERNS.some((re) => re.test(text));
}
 
function buildHistory(raw) {
  if (!Array.isArray(raw)) return [];
 
  const kept = [];
  let dropped = 0;
 
  for (const m of raw.slice(-12)) {
    if (!m || typeof m.text !== 'string' || !m.text.trim()) continue;
 
    /* 선생님 대사에서만 걸러냅니다. 학생이 실제로 한 말은 절대 지우지 않습니다 —
       학습자의 말을 임의로 지우는 것이 훨씬 나쁜 사고입니다. */
    if (m.role === 'teacher' && isBrokenEcho(m.text)) {
      dropped++;
      continue;
    }
 
    kept.push({
      role: m.role === 'teacher' ? 'model' : 'user',
      parts: [{ text: String(m.text).slice(0, 1000) }],
    });
  }
 
  if (dropped) {
    console.warn(`[talk] 고장난 시절의 선생님 대사 ${dropped}개를 기록에서 걸렀습니다`);
  }
  return kept;
}
 
/**
 * 도구 호출만 있고 대사가 비었을 때, **말로 할 한 문장**을 만듭니다.
 *
 * 왜 필요한가: api/talk.js 안쪽 주석 참고.
 * 요약하면 — 화면에 카드만 뜨고 아바타가 침묵하면, 학습자는
 * "내 말을 못 들었나 보다"라고 느낍니다. 그건 대화가 아닙니다.
 *
 * 설계 원칙:
 *   - **되짚어주기(recast)** 형태로 만듭니다. 지적하지 않습니다.
 *     교정 카드가 이미 자세히 보여주므로, 말로는 자연스럽게 흘립니다.
 *   - 영어로 만듭니다. 이 앱의 선생님은 영어로 말합니다.
 *   - 짧게. 이건 어디까지나 비상용 한 문장입니다.
 */
function speakFromToolCalls(toolCalls) {
  for (const call of toolCalls) {
    const a = call?.args || {};
 
    if (call.name === 'correct_sentence' && a.corrected) {
      /* ⚠️ 되짚어주되(recast) **꼬리표를 붙이지 않습니다.**
         처음에는 `Ah, you mean — ${corrected} Nice one!` 이었는데,
         그 "Nice one!" 을 다음 턴에서 모델이 **학생이 한 말**로 착각해
         teach_word('Nice one!') 를 불렀습니다. 자기가 한 말을 가르치는
         고리가 생긴 것입니다. 선생님 대사에는 학생 말로 오해될
         군더더기를 붙이지 않습니다. */
      return `Ah, you mean "${String(a.corrected).trim()}". Tell me more about it!`;
    }
 
    if (call.name === 'teach_word' && a.word) {
      const ex = a.example_en ? ` For example: ${String(a.example_en).trim()}` : '';
      return `We call that "${String(a.word).trim()}".${ex} Want to try saying it?`;
    }
 
    if (call.name === 'log_progress') {
      return `That was really good. Keep going!`;
    }
  }
 
  /* 알 수 없는 도구뿐이라면, 그래도 침묵하지는 않습니다.
     대화를 이어가는 게 카드보다 중요합니다. */
  return `Got it! Tell me more.`;
}
 
module.exports = async function handler(req, res) {
  if (!guard(req, res)) return;
 
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return res.status(500).json({
      error: 'server_not_configured',
      hint:
        '서버에 GEMINI_API_KEY 가 없습니다. Vercel 프로젝트 → Settings → ' +
        'Environment Variables 에서 이름이 정확히 GEMINI_API_KEY 인지 ' +
        '(끝의 Y 까지) 확인하고, 저장한 뒤 반드시 Redeploy 해주세요.',
    });
  }
 
  const profileId = String(req.body?.profileId || '');
  const profile = FAMILY_PROFILES[profileId];
  if (!profile) {
    return res.status(400).json({ error: 'unknown_profile', message: `알 수 없는 프로필입니다: ${profileId}` });
  }
 
  const context = sanitizeContext(req.body?.context);
  const isChild = profile.kind === 'child';
  const stage = isChild ? getStage(context.stage ?? profile.defaultStage) : null;
 
  const systemText = isChild
    ? buildChildInstruction(profile, stage, context)
    : buildAdultInstruction(profile, context);
 
  /* 들어온 발화. 오디오가 우선이고, 없으면 글자(힌트 버튼·키보드 입력)입니다. */
  const audioB64 = typeof req.body?.audio === 'string' ? req.body.audio : '';
  const audioMime = String(req.body?.audioMimeType || 'audio/wav');
  const userText = String(req.body?.text || '').trim();
 
  if (!audioB64 && !userText) {
    return res.status(400).json({ error: 'audio_or_text_required' });
  }
 
  /* 오디오를 보낼 때는 "받아쓴 말"도 함께 달라고 합니다.
     화면 자막과 학습 기록에 아이가 실제로 한 말이 남아야 하기 때문입니다. */
  const turnParts = [];
  if (audioB64) {
    turnParts.push({ inlineData: { mimeType: audioMime, data: audioB64 } });
    turnParts.push({
      text:
        '위 오디오는 학생이 방금 한 말입니다.\n' +
        '먼저 학생이 한 말을 그대로 받아쓰고, 그 다음 줄부터 선생님으로서 대답하세요.\n' +
        '반드시 이 형식을 지키세요:\n' +
        'HEARD: <학생이 한 말 그대로. 문법 교정하지 말 것>\n' +
        'REPLY: <선생님 대사 — 절대 비우지 말 것>\n' +
        'FIX: <학생이 한 말> || <자연스럽게 고친 말> || <한국어로 짧은 설명>\n' +
        'WORD: <가르칠 단어> || <한국어 뜻> || <짧은 예문>\n' +
        '\n' +
        'FIX 와 WORD 는 **필요할 때만** 씁니다. 없으면 그 줄 자체를 쓰지 마세요.\n' +
        'REPLY 는 **매 턴 반드시** 있어야 합니다.\n' +
        '\n' +
        '⚠️ 받아쓰기 규칙 (이것을 어기면 앱이 망가집니다):\n' +
        '- **들리지 않는 말을 지어내지 마세요.** 오디오에 실제로 들어 있는 소리만 적으세요.\n' +
        '- 오디오가 잡음뿐이거나, 숨소리·기침·생활소음뿐이거나, 너무 작아서\n' +
        '  알아들을 수 없으면 **HEARD: 뒤를 완전히 비워두세요.**\n' +
        '- 앞의 대화 내용을 보고 "이렇게 말했을 것"이라고 **추측해서 채우지 마세요.**\n' +
        '  대화 흐름상 그럴듯한 문장을 지어내는 것이 가장 나쁜 행동입니다.\n' +
        '- 일부만 알아들었으면 알아들은 부분만 적으세요. 나머지를 메우지 마세요.\n' +
        '- 비워두는 것은 실패가 아닙니다. 앱이 "한 번 더 말해 주세요"라고 안내합니다.\n' +
        '\n' +
        '🎯 좋은 선생님이 되는 법 (가장 중요합니다):\n' +
        '  이 앱의 목적은 **문장 교정**이 아니라 **대화**입니다.\n' +
        '  교정은 대화를 돕는 양념이지 요리가 아닙니다.\n' +
        '\n' +
        '  1) 학생이 말한 **내용**에 먼저 반응하세요.\n' +
        '     "하와이 세 섬에 다녀왔다" → 어느 섬이 제일 좋았는지, 뭘 했는지,\n' +
        '     누구와 갔는지 물으세요. 문장 구조가 아니라 **이야기**에 반응합니다.\n' +
        '  2) 아는 것을 보태세요. 선생님도 대화에 기여해야 합니다.\n' +
        '     "Kauai is so green — people call it the Garden Isle." 처럼요.\n' +
        '     한 마디도 보태지 않고 되묻기만 하면 취조가 됩니다.\n' +
        '  3) 이전 대화를 기억하고 이어가세요. 아까 목사님이라고 했으면\n' +
        '     설교 이야기를, 아기가 있다고 했으면 그 아기 이야기를 이어가세요.\n' +
        '  4) 매번 같은 틀로 시작하지 마세요. 특히 "Ah, you mean ..." 이나\n' +
        '     "Tell me more about it!" 을 **반복하지 마세요.** 그건 대화가\n' +
        '     아니라 자동응답기입니다.\n' +
        '  5) 교정은 **꼭 필요할 때만**. 매 턴 고치지 마세요.\n' +
        '     의미가 통했으면 그냥 넘어가고 대화를 이어가는 편이 낫습니다.\n' +
        '     하루에 서너 번이면 충분합니다.\n' +
        '  6) 길이: 두세 문장. 반응 + (보탠 것) + 질문 하나.\n' +
        '\n' +
        '⚠️ REPLY 규칙 (이것도 어기면 앱이 망가집니다):\n' +
        '- **교육 도구를 호출할 때도 REPLY 는 반드시 채우세요.**\n' +
        '  도구만 부르고 REPLY 를 비우면, 화면에는 카드가 뜨는데 선생님은\n' +
        '  한마디도 하지 않습니다. 학생에게는 "내 말을 못 들었다"로 보입니다.\n' +
        '- 특히 correct_sentence 를 부를 때는, 말로 **자연스럽게 되짚어** 주세요.\n' +
        '  학생: "Yesterday I go to park."\n' +
        '  REPLY: "Oh, you went to the park! Who did you go with?"\n' +
        '  (카드가 자세히 설명하므로, 말로는 지적하지 말고 흘리듯 고쳐 말하세요)\n' +
        '- 학생이 **긴 문장**을 말했으면, 그 안의 내용에 실제로 반응하세요.\n' +
        '  길다고 "Good job!" 한마디로 넘기지 마세요. 무엇을 말했는지 짚어주고\n' +
        '  이어지는 질문을 하세요.\n' +
        '\n' +
        '⚠️ 지난 대화 기록에 대하여:\n' +
        '  기록은 **무슨 이야기를 했는지 기억하기 위한 것**입니다.\n' +
        '  거기 있는 문장의 **말투나 틀을 따라 하지 마세요.**\n' +
        '  특히 "Ah, you mean — ...", "Nice one!", "That was really good!" 같은\n' +
        '  틀이 보이더라도 흉내내지 마세요. 그건 고장났던 시절의 흔적입니다.\n' +
        '  매번 그 상황에 맞는 **새로운 말**을 하세요.\n' +
        '\n' +
        '⚠️ 말이 조각나서 도착할 때 (아주 중요):\n' +
        '  학생이 문장 중간에 뜸을 들이면, 한 문장이 **두 번에 나눠서** 옵니다.\n' +
        '     이전 턴: "The weather was"      이번 턴: "dying"\n' +
        '  이번 오디오가 한두 단어뿐이고, 바로 앞 대화와 이어붙였을 때\n' +
        '  하나의 문장이 된다면 **이어진 말로 이해하세요.**\n' +
        '  - 그 조각 하나만 놓고 엉뚱하게 되묻지 마세요.\n' +
        '  - "Good job!" 같은 칭찬으로 넘기지도 마세요.\n' +
        '  - 이어붙인 **문장 전체**에 반응하세요.\n' +
        '    (위 예라면 "The weather was dying" 에 반응하는 것이 맞습니다)',
    });
  } else {
    turnParts.push({ text: userText });
  }
 
  const bodyData = {
    system_instruction: { parts: [{ text: systemText }] },
    contents: [...buildHistory(req.body?.history), { role: 'user', parts: turnParts }],
    /* ⚠️ 2026-08-18. temperature 가 1.0 이었습니다.
     *
     *    이 한 번의 호출이 **두 가지 일**을 동시에 합니다:
     *      (1) 학생이 한 말 받아쓰기 — 정확해야 함. 창의성이 있으면 안 됨.
     *      (2) 선생님 대사 만들기   — 자연스러워야 함.
     *
     *    1.0 은 (2)에 맞춘 값이고, (1)에는 **재앙**입니다. 잘 안 들리는
     *    오디오를 받으면 모델이 대화 흐름에 어울리는 문장을 **지어냅니다.**
     *    "내가 말하지 않은 단어를 스스로 만들어낸다"가 이것입니다.
     *
     *    0.4 로 낮춥니다. 선생님 대사는 조금 덜 변화무쌍해지지만,
     *    아이 영어 학습에는 오히려 일관된 쪽이 낫습니다.
     *    받아쓰기가 틀리면 그 뒤의 모든 것이 틀립니다.
     */
    generationConfig: { temperature: 0.4, maxOutputTokens: 800 },
  };
  /* ⚠️ 2026-08-19 — 함수 호출(tools)을 **일부러 쓰지 않습니다.**
     REST generateContent 에서 모델이 함수를 부르면 응답에 함수 호출만 있고
     **글자가 없습니다.** 무상태 REST 라 함수 결과를 돌려주는 왕복이 없어서,
     모델은 영영 말을 이어갈 기회를 못 받습니다. 그 결과 매 턴 대사가 비었고
     서버 안전망이 만든 "Ah, you mean ... Tell me more about it!" 이 화면을
     도배했습니다. 이제 교정·단어는 FIX:/WORD: 줄로 **같은 응답 안에서**
     받습니다. @see api/_parseTurn.js extractTeaching */
 
  const attempts = [];
 
  for (const model of modelOrder()) {
    try {
      const url =
        `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;
 
      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(bodyData),
      });
 
      if (!response.ok) {
        const detail = (await response.text()).slice(0, 400);
        attempts.push({ model, status: response.status, detail });
        if (response.status === 429) {
          return res.status(502).json({
            error: 'talk_rate_limited',
            attempts,
            hint: 'API 사용량 한도에 걸렸습니다. 잠시 후 다시 시도해 주세요.',
          });
        }
        continue;
      }
 
      const data = await response.json();
      const parts = data?.candidates?.[0]?.content?.parts || [];
 
      /* 함수 호출(교육 도구)과 글자를 분리합니다. */
      /* ⚠️ 이제 함수 호출을 쓰지 않습니다(위 bodyData 주석 참고).
         혹시 모델이 그래도 함수를 부르면 그것도 받아둡니다 — 버리면
         가르친 내용이 사라지므로, 있으면 쓰고 없으면 글자에서 뽑습니다. */
      const fnCalls = parts
        .filter((p) => p.functionCall)
        .map((p) => ({ name: p.functionCall.name, args: p.functionCall.args || {} }));
 
      const rawText = parts.filter((p) => typeof p.text === 'string').map((p) => p.text).join('\n').trim();
 
      /* HEARD/REPLY 형식을 뜯어냅니다.
         왜 따로 뺐나: 여기서 난 사고("REPLY:" 접두사가 아이 말풍선에
         그대로 찍히고 선생님이 자문자답)가 화면까지 흘러갔기 때문에,
         이 부분만 따로 검사할 수 있어야 합니다.
         → api/_parseTurn.js, tools/turn-queue.test.mjs 참고 */
      // reply 는 아래 안전망에서 채울 수 있으므로 let 입니다
      let { heard, reply, heardEmpty, toolCalls: textCalls } = parseTurnText({
        rawText,
        userText,
        hasAudio: !!audioB64,
      });

      /* 글자에서 뽑은 것(FIX/WORD)을 우선 씁니다. 함수 호출은 예비입니다. */
      let toolCalls = textCalls.length ? textCalls : fnCalls;
 
      if (!reply && !toolCalls.length) {
        attempts.push({ model, status: 200, detail: '응답에 대사가 없습니다' });
        continue;
      }
 
      /* ⚠️ 2026-08-19 사고 — "카드에 뜨는 말에 아바타가 전혀 반응하지 않는다"
         ──────────────────────────────────────────────────────────────────
         목사님 말씀: "카드에 뜨는말에는 아바타가 전혀 반응하지않고 안들은거 같음"
 
         원인: 모델이 교육 도구(correct_sentence 등)만 호출하고 REPLY 를
         비워 보낼 때가 있습니다. 위 조건은 `!reply && !toolCalls.length`
         이므로, **도구만 있으면 reply 가 비어도 그대로 통과**했습니다.
         그러면 화면에는 교정 카드가 뜨는데 아바타는 한마디도 안 합니다.
         학습자 입장에서는 "내 말을 아예 못 들었다"로 보입니다.
 
         프롬프트로 "도구를 부를 때도 말은 반드시 하라"고 지시해 두었지만,
         지시는 지켜지지 않을 때가 있습니다. 그래서 서버에 안전망을 둡니다.
         도구 내용에서 **말로 되짚어주는 한 문장**을 만들어 채웁니다. */
      /* ⚠️ 2026-08-19 두 번째 사고 — "갑자기 혼자 대화하기 시작했어.
             내가 하지 않은 말을 내가 말한 것처럼 대화해."
         ──────────────────────────────────────────────────────────────────
         바로 위 안전망을 넣자마자 이 사고가 났습니다. 원인은 두 겹이었습니다.
 
         ① 못 알아들었는데(HEARD 가 빈) 모델이 correct_sentence 를 부릅니다.
            무엇을 들었는지도 모르면서 "고친 문장"을 지어낸 것입니다.
         ② 그런데 안전망이 그 지어낸 `corrected` 를 **선생님 대사**로 만들어
            "Ah, you mean — I woke up early, around 3 a.m." 라고 말했습니다.
 
         결과: 학생 말풍선은 비어 있는데, 선생님이 학생이 했을 법한 말을
         대신 하고, 그게 대화 기록에 남아 다음 턴의 재료가 됩니다.
         → 선생님 혼자 묻고 답하는 대화가 이어집니다.
 
         그래서 **못 알아들은 턴에서는 도구를 통째로 버립니다.**
         들은 게 없으면 가르칠 것도 없습니다. */
      if (heardEmpty && toolCalls.length) {
        console.warn(
          `[talk] 못 알아들은 턴인데 도구를 ${toolCalls.length}개 불렀습니다 — 전부 버립니다:`,
          toolCalls.map((t) => t.name).join(', ')
        );
        toolCalls = [];
      }
 
      if (!reply && !toolCalls.length && heardEmpty) {
        /* 들은 것도 없고 할 말도 없으면, 되묻습니다.
           침묵하면 "왜 반응이 없지?" 가 됩니다. */
        reply = "Sorry, I didn't catch that. Could you say it once more?";
      }
 
      if (!reply && toolCalls.length) {
        reply = speakFromToolCalls(toolCalls);
        console.warn('[talk] 대사가 비어 도구 내용으로 채웠습니다:', reply);
      }
 
      /* 이 모델이 실제로 답했습니다. 다음 턴은 여기부터 시도합니다. */
      lastGoodModel = model;
 
      return res.status(200).json({
        userText: heard,
        reply,
        toolCalls,
        heardEmpty,
        model,
        ...(isChild ? { stage: stage.id, stageName: stage.name } : {}),
      });
    } catch (err) {
      attempts.push({ model, status: 0, detail: String(err?.message || err).slice(0, 300) });
    }
  }
 
  return res.status(502).json({
    error: 'talk_all_models_failed',
    attempts,
    hint: '대화 모델에 모두 접근하지 못했습니다. 서버 로그의 attempts 를 확인하세요.',
  });
};
 
