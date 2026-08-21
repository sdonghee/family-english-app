/**
 * web_app/src/ui.js
 * ----------------------------------------------------------------------------
 * 화면 그리기 담당.
 *
 * 핵심 아이디어: **말은 순수하게 대화만, 가르치는 건 화면이 맡는다.**
 *
 * 기존 버전은 AI가 JSON을 뱉고 그걸 읽어주는 구조여서 대화가 어색했습니다.
 * 여기서는 선생님이 사람처럼 말하는 동안, 단어 카드와 교정 카드가
 * 화면 옆에서 조용히 뜹니다. 대화 흐름을 끊지 않으면서 학습은 남습니다.
 * ----------------------------------------------------------------------------
 */

const el = {};

export function initUi() {
  const ids = [
    'profile-screen', 'call-screen', 'profile-grid',
    'avatar-stage', 'avatar-glow', 'state-badge', 'state-text',
    'subtitle-en', 'subtitle-ko', 'user-echo',
    'transcript', 'teaching-layer', 'toast-layer',
    'status-line', 'mic-button', 'mic-icon', 'mic-label', 'mic-level',
    'interrupt-button',
    'active-profile', 'mission-text', 'mission-badge', 'stage-chip',
    'usage-bar', 'usage-fill', 'usage-text',
    'vocab-modal', 'vocab-list', 'vocab-count', 'quiz-area',
    'report-modal', 'report-body',
    'settings-modal', 'roleplay-modal', 'roleplay-grid',
    'stage-setting', 'stage-ladder', 'stage-history', 'setting-can-read',
    'text-input', 'send-button', 'translate-button',
    'diagnostics', 'setting-diagnostics',
    'history-modal', 'history-body', 'history-title',
  ];
  for (const id of ids) {
    el[id] = document.getElementById(id);
  }
  return el;
}

export function refs() { return el; }

/* ═══════════════════════════════════════════════════════════════════════════
   상태 표시
   ═══════════════════════════════════════════════════════════════════════════ */

const STATE_LABELS = {
  idle:       { text: '대기 중',      cls: '' },
  connecting: { text: '연결 중...',   cls: 'thinking' },
  listening:  { text: '듣고 있어요',  cls: 'listening' },
  thinking:   { text: '생각 중',      cls: 'thinking' },
  speaking:   { text: '말하는 중',    cls: 'speaking' },
  error:      { text: '연결 오류',    cls: 'error' },
};

export function setAvatarState(state) {
  const info = STATE_LABELS[state] || STATE_LABELS.idle;
  if (el['state-text']) el['state-text'].textContent = info.text;
  if (el['state-badge']) {
    el['state-badge'].className = `state-badge ${info.cls}`;
  }
  if (el['avatar-stage']) {
    el['avatar-stage'].dataset.state = state;
  }
}

export function setStatus(text) {
  if (el['status-line']) el['status-line'].textContent = text;
}

export function setMicUi({ active, label, icon }) {
  if (el['mic-button']) el['mic-button'].classList.toggle('active', !!active);
  if (label && el['mic-label']) el['mic-label'].textContent = label;
  if (icon && el['mic-icon']) el['mic-icon'].textContent = icon;
}

/**
 * 끼어들기 버튼. 선생님이 말하는 동안에만 보입니다.
 *
 * 소리로 끼어드는 게 잘 안 될 때(스피커가 크거나, 아이 목소리가 작을 때)
 * 확실하게 말을 끊을 수 있는 수동 탈출구입니다.
 */
export function setInterruptVisible(visible) {
  const btn = el['interrupt-button'];
  if (!btn) return;
  btn.classList.toggle('visible', !!visible);
  btn.setAttribute('aria-hidden', visible ? 'false' : 'true');
}

/** 마이크 입력 레벨 시각화 (0~1) */
export function setMicLevel(level, speaking) {
  if (!el['mic-level']) return;
  const pct = Math.min(100, Math.round(level * 700));
  el['mic-level'].style.width = `${pct}%`;
  el['mic-level'].classList.toggle('speaking', !!speaking);
}

/* ═══════════════════════════════════════════════════════════════════════════
   자막
   ═══════════════════════════════════════════════════════════════════════════ */

/**
 * 자막 상자는 내용이 있을 때만 보여야 합니다.
 * 안 그러면 통화를 막 시작했을 때 아바타 위에 빈 검은 상자가 떠 있습니다.
 * (:empty 로는 안 됩니다 — 안에 자식 요소들이 들어 있기 때문입니다)
 */
function refreshSubtitleBox() {
  const box = el['subtitle-en']?.parentElement;
  if (!box) return;
  const hasContent =
    !!el['subtitle-en']?.textContent?.trim() ||
    !!el['subtitle-ko']?.textContent?.trim();
  box.style.display = hasContent ? '' : 'none';
}

export function setTeacherSubtitle(text) {
  if (el['subtitle-en']) el['subtitle-en'].textContent = text || '';
  refreshSubtitleBox();
}

export function setKoreanSubtitle(text, visible = true) {
  if (!el['subtitle-ko']) return;
  el['subtitle-ko'].textContent = text || '';
  el['subtitle-ko'].style.display = visible && text ? 'block' : 'none';
  refreshSubtitleBox();
}

/** 내가 말한 내용을 즉시 보여줍니다 (제대로 인식됐는지 바로 알 수 있게) */
export function setUserEcho(text, final = false) {
  if (!el['user-echo']) return;
  el['user-echo'].textContent = text || '';
  el['user-echo'].classList.toggle('final', final);
  el['user-echo'].style.opacity = text ? '1' : '0';
}

/* ═══════════════════════════════════════════════════════════════════════════
   대화 기록
   ═══════════════════════════════════════════════════════════════════════════ */

export function appendTranscript({ speaker, text, icon }) {
  if (!el['transcript'] || !text?.trim()) return;

  const row = document.createElement('div');
  row.className = `transcript-row ${speaker}`;

  const avatar = document.createElement('span');
  avatar.className = 'transcript-avatar';
  avatar.textContent = icon || (speaker === 'user' ? '🙂' : '👩‍🏫');

  const bubble = document.createElement('div');
  bubble.className = 'transcript-bubble';
  bubble.textContent = text.trim();

  row.append(avatar, bubble);
  el['transcript'].appendChild(row);
  el['transcript'].scrollTop = el['transcript'].scrollHeight;
}

/**
 * 마지막 줄의 내용을 바꿔 씁니다.
 *
 * 음성 인식 결과는 늦게 도착하고, 때로는 같은 말을 더 길게 다시 보냅니다.
 * 그때 줄을 새로 만들면 화면에 같은 말이 두 번 찍혀서, 내가 두 번 말한
 * 것처럼 보입니다. 그런 경우 새 줄 대신 마지막 줄을 고쳐 씁니다.
 *
 * @returns {boolean} 바꿔 썼으면 true
 */
export function replaceLastTranscript(speaker, text) {
  const list = el['transcript'];
  if (!list || !text?.trim()) return false;
  const last = list.lastElementChild;
  if (!last || !last.classList.contains(speaker)) return false;
  const bubble = last.querySelector('.transcript-bubble');
  if (!bubble) return false;
  bubble.textContent = text.trim();
  list.scrollTop = list.scrollHeight;
  return true;
}

export function clearTranscript() {
  if (el['transcript']) el['transcript'].innerHTML = '';
}

/* ═══════════════════════════════════════════════════════════════════════════
   교육 카드 — 이 앱의 핵심 학습 장치
   ═══════════════════════════════════════════════════════════════════════════ */

function mountCard(node, { ttlMs = 26000 } = {}) {
  const layer = el['teaching-layer'];
  if (!layer) return;

  layer.appendChild(node);
  // 다음 프레임에 클래스를 붙여야 트랜지션이 동작합니다
  requestAnimationFrame(() => node.classList.add('shown'));

  // 한 번에 한 장만 보여줍니다.
  // 두 장만 돼도 선생님 얼굴이 완전히 가려지고,
  // 어린아이는 애초에 한 번에 두 가지를 못 봅니다.
  while (layer.children.length > 1) {
    layer.firstElementChild?.remove();
  }

  const dismiss = () => {
    node.classList.remove('shown');
    setTimeout(() => node.remove(), 320);
  };

  node.querySelector('.card-close')?.addEventListener('click', dismiss);
  if (ttlMs) setTimeout(dismiss, ttlMs);
}

/**
 * 화면에 떠 있는 학습 카드를 전부 치웁니다.
 * 통화를 바꿀 때 호출하지 않으면 하율이 카드가 지율이 화면에 남습니다.
 */
export function clearTeachingCards() {
  if (el['teaching-layer']) el['teaching-layer'].innerHTML = '';
}

/**
 * 📘 단어 카드
 *
 * 글자를 못 읽는 아이(지율 4세)에게는 글자가 아무 의미가 없습니다.
 * 그래서 읽기 여부에 따라 카드 모양이 완전히 달라집니다.
 *   못 읽음 → 커다란 이모지 + 한국어 뜻 + 자동 음성. 영어 철자는 작게.
 *   읽음   → 영어 단어를 크게, 발음·예문까지.
 */
export function showWordCard(entry, { canRead = true, onSpeak } = {}) {
  const word = entry.word || '';
  const emoji = entry.emoji || '';
  const meaning = entry.meaning_ko || entry.meaningKo || '';
  const pron = entry.pronunciation_ko || entry.pronunciationKo || '';
  const exEn = entry.example_en || entry.exampleEn || '';
  const exKo = entry.example_ko || entry.exampleKo || '';

  const card = document.createElement('div');
  card.className = `teach-card vocab${canRead === false ? ' picture' : ''}`;

  if (canRead === false) {
    // 그림 중심 카드 — 글자를 못 읽어도 뜻을 알 수 있어야 합니다
    card.innerHTML = `
      <button class="card-close" aria-label="닫기">×</button>
      <div class="pic-emoji"></div>
      <div class="pic-meaning"></div>
      <div class="pic-word">
        <span class="pic-en"></span>
        <button class="speak-btn big" aria-label="다시 듣기">🔊</button>
      </div>
    `;
    card.querySelector('.pic-emoji').textContent = emoji || '✨';
    card.querySelector('.pic-meaning').textContent = meaning;
    card.querySelector('.pic-en').textContent = word;
  } else {
    card.innerHTML = `
      <button class="card-close" aria-label="닫기">×</button>
      <div class="card-tag">📘 새 단어</div>
      <div class="vocab-headword">
        <span class="vocab-emoji"></span>
        <span class="vocab-word"></span>
        <button class="speak-btn" aria-label="발음 듣기">🔊</button>
      </div>
      <div class="vocab-pron"></div>
      <div class="vocab-meaning"></div>
      <div class="vocab-example">
        <div class="ex-en"></div>
        <div class="ex-ko"></div>
      </div>
    `;
    card.querySelector('.vocab-emoji').textContent = emoji;
    card.querySelector('.vocab-word').textContent = word;
    card.querySelector('.vocab-pron').textContent = pron;
    card.querySelector('.vocab-meaning').textContent = meaning;
    card.querySelector('.ex-en').textContent = exEn;
    card.querySelector('.ex-ko').textContent = exKo;
    if (!exEn) card.querySelector('.vocab-example').style.display = 'none';
  }

  card.querySelector('.speak-btn')?.addEventListener('click', () => onSpeak?.(word));
  mountCard(card, { ttlMs: canRead === false ? 34000 : 26000 });

  // 못 읽는 아이는 소리로만 알 수 있으니 카드가 뜨자마자 한 번 들려줍니다
  if (canRead === false) setTimeout(() => onSpeak?.(word), 400);
}

/** 기존 이름 호환 */
export const showVocabCard = showWordCard;

/** 틀의 빈칸을 전부 채웁니다. replace()는 첫 번째만 바꿔서 ___가 그대로 읽힙니다. */
function fillFrame(frame, word) {
  return frame.split('___').join(word || 'this');
}

/**
 * 🎯 문장 틀 카드 — 이 앱에서 아이에게 가장 중요한 카드
 *
 * "단어는 아는데 문장을 못 만드는" 상태를 넘기는 장치입니다.
 * 틀을 통째로 보여주고, 빈칸에 넣을 단어를 눌러가며 놀 수 있게 합니다.
 */
export function showFrameCard(entry, { canRead = true, onSpeak } = {}) {
  const frame = entry.frame || '';
  const meaning = entry.meaning_ko || entry.meaningKo || '';
  const examples = Array.isArray(entry.examples) ? entry.examples.slice(0, 4) : [];

  const card = document.createElement('div');
  card.className = `teach-card frame${canRead === false ? ' picture' : ''}`;

  card.innerHTML = `
    <button class="card-close" aria-label="닫기">×</button>
    <div class="card-tag">🎯 오늘의 문장 틀</div>
    <div class="frame-line">
      <span class="frame-text"></span>
      <button class="speak-btn" aria-label="들어보기">🔊</button>
    </div>
    <div class="frame-meaning"></div>
    <div class="frame-chips"></div>
    <div class="frame-hint">빈칸에 단어를 넣어 말해 보세요</div>
  `;

  // 빈칸(___)을 눈에 띄게 표시합니다
  const frameText = card.querySelector('.frame-text');
  const parts = frame.split('___');
  parts.forEach((part, i) => {
    frameText.appendChild(document.createTextNode(part));
    if (i < parts.length - 1) {
      const blank = document.createElement('span');
      blank.className = 'frame-blank';
      blank.textContent = '＿＿';
      frameText.appendChild(blank);
    }
  });

  card.querySelector('.frame-meaning').textContent = meaning;

  const chips = card.querySelector('.frame-chips');
  for (const ex of examples) {
    const chip = document.createElement('button');
    chip.className = 'frame-chip';
    chip.innerHTML = `<span class="chip-emoji"></span><span class="chip-en"></span><span class="chip-ko"></span>`;
    chip.querySelector('.chip-emoji').textContent = ex.emoji || '';
    chip.querySelector('.chip-en').textContent = ex.word || '';
    chip.querySelector('.chip-ko').textContent = ex.ko || '';
    // 누르면 틀에 그 단어를 넣은 완성 문장을 들려줍니다
    chip.addEventListener('click', () => onSpeak?.(fillFrame(frame, ex.word)));
    chips.appendChild(chip);
  }
  if (!examples.length) chips.remove();

  card.querySelector('.speak-btn')?.addEventListener('click', () =>
    onSpeak?.(fillFrame(frame, examples[0]?.word))
  );

  // 문장 틀은 오래 남겨둡니다 — 보면서 계속 따라 하는 카드이기 때문입니다
  mountCard(card, { ttlMs: 90000 });

  if (canRead === false) {
    setTimeout(() => onSpeak?.(fillFrame(frame, examples[0]?.word)), 400);
  }
}

/**
 * ✏️ 문장 교정 카드
 *
 * 아이는 3단계 이상에서만 이 카드를 봅니다.
 * 그 전에는 서버가 이 도구를 아예 주지 않습니다 —
 * 어린 아이에게 "틀렸어"를 보여주면 입을 닫아버리기 때문입니다.
 */
export function showCorrectionCard(entry, { onSpeak } = {}) {
  const card = document.createElement('div');
  card.className = 'teach-card correction';

  card.innerHTML = `
    <button class="card-close" aria-label="닫기">×</button>
    <div class="card-tag">✏️ <span class="err-type"></span></div>
    <div class="fix-row before"><span class="fix-mark">✗</span><span class="fix-text"></span></div>
    <div class="fix-row after">
      <span class="fix-mark">✓</span><span class="fix-text"></span>
      <button class="speak-btn" aria-label="발음 듣기">🔊</button>
    </div>
    <div class="fix-why"></div>
    <div class="fix-levels">
      <div class="level-row native"><span class="level-tag">원어민</span><span class="level-text"></span></div>
      <div class="level-row advanced"><span class="level-tag">고급</span><span class="level-text"></span></div>
    </div>
  `;

  // 모델이 만든 문자열은 전부 textContent로 (innerHTML 금지 — XSS 방지)
  card.querySelector('.err-type').textContent = entry.error_type || entry.errorType || '교정';
  card.querySelector('.before .fix-text').textContent = entry.original || '';
  card.querySelector('.after .fix-text').textContent = entry.corrected || '';
  card.querySelector('.fix-why').textContent = entry.explanation_ko || entry.explanationKo || '';

  const native = entry.native_version || entry.nativeVersion || '';
  const advanced = entry.advanced_version || entry.advancedVersion || '';
  card.querySelector('.native .level-text').textContent = native;
  card.querySelector('.advanced .level-text').textContent = advanced;
  if (!native) card.querySelector('.native').style.display = 'none';
  if (!advanced) card.querySelector('.advanced').style.display = 'none';

  card.querySelector('.speak-btn')?.addEventListener('click', () =>
    onSpeak?.(entry.corrected || '')
  );

  mountCard(card, { ttlMs: 32000 });
}

const PROGRESS_ICONS = {
  first_english_word: '🌟',
  two_words: '🧩',
  used_frame: '🎯',
  new_sentence: '🚀',
  asked_question: '❓',
  reused_expression: '💎',
  good_pronunciation: '🎙️',
  brave_attempt: '💪',
  mission_complete: '🏆',
};

/** 🎉 칭찬 토스트 */
export function showProgressToast(entry) {
  toast(`${PROGRESS_ICONS[entry.kind] || '⭐'} ${entry.detail_ko || entry.detailKo || '잘했어요!'}`, {
    variant: 'success',
    ttlMs: 6000,
  });
}

/**
 * 진단 패널.
 *
 * 실제 통화가 이상할 때(말을 못 알아듣는다, 같은 말을 반복한다 등)
 * 어디가 문제인지 알려면 이 숫자들이 필요합니다.
 *
 *   연결      — 세션이 몇 번 열렸는지. 계속 늘면 재연결이 반복되는 것
 *   말시작/끝 — 짝이 맞아야 정상. 끝이 적으면 턴이 안 끝나고 있는 것
 *   턴        — 선생님이 응답을 마친 횟수. 말시작 수와 비슷해야 정상
 *   게이트    — idle이면 전송 안 함 / speaking이면 전송 중
 *   기준      — 이 값보다 큰 소리만 발화로 봅니다. 목소리보다 높으면 못 알아듣습니다
 */
export function setDiagnostics(d) {
  const box = el['diagnostics'];
  if (!box) return;
  box.style.display = '';

  const level = (d.level ?? 0);
  const onset = d.onset ?? 0;
  const hearing = level > onset;

  box.innerHTML = `
    <div class="diag-row">
      <span class="diag-k">연결</span><b class="${d.connects > 3 ? 'bad' : ''}">${d.connects}</b>
      <span class="diag-k">턴</span><b>${d.turns}</b>
      <span class="diag-k">끼어듦</span><b>${d.interrupts}</b>
    </div>
    <div class="diag-row">
      <span class="diag-k">말시작</span><b>${d.activityStart}</b>
      <span class="diag-k">말끝</span><b class="${
        d.activityStart - d.activityEnd > 1 ? 'bad' : 'good'
      }">${d.activityEnd}</b>
      <span class="diag-k">프레임</span><b>${d.framesSent}</b>
    </div>
    <div class="diag-row">
      <span class="diag-k">게이트</span><b class="${d.gateState !== 'idle' ? 'good' : ''}">${d.gateState}</b>
      <span class="diag-k">세션</span><b class="${d.live ? 'good' : 'bad'}">${d.live ? '연결됨' : '끊김'}</b>
      <span class="diag-k">이어붙임</span><b>${d.resumed ? 'O' : 'X'}</b>
    </div>
    <div class="diag-row">
      <span class="diag-k">소리</span><b class="${hearing ? 'good' : ''}">${level.toFixed(4)}</b>
      <span class="diag-k">기준</span><b>${onset.toFixed(4)}</b>
      <span class="diag-k">말끝대기</span><b>${d.endOfSpeechMs}ms</b>
    </div>
    ${d.lastError ? `<div class="diag-err"></div>` : ''}
  `;
  if (d.lastError) box.querySelector('.diag-err').textContent = `오류: ${d.lastError}`;
}

export function hideDiagnostics() {
  if (el['diagnostics']) el['diagnostics'].style.display = 'none';
}

/**
 * 지난 대화 보기.
 *
 * 화면에만 보여주고 버리면, 무엇이 잘못됐는지 나중에 확인할 방법이 없습니다.
 * 부모가 아이가 무슨 이야기를 했는지 보는 데에도 필요합니다.
 */
export function renderConversations(convos, { profileName = '' } = {}) {
  const body = el['history-body'];
  if (!body) return;

  if (el['history-title']) {
    el['history-title'].textContent = profileName ? `💬 ${profileName}의 지난 대화` : '💬 지난 대화';
  }

  body.innerHTML = '';

  if (!convos.length) {
    const p = document.createElement('p');
    p.className = 'empty-note';
    p.textContent =
      '아직 저장된 대화가 없어요. ' +
      '이번 업데이트부터 대화가 자동으로 기록됩니다.';
    body.appendChild(p);
    return;
  }

  const fmt = (ts) => {
    const d = new Date(ts);
    const p = (x) => String(x).padStart(2, '0');
    return `${d.getMonth() + 1}/${d.getDate()} ${p(d.getHours())}:${p(d.getMinutes())}`;
  };

  convos.forEach((convo, idx) => {
    const block = document.createElement('details');
    block.className = 'convo-block';
    if (idx === 0) block.open = true;   // 가장 최근 대화는 펼쳐서 보여줍니다

    const summary = document.createElement('summary');
    summary.className = 'convo-head';
    summary.innerHTML = `<span class="convo-when"></span><span class="convo-count"></span>`;
    summary.querySelector('.convo-when').textContent = fmt(convo.startedAt);
    summary.querySelector('.convo-count').textContent = `${convo.messages.length}줄`;
    block.appendChild(summary);

    const list = document.createElement('div');
    list.className = 'convo-lines';
    for (const m of convo.messages) {
      const row = document.createElement('div');
      row.className = `convo-line ${m.speaker}`;
      row.innerHTML = `<span class="convo-who"></span><span class="convo-text"></span>`;
      row.querySelector('.convo-who').textContent = m.speaker === 'user' ? '나' : 'Chloe';
      row.querySelector('.convo-text').textContent = m.text;
      list.appendChild(row);
    }
    block.appendChild(list);
    body.appendChild(block);
  });
}

/* ═══════════════════════════════════════════════════════════════════════════
   토스트 / 배너
   ═══════════════════════════════════════════════════════════════════════════ */

export function toast(message, { variant = 'info', ttlMs = 4200 } = {}) {
  const layer = el['toast-layer'];
  if (!layer) return;

  const node = document.createElement('div');
  node.className = `toast ${variant}`;
  node.textContent = message;
  layer.appendChild(node);

  requestAnimationFrame(() => node.classList.add('shown'));
  setTimeout(() => {
    node.classList.remove('shown');
    setTimeout(() => node.remove(), 300);
  }, ttlMs);
}

/* ═══════════════════════════════════════════════════════════════════════════
   사용량 표시 (하루 한도)
   ═══════════════════════════════════════════════════════════════════════════ */

export function setUsage({ usedMin, limitMin, krw }) {
  if (!el['usage-fill'] || !el['usage-text']) return;

  if (!limitMin) {
    el['usage-fill'].style.width = '0%';
    el['usage-text'].textContent = `오늘 ${usedMin.toFixed(1)}분 · 약 ${Math.round(krw)}원`;
    return;
  }

  const ratio = Math.min(1, usedMin / limitMin);
  el['usage-fill'].style.width = `${ratio * 100}%`;
  el['usage-fill'].className = 'usage-fill' +
    (ratio > 0.9 ? ' danger' : ratio > 0.7 ? ' warn' : '');
  el['usage-text'].textContent =
    `오늘 ${usedMin.toFixed(1)} / ${limitMin}분 · 약 ${Math.round(krw)}원`;
}

/* ═══════════════════════════════════════════════════════════════════════════
   미션
   ═══════════════════════════════════════════════════════════════════════════ */

export function setMission(text, done = false) {
  if (el['mission-text']) el['mission-text'].textContent = text ? `"${text}"` : '';
  if (el['mission-badge']) {
    el['mission-badge'].textContent = done ? '달성! 🎉' : '진행 중';
    el['mission-badge'].classList.toggle('done', done);
  }
}

/** 현재 학습 단계 표시 (아이만) */
export function setStageChip(stageMeta) {
  const chip = el['stage-chip'];
  if (!chip) return;
  if (!stageMeta) {
    chip.style.display = 'none';
    return;
  }
  chip.style.display = '';
  chip.textContent = `${stageMeta.id + 1}단계 · ${stageMeta.short}`;
  chip.title = stageMeta.desc;
}

/** 단계가 바뀌었을 때 부모에게만 알립니다 (아이에게는 말하지 않습니다) */
export function announceStageChange(from, to, stages) {
  const up = to > from;
  toast(
    `${up ? '⬆️' : '⬇️'} 학습 단계가 ${up ? '올라갔' : '조정됐'}어요 — ` +
    `${stages[from].short} → ${stages[to].short}`,
    { variant: up ? 'success' : 'info', ttlMs: 7000 }
  );
}

/**
 * 설정 화면의 학습 단계 사다리 (부모용).
 * 아이 프로필일 때만 보입니다.
 */
export function renderStageLadder(stages, { current, history = [], onPick } = {}) {
  const block = el['stage-setting'];
  const ladder = el['stage-ladder'];
  if (!block || !ladder) return;

  if (current === null || current === undefined) {
    block.style.display = 'none';
    return;
  }
  block.style.display = '';
  ladder.innerHTML = '';

  stages.forEach((stage) => {
    const btn = document.createElement('button');
    btn.className = `stage-step${stage.id === current ? ' current' : ''}`;
    btn.innerHTML = `
      <span class="stage-step-no"></span>
      <span class="stage-step-main">
        <span class="stage-step-name"></span>
        <span class="stage-step-desc"></span>
      </span>
      <span class="stage-step-kr"></span>
    `;
    btn.querySelector('.stage-step-no').textContent = String(stage.id + 1);
    btn.querySelector('.stage-step-name').textContent = stage.name;
    btn.querySelector('.stage-step-desc').textContent = stage.desc;
    btn.querySelector('.stage-step-kr').textContent = `한국어 ${stage.korean}%`;
    btn.addEventListener('click', () => onPick?.(stage.id));
    ladder.appendChild(btn);
  });

  const hist = el['stage-history'];
  if (hist) {
    if (!history.length) {
      hist.textContent = '아직 단계 변경 기록이 없습니다.';
    } else {
      hist.textContent = history
        .slice(-4)
        .reverse()
        .map((h) => {
          const d = new Date(h.at);
          return `${d.getMonth() + 1}/${d.getDate()} · ` +
            `${stages[h.from]?.short ?? h.from} → ${stages[h.to]?.short ?? h.to}` +
            (h.reason ? ` (${h.reason})` : '');
        })
        .join('\n');
    }
  }
}

/* ═══════════════════════════════════════════════════════════════════════════
   모달
   ═══════════════════════════════════════════════════════════════════════════ */

export function openModal(id) { el[id]?.classList.remove('hidden'); }
export function closeModal(id) { el[id]?.classList.add('hidden'); }

/* ═══════════════════════════════════════════════════════════════════════════
   단어장
   ═══════════════════════════════════════════════════════════════════════════ */

export function renderVocabBook(items, { onSpeak, onDelete } = {}) {
  const list = el['vocab-list'];
  if (!list) return;

  if (el['vocab-count']) {
    el['vocab-count'].textContent = `${items.length}개`;
  }

  list.innerHTML = '';
  if (!items.length) {
    const empty = document.createElement('p');
    empty.className = 'empty-note';
    empty.textContent = '아직 모은 단어가 없어요. Chloe 선생님과 대화하면 자동으로 쌓입니다!';
    list.appendChild(empty);
    return;
  }

  const now = Date.now();
  for (const item of items) {
    const row = document.createElement('div');
    row.className = 'vocab-row';
    const due = (item.dueAt || 0) <= now;

    row.innerHTML = `
      <div class="vocab-row-main">
        <div class="vocab-row-head">
          <span class="v-emoji"></span>
          <strong class="v-word"></strong>
          <span class="v-pron"></span>
          ${due ? '<span class="due-chip">복습</span>' : ''}
          <span class="box-chip"></span>
        </div>
        <div class="v-meaning"></div>
        <div class="v-example"></div>
      </div>
      <div class="vocab-row-actions">
        <button class="mini-btn v-speak" aria-label="발음 듣기">🔊</button>
        <button class="mini-btn v-del" aria-label="삭제">🗑️</button>
      </div>
    `;

    row.querySelector('.v-emoji').textContent = item.emoji || '';
    row.querySelector('.v-word').textContent = item.word;
    row.querySelector('.v-pron').textContent = item.pronunciationKo || '';
    row.querySelector('.v-meaning').textContent = item.meaningKo || '';
    row.querySelector('.v-example').textContent = item.exampleEn || '';
    row.querySelector('.box-chip').textContent = `${(item.box || 0)}/6`;

    row.querySelector('.v-speak')?.addEventListener('click', () => onSpeak?.(item.word));
    row.querySelector('.v-del')?.addEventListener('click', async () => {
      await onDelete?.(item.word);
      row.remove();
    });

    list.appendChild(row);
  }
}

/** 번역 버튼은 선생님이 말을 한 뒤에만 의미가 있습니다 */
export function setTranslateAvailable(available) {
  if (el['translate-button']) {
    // display로 감춰야 빈 자리를 차지하지 않습니다
    el['translate-button'].style.display = available ? '' : 'none';
  }
}

/* ═══════════════════════════════════════════════════════════════════════════
   복습 퀴즈 (텍스트 모델 — 거의 무료)
   ═══════════════════════════════════════════════════════════════════════════ */

export function renderQuiz(questions, { onSpeak } = {}) {
  const area = el['quiz-area'];
  if (!area) return;

  area.classList.remove('hidden');
  area.innerHTML = '';

  if (!questions.length) {
    area.innerHTML = '<p class="empty-note">복습할 단어가 아직 없어요.</p>';
    return;
  }

  questions.forEach((q, i) => {
    const card = document.createElement('div');
    card.className = 'quiz-card';
    card.innerHTML = `
      <div class="quiz-q"><b>${i + 1}.</b> <span class="q-text"></span></div>
      <div class="quiz-actions">
        <button class="mini-btn q-hint" ${q.hint ? '' : 'style="display:none"'}>💡 힌트</button>
        <button class="mini-btn q-show">정답 보기</button>
      </div>
      <div class="quiz-hint hidden"></div>
      <div class="quiz-answer hidden">
        <span class="a-text"></span>
        <button class="speak-btn" aria-label="발음 듣기">🔊</button>
      </div>
    `;
    card.querySelector('.q-text').textContent = q.question || '';
    card.querySelector('.quiz-hint').textContent = q.hint || '';
    card.querySelector('.a-text').textContent = q.answer || '';

    card.querySelector('.q-hint')?.addEventListener('click', () =>
      card.querySelector('.quiz-hint')?.classList.toggle('hidden')
    );
    card.querySelector('.q-show')?.addEventListener('click', () =>
      card.querySelector('.quiz-answer')?.classList.toggle('hidden')
    );
    card.querySelector('.speak-btn')?.addEventListener('click', () => onSpeak?.(q.answer));

    area.appendChild(card);
  });
}

export function clearQuiz() {
  const area = el['quiz-area'];
  if (area) {
    area.innerHTML = '';
    area.classList.add('hidden');
  }
}

/* ═══════════════════════════════════════════════════════════════════════════
   학습 리포트
   ═══════════════════════════════════════════════════════════════════════════ */

export function renderReport({ profile, todayMinutes, limitMinutes, turns, vocabTotal, dueCount, errorStats, recentDays, highlights, estimatedKrw, monthKrw, stageInfo, stages }) {
  const body = el['report-body'];
  if (!body) return;

  const maxMinutes = Math.max(1, ...recentDays.map((d) => d.minutes));

  const bars = recentDays.map((d) => {
    const h = Math.max(3, Math.round((d.minutes / maxMinutes) * 64));
    const isToday = d === recentDays[recentDays.length - 1];
    return `
      <div class="bar-col">
        <div class="bar${isToday ? ' today' : ''}" style="height:${h}px" title="${d.minutes.toFixed(1)}분"></div>
        <span class="bar-label">${d.label}</span>
      </div>`;
  }).join('');

  const errorRows = errorStats.length
    ? errorStats.slice(0, 5).map(([type, count]) => {
        const max = errorStats[0][1] || 1;
        return `
          <div class="err-row">
            <span class="err-name">${escapeHtml(type)}</span>
            <span class="err-bar"><i style="width:${Math.round((count / max) * 100)}%"></i></span>
            <span class="err-count">${count}회</span>
          </div>`;
      }).join('')
    : '<p class="empty-note">아직 교정 기록이 없어요.</p>';

  const highlightList = highlights.length
    ? `<ul class="highlight-list">${highlights.slice(0, 5).map((h) => `<li>${escapeHtml(h)}</li>`).join('')}</ul>`
    : '<p class="empty-note">오늘의 성취가 기록되면 여기 표시됩니다.</p>';

  const stageBlock = stageInfo
    ? `
    <h4>지금 학습 단계</h4>
    <div class="cost-note">
      <b>${stageInfo.stage + 1}단계 · ${escapeHtml(stages[stageInfo.stage].name)}</b><br>
      ${escapeHtml(stages[stageInfo.stage].desc)} — 한국어 ${stages[stageInfo.stage].korean}% 정도로 이야기합니다.
      ${stageInfo.history.length
        ? `<br><span style="color:var(--text-dim);font-size:11px">최근 변경: ${
            stageInfo.history.slice(-1).map((h) => {
              const d = new Date(h.at);
              return `${d.getMonth() + 1}/${d.getDate()} ${stages[h.from]?.short ?? ''} → ${stages[h.to]?.short ?? ''}`;
            }).join('')
          }</span>`
        : ''}
    </div>`
    : '';

  body.innerHTML = `
    <div class="report-hero">
      <div class="hero-stat"><b>${todayMinutes.toFixed(1)}</b><span>오늘 대화(분)</span></div>
      <div class="hero-stat"><b>${turns}</b><span>주고받은 턴</span></div>
      <div class="hero-stat"><b>${vocabTotal}</b><span>모은 표현</span></div>
      <div class="hero-stat"><b>${dueCount}</b><span>복습할 단어</span></div>
    </div>

    ${stageBlock}

    <h4>최근 7일 대화량</h4>
    <div class="bar-chart">${bars}</div>

    <h4>오늘의 성취</h4>
    ${highlightList}

    <h4>자주 틀리는 부분 (최근 30일)</h4>
    <div class="err-stats">${errorRows}</div>

    <h4>사용량 & 예상 요금</h4>
    <p class="cost-note">
      오늘 ${escapeHtml(profile.name)}: 약 <b>${Math.round(estimatedKrw)}원</b>
      ${limitMinutes ? `(하루 한도 ${limitMinutes}분)` : ''}<br>
      이번 달 가족 전체: 약 <b>${Math.round(monthKrw)}원</b>
    </p>
    <p class="cost-hint">
      침묵 구간은 전송하지 않으므로, 실제 통화 시간보다 요금 기준 시간이 짧습니다.
    </p>
  `;
}

function escapeHtml(str) {
  return String(str).replace(/[&<>"']/g, (c) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])
  );
}

/* ═══════════════════════════════════════════════════════════════════════════
   프로필 / 롤플레이 그리드
   ═══════════════════════════════════════════════════════════════════════════ */

export function renderProfiles(profiles, { onSelect, usageOf } = {}) {
  const grid = el['profile-grid'];
  if (!grid) return;
  grid.innerHTML = '';

  for (const p of profiles) {
    const usage = usageOf?.(p.id) || { usedMin: 0, limitMin: 0, exhausted: false };

    const card = document.createElement('button');
    card.className = 'profile-card';
    card.style.setProperty('--profile-color', p.color);
    card.disabled = usage.exhausted;

    card.innerHTML = `
      <span class="profile-icon">${p.icon}</span>
      <span class="profile-name"></span>
      <span class="profile-sub"></span>
      <span class="profile-usage">
        <i style="width:${usage.limitMin ? Math.min(100, (usage.usedMin / usage.limitMin) * 100) : 0}%"></i>
      </span>
      <span class="profile-usage-text"></span>
    `;
    card.querySelector('.profile-name').textContent = p.name;
    card.querySelector('.profile-sub').textContent = p.sub ? `${p.sub} · ${p.age}세` : `${p.age}세`;
    card.querySelector('.profile-usage-text').textContent = usage.exhausted
      ? '오늘 목표 완료! 🎉'
      : usage.limitMin
        ? `${Math.max(0, usage.limitMin - usage.usedMin).toFixed(0)}분 남음`
        : '';

    card.addEventListener('click', () => onSelect?.(p));
    grid.appendChild(card);
  }
}

export function renderRoleplay(scenarios, { onSelect } = {}) {
  const grid = el['roleplay-grid'];
  if (!grid) return;
  grid.innerHTML = '';

  for (const s of scenarios) {
    const item = document.createElement('button');
    item.className = 'roleplay-item';
    item.innerHTML = `<span class="rp-title"></span><span class="rp-desc"></span>`;
    item.querySelector('.rp-title').textContent = s.title;
    item.querySelector('.rp-desc').textContent = s.desc;
    item.addEventListener('click', () => onSelect?.(s));
    grid.appendChild(item);
  }
}

export function setActiveProfile(profile) {
  if (el['active-profile']) {
    el['active-profile'].textContent = `${profile.icon} ${profile.name}`;
  }
}

export function showScreen(which) {
  el['profile-screen']?.classList.toggle('active', which === 'profile');
  el['call-screen']?.classList.toggle('active', which === 'call');
}
