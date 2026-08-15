/**
 * web_app/src/report-export.js
 * ----------------------------------------------------------------------------
 * 대화 기록과 진단 정보를 파일 하나로 내보냅니다.
 *
 * 왜 필요한가:
 *   "대화가 이상하다"는 이야기를 들어도, 무엇이 어떻게 이상했는지
 *   실제 기록이 없으면 추측으로 고칠 수밖에 없습니다.
 *   이 파일 하나만 있으면 무엇이 잘못됐는지 바로 짚을 수 있습니다.
 *
 * 담기는 것:
 *   - 실제 주고받은 대화 전체
 *   - 진단 숫자 (말 시작/끝 신호, 재연결 횟수, 마이크 감도 등)
 *   - 설정값과 환경 (브라우저, 기기)
 *
 * 개인정보:
 *   전부 이 기기 안에서만 만들어지고, 저장하기 전에는 아무 데도 안 나갑니다.
 *   가족의 대화 내용이 들어 있으니 공유할 때 확인하세요.
 * ----------------------------------------------------------------------------
 */

import { listRecentConversations, listVocabulary, getStageInfo } from './storage.js';
import { CHILD_STAGES, APP_VERSION } from './config.js';

function fmtTime(ts) {
  const d = new Date(ts);
  const p = (n) => String(n).padStart(2, '0');
  return `${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
}

function fmtDate(ts) {
  const d = new Date(ts);
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

const SPEAKER_LABEL = {
  user: '나',
  teacher: 'Chloe',
  system: '(시스템)',
};

/**
 * 진단 리포트 텍스트를 만듭니다.
 *
 * @param {object} opts
 * @param {object} opts.profile
 * @param {object} opts.diag       app.diag
 * @param {object} opts.settings
 * @param {number} [opts.conversations] 몇 개의 통화를 담을지
 */
export async function buildReportText({ profile, diag = {}, settings = {}, conversations = 3 }) {
  const lines = [];
  const add = (s = '') => lines.push(s);

  add('═'.repeat(60));
  add('  우리집 영어 — 대화 기록 및 진단 정보');
  add('═'.repeat(60));
  add(`만든 시각 : ${fmtDate(Date.now())}`);
  add(`대상      : ${profile?.name ?? '-'} (${profile?.age ?? '-'}세, ${profile?.id ?? '-'})`);

  if (profile?.kind === 'child') {
    try {
      const info = getStageInfo(profile.id);
      const meta = CHILD_STAGES[info.stage];
      add(`학습 단계 : ${info.stage + 1}단계 · ${meta?.name ?? ''} (한국어 ${meta?.korean ?? '?'}%)`);
      if (info.history?.length) {
        const h = info.history.slice(-3)
          .map((x) => `${fmtDate(x.at)} ${CHILD_STAGES[x.from]?.short} → ${CHILD_STAGES[x.to]?.short}`)
          .join(' / ');
        add(`단계 이력 : ${h}`);
      }
    } catch { /* 저장소 문제는 리포트를 막지 않습니다 */ }
  }

  /* ── 진단 숫자 ─────────────────────────────────────────────────── */
  add('');
  add('─'.repeat(60));
  add(' 진단 숫자 (마지막 통화)');
  add('─'.repeat(60));
  add(`연결 횟수        : ${diag.connects ?? 0}   ${
    (diag.connects ?? 0) > 3 ? '← 너무 많습니다. 재연결이 반복되고 있습니다' : ''
  }`);
  add(`말 시작 신호      : ${diag.activityStart ?? 0}`);
  add(`말 끝 신호        : ${diag.activityEnd ?? 0}   ${
    (diag.activityStart ?? 0) - (diag.activityEnd ?? 0) > 1
      ? '← 시작보다 적습니다. 턴이 안 닫히고 있습니다'
      : '(시작과 비슷하면 정상)'
  }`);
  add(`선생님 턴 완료    : ${diag.turns ?? 0}   ${
    (diag.turns ?? 0) === 0 && (diag.activityEnd ?? 0) > 0
      ? '← 말은 보냈는데 응답이 없었습니다'
      : ''
  }`);
  add(`끼어든 횟수       : ${diag.interrupts ?? 0}`);
  add(`보낸 오디오 프레임: ${diag.framesSent ?? 0} (1프레임 = 80ms)`);
  add(`말끝 대기 시간    : ${diag.endOfSpeechMs ?? 0}ms`);

  /* ── 스피커 되돌림(에코) 진단 ────────────────────────────────────
     "내가 한 말이 반복되서 인식된다"는 증상의 원인을 여기서 가릅니다.   */
  add('');
  add(`선생님 말하는 중 시작: ${diag.startsWhileTeacher ?? 0} / ${diag.activityStart ?? 0}   ${
    (diag.activityStart ?? 0) > 0 &&
    (diag.startsWhileTeacher ?? 0) / (diag.activityStart ?? 1) > 0.5
      ? '← 대부분이 선생님 말하는 중입니다. 스피커 소리가 되돌아오고 있습니다'
      : ''
  }`);
  add(`선생님 목소리 되돌림 : ${diag.echoDropped ?? 0}회 걸러냄   ${
    (diag.echoDropped ?? 0) > 0 ? '← 이어폰을 쓰거나 안전 모드를 켜세요' : ''
  }`);
  add(`같은 말 중복 인식    : ${diag.dupMerged ?? 0}회 합침`);
  add(`스피커 누출 크기     : ${(diag.echoFloor ?? 0).toFixed(4)}   ${
    (diag.echoFloor ?? 0) > 0.02
      ? '← 큽니다. 스피커 소리가 마이크로 많이 들어갑니다'
      : '(0.005 아래면 좋음 · 이어폰이면 거의 0)'
  }`);
  add('');
  add(`세션 이어붙임     : ${diag.resumed ? '성공' : '안 됨'}`);
  if (diag.lastError) add(`마지막 오류       : ${diag.lastError}`);

  /* ── 설정 ──────────────────────────────────────────────────────── */
  add('');
  add('─'.repeat(60));
  add(' 설정');
  add('─'.repeat(60));
  add(`안전 모드(반이중) : ${settings.halfDuplex ? '켬 (스피커용)' : '끔 (이어폰용)'}`);
  add(`아바타            : ${settings.avatarMode === 'video' ? '실사 영상' : '사진'}`);
  add(`한글 자막         : ${settings.showKoreanSubtitle ? '켬' : '끔'}`);

  /* ── 환경 ──────────────────────────────────────────────────────── */
  add('');
  add('─'.repeat(60));
  add(' 환경');
  add('─'.repeat(60));
  add(`앱 버전  : ${APP_VERSION}`);
  add(`브라우저 : ${navigator.userAgent}`);
  add(`언어     : ${navigator.language}`);
  add(`화면     : ${window.innerWidth}×${window.innerHeight}`);

  /* ── 대화 ──────────────────────────────────────────────────────── */
  add('');
  add('═'.repeat(60));
  add('  실제 대화 내용');
  add('═'.repeat(60));

  try {
    const convos = await listRecentConversations(profile.id, conversations);
    if (!convos.length) {
      add('(저장된 대화가 없습니다)');
    }
    for (const convo of convos) {
      add('');
      add(`── ${fmtDate(convo.startedAt)} · ${convo.messages.length}줄 ` + '─'.repeat(20));
      for (const m of convo.messages) {
        const who = SPEAKER_LABEL[m.speaker] ?? m.speaker;
        add(`[${fmtTime(m.at)}] ${who.padEnd(6)} ${m.text}`);
      }
    }
  } catch (err) {
    add(`(대화를 불러오지 못했습니다: ${err.message})`);
  }

  /* ── 단어장 ────────────────────────────────────────────────────── */
  try {
    const vocab = await listVocabulary(profile.id, { limit: 40 });
    if (vocab.length) {
      add('');
      add('─'.repeat(60));
      add(` 배운 표현 (${vocab.length}개)`);
      add('─'.repeat(60));
      for (const v of vocab) {
        add(`  ${v.emoji || ' '} ${v.word} — ${v.meaningKo}${v.exampleEn ? `  (${v.exampleEn})` : ''}`);
      }
    }
  } catch { /* 무시 */ }

  add('');
  add('═'.repeat(60));
  return lines.join('\n');
}

/** 파일로 저장합니다 */
export function downloadText(filename, text) {
  const blob = new Blob([text], { type: 'text/plain;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** 클립보드에 복사 (파일 저장이 막힌 환경 대비) */
export async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}
