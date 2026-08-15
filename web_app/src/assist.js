/**
 * web_app/src/assist.js
 * ----------------------------------------------------------------------------
 * 저비용 텍스트 보조 호출.
 *
 * 비싼 음성(Live API)은 "말하기 연습"에만 쓰고,
 * 번역·복습 퀴즈·뜻풀이는 전부 텍스트 모델로 넘깁니다.
 * 호출 한 번에 0.1원 수준이라 마음껏 눌러도 됩니다.
 * ----------------------------------------------------------------------------
 */

async function callAssist(payload) {
  const res = await fetch('/api/assist', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || !data.ok) {
    throw new Error(
      data.message || data.reason || `서버가 응답을 주지 않았습니다 (HTTP ${res.status})`
    );
  }
  return data;
}

/** 같은 문장을 두 번 번역하지 않도록 캐시 (요금 절약) */
const translateCache = new Map();

/**
 * 선생님이 한 말을 한국어로 풀어줍니다.
 * @returns {Promise<{korean: string, keyWords: Array<{word:string, meaning:string}>}>}
 */
export async function translate(text, age) {
  const key = `${age}::${text}`;
  if (translateCache.has(key)) return translateCache.get(key);

  const data = await callAssist({ mode: 'translate', text, age });
  const result = { korean: data.korean || '', keyWords: data.keyWords || [] };

  translateCache.set(key, result);
  // 캐시가 무한정 커지지 않게
  if (translateCache.size > 120) {
    translateCache.delete(translateCache.keys().next().value);
  }
  return result;
}

/**
 * 단어장으로 복습 퀴즈를 만듭니다.
 * @returns {Promise<Array<{question:string, answer:string, hint?:string}>>}
 */
export async function makeQuiz(words, age) {
  const data = await callAssist({ mode: 'quiz', words, age });
  return data.questions || [];
}

/** 단어 하나를 자세히 설명합니다. */
export async function explain(word, age) {
  return callAssist({ mode: 'explain', word, age });
}
