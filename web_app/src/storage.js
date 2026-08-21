/**
 * web_app/src/storage.js
 * ----------------------------------------------------------------------------
 * 단어장 · 학습 기록 저장소.
 *
 * 기존 버전은 localStorage에 JSON을 통째로 넣었는데, 대화가 쌓이면
 * 5MB 한도에 부딪혀 조용히 실패합니다. 여기서는 IndexedDB를 씁니다.
 * (설정처럼 작은 값만 localStorage에 남깁니다)
 *
 * 단어장에는 **간격 반복(spaced repetition)** 정보를 함께 저장합니다.
 * 복습 시점이 된 단어를 다음 대화의 프롬프트에 넣어주면,
 * 추가 요금 없이 선생님이 자연스럽게 복습을 시켜줍니다.
 * → 비용은 그대로, 학습 효과는 크게.
 * ----------------------------------------------------------------------------
 */

import { STORAGE, DEFAULTS, PROFILES, CHILD_STAGES } from './config.js';

const STORES = {
  VOCAB: 'vocabulary',
  CORRECTIONS: 'corrections',
  SESSIONS: 'sessions',
  /** 대화 한 줄 한 줄. 무엇이 잘못됐는지 보려면 이게 남아 있어야 합니다. */
  MESSAGES: 'messages',
};

let dbPromise = null;

function openDb() {
  if (dbPromise) return dbPromise;

  dbPromise = new Promise((resolve, reject) => {
    const request = indexedDB.open(STORAGE.DB_NAME, STORAGE.DB_VERSION);

    request.onupgradeneeded = (event) => {
      const db = event.target.result;

      if (!db.objectStoreNames.contains(STORES.VOCAB)) {
        const store = db.createObjectStore(STORES.VOCAB, { keyPath: 'id' });
        store.createIndex('profileId', 'profileId');
        store.createIndex('dueAt', 'dueAt');
        store.createIndex('word', 'word');
      }
      if (!db.objectStoreNames.contains(STORES.CORRECTIONS)) {
        const store = db.createObjectStore(STORES.CORRECTIONS, { keyPath: 'id' });
        store.createIndex('profileId', 'profileId');
        store.createIndex('createdAt', 'createdAt');
      }
      if (!db.objectStoreNames.contains(STORES.SESSIONS)) {
        const store = db.createObjectStore(STORES.SESSIONS, { keyPath: 'id' });
        store.createIndex('profileId', 'profileId');
        store.createIndex('startedAt', 'startedAt');
      }
      if (!db.objectStoreNames.contains(STORES.MESSAGES)) {
        const store = db.createObjectStore(STORES.MESSAGES, { keyPath: 'id', autoIncrement: true });
        store.createIndex('sessionId', 'sessionId');
        store.createIndex('profileId', 'profileId');
        store.createIndex('at', 'at');
      }
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
    // 다른 탭이 예전 버전을 잡고 있으면 여기서 멈춥니다
    request.onblocked = () => reject(new Error('다른 탭에서 앱이 열려 있어 저장소를 열 수 없습니다'));
  });

  // ⚠️ 실패한 약속을 캐시해두면 그 탭에서는 영원히 단어장이 안 열립니다.
  //    실패 시 캐시를 비워 다음 호출에서 다시 시도할 수 있게 합니다.
  dbPromise.catch(() => { dbPromise = null; });

  return dbPromise;
}

async function tx(storeName, mode, fn) {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(storeName, mode);
    const store = transaction.objectStore(storeName);
    let result;
    try {
      result = fn(store);
    } catch (err) {
      reject(err);
      return;
    }
    transaction.oncomplete = () => resolve(result?.result ?? result);
    transaction.onerror = () => reject(transaction.error);
    transaction.onabort = () => reject(transaction.error);
  });
}

function requestToPromise(request) {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

/* ═══════════════════════════════════════════════════════════════════════════
   간격 반복 (Leitner 방식 단순화)
   복습 성공 횟수에 따라 다음 복습까지의 간격이 늘어납니다.
   ═══════════════════════════════════════════════════════════════════════════ */
/**
 * 복습 간격(일).
 *
 * ⚠️ 첫 칸을 0으로 두면 방금 배운 단어가 **그 즉시** 복습 대상이 됩니다.
 *    그러면 단어장의 모든 단어에 "복습" 딱지가 붙고,
 *    리포트의 "복습할 단어" 숫자가 전체 단어 수와 똑같아져서 의미가 없어집니다.
 *    그래서 첫 복습은 같은 날 4시간 뒤로 잡습니다 (하루 안에 한 번 더 만나기).
 */
const REVIEW_INTERVALS_DAYS = [1 / 6, 1, 3, 7, 16, 35, 70];

function nextDueAt(box) {
  const days = REVIEW_INTERVALS_DAYS[Math.min(box, REVIEW_INTERVALS_DAYS.length - 1)];
  return Date.now() + days * 24 * 60 * 60 * 1000;
}

/* ═══════════════════════════════════════════════════════════════════════════
   단어장
   ═══════════════════════════════════════════════════════════════════════════ */

/** 단어 저장 (같은 단어가 이미 있으면 갱신) */
export async function saveVocabulary(profileId, entry) {
  const word = String(entry.word || '').trim();
  if (!word) return null;

  const id = `${profileId}::${word.toLowerCase()}`;

  // ⚠️ 읽기와 쓰기를 각각 다른 트랜잭션으로 하면 갱신이 사라집니다.
  //    (같은 턴에 promoteVocabulary와 동시에 실행되는 일이 실제로 생깁니다)
  //    반드시 하나의 readwrite 트랜잭션 안에서 읽고 씁니다.
  return tx(STORES.VOCAB, 'readwrite', async (store) => {
    const existing = await requestToPromise(store.get(id));

    const record = {
      id,
      profileId,
      word,
      meaningKo: entry.meaning_ko || entry.meaningKo || '',
      partOfSpeech: entry.part_of_speech || entry.partOfSpeech || '',
      pronunciationKo: entry.pronunciation_ko || entry.pronunciationKo || '',
      // 글자를 못 읽는 아이는 이모지로 뜻을 알아봅니다 — 반드시 보존
      emoji: entry.emoji || existing?.emoji || '',
      exampleEn: entry.example_en || entry.exampleEn || '',
      exampleKo: entry.example_ko || entry.exampleKo || '',
      createdAt: existing?.createdAt || Date.now(),
      updatedAt: Date.now(),
      // 이미 있던 단어를 또 배웠다면 아직 안 익은 것 → 박스를 되돌립니다
      box: existing ? Math.max(0, (existing.box || 0) - 1) : 0,
      timesSeen: (existing?.timesSeen || 0) + 1,
      timesUsed: existing?.timesUsed || 0,
    };
    record.dueAt = nextDueAt(record.box);

    store.put(record);
    return record;
  });
}

/** 학습자가 그 표현을 스스로 다시 썼을 때 → 한 단계 승급 */
export async function promoteVocabulary(profileId, word) {
  const id = `${profileId}::${String(word).toLowerCase()}`;

  // saveVocabulary와 같은 이유로 하나의 트랜잭션 안에서 처리합니다
  return tx(STORES.VOCAB, 'readwrite', async (store) => {
    const existing = await requestToPromise(store.get(id));
    if (!existing) return null;

    existing.box = Math.min(REVIEW_INTERVALS_DAYS.length - 1, (existing.box || 0) + 1);
    existing.timesUsed = (existing.timesUsed || 0) + 1;
    existing.dueAt = nextDueAt(existing.box);
    existing.updatedAt = Date.now();

    store.put(existing);
    return existing;
  });
}

export async function listVocabulary(profileId, { limit = 500 } = {}) {
  const all = await tx(STORES.VOCAB, 'readonly', (s) =>
    requestToPromise(s.index('profileId').getAll(profileId))
  );
  return all.sort((a, b) => b.updatedAt - a.updatedAt).slice(0, limit);
}

/**
 * 오늘 복습해야 하는 단어들.
 * 이 목록을 다음 세션 프롬프트에 넣어주면 선생님이 자연스럽게 복습시킵니다.
 */
export async function listDueVocabulary(profileId, limit = 12) {
  const all = await listVocabulary(profileId);
  const now = Date.now();
  return all
    .filter((v) => (v.dueAt || 0) <= now)
    .sort((a, b) => (a.dueAt || 0) - (b.dueAt || 0))
    .slice(0, limit);
}

export async function deleteVocabulary(profileId, word) {
  const id = `${profileId}::${String(word).toLowerCase()}`;
  await tx(STORES.VOCAB, 'readwrite', (s) => s.delete(id));
}

/* ═══════════════════════════════════════════════════════════════════════════
   문장 교정 기록
   ═══════════════════════════════════════════════════════════════════════════ */

export async function saveCorrection(profileId, entry) {
  const record = {
    id: `${profileId}::${Date.now()}::${Math.round(performance.now() * 1000) % 100000}`,
    profileId,
    original: entry.original || '',
    corrected: entry.corrected || '',
    explanationKo: entry.explanation_ko || entry.explanationKo || '',
    nativeVersion: entry.native_version || entry.nativeVersion || '',
    advancedVersion: entry.advanced_version || entry.advancedVersion || '',
    errorType: entry.error_type || entry.errorType || '기타',
    createdAt: Date.now(),
  };
  await tx(STORES.CORRECTIONS, 'readwrite', (s) => s.put(record));
  return record;
}

export async function listCorrections(profileId, { limit = 200 } = {}) {
  const all = await tx(STORES.CORRECTIONS, 'readonly', (s) =>
    requestToPromise(s.index('profileId').getAll(profileId))
  );
  return all.sort((a, b) => b.createdAt - a.createdAt).slice(0, limit);
}

/** 오류 유형별 집계 — 리포트에서 "무엇을 자주 틀리는가"를 보여줍니다 */
export async function errorTypeStats(profileId, sinceDays = 30) {
  const cutoff = Date.now() - sinceDays * 24 * 60 * 60 * 1000;
  const all = await listCorrections(profileId, { limit: 1000 });
  const stats = {};
  for (const c of all) {
    if (c.createdAt < cutoff) continue;
    stats[c.errorType] = (stats[c.errorType] || 0) + 1;
  }
  return Object.entries(stats).sort((a, b) => b[1] - a[1]);
}

/* ═══════════════════════════════════════════════════════════════════════════
   세션 기록 (다음 대화에서 "지난번 이야기"를 이어가기 위한 요약)
   ═══════════════════════════════════════════════════════════════════════════ */

export async function saveSession(profileId, session) {
  const record = {
    id: `${profileId}::${session.startedAt}`,
    profileId,
    startedAt: session.startedAt,
    endedAt: session.endedAt || Date.now(),
    turns: session.turns || 0,
    minutes: session.minutes || 0,
    /** 대화에서 오갔던 주제 키워드 (다음 세션 프롬프트에 씁니다) */
    topics: session.topics || [],
    highlights: session.highlights || [],
    newWords: session.newWords || [],
    /** 이번 대화에서 연습한 문장 틀 */
    frames: session.frames || [],
    /** 그때의 학습 단계 (나중에 성장 곡선을 보기 위해) */
    stage: session.stage ?? null,
  };
  await tx(STORES.SESSIONS, 'readwrite', (s) => s.put(record));
  return record;
}

export async function listSessions(profileId, { limit = 30 } = {}) {
  const all = await tx(STORES.SESSIONS, 'readonly', (s) =>
    requestToPromise(s.index('profileId').getAll(profileId))
  );
  return all.sort((a, b) => b.startedAt - a.startedAt).slice(0, limit);
}

/**
 * 서버에 보낼 "지난 대화 요약" 문자열을 만듭니다.
 * 토큰을 아끼려고 짧게 유지합니다 (600자 제한).
 */
export async function buildRecentSummary(profileId) {
  const sessions = await listSessions(profileId, { limit: 3 });
  if (!sessions.length) return '';

  const parts = [];
  for (const s of sessions) {
    const when = new Date(s.startedAt);
    const label = `${when.getMonth() + 1}/${when.getDate()}`;
    const bits = [];
    if (s.topics?.length) bits.push(`주제: ${s.topics.slice(0, 4).join(', ')}`);
    if (s.frames?.length) bits.push(`연습한 틀: ${s.frames.slice(0, 2).join(' / ')}`);
    if (s.highlights?.length) bits.push(s.highlights.slice(0, 2).join(' / '));
    if (bits.length) parts.push(`${label} — ${bits.join(' · ')}`);
  }
  return parts.join('\n').slice(0, 600);
}

/* ═══════════════════════════════════════════════════════════════════════════
   설정 (작은 값이므로 localStorage)
   ═══════════════════════════════════════════════════════════════════════════ */

/**
 * 저장된 설정에 한 번만 적용하는 보정.
 *
 * ⚠️ 기본값을 바꿔도 **저장된 값이 이깁니다.**
 *    halfDuplex 기본값을 true → false 로 바꿨지만, 설정 화면에서 아무거나
 *    한 번 건드린 적이 있으면 예전 true 가 통째로 저장돼 있어서
 *    마이크가 계속 닫힙니다. 그리고 그 상태에서는 ✋ 버튼도 안 뜹니다.
 *    문제를 겪고 설정을 뒤져본 사람일수록 저장돼 있을 확률이 높습니다.
 *    그래서 옛 기본값으로 굳은 true 는 딱 한 번 지워줍니다.
 *    이 보정 이후에 사용자가 직접 켠 값은 그대로 존중합니다.
 */
const SETTINGS_MIGRATIONS = [
  {
    // v7에서 기본값을 "끼어들기 모드"로 바꾸면서 저장된 true 를 지웠는데,
    // 그게 스피커 되돌림(내 말이 두 번 인식됨)을 불러왔습니다. v8에서
    // 안전 모드를 다시 기본으로 되돌리므로, 그때 지웠던 흔적도 정리합니다.
    id: 'halfDuplexOffByDefault',
    apply() { /* v8에서 무효화 — 아무것도 하지 않습니다 */ },
  },
  {
    // v7을 잠깐 쓰신 분은 "끼어들기 모드"가 저장돼 있을 수 있습니다.
    // 직접 고르신 게 아니라면 안전 모드로 되돌립니다.
    id: 'halfDuplexBackOnByDefault',
    apply(s) {
      if (s.halfDuplexUserSet) return;
      if (s.halfDuplex === false) delete s.halfDuplex;
    },
  },
  {
    /**
     * v11: 기본 아바타가 사진 → 3D 로 바뀌었습니다.
     *
     * loadSettings 는 { ...DEFAULTS, ...stored } 이므로, 예전에 저장된
     * 'photo' 가 남아 있으면 새 기본값이 영영 적용되지 않습니다.
     * 사용자가 **직접** 고른 게 아니라면 저장값을 지워서 새 기본값이
     * 적용되게 합니다. 직접 사진을 고르신 분의 선택은 그대로 둡니다.
     */
    id: 'threeAvatarByDefault',
    apply(s) {
      if (s.avatarModeUserSet) return;
      if (s.avatarMode === 'photo') delete s.avatarMode;
    },
  },
];

export function loadSettings() {
  let stored;
  try {
    const raw = localStorage.getItem(STORAGE.SETTINGS_KEY);
    stored = raw ? JSON.parse(raw) : {};
  } catch {
    stored = {};
  }
  if (!stored || typeof stored !== 'object') stored = {};

  const done = Array.isArray(stored._migrations) ? stored._migrations.slice() : [];
  let changed = false;
  for (const m of SETTINGS_MIGRATIONS) {
    if (done.includes(m.id)) continue;
    m.apply(stored);
    done.push(m.id);
    changed = true;
  }
  if (changed) {
    stored._migrations = done;
    try {
      localStorage.setItem(STORAGE.SETTINGS_KEY, JSON.stringify(stored));
    } catch { /* 저장을 못 해도 이번 실행에는 적용됩니다 */ }
  }

  return { ...DEFAULTS, ...stored };
}

export function saveSettings(settings) {
  try {
    localStorage.setItem(STORAGE.SETTINGS_KEY, JSON.stringify(settings));
  } catch (err) {
    console.warn('[storage] 설정 저장 실패', err);
  }
}

/* ═══════════════════════════════════════════════════════════════════════════
   아이 학습 단계

   선생님(모델)이 대화를 보고 판단해 올리거나 내립니다.
   아이에게는 보이지 않고, 부모만 리포트에서 확인합니다.

   한 번의 판단으로 바로 바꾸지 않습니다. 같은 방향 제안이 두 번 쌓여야
   실제로 움직입니다 — 하루 컨디션으로 단계가 출렁이면 안 되기 때문입니다.
   ═══════════════════════════════════════════════════════════════════════════ */

const MAX_STAGE = CHILD_STAGES.length - 1;
/** 실제로 단계를 옮기기 위해 필요한 같은 방향 제안 횟수 */
const VOTES_TO_MOVE = 2;

function loadStages() {
  try {
    const raw = localStorage.getItem(STORAGE.STAGE_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

function saveStages(data) {
  try {
    localStorage.setItem(STORAGE.STAGE_KEY, JSON.stringify(data));
  } catch (err) {
    console.warn('[storage] 단계 저장 실패', err);
  }
}

function defaultStageOf(profileId) {
  return PROFILES.find((p) => p.id === profileId)?.defaultStage ?? 0;
}

/** 이 아이의 현재 단계 */
export function getStage(profileId) {
  const all = loadStages();
  const entry = all[profileId];
  const value = Number.isFinite(entry?.stage) ? entry.stage : defaultStageOf(profileId);
  return Math.max(0, Math.min(MAX_STAGE, value));
}

/** 단계 정보 전체 (리포트용) */
export function getStageInfo(profileId) {
  const all = loadStages();
  const entry = all[profileId] || {};
  const stage = getStage(profileId);
  return {
    stage,
    meta: CHILD_STAGES[stage],
    votes: entry.votes || 0,
    history: entry.history || [],
  };
}

/** 부모가 직접 단계를 설정 */
export function setStage(profileId, stage, reason = '부모가 직접 조정') {
  const all = loadStages();
  const next = Math.max(0, Math.min(MAX_STAGE, Math.floor(Number(stage) || 0)));
  const prev = getStage(profileId);

  all[profileId] = {
    // ⚠️ 기존 항목을 펼쳐야 합니다. 안 그러면 연습 중이던 문장 틀이 사라집니다.
    ...(all[profileId] || {}),
    stage: next,
    votes: 0,
    history: [
      ...((all[profileId]?.history) || []),
      { at: Date.now(), from: prev, to: next, reason },
    ].slice(-20),
  };
  saveStages(all);
  return next;
}

/**
 * 선생님의 단계 조정 제안을 반영합니다.
 *
 * @returns {{changed: boolean, stage: number, from: number, votes: number}}
 */
export function recordStageSuggestion(profileId, direction, reason = '') {
  const all = loadStages();
  const entry = all[profileId] || { stage: defaultStageOf(profileId), votes: 0, history: [] };
  const current = Math.max(0, Math.min(MAX_STAGE, entry.stage ?? defaultStageOf(profileId)));
  const delta = direction === 'up' ? 1 : -1;

  // 방향이 바뀌면 표를 새로 셉니다
  const votes = Math.sign(entry.votes || 0) === delta ? (entry.votes || 0) + delta : delta;

  let stage = current;
  let changed = false;

  if (Math.abs(votes) >= VOTES_TO_MOVE) {
    const next = Math.max(0, Math.min(MAX_STAGE, current + delta));
    if (next !== current) {
      stage = next;
      changed = true;
    }
  }

  all[profileId] = {
    // ⚠️ 기존 항목 보존 (currentFrame 등)
    ...entry,
    stage,
    votes: changed ? 0 : votes,
    history: changed
      ? [...(entry.history || []), { at: Date.now(), from: current, to: stage, reason }].slice(-20)
      : (entry.history || []),
  };
  saveStages(all);

  return { changed, stage, from: current, votes: all[profileId].votes };
}

/* ═══════════════════════════════════════════════════════════════════════════
   지금 연습 중인 문장 틀
   (다음 대화에서 같은 틀을 이어서 연습시키기 위해 기억합니다)
   ═══════════════════════════════════════════════════════════════════════════ */

export function getCurrentFrame(profileId) {
  const all = loadStages();
  return all[profileId]?.currentFrame || '';
}

export function setCurrentFrame(profileId, frame) {
  const all = loadStages();
  all[profileId] = { ...(all[profileId] || { stage: defaultStageOf(profileId) }), currentFrame: frame };
  saveStages(all);
}

/* ═══════════════════════════════════════════════════════════════════════════
   대화 기록

   화면에만 보여주고 버리면, 무엇이 잘못됐는지 나중에 확인할 방법이 없습니다.
   (실제로 "대화가 이상하다"는 걸 확인하려다 기록이 없어서 막혔습니다)
   부모가 아이가 무슨 이야기를 했는지 보는 데에도 필요합니다.
   ═══════════════════════════════════════════════════════════════════════════ */

/** 대화 한 줄 저장 */
export async function appendMessage(profileId, sessionId, speaker, text) {
  if (!text?.trim()) return;
  try {
    await tx(STORES.MESSAGES, 'readwrite', (store) => {
      store.add({
        profileId,
        sessionId,
        speaker,            // 'user' | 'teacher' | 'system'
        text: String(text).slice(0, 2000),
        at: Date.now(),
      });
    });
  } catch (err) {
    console.warn('[storage] 대화 저장 실패', err);
  }
}

/** 한 통화의 대화 전체 */
export async function listMessages(sessionId) {
  const all = await tx(STORES.MESSAGES, 'readonly', (s) =>
    requestToPromise(s.index('sessionId').getAll(sessionId))
  );
  return all.sort((a, b) => a.at - b.at);
}

/** 이 사람의 최근 대화들 (통화 단위로 묶어서) */
export async function listRecentConversations(profileId, limit = 10) {
  const all = await tx(STORES.MESSAGES, 'readonly', (s) =>
    requestToPromise(s.index('profileId').getAll(profileId))
  );

  const bySession = new Map();
  for (const m of all) {
    if (!bySession.has(m.sessionId)) {
      bySession.set(m.sessionId, { sessionId: m.sessionId, startedAt: m.at, messages: [] });
    }
    const g = bySession.get(m.sessionId);
    g.messages.push(m);
    g.startedAt = Math.min(g.startedAt, m.at);
  }

  return [...bySession.values()]
    .map((g) => ({ ...g, messages: g.messages.sort((a, b) => a.at - b.at) }))
    .sort((a, b) => b.startedAt - a.startedAt)
    .slice(0, limit);
}

/** 30일 지난 대화는 정리합니다 (용량 보호) */
export async function pruneOldMessages(days = 30) {
  const cutoff = Date.now() - days * 24 * 60 * 60 * 1000;
  try {
    const db = await openDb();
    await new Promise((resolve, reject) => {
      const t = db.transaction(STORES.MESSAGES, 'readwrite');
      const idx = t.objectStore(STORES.MESSAGES).index('at');
      const req = idx.openCursor(IDBKeyRange.upperBound(cutoff));
      req.onsuccess = () => {
        const cur = req.result;
        if (cur) { cur.delete(); cur.continue(); }
      };
      t.oncomplete = resolve;
      t.onerror = () => reject(t.error);
    });
  } catch (err) {
    console.warn('[storage] 오래된 대화 정리 실패', err);
  }
}

export async function deleteConversation(sessionId) {
  const db = await openDb();
  await new Promise((resolve, reject) => {
    const t = db.transaction(STORES.MESSAGES, 'readwrite');
    const idx = t.objectStore(STORES.MESSAGES).index('sessionId');
    const req = idx.openCursor(IDBKeyRange.only(sessionId));
    req.onsuccess = () => {
      const cur = req.result;
      if (cur) { cur.delete(); cur.continue(); }
    };
    t.oncomplete = resolve;
    t.onerror = () => reject(t.error);
  });
}
