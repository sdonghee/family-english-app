/**
 * api/session.js
 * ----------------------------------------------------------------------------
 * 통화를 시작할 때 화면이 알아야 하는 값만 내려줍니다.
 *
 * api/live-token.js 를 대체합니다. 이제 실시간 WebSocket 을 열지 않으므로
 * ephemeral token(임시 열쇠)이 필요 없습니다. 하지만 프로필 정보와
 * "말이 끝났다고 볼 때까지 기다리는 시간"은 여전히 **서버가** 정해야 합니다.
 * (브라우저가 정하면 아이마다 다른 기준을 클라이언트가 마음대로 바꿀 수 있습니다)
 *
 * ⭐ 여기서 API 키를 검사하는 이유:
 *   실제 대화(/api/talk)에서 처음 실패하면, 아이는 이미 마이크에 대고
 *   말을 한 뒤입니다. 시작 버튼을 누른 순간에 미리 걸러야 "왜 대답을 안 하지"
 *   하고 헤매지 않습니다.
 * ----------------------------------------------------------------------------
 */

'use strict';

const { guard } = require('./_guard');
const { FAMILY_PROFILES, endOfSpeechMs } = require('./_persona');
const { CHILD_STAGES, getStage } = require('./_stages');

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
  if (apiKey.length < 20) {
    return res.status(500).json({
      error: 'server_key_looks_wrong',
      hint:
        'GEMINI_API_KEY 값이 너무 짧습니다. 키가 잘려서 저장된 것 같습니다. ' +
        'Google AI Studio 에서 키를 다시 복사해 넣고 Redeploy 해주세요.',
    });
  }

  const profileId = String(req.body?.profileId || '');
  const profile = FAMILY_PROFILES[profileId];
  if (!profile) {
    return res.status(400).json({
      error: 'unknown_profile',
      message: `알 수 없는 프로필입니다: ${profileId}`,
    });
  }

  const rawStage = Number(req.body?.context?.stage);
  const stageId = Number.isFinite(rawStage)
    ? Math.max(0, Math.min(CHILD_STAGES.length - 1, Math.floor(rawStage)))
    : undefined;

  return res.status(200).json({
    mode: 'turn-based',   // 화면 진단창에 찍힙니다 (Live 가 아님을 명확히)
    endOfSpeechMs: endOfSpeechMs(profile, { stage: stageId }),
    profile: {
      id: profileId,
      name: profile.name,
      enName: profile.enName,
      age: profile.age,
      kind: profile.kind,
      canRead: profile.canRead,
      ...(profile.kind === 'child'
        ? {
            stage: stageId ?? profile.defaultStage,
            stageName: getStage(stageId ?? profile.defaultStage).name,
          }
        : { level: profile.level }),
    },
  });
};
