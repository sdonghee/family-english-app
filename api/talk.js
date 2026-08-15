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

/* 대화용 텍스트 모델 후보. 앞에서부터 시도합니다. */
const TEXT_MODELS = [
  process.env.GEMINI_TALK_MODEL,
  'gemini-3.6-flash',
  'gemini-2.5-flash',
].filter(Boolean);

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
function buildHistory(raw) {
  if (!Array.isArray(raw)) return [];
  return raw
    .slice(-12)
    .filter((m) => m && typeof m.text === 'string' && m.text.trim())
    .map((m) => ({
      role: m.role === 'teacher' ? 'model' : 'user',
      parts: [{ text: String(m.text).slice(0, 1000) }],
    }));
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
        'REPLY: <선생님 대사>\n' +
        '오디오에 말이 없거나 알아들을 수 없으면 HEARD: 를 비워두세요.',
    });
  } else {
    turnParts.push({ text: userText });
  }

  const bodyData = {
    system_instruction: { parts: [{ text: systemText }] },
    contents: [...buildHistory(req.body?.history), { role: 'user', parts: turnParts }],
    generationConfig: { temperature: 1.0, maxOutputTokens: 800 },
  };
  const tools = toolsFor(profile, stage);
  if (tools) bodyData.tools = tools;

  const attempts = [];

  for (const model of TEXT_MODELS) {
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
      const toolCalls = parts
        .filter((p) => p.functionCall)
        .map((p) => ({ name: p.functionCall.name, args: p.functionCall.args || {} }));

      const rawText = parts.filter((p) => typeof p.text === 'string').map((p) => p.text).join('\n').trim();

      /* HEARD/REPLY 형식을 뜯어냅니다.
         모델이 형식을 안 지키는 경우가 반드시 생기므로, 그때는 전체를
         대사로 취급합니다. 여기서 빈손으로 돌아가면 앱이 멈춥니다. */
      let heard = userText;
      let reply = rawText;

      const heardMatch = rawText.match(/^\s*HEARD:\s*(.*)$/im);
      const replyMatch = rawText.match(/^\s*REPLY:\s*([\s\S]*)$/im);
      if (replyMatch) {
        reply = replyMatch[1].trim();
        heard = heardMatch ? heardMatch[1].trim() : heard;
      }

      if (!reply && !toolCalls.length) {
        attempts.push({ model, status: 200, detail: '응답에 대사가 없습니다' });
        continue;
      }

      return res.status(200).json({
        userText: heard,
        reply,
        toolCalls,
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
