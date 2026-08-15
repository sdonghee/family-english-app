/**
 * api/_guard.js
 * ----------------------------------------------------------------------------
 * 모든 API 엔드포인트가 공유하는 출처(origin) 검사.
 *
 * 헤더만 설정하고 요청은 그대로 처리하면, 브라우저 밖에서 오는 요청
 * (curl, 스크립트)은 아무 제약 없이 통과합니다. CORS는 브라우저에게 주는
 * 안내일 뿐 서버 차단 장치가 아니기 때문입니다.
 *
 * 요금 관리가 이 앱의 핵심 목표이므로, 허용되지 않은 출처는 **실제로 거절**합니다.
 *
 * (Origin 헤더는 GET/HEAD가 아닌 요청에는 브라우저가 항상 붙입니다.
 *  따라서 POST에서 Origin이 없다면 브라우저에서 온 요청이 아닙니다.)
 * ----------------------------------------------------------------------------
 */

'use strict';

function allowedOrigin(req) {
  const configured = (process.env.ALLOWED_ORIGINS || '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);

  const origin = req.headers.origin;
  if (!origin) return null;

  const isVercelHost = /^https:\/\/[a-z0-9-]+\.vercel\.app$/i.test(origin);
  const isLocalhost = /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/i.test(origin);

  if (configured.includes(origin) || isVercelHost || isLocalhost) return origin;
  return null;
}

/**
 * 공통 전처리.
 * @returns {boolean} true면 계속 진행, false면 이미 응답을 보냈으니 즉시 return
 */
function guard(req, res, { methods = ['POST'] } = {}) {
  const origin = allowedOrigin(req);

  if (origin) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Vary', 'Origin');
  }
  res.setHeader('Access-Control-Allow-Methods', [...methods, 'OPTIONS'].join(', '));
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('Cache-Control', 'no-store');

  if (req.method === 'OPTIONS') {
    res.status(204).end();
    return false;
  }

  if (!methods.includes(req.method)) {
    res.status(405).json({ error: 'method_not_allowed' });
    return false;
  }

  // ⭐ 여기가 핵심: 허용되지 않은 출처는 실제로 거절합니다.
  if (!origin) {
    res.status(403).json({
      error: 'forbidden_origin',
      message:
        '허용되지 않은 곳에서 온 요청입니다. ' +
        'ALLOWED_ORIGINS 환경변수에 이 앱의 도메인이 들어 있는지 확인해 주세요.',
    });
    return false;
  }

  return true;
}

/** 제어문자를 없애고 길이를 제한합니다 (프롬프트에 들어가는 값 정화용) */
function cleanText(value, max) {
  return typeof value === 'string'
    ? value
        .replace(/[\u0000-\u001F\u007F]/g, ' ')
        .replace(/\s+/g, ' ')
        .trim()
        .slice(0, max)
    : '';
}

module.exports = { guard, allowedOrigin, cleanText };
