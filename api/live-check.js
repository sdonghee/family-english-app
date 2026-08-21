/**
 * api/live-check.js
 * ----------------------------------------------------------------------------
 * "이 API 키로 실시간 음성(Live API)을 쓸 수 있는가?" 를 **구글에 직접 물어봅니다.**
 *
 * 왜 필요한가:
 *   Live API 는 쓸 수 없을 때 오류를 주지 않고 **그냥 응답을 안 합니다.**
 *   그래서 앱에서는 "설정이 문제인지, 모델이 문제인지, 키가 문제인지"를
 *   구별할 방법이 없습니다. 실제로 설정 10가지 × 모델 3가지를 전부
 *   시도하고도 원인을 특정하지 못했습니다.
 *
 *   대신 모델 목록 API 는 **정직하게 대답합니다.** 각 모델마다
 *   "이 모델로 할 수 있는 것들"(supportedGenerationMethods) 을 알려주는데,
 *   거기에 `bidiGenerateContent` 가 있으면 그게 곧 실시간 음성입니다.
 *
 *   이 한 번의 호출로 추측이 끝납니다.
 *
 * 쓰는 법: 브라우저로 그냥 열어보세요.
 *   https://(내앱주소)/api/live-check
 * ----------------------------------------------------------------------------
 */
 
'use strict';
 
module.exports = async function handler(req, res) {
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
 
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return res.status(500).json({
      결론: '❌ 서버에 GEMINI_API_KEY 가 없습니다.',
      할일: 'Vercel → Settings → Environment Variables 에서 이름이 정확히 ' +
            'GEMINI_API_KEY 인지 확인하고 Redeploy 해주세요.',
    });
  }
 
  try {
    // 모델 목록을 가져옵니다. 키가 실제로 쓸 수 있는 것만 나옵니다.
    const r = await fetch(
      'https://generativelanguage.googleapis.com/v1beta/models?pageSize=200',
      { headers: { 'x-goog-api-key': apiKey } }
    );
    const text = await r.text();
 
    if (!r.ok) {
      return res.status(200).json({
        결론: `❌ 구글이 키를 거절했습니다 (${r.status})`,
        할일: r.status === 400 || r.status === 403
          ? 'API 키가 잘못됐거나 만료됐습니다. Google AI Studio 에서 새로 발급받아 주세요.'
          : '잠시 후 다시 시도해 주세요.',
        구글응답: text.slice(0, 400),
      });
    }
 
    const data = JSON.parse(text);
    const models = Array.isArray(data.models) ? data.models : [];
 
    // 실시간 음성이 가능한 모델 = bidiGenerateContent 를 지원하는 모델
    const liveModels = models
      .filter((m) => (m.supportedGenerationMethods || []).includes('bidiGenerateContent'))
      .map((m) => String(m.name || '').replace(/^models\//, ''));
 
    // 참고용: 일반 대화(지금 쓰던 방식)가 되는 모델 수
    const textModels = models.filter((m) =>
      (m.supportedGenerationMethods || []).includes('generateContent')).length;
 
    if (liveModels.length === 0) {
      return res.status(200).json({
        결론: '❌ 이 키로는 실시간 음성(Live API)을 쓸 수 없습니다.',
        설명:
          '구글이 알려준 모델 목록에 실시간 음성이 되는 모델이 하나도 없습니다. ' +
          '앱 코드 문제가 아닙니다.',
        할일: [
          '1. https://aistudio.google.com 에 같은 계정으로 들어가 보세요.',
          '2. 왼쪽에서 Live / Stream 메뉴를 찾아 실시간 대화가 되는지 보세요.',
          '3. 거기서도 안 되면, 결제(빌링)를 등록해야 열리는 경우가 많습니다.',
          '   AI Studio → 왼쪽 아래 Settings / Plan 에서 확인하실 수 있습니다.',
        ],
        참고: `일반 대화용 모델은 ${textModels}개 쓸 수 있습니다 (지금 쓰시던 방식은 정상).`,
        전체모델수: models.length,
      });
    }
 
    return res.status(200).json({
      결론: '✅ 이 키로 실시간 음성을 쓸 수 있습니다!',
      쓸수있는_실시간음성_모델: liveModels,
      할일:
        '위 목록의 모델 이름 하나를 Vercel 환경변수 GEMINI_LIVE_MODEL 에 ' +
        '넣고 Redeploy 하면 앱이 그 모델을 씁니다. ' +
        '(목록을 그대로 복사해서 저에게 보내주셔도 됩니다)',
      참고: `일반 대화용 모델 ${textModels}개, 전체 ${models.length}개.`,
    });
  } catch (err) {
    return res.status(500).json({
      결론: '❌ 확인 중 오류가 났습니다.',
      내용: String(err && err.message || err).slice(0, 300),
    });
  }
};
 
