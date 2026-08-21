/**
 * api/assist.js
 * ----------------------------------------------------------------------------
 * 저비용 텍스트 보조 엔드포인트.
 *
 * 음성(Live API)은 분당 과금이라 비쌉니다. 하지만 학습에서 음성이 꼭 필요한 건
 * "말하기 연습"뿐입니다. 번역·복습 퀴즈·뜻풀이는 텍스트로 하면
 * 요금이 사실상 0에 가깝습니다 (호출 한 번에 0.1원 수준).
 *
 * 그래서 비싼 음성은 대화에만 쓰고, 나머지는 전부 여기로 보냅니다.
 *
 * 모드:
 *   translate — 선생님이 한 말을 한국어로 풀어줍니다 (못 알아들었을 때)
 *   quiz      — 단어장으로 복습 퀴즈를 만듭니다
 *   explain   — 단어/표현 하나를 자세히 설명합니다
 * ----------------------------------------------------------------------------
 */

'use strict';

const { GoogleGenAI } = require('@google/genai');
const { guard } = require('./_guard');

/** 텍스트용 저가 모델. 환경변수로 바꿀 수 있습니다. */
const TEXT_MODEL = process.env.GEMINI_TEXT_MODEL || 'gemini-3.1-flash';

const clean = (s, max) =>
  typeof s === 'string'
    ? s.replace(/[\u0000-\u001F\u007F]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max)
    : '';

/** 모드별 프롬프트 + 응답 스키마 */
function buildRequest(mode, body) {
  switch (mode) {
    case 'translate': {
      const text = clean(body.text, 600);
      if (!text) throw new Error('번역할 문장이 없습니다');
      const age = Number(body.age) || 20;
      const forKid = age <= 10;
      return {
        prompt:
          `다음은 영어 선생님이 ${age}세 학습자에게 한 말입니다. 한국어로 옮겨 주세요.\n\n` +
          `"${text}"\n\n` +
          (forKid
            ? '아이가 이해할 수 있는 아주 쉬운 한국어로, 짧게 써 주세요.'
            : '자연스러운 한국어로 옮기고, 직역이 어색하면 의미를 살려 주세요.'),
        schema: {
          type: 'object',
          properties: {
            korean: { type: 'string', description: '한국어 번역' },
            keyWords: {
              type: 'array',
              description: '이 문장에서 알아두면 좋은 표현 (최대 2개, 없으면 빈 배열)',
              items: {
                type: 'object',
                properties: {
                  word: { type: 'string' },
                  meaning: { type: 'string' },
                },
                required: ['word', 'meaning'],
              },
            },
          },
          required: ['korean', 'keyWords'],
        },
      };
    }

    case 'quiz': {
      const words = Array.isArray(body.words)
        ? body.words.map((w) => clean(w, 60)).filter(Boolean).slice(0, 10)
        : [];
      if (!words.length) throw new Error('퀴즈로 낼 단어가 없습니다');
      const age = Number(body.age) || 20;
      return {
        prompt:
          `${age}세 한국인 영어 학습자를 위한 복습 퀴즈를 만들어 주세요.\n` +
          `복습할 표현: ${words.join(', ')}\n\n` +
          `각 표현마다 문제 1개씩. 한국어 뜻을 주고 영어 표현을 떠올리게 하거나, ` +
          `빈칸이 있는 짧은 영어 문장을 주고 채우게 하세요. ` +
          `${age <= 10 ? '아이가 풀 수 있게 아주 쉽게 만드세요.' : ''}`,
        schema: {
          type: 'object',
          properties: {
            questions: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  question: { type: 'string', description: '문제 (한국어 설명 + 필요시 영어 빈칸 문장)' },
                  answer: { type: 'string', description: '정답 영어 표현' },
                  hint: { type: 'string', description: '힌트 (첫 글자 등)' },
                },
                required: ['question', 'answer'],
              },
            },
          },
          required: ['questions'],
        },
      };
    }

    case 'explain': {
      const word = clean(body.word, 80);
      if (!word) throw new Error('설명할 단어가 없습니다');
      const age = Number(body.age) || 20;
      return {
        prompt:
          `"${word}" 를 ${age}세 한국인 영어 학습자에게 설명해 주세요. ` +
          `${age <= 10 ? '아이가 이해할 수 있게 아주 쉽고 재미있게.' : '뉘앙스와 실제 쓰임까지.'}`,
        schema: {
          type: 'object',
          properties: {
            meaningKo: { type: 'string' },
            pronunciationKo: { type: 'string', description: '한글 발음 표기' },
            examples: {
              type: 'array',
              description: '예문 2~3개',
              items: {
                type: 'object',
                properties: { en: { type: 'string' }, ko: { type: 'string' } },
                required: ['en', 'ko'],
              },
            },
            tipKo: { type: 'string', description: '기억하는 요령이나 주의할 점' },
          },
          required: ['meaningKo', 'examples'],
        },
      };
    }

    default:
      throw new Error(`알 수 없는 모드: ${mode}`);
  }
}

module.exports = async function handler(req, res) {
  if (!guard(req, res)) return;

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return res.status(500).json({
      error: 'server_not_configured',
      message: 'GEMINI_API_KEY 환경변수가 설정되지 않았습니다.',
    });
  }

  const body = req.body || {};
  let request;
  try {
    request = buildRequest(String(body.mode || 'translate'), body);
  } catch (err) {
    return res.status(400).json({ error: 'bad_request', message: String(err.message) });
  }

  try {
    const ai = new GoogleGenAI({ apiKey });

    const result = await ai.models.generateContent({
      model: TEXT_MODEL,
      contents: request.prompt,
      config: {
        responseMimeType: 'application/json',
        responseSchema: request.schema,
        // 번역·퀴즈는 창의성이 필요 없습니다 → 낮은 온도 + 사고 최소화로 비용 절감
        temperature: 0.3,
        thinkingConfig: { thinkingLevel: 'MINIMAL' },
      },
    });

    const text = result.text;
    let data;
    try {
      data = JSON.parse(text);
    } catch {
      console.error('[assist] JSON 파싱 실패:', String(text).slice(0, 300));
      return res.status(502).json({ error: 'bad_model_output', message: '응답을 해석할 수 없습니다.' });
    }

    return res.status(200).json({ ok: true, ...data });
  } catch (err) {
    console.error('[assist] 실패:', err);
    const message = String(err?.message || err);
    let hint = message;
    if (/not found|NOT_FOUND|permission/i.test(message)) {
      hint = `모델 "${TEXT_MODEL}" 을 쓸 수 없습니다. GEMINI_TEXT_MODEL 환경변수로 바꿔보세요.`;
    } else if (/quota|RESOURCE_EXHAUSTED|429/i.test(message)) {
      hint = 'API 사용량 한도에 걸렸습니다. 잠시 후 다시 시도해 주세요.';
    }
    return res.status(502).json({ error: 'assist_failed', message: hint });
  }
};
