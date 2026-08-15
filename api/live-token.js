
/**
 * api/live-token.js
 * ----------------------------------------------------------------------------
 * Gemini Live API용 ephemeral token(임시 토큰)을 발급합니다.
 *
 * 왜 필요한가:
 *   브라우저에서 Live API에 직접 WebSocket을 열어야 하는데, 거기에 진짜
 *   GEMINI_API_KEY를 넣으면 개발자도구에서 그대로 털립니다. 그래서 Google은
 *   수명이 짧은 임시 토큰을 쓰라고 권합니다.
 *
 * 보안상 가장 중요한 부분 (반드시 유지):
 *   liveConnectConstraints 를 채워서 model / systemInstruction / tools 를
 *   서버에서 **잠가야** 합니다. 이걸 비워두고 토큰을 발급하면 클라이언트가
 *   setup 프레임에 아무 값이나 넣어서 시스템 프롬프트를 갈아치우거나
 *   코드 실행 도구를 켤 수 있습니다. (실제로 보고된 취약점입니다.)
 *
 *   lockAdditionalFields: [] 는 "constraints에 내가 명시한 필드만 잠근다"는 뜻.
 *   sessionResumption 은 일부러 잠그지 않습니다 — 클라이언트가 끊긴 세션을
 *   이어붙일 때 handle을 넘겨야 하기 때문입니다.
 * ----------------------------------------------------------------------------
 */
 
'use strict';
 
const { GoogleGenAI } = require('@google/genai');
const { guard } = require('./_guard');
const { FAMILY_PROFILES, buildLiveConfig, endOfSpeechMs } = require('./_persona');
const { CHILD_STAGES, getStage } = require('./_stages');
 
/**
 * 브라우저가 보낸 학습 컨텍스트를 정화합니다.
 * 이 값들은 시스템 프롬프트에 들어가므로 프롬프트 인젝션 표면입니다.
 * 가족용 앱이라 위험은 낮지만, 길이/개수를 제한하고 제어문자를 제거합니다.
 */
function sanitizeContext(raw) {
  const clean = (s, max) =>
    typeof s === 'string'
      ? s.replace(/[\u0000-\u001F\u007F]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max)
      : '';
 
  const knownWords = Array.isArray(raw?.knownWords)
    ? raw.knownWords
        .filter((w) => typeof w === 'string')
        .map((w) => clean(w, 60))
        .filter(Boolean)
        .slice(0, 60)
    : [];
 
  return {
    recentSummary: clean(raw?.recentSummary, 600),
    todayMission: clean(raw?.todayMission, 120),
    currentFrame: clean(raw?.currentFrame, 80),
    /** 끊겼다가 다시 붙는 중인지 (인사를 반복하지 않기 위해) */
    isResume: raw?.isResume === true,
    // 정확히 세 값만 허용합니다 (임의 문자열이 프롬프트에 들어가지 않게)
    canRead: raw?.canRead === true ? true
      : raw?.canRead === false ? false
      : raw?.canRead === 'partial' ? 'partial'
      : undefined,
    knownWords,
    // 단계는 숫자만 받고 서버에서 범위를 강제합니다
    stage: Number.isFinite(Number(raw?.stage))
      ? Math.max(0, Math.min(CHILD_STAGES.length - 1, Math.floor(Number(raw.stage))))
      : undefined,
  };
}
 
module.exports = async function handler(req, res) {
  if (!guard(req, res)) return;
 
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    /* ⚠️ 이 화면 문구가 이 앱에서 가장 중요한 오류 메시지입니다.
       실제로 이 상황이 났었고(환경변수 이름이 GEMINI_API_KE 로 저장됨),
       화면에는 "토큰 발급 실패 (500)" 만 떠서 원인을 찾는 데 한참 걸렸습니다.
       그래서 **철자와 재배포까지** 짚어서 알려줍니다.                   */
    return res.status(500).json({
      error: 'server_not_configured',
      hint:
        '서버에 GEMINI_API_KEY 가 없습니다. Vercel 프로젝트 → Settings → ' +
        'Environment Variables 에서 이름이 정확히 GEMINI_API_KEY 인지 ' +
        '(끝의 Y 까지) 확인하고, 저장한 뒤 반드시 Redeploy 해주세요.',
      message:
        'GEMINI_API_KEY 환경변수가 설정되지 않았습니다. ' +
        'Vercel 프로젝트 Settings → Environment Variables 에서 추가해 주세요.',
    });
  }
  if (apiKey.length < 20) {
    return res.status(500).json({
      error: 'server_key_looks_wrong',
      hint:
        'GEMINI_API_KEY 값이 너무 짧습니다. 키가 잘려서 저장된 것 같습니다. ' +
        'Google AI Studio 에서 키를 다시 복사해 넣고 Redeploy 해주세요.',
    });
  }
 
  // ── 프로필은 서버가 결정합니다. 브라우저는 id만 고를 수 있습니다. ──────
  const profileId = String(req.body?.profileId || '');
  const profile = FAMILY_PROFILES[profileId];
  if (!profile) {
    return res.status(400).json({
      error: 'unknown_profile',
      message: `알 수 없는 프로필입니다: ${profileId}`,
    });
  }
 
  const context = sanitizeContext(req.body?.context);
  const model = process.env.GEMINI_LIVE_MODEL || 'gemini-3.1-flash-live-preview';
 
  try {
    // ephemeral token은 v1alpha에서만 지원됩니다.
    const ai = new GoogleGenAI({
      apiKey,
      httpOptions: { apiVersion: 'v1alpha' },
    });
 
    const config = buildLiveConfig(profile, context);
 
    const now = Date.now();
    const token = await ai.authTokens.create({
      config: {
        // 토큰 1개당 세션 1개.
        uses: 1,
        // 새 세션을 시작할 수 있는 시간: 2분 (그 안에 연결해야 함)
        newSessionExpireTime: new Date(now + 2 * 60 * 1000).toISOString(),
        // 세션 자체의 최대 수명: 60분
        expireTime: new Date(now + 60 * 60 * 1000).toISOString(),
 
        /* ⭐ 모델만 못박습니다.
         *
         * ⚠️ 예전에는 여기에 config 전체를 넣고 lockAdditionalFields: [] 를
         *    썼습니다. 그랬더니 실제 접속에서 이 오류가 났습니다.
         *
         *      {"code":400,"message":"field_mask is invalid for
         *       BidiGenerateContentSetup","status":"INVALID_ARGUMENT"}
         *
         *    구글은 constraints 의 config 를 **필드 마스크**로 바꿔서 잠그는데,
         *    그 안에 setup 메시지에 없는 필드가 하나라도 있으면 마스크 자체가
         *    무효가 되어 **연결이 통째로 거부**됩니다. 어느 필드가 문제인지는
         *    오류에 안 나옵니다.
         *
         *    그래서 config 는 잠그지 않고 아래 응답으로 내려보내, 클라이언트가
         *    setup 프레임에 실어 보냅니다. 그러면 문제가 있는 필드가 있을 때
         *    **그 필드 이름이 찍힌** 오류가 나서 원인을 알 수 있습니다.
         *
         *    보안상 맞바꾼 것: 시스템 프롬프트가 브라우저에서 보입니다.
         *    가족만 쓰는 앱이라 감수합니다. 모델은 여전히 잠겨 있어서
         *    이 토큰으로 다른(비싼) 모델을 쓸 수는 없습니다.
         */
        liveConnectConstraints: { model },
      },
    });
 
    if (!token?.name) {
      throw new Error('토큰 발급 응답에 name이 없습니다');
    }
 
    return res.status(200).json({
      token: token.name,
      model,
      /* 이제 setup 설정을 클라이언트가 보냅니다.
         (프롬프트·도구·음성 모두 여전히 서버가 만든 그대로입니다) */
      config,
      // 서버 자동 VAD를 껐으므로, 말의 끝은 클라이언트가 판단합니다.
      // 그 기준 시간을 여기서 내려줍니다 (4살은 길게, 어른은 짧게).
      endOfSpeechMs: endOfSpeechMs(profile, context),
      // 클라이언트 UI가 알아야 하는 정보만 최소로 내려줍니다.
      profile: {
        id: profileId,
        name: profile.name,
        enName: profile.enName,
        age: profile.age,
        kind: profile.kind,
        canRead: profile.canRead,
        // 아이는 이번 세션에 적용된 단계를 함께 알려줍니다 (화면 표시용)
        ...(profile.kind === 'child'
          ? {
              stage: context.stage ?? profile.defaultStage,
              stageName: getStage(context.stage ?? profile.defaultStage).name,
            }
          : { level: profile.level }),
      },
      expiresAt: new Date(now + 60 * 60 * 1000).toISOString(),
    });
  } catch (err) {
    console.error('[live-token] 발급 실패:', err);
    const message = String(err?.message || err);
 
    // 자주 나오는 오류를 사람이 읽을 수 있는 안내로 바꿔줍니다.
    let hint = '';
    if (/allowlist|permission|PERMISSION_DENIED|not found|NOT_FOUND/i.test(message)) {
      hint =
        `모델 "${model}" 에 접근 권한이 없을 수 있습니다. ` +
        'GEMINI_LIVE_MODEL 환경변수로 다른 Live 모델을 지정해 보세요.';
    } else if (/API key|API_KEY_INVALID|UNAUTHENTICATED/i.test(message)) {
      hint = 'GEMINI_API_KEY 가 올바르지 않습니다.';
    } else if (/quota|RESOURCE_EXHAUSTED|429/i.test(message)) {
      hint = 'API 사용량 한도에 걸렸습니다. 잠시 후 다시 시도해 주세요.';
    }
 
    return res.status(502).json({
      error: 'token_creation_failed',
      message: hint || message,
    });
  }
};
 
