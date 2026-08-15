/**
 * api/tts.js
 * ----------------------------------------------------------------------------
 * 선생님 대사(글자)를 자연스러운 음성으로 바꿔서 돌려줍니다.
 *
 * 왜 이 파일이 생겼나:
 *   Live API(실시간 음성)가 이 계정에서 열리지 않는 것을 확인했습니다.
 *   그래서 "연결을 열어두고 오디오를 흘려보내는" 방식을 버리고,
 *   문장이 완성될 때마다 한 번씩 소리로 바꾸는 방식으로 바꿉니다.
 *
 * ⭐ 형식이 맞아떨어지는 부분 (건드리지 말 것):
 *   Gemini TTS 는 **24kHz, 16-bit, mono PCM** 을 base64 로 돌려줍니다.
 *   web_app/src/player.js 가 원래 Live API 로부터 받던 것과 **완전히 같은 형식**입니다.
 *   덕분에 재생기·립싱크·아바타는 한 줄도 고치지 않았습니다.
 *   (config.js 의 AUDIO.OUTPUT_SAMPLE_RATE = 24000 과 반드시 일치해야 합니다.
 *    여기를 다른 모델로 바꿔서 샘플레이트가 달라지면 목소리가 느려지거나
 *    다람쥐처럼 됩니다.)
 * ----------------------------------------------------------------------------
 */

'use strict';

const { guard } = require('./_guard');
const { FAMILY_PROFILES, ADULT_TUNING } = require('./_persona');

/* TTS 모델 후보.
   앞에서부터 시도하고, 접근 권한이 없으면 다음 것으로 넘어갑니다.
   ⚠️ 조용히 넘어가지 않습니다. 어느 모델이 왜 실패했는지 전부 모아서
      응답에 실어 보냅니다. Live API 때 "그냥 응답이 없어서" 원인을
      영영 못 찾았던 일을 반복하지 않기 위해서입니다. */
const TTS_MODELS = [
  process.env.GEMINI_TTS_MODEL,
  'gemini-2.5-flash-preview-tts',
  'gemini-2.5-pro-preview-tts',
].filter(Boolean);

/** 이 학습자에게 쓸 목소리. Live API 때 쓰던 것과 같은 이름을 그대로 씁니다. */
function voiceFor(profile) {
  if (!profile) return 'Aoede';
  return profile.kind === 'child'
    ? 'Aoede'
    : ADULT_TUNING[profile.level]?.voice || 'Aoede';
}

/**
 * 읽는 방식을 말로 지시합니다.
 * Gemini TTS 는 텍스트 앞에 붙인 지시문을 읽지 않고 '연기 지시'로 받아들입니다.
 *
 * 왜 나이별로 다르게 하나:
 *   4살 지율이에게 어른 속도로 읽으면 한 마디도 못 알아듣습니다.
 *   반대로 어른에게 아이 말투로 읽으면 학습에 도움이 되는 자연스러운
 *   억양·연음을 하나도 못 듣게 됩니다.
 */
function styleFor(profile) {
  if (!profile) return 'Say warmly and clearly';
  if (profile.kind !== 'child') {
    return 'Say this naturally and conversationally, like a friendly native speaker on a phone call';
  }
  if (profile.age <= 5) {
    return 'Say this slowly, very warmly and cheerfully, like a kindergarten teacher talking to a 4-year-old. Exaggerate the intonation a little';
  }
  if (profile.age <= 7) {
    return 'Say this slowly, warmly and cheerfully, like a kind teacher talking to a small child';
  }
  return 'Say this warmly and clearly, with friendly energy, like a favorite teacher talking to a 9-year-old';
}

module.exports = async function handler(req, res) {
  if (!guard(req, res)) return;

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    /* ⚠️ 이 앱에서 가장 중요한 오류 메시지입니다.
       실제로 환경변수 이름이 GEMINI_API_KE 로 저장돼 있어서 몇 시간을
       날린 적이 있습니다. 그래서 철자와 재배포까지 짚어서 알려줍니다. */
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

  const text = String(req.body?.text || '').trim();
  if (!text) return res.status(400).json({ error: 'text_required' });

  /* 한 번에 읽을 수 있는 길이를 제한합니다.
     길면 응답이 느려지고, 아이는 그 사이 기다리다 흥미를 잃습니다.
     프롬프트에서 이미 짧게 말하라고 지시하지만 모델이 어길 수 있으므로
     여기서 한 번 더 막습니다. */
  const safeText = text.slice(0, 900);

  const profile = FAMILY_PROFILES[String(req.body?.profileId || '')] || null;
  const voiceName = voiceFor(profile);
  const prompt = `${styleFor(profile)}: ${safeText}`;

  const attempts = [];

  for (const model of TTS_MODELS) {
    try {
      const url =
        `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;

      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: {
            responseModalities: ['AUDIO'],
            speechConfig: {
              voiceConfig: { prebuiltVoiceConfig: { voiceName } },
            },
          },
        }),
      });

      if (!response.ok) {
        const detail = (await response.text()).slice(0, 400);
        attempts.push({ model, status: response.status, detail });
        // 권한/모델 문제면 다음 후보로. 그 외(429 등)는 더 시도해도 같습니다.
        if (response.status === 429 || response.status >= 500) {
          return res.status(502).json({
            error: 'tts_upstream_error',
            attempts,
            hint:
              response.status === 429
                ? 'API 사용량 한도에 걸렸습니다. 잠시 후 다시 시도해 주세요.'
                : '구글 서버 쪽 오류입니다. 잠시 후 다시 시도해 주세요.',
          });
        }
        continue;
      }

      const data = await response.json();
      const part = data?.candidates?.[0]?.content?.parts?.find((p) => p.inlineData);
      const audio = part?.inlineData?.data;

      if (!audio) {
        attempts.push({ model, status: 200, detail: 'inlineData 가 응답에 없습니다' });
        continue;
      }

      return res.status(200).json({
        audio,                       // base64 PCM16
        sampleRate: 24000,           // player.js 가 기대하는 값과 일치해야 합니다
        mimeType: part.inlineData.mimeType || 'audio/L16;rate=24000',
        model,
        voiceName,
      });
    } catch (err) {
      attempts.push({ model, status: 0, detail: String(err?.message || err).slice(0, 300) });
    }
  }

  /* 모든 후보가 실패. **조용히 넘어가지 않습니다.**
     클라이언트는 이 응답을 보고 화면에 "브라우저 음성으로 대체 중" 배지를
     띄웁니다. 말없이 대신 대답하는 폴백은 버그보다 나쁩니다. */
  return res.status(502).json({
    error: 'tts_all_models_failed',
    attempts,
    hint:
      'TTS 모델에 모두 접근하지 못했습니다. 계정에서 아직 열리지 않은 모델일 수 ' +
      '있습니다. GEMINI_TTS_MODEL 환경변수로 다른 모델을 지정해 보세요.',
  });
};
