/**
 * web_app/src/usage.js
 * ----------------------------------------------------------------------------
 * 사용량 계량기 + 하루 한도.
 *
 * 두 가지 목적이 있습니다:
 *  1) 요금 사고 방지 — 아이가 앱을 켜두고 잊어버려도 한도에서 멈춥니다.
 *  2) 학습 습관 — "하루 15분"이라는 명확한 목표가 오히려 꾸준함을 만듭니다.
 *
 * 과금 대상을 실제로 흘려보낸 시간으로 계산합니다.
 * (마이크 게이트 덕분에 '연결된 시간'보다 훨씬 짧습니다)
 * ----------------------------------------------------------------------------
 */

import { COST, STORAGE } from './config.js';

function todayKey() {
  // 로컬 시간 기준 YYYY-MM-DD
  const d = new Date();
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function emptyEntry() {
  return { audioInMs: 0, audioOutMs: 0, avatarMs: 0, sessions: 0, turns: 0 };
}

export class UsageMeter {
  constructor() {
    this.data = this._load();
    this._pruneOldDays();
  }

  _load() {
    try {
      const raw = localStorage.getItem(STORAGE.USAGE_KEY);
      return raw ? JSON.parse(raw) : {};
    } catch {
      return {};
    }
  }

  _save() {
    try {
      localStorage.setItem(STORAGE.USAGE_KEY, JSON.stringify(this.data));
    } catch (err) {
      console.warn('[usage] 저장 실패', err);
    }
  }

  /** 30일 지난 기록은 지웁니다 (localStorage 용량 보호) */
  _pruneOldDays() {
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - 30);
    // todayKey()와 같은 로컬 시간 기준으로 만들어야 하루 밀리지 않습니다
    const pad = (n) => String(n).padStart(2, '0');
    const cutoffKey =
      `${cutoff.getFullYear()}-${pad(cutoff.getMonth() + 1)}-${pad(cutoff.getDate())}`;

    let changed = false;
    for (const day of Object.keys(this.data)) {
      if (day < cutoffKey) {
        delete this.data[day];
        changed = true;
      }
    }
    if (changed) this._save();
  }

  _entry(profileId, day = todayKey()) {
    this.data[day] ||= {};
    this.data[day][profileId] ||= emptyEntry();
    return this.data[day][profileId];
  }

  /** 오늘 이 프로필의 사용 기록 */
  today(profileId) {
    return { ...this._entry(profileId) };
  }

  addAudioIn(profileId, ms) {
    this._entry(profileId).audioInMs += ms;
    this._saveThrottled();
  }

  addAudioOut(profileId, ms) {
    this._entry(profileId).audioOutMs += ms;
    this._saveThrottled();
  }

  addAvatar(profileId, ms) {
    this._entry(profileId).avatarMs += ms;
    this._saveThrottled();
  }

  addSession(profileId) {
    this._entry(profileId).sessions += 1;
    this._save();
  }

  addTurn(profileId) {
    this._entry(profileId).turns += 1;
    this._saveThrottled();
  }

  /** 잦은 쓰기를 막기 위해 2초에 한 번만 저장 */
  _saveThrottled() {
    if (this._saveTimer) return;
    this._saveTimer = setTimeout(() => {
      this._saveTimer = null;
      this._save();
    }, 2000);
  }

  /**
   * 오늘 사용한 "대화 분량"(분).
   * 요금 기준인 실제 전송 시간 중 더 긴 쪽을 씁니다.
   */
  todayMinutes(profileId) {
    const e = this._entry(profileId);
    return Math.max(e.audioInMs, e.audioOutMs) / 60000;
  }

  /** 하루 한도 (분). 0 또는 없으면 무제한 */
  dailyLimit(profileId) {
    return COST.DAILY_LIMIT_MIN[profileId] || 0;
  }

  /** 남은 시간 (분). 무제한이면 Infinity */
  remainingMinutes(profileId) {
    const limit = this.dailyLimit(profileId);
    if (!limit) return Infinity;
    return Math.max(0, limit - this.todayMinutes(profileId));
  }

  /** 한도를 다 썼는지 */
  isExhausted(profileId) {
    return this.remainingMinutes(profileId) <= 0;
  }

  /** 예상 요금 (원). 참고용 추정치입니다. */
  estimateKrw(profileId, day = todayKey()) {
    const e = this._entry(profileId, day);
    const r = COST.RATE_USD_PER_MIN;
    const usd =
      (e.audioInMs / 60000) * r.audioIn +
      (e.audioOutMs / 60000) * r.audioOut +
      (e.avatarMs / 60000) * r.avatarVideo;
    return usd * COST.USD_TO_KRW;
  }

  /** 가족 전체 오늘 예상 요금 (원) */
  estimateFamilyTodayKrw() {
    const day = todayKey();
    const profiles = Object.keys(this.data[day] || {});
    return profiles.reduce((sum, id) => sum + this.estimateKrw(id, day), 0);
  }

  /** 이번 달 가족 전체 예상 요금 (원) */
  estimateMonthKrw() {
    const monthPrefix = todayKey().slice(0, 7);
    let total = 0;
    for (const [day, profiles] of Object.entries(this.data)) {
      if (!day.startsWith(monthPrefix)) continue;
      for (const id of Object.keys(profiles)) {
        total += this.estimateKrw(id, day);
      }
    }
    return total;
  }

  /** 최근 N일 기록 (리포트 그래프용) */
  recentDays(profileId, days = 7) {
    const out = [];
    for (let i = days - 1; i >= 0; i--) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      const pad = (n) => String(n).padStart(2, '0');
      const key = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
      const e = this.data[key]?.[profileId] || emptyEntry();
      out.push({
        day: key,
        label: `${d.getMonth() + 1}/${d.getDate()}`,
        minutes: Math.max(e.audioInMs, e.audioOutMs) / 60000,
        turns: e.turns,
      });
    }
    return out;
  }

  /** 지금 즉시 저장 (세션 종료 시) */
  flush() {
    clearTimeout(this._saveTimer);
    this._saveTimer = null;
    this._save();
  }
}
