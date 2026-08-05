// Max AI Style - Clean 6인 가족 프로필 (하율/예율 만9세, 성율 만6세, 지율 만4세)
const DEFAULT_PROFILES = [
  { id: 'p_dad', name: '아빠', age: 42, avatarIcon: '👨‍💼', themeColor: '#2196F3' },
  { id: 'p_mom', name: '엄마', age: 40, avatarIcon: '👩‍🏫', themeColor: '#E91E63' },
  { id: 'p_child1', name: '첫째 하율 (쌍둥이)', age: 9, avatarIcon: '👦', themeColor: '#9C27B0' },
  { id: 'p_child2', name: '둘째 예율 (쌍둥이)', age: 9, avatarIcon: '👧', themeColor: '#4CAF50' },
  { id: 'p_child3', name: '셋째 성율', age: 6, avatarIcon: '🧒', themeColor: '#FF9800' },
  { id: 'p_youngest', name: '막내 지율', age: 4, avatarIcon: '👶', themeColor: '#00BCD4' }
];

const ROLEPLAY_SCENARIOS = [
  { id: 'airport', title: '✈️ 공항 출국 심사대', desc: '공항 심사관과의 실전 입국/출국 대화' },
  { id: 'cafe', title: '☕ 해외 커스텀 카페 주문', desc: '스타벅스/해외 카페 주문 및 커스텀 요청' },
  { id: 'hotel', title: '🏨 호텔 체크인 & 룸 서비스', desc: '호텔 체크인 및 불편사항 요청하기' },
  { id: 'business', title: '💼 글로벌 비즈니스 미팅', desc: '해외 파트너사와의 업무 협상 및 제안' },
  { id: 'gaming', title: '🎮 외국 친구와 게임 수다', desc: '하율/예율이 외국 친구와의 로블록스/게임 수다' },
  { id: 'dino', title: '🦖 공룡 탐험가 역할극', desc: '성율이 맞춤! 티라노사우루스와 정글 탐험' },
  { id: 'zoo', title: '🐘 동물원 탐험 퀴즈', desc: '지율이 맞춤! 동물 소리 퀴즈와 귀여운 수다' }
];

let profiles = [];
let activeProfile = null;
let chatHistories = {};
let userFlashcards = [];
let userGeminiApiKey = '';
let isListening = false;
let recognition = null;
let naturalVoices = [];
let speechPauseTimer = null;
let accumulatedTranscript = '';
let conversationTurnCount = 0;
let isSpeakingAnim = false;
let recentRepliesBuffer = [];

let userErrorPatterns = { tense: 0, article: 0, preposition: 0, wordOrder: 0, agreement: 0, other: 0 };
let uniqueWordsUsed = new Set();
let sentenceLengths = [];

let currentDailyMission = {
  expression: "Could you tell me more?",
  completed: false
};

const DAILY_MISSIONS = [
  "Could you tell me more?",
  "How is your day going?",
  "I love playing games!",
  "Make sure to get rest!",
  "What is your favorite food?",
  "Tell me a fun story!"
];

const profileSection = document.getElementById('profile-section');
const chatSection = document.getElementById('chat-section');
const profileGrid = document.getElementById('profile-grid');
const backToProfilesBtn = document.getElementById('back-to-profiles-btn');
const roleplayBtn = document.getElementById('roleplay-btn');
const activeProfileHeader = document.getElementById('active-profile-header');

const aiHumanStage = document.getElementById('ai-human-stage');
const lingoStatusTag = document.getElementById('lingo-status-tag');
const speechEnText = document.getElementById('speech-en-text');
const speechKrSub = document.getElementById('speech-kr-sub');
const hintToggleBtn = document.getElementById('hint-toggle-btn');
const speakingIndicator = document.getElementById('speaking-indicator');

const chatMessages = document.getElementById('chat-messages');
const quickChipsContainer = document.getElementById('quick-chips-container');
const chatInput = document.getElementById('chat-input');
const sendBtn = document.getElementById('send-btn');
const giantMicBtn = document.getElementById('giant-mic-btn');
const micIcon = document.getElementById('mic-icon');
const micLabel = document.getElementById('mic-label');
const settingsBtn = document.getElementById('settings-btn');
const deckBtn = document.getElementById('deck-btn');
const reportBtn = document.getElementById('report-btn');

const settingsModal = document.getElementById('settings-modal');
const geminiKeyInput = document.getElementById('gemini-key-input');
const saveSettingsBtn = document.getElementById('save-settings-btn');
const closeSettingsBtn = document.getElementById('close-settings-btn');

const roleplayModal = document.getElementById('roleplay-modal');
const roleplayGrid = document.getElementById('roleplay-grid');
const closeRoleplayBtn = document.getElementById('close-roleplay-btn');

const deckModal = document.getElementById('deck-modal');
const deckCardContainer = document.getElementById('deck-card-container');
const closeDeckBtn = document.getElementById('close-deck-btn');

const reportModal = document.getElementById('report-modal');
const closeReportBtn = document.getElementById('close-report-btn');
const reportTotalTurns = document.getElementById('report-total-turns');
const reportNativeCount = document.getElementById('report-native-count');
const reportMissionFill = document.getElementById('report-mission-fill');
const reportMissionText = document.getElementById('report-mission-text');
const reportFeedbackSummary = document.getElementById('report-feedback-summary');
const missionExpressionText = document.getElementById('mission-expression-text');
const missionStatusBadge = document.getElementById('mission-status-badge');

function initApp() {
  loadStoredData();
  renderProfiles();
  renderRoleplayModal();
  setupSpeechRecognition();
  loadNaturalVoices();
  setupEventListeners();
  initDailyMission();
  // Avatar animations handled by CSS
}

function setAvatarMood(mood) {
  const wrapper = document.getElementById('video-avatar-wrapper');
  if (!wrapper) return;
  wrapper.classList.remove('happy', 'curious', 'focused', 'warm');
  if (['happy', 'curious', 'focused', 'warm'].includes(mood)) {
    wrapper.classList.add(mood);
  }
}

function initDailyMission() {
  const charCode = activeProfile && activeProfile.id ? activeProfile.id.charCodeAt(0) : 65;
  const idx = Math.abs(charCode + new Date().getDate()) % DAILY_MISSIONS.length;
  currentDailyMission.expression = DAILY_MISSIONS[idx];
  currentDailyMission.completed = false;

  if (missionExpressionText) {
    missionExpressionText.innerText = `"${currentDailyMission.expression}"`;
  }
  if (missionStatusBadge) {
    missionStatusBadge.innerText = "진행 중 🎯";
    missionStatusBadge.classList.remove('completed');
  }
}

function checkMissionCompletion(userText, aiReply) {
  if (!currentDailyMission || currentDailyMission.completed) return;
  
  const textToCheck = ((userText || "") + " " + (aiReply || "")).toLowerCase();
  const targetWords = currentDailyMission.expression.toLowerCase().replace(/[^a-z0-9\s]/g, '').split(' ').filter(w => w.length > 2);
  const matched = targetWords.filter(w => textToCheck.includes(w));
  
  if (matched.length >= Math.min(2, targetWords.length)) {
    currentDailyMission.completed = true;
    if (missionStatusBadge) {
      missionStatusBadge.innerText = "달성 완료! 🎉";
      missionStatusBadge.classList.add('completed');
    }
  }
}

function openReportModal() {
  if (!reportModal) return;

  const userMsgs = activeProfile && chatHistories[activeProfile.id] 
    ? chatHistories[activeProfile.id].filter(m => m.sender === 'user').length 
    : 0;
  const turns = conversationTurnCount > 0 ? conversationTurnCount : userMsgs;
  const nativeCount = userFlashcards ? userFlashcards.length : 0;
  const isMissionDone = currentDailyMission.completed;

  if (reportTotalTurns) reportTotalTurns.innerText = turns;
  if (reportNativeCount) reportNativeCount.innerText = nativeCount;

  if (reportMissionFill && reportMissionText) {
    if (isMissionDone) {
      reportMissionFill.style.width = "100%";
      reportMissionText.innerText = `미션 달성 완료! 🎉 ("${currentDailyMission.expression}")`;
    } else {
      reportMissionFill.style.width = "40%";
      reportMissionText.innerText = `미션 진행 중 🎯 ("${currentDailyMission.expression}")`;
    }
  }

  // Analytics Calculation
  let mostCommonError = "없음";
  let maxErrorCount = 0;
  for (const [errorType, count] of Object.entries(userErrorPatterns)) {
    if (count > maxErrorCount) {
      maxErrorCount = count;
      mostCommonError = errorType;
    }
  }
  
  const vocabDiversity = uniqueWordsUsed.size;
  const avgSentenceLength = sentenceLengths.length > 0 ? (sentenceLengths.reduce((a, b) => a + b, 0) / sentenceLengths.length).toFixed(1) : 0;
  
  const errorMapKr = { tense: "시제 오류", article: "관사 오류", preposition: "전치사 오류", wordOrder: "어순 오류", agreement: "수일치 오류", other: "기타 오류", "없음": "없음" };
  const krErrorName = errorMapKr[mostCommonError] || mostCommonError;

  if (reportFeedbackSummary) {
    const pName = activeProfile ? activeProfile.name : '학습자';
    if (turns === 0) {
      reportFeedbackSummary.innerText = `안녕하세요 ${pName}님! Chloe 선생님과의 대화를 시작하시면 오늘의 1분 성취 리포트가 자동으로 기록됩니다. 🎙️`;
    } else {
      let feedbackHTML = `대단해요, ${pName}님! 총 ${turns}번의 대화 동안 ${nativeCount}개의 원어민 표현을 수집하셨네요! 🌟<br><br>`;
      feedbackHTML += `<b>📊 오늘의 학습 분석:</b><br>`;
      feedbackHTML += `- 사용한 다양한 단어 수 (어휘력): <b>${vocabDiversity} 단어</b><br>`;
      feedbackHTML += `- 평균 문장 길이 (복잡도): <b>${avgSentenceLength} 단어/문장</b><br>`;
      feedbackHTML += `- 가장 자주 틀린 부분: <b>${krErrorName}</b> (${maxErrorCount}회)<br><br>`;
      feedbackHTML += `<b>💡 맞춤형 피드백:</b><br>`;
      if (maxErrorCount > 0) {
        feedbackHTML += `${krErrorName}에 조금 더 신경써서 말해보면 완벽한 원어민에 가까워질 거예요!`;
      } else {
        feedbackHTML += `현재 문법이 매우 정확합니다! 더 길고 복잡한 문장에 도전해보세요!`;
      }
      reportFeedbackSummary.innerHTML = feedbackHTML;
    }
  }

  reportModal.classList.remove('hidden');
}

function setAvatarState(state) {
  const wrapper = document.getElementById('video-avatar-wrapper');
  const badge = document.getElementById('avatar-state-badge');
  const stateText = badge ? badge.querySelector('.state-text') : null;
  
  // 모든 상태 클래스 제거
  if (wrapper) wrapper.classList.remove('talking', 'listening', 'thinking');
  if (badge) badge.classList.remove('listening', 'thinking', 'speaking');
  if (speakingIndicator) speakingIndicator.classList.remove('active');
  
  switch(state) {
    case 'listening':
      if (wrapper) wrapper.classList.add('listening');
      if (badge) badge.classList.add('listening');
      if (stateText) stateText.textContent = '경청 중 🎧';
      setAvatarMood('curious');
      break;
    case 'thinking':
      if (wrapper) wrapper.classList.add('thinking');
      if (badge) badge.classList.add('thinking');
      if (stateText) stateText.textContent = '생각 중 🤔';
      setAvatarMood('focused');
      break;
    case 'speaking':
      if (wrapper) wrapper.classList.add('talking');
      if (badge) badge.classList.add('speaking');
      if (stateText) stateText.textContent = '말하는 중 🗣️';
      if (speakingIndicator) speakingIndicator.classList.add('active');
      break;
    default: // idle
      if (stateText) stateText.textContent = '대기 중';
      break;
  }
}

function startTalkingAvatarLoop() {
  isSpeakingAnim = true;
  setAvatarState('speaking');
}

function stopTalkingAvatarLoop() {
  isSpeakingAnim = false;
  setAvatarState('idle');
}

let naturalEnVoice = null;
let naturalKrVoice = null;

function loadNaturalVoices() {
  if ('speechSynthesis' in window) {
    const updateVoices = () => {
      const allVoices = window.speechSynthesis.getVoices();
      const enVoices = allVoices.filter(v => v.lang.startsWith('en'));
      const krVoices = allVoices.filter(v => v.lang.startsWith('ko'));
      
      // 1. 영어 여성 음성 우선순위
      const enPriority = ['Google US English', 'Google UK English Female', 'Samantha', 'Microsoft Aria', 'Microsoft Jenny', 'Karen'];
      let foundEn = enVoices.find(v => (v.name.includes('Natural') || v.name.includes('Neural')) && !v.name.includes('Male'));
      if (!foundEn) {
        for (const name of enPriority) {
          foundEn = enVoices.find(v => v.name.includes(name));
          if (foundEn) break;
        }
      }
      naturalEnVoice = foundEn || enVoices.find(v => !v.name.includes('Male')) || enVoices[0];

      // 2. 한국어 여성 음성 우선순위
      const krPriority = ['Google 한국어', 'Heami', 'Sun-Hi', 'Microsoft SunHi', 'Microsoft Heami', 'Yuna'];
      let foundKr = krVoices.find(v => v.name.includes('Natural') || v.name.includes('Google') || v.name.includes('Neural'));
      if (!foundKr) {
        for (const name of krPriority) {
          foundKr = krVoices.find(v => v.name.includes(name));
          if (foundKr) break;
        }
      }
      naturalKrVoice = foundKr || krVoices[0];

      console.log('🎙️ Selected En Voice:', naturalEnVoice?.name);
      console.log('🎙️ Selected Kr Voice:', naturalKrVoice?.name);
    };

    updateVoices();
    window.speechSynthesis.onvoiceschanged = updateVoices;
  }
}

function loadStoredData() {
  profiles = JSON.parse(JSON.stringify(DEFAULT_PROFILES));

  const savedHistories = localStorage.getItem('lingo_chat_histories_v23');
  if (savedHistories) chatHistories = JSON.parse(savedHistories);

  const savedFlashcards = localStorage.getItem('lingo_user_flashcards_v23');
  if (savedFlashcards) userFlashcards = JSON.parse(savedFlashcards);

  userGeminiApiKey = localStorage.getItem('lingo_gemini_api_key') || '';
  if (geminiKeyInput) geminiKeyInput.value = userGeminiApiKey;
}

function saveHistories() {
  localStorage.setItem('lingo_chat_histories_v23', JSON.stringify(chatHistories));
}

function saveFlashcards() {
  localStorage.setItem('lingo_user_flashcards_v23', JSON.stringify(userFlashcards));
}

function renderProfiles() {
  if (!profileGrid) return;
  profileGrid.innerHTML = '';

  profiles.forEach(p => {
    const card = document.createElement('div');
    card.className = 'profile-card';
    card.style.borderColor = p.themeColor;

    card.innerHTML = `
      <div class="profile-avatar-circle" style="background-color: ${p.themeColor}20;">
        ${p.avatarIcon}
      </div>
      <div class="profile-name">${p.name}</div>
      <div class="profile-sub">${p.age}세 맞춤 대화</div>
    `;

    card.addEventListener('click', () => selectProfile(p.id));
    profileGrid.appendChild(card);
  });
}

function getProfileNameInfo(profile) {
  if (!profile || !profile.name) {
    return { krName: '친구', enName: 'Friend' };
  }

  const KnownMappings = {
    'p_dad': { krName: '아빠', enName: 'Dad' },
    'p_mom': { krName: '엄마', enName: 'Mom' },
    'p_child1': { krName: '하율', enName: 'Hayul' },
    'p_child2': { krName: '예율', enName: 'Yeyul' },
    'p_child3': { krName: '성율', enName: 'Seongyul' },
    'p_youngest': { krName: '지율', enName: 'Jiyul' }
  };

  if (profile.id && KnownMappings[profile.id]) {
    return KnownMappings[profile.id];
  }

  const rawName = profile.name.trim();
  let clean = rawName.replace(/\(.*?\)/g, '').replace(/\[.*?\]/g, '').trim();
  clean = clean.replace(/^(첫째|둘째|셋째|넷째|막내)\s+/g, '').trim();

  if (clean === '아빠') return { krName: '아빠', enName: 'Dad' };
  if (clean === '엄마') return { krName: '엄마', enName: 'Mom' };
  if (clean === '하율') return { krName: '하율', enName: 'Hayul' };
  if (clean === '예율') return { krName: '예율', enName: 'Yeyul' };
  if (clean === '성율') return { krName: '성율', enName: 'Seongyul' };
  if (clean === '지율') return { krName: '지율', enName: 'Jiyul' };

  const isEnglish = /^[A-Za-z0-9\s]+$/.test(clean);
  if (isEnglish) {
    return { krName: clean, enName: clean };
  }

  return { krName: clean, enName: clean };
}

function selectProfile(id) {
  activeProfile = profiles.find(p => p.id === id);
  if (!activeProfile) return;

  conversationTurnCount = 0;
  recentRepliesBuffer = [];

  const welcomeContent = getWelcomeMessage(activeProfile);
  const welcomeTranslation = getWelcomeTranslation(activeProfile);

  if (!chatHistories[id] || chatHistories[id].length === 0) {
    chatHistories[id] = [
      {
        sender: 'ai',
        content: welcomeContent,
        translation: welcomeTranslation,
        timestamp: new Date().toISOString()
      }
    ];
    saveHistories();
  } else {
    // 저장된 기존 웰컴 메시지가 있는 경우 표현 보정 및 갱신
    if (chatHistories[id][0] && chatHistories[id][0].sender === 'ai') {
      chatHistories[id][0].content = welcomeContent;
      chatHistories[id][0].translation = welcomeTranslation;
      saveHistories();
    }
  }

  if (activeProfileHeader) activeProfileHeader.innerHTML = `${activeProfile.avatarIcon} <span>${activeProfile.name}</span>`;
  renderMessages();
  renderQuickChips();
  initDailyMission();

  if (profileSection) profileSection.classList.remove('active');
  if (chatSection) chatSection.classList.add('active');

  const welcomeMsg = chatHistories[id][0];
  updateVideoOverlaySubtitles(welcomeMsg.content, welcomeMsg.translation);
  speakText(welcomeMsg.content);
}

function getWelcomeMessage(profile) {
  const { enName } = getProfileNameInfo(profile);
  if (profile.age <= 5) {
    return `Hi ${enName}! What are you playing with today? ✨`;
  } else if (profile.age <= 9) {
    return `Hey ${enName}! What was the best part of your day today? 🎮`;
  } else {
    return `Hello ${enName}! I'm Chloe. How is your day going today? ✨`;
  }
}

function getWelcomeTranslation(profile) {
  const { krName } = getProfileNameInfo(profile);
  if (profile.age <= 5) {
    return `안녕 ${krName}! 오늘 뭐 하고 놀고 있니? ✨`;
  } else if (profile.age <= 9) {
    return `안녕 ${krName}! 오늘 가장 재미있었던 일은 뭐야? 🎮`;
  } else {
    return `안녕하세요 ${krName}님! 저는 클로이예요. 오늘 하루 어떠셨나요? ✨`;
  }
}

function updateVideoOverlaySubtitles(enText, krText) {
  if (speechEnText) speechEnText.innerText = `"${enText}"`;
  if (speechKrSub) speechKrSub.innerText = krText || "";
}

function renderMessages() {
  if (!chatMessages) return;
  chatMessages.innerHTML = '';
  const messages = chatHistories[activeProfile.id] || [];

  messages.forEach((msg, idx) => {
    const row = document.createElement('div');
    row.className = `msg-row ${msg.sender}`;

    const avatar = document.createElement('div');
    avatar.className = 'msg-avatar';
    avatar.innerText = msg.sender === 'user' ? activeProfile.avatarIcon : '👩‍🏫';

    const bubble = document.createElement('div');
    bubble.className = 'msg-bubble';

    let contentHtml = `<div>${msg.content} <button class="tts-btn" onclick="speakText('${msg.content.replace(/'/g, "\\'")}')">🔊</button></div>`;

    if (msg.grammarFixNote) {
      contentHtml += `
        <div class="grammar-tip" style="background:#451a03; border-color:#78350f; color:#fde047; margin-top:6px;">
          <span>🔧 문법/표현 교정:</span> ${msg.grammarFixNote}
        </div>
      `;
    }

    if (msg.pronunciationTip) {
      contentHtml += `
        <div class="grammar-tip" style="background:#1e1b4b; border-color:#4338ca; color:#a5b4fc; margin-top:6px;">
          <span>🎙️ 억양 & 발음 팁:</span> ${msg.pronunciationTip}
        </div>
      `;
    }

    if (msg.nativeUpgrade || msg.advancedUpgrade) {
      contentHtml += `
        <div class="upgrade-elevator">
          <div class="upgrade-title">💎 3단계 문장 엘리베이터 & 실전 따라하기</div>
          <div class="upgrade-step native">🥈 원어민 표현: "${msg.nativeUpgrade || ''}"</div>
          <div class="upgrade-step advanced">🥇 C1/C2 고급 표현: "${msg.advancedUpgrade || ''}"</div>
          ${msg.nativeUpgrade ? `<button class="practice-speak-btn" onclick="fillPracticeSentence('${msg.nativeUpgrade.replace(/'/g, "\\'")}')">📢 원어민 표현 따라 연습하기</button>` : ''}
        </div>
      `;
    }

    if (msg.translation) {
      const transId = `trans-${idx}`;
      contentHtml += `
        <button class="toggle-trans-btn" onclick="toggleTranslation('${transId}')">🌐 한글 번역 보기</button>
        <div id="${transId}" class="translation-box" style="display: none;">${msg.translation}</div>
      `;
    }

    bubble.innerHTML = contentHtml;
    row.appendChild(avatar);
    row.appendChild(bubble);
    chatMessages.appendChild(row);
  });

  chatMessages.scrollTop = chatMessages.scrollHeight;
}

function toggleTranslation(id) {
  const el = document.getElementById(id);
  if (el) {
    el.style.display = el.style.display === 'none' ? 'block' : 'none';
  }
}

function splitTextIntoBilingualChunks(text) {
  if (!text) return [];

  // 1. 이모지, 서식 기호 제거 (문장부호 , . ! ? 은 호흡 마디 계산용으로 보존)
  let clean = text.replace(/[\u{1F600}-\u{1F64F}\u{1F300}-\u{1F5FF}\u{1F680}-\u{1F6FF}\u{1F1E0}-\u{1F1FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}\u{FE00}-\u{FE0F}\u{1F900}-\u{1F9FF}\u{200D}\u{20E3}]/gu, '');
  clean = clean.replace(/\[.*?\]/g, '').replace(/[*_#`~]/g, '').trim();

  // 2. 구두점(, . ! ?)을 기준으로 자연스러운 마디 분리
  const rawSegments = clean.split(/(?<=[,.!?])\s+/);
  const chunks = [];

  rawSegments.forEach(segment => {
    const trimmed = segment.trim();
    if (!trimmed) return;

    const hasComma = trimmed.endsWith(',');
    const hasQuestion = trimmed.endsWith('?');
    const hasExclamation = trimmed.endsWith('!');

    // 세그먼트 전체의 주언어 판별 (영문 알파벳 수 vs 한글 글자 수)
    const krCount = (trimmed.match(/[\uAC00-\uD7AF\u3130-\u318F\u1100-\u11FF]/g) || []).length;
    const enCount = (trimmed.match(/[a-zA-Z]/g) || []).length;

    // 단어별 잦은 언어 음성 교체로 인한 끊김 방지: 세그먼트 단위로 주언어 지정
    const lang = (enCount >= krCount) ? 'en-US' : 'ko-KR';
    const pauseTime = hasComma ? 120 : (hasQuestion || hasExclamation ? 200 : 160);

    chunks.push({
      text: trimmed,
      lang: lang,
      pause: pauseTime,
      isQuestion: hasQuestion,
      isExclamation: hasExclamation
    });
  });

  return chunks;
}

function fillPracticeSentence(text) {
  if (!chatInput) return;
  chatInput.value = text;
  if (lingoStatusTag) lingoStatusTag.innerText = "📢 [따라하기 연습] 마이크 버튼 🎙️을 누르고 문장을 크게 읽어보세요!";
  chatInput.focus();
}

function speakText(text) {
  if (!('speechSynthesis' in window)) return;
  
  // 🔇 중요: 선생님이 말할 때는 마이크를 즉시 완전히 꺼서 스피커 소리가 마이크로 재입력되는 피드백 에코 루프 차단!
  stopListening();
  window.speechSynthesis.cancel();
  if (!naturalEnVoice) loadNaturalVoices();

  const chunks = splitTextIntoBilingualChunks(text);
  if (chunks.length === 0) return;

  if (aiHumanStage) aiHumanStage.classList.add('speaking');
  startTalkingAvatarLoop();

  if (lingoStatusTag) lingoStatusTag.innerText = "🗣️ Chloe 선생님이 부드러운 목소리로 대화하는 중...";

  let currentIdx = 0;

  // Chrome TTS 멈춤 방지 패치
  let resumeTimer = setInterval(() => {
    if (window.speechSynthesis.speaking) {
      window.speechSynthesis.pause();
      window.speechSynthesis.resume();
    }
  }, 10000);

  const playNextChunk = () => {
    if (currentIdx >= chunks.length) {
      clearInterval(resumeTimer);
      if (aiHumanStage) aiHumanStage.classList.remove('speaking');
      stopTalkingAvatarLoop();
      if (lingoStatusTag) lingoStatusTag.innerText = "🎤 경청 중... 편하게 말씀해 주세요!";
      
      // 🎧 선생님 발화가 완전히 끝난 뒤 스피커 여운이 사라지는 1.2초 후 마이크를 안심하게 재활성화
      setTimeout(() => {
        if (!isListening && !window.speechSynthesis.speaking) {
          startListening();
        }
      }, 1200);
      return;
    }

    const chunk = chunks[currentIdx];
    currentIdx++;

    // 발음 시 문자 부호 명칭("물음표" 등)을 읽지 않도록 기호 제거 후 순수 텍스트 추출
    let speakable = chunk.text.replace(/[^a-zA-Z0-9\s\uAC00-\uD7AF\u3130-\u318F\u1100-\u11FF']/g, ' ').trim();
    if (!speakable) {
      playNextChunk();
      return;
    }

    const utterance = new SpeechSynthesisUtterance(speakable);
    
    if (chunk.lang === 'ko-KR') {
      utterance.lang = 'ko-KR';
      if (naturalKrVoice) utterance.voice = naturalKrVoice;
      utterance.rate = 0.92; // 따스하고 우아한 속도
      utterance.pitch = 1.02;
    } else {
      utterance.lang = 'en-US';
      if (naturalEnVoice) utterance.voice = naturalEnVoice;
      
      // 🎭 품격 있는 억양(Intonation) 및 여유로운 템포 조절
      if (chunk.isExclamation) {
        utterance.rate = 0.86;
        utterance.pitch = 1.15; // 따스하게 감탄하는 톤
      } else if (chunk.isQuestion) {
        utterance.rate = 0.82;
        utterance.pitch = 1.12; // 끝을 정중하고 여유롭게 올리는 올려묻기
      } else {
        utterance.rate = 0.83;  // 편안하고 지적인 품격 있는 원어민 속도 (0.90 -> 0.83)
        utterance.pitch = 1.03; // 편안한 평서문 호흡
      }
    }

    utterance.onend = () => {
      // 쉼표, 마침표마다 사람처럼 0.3~0.4초간 자연스러운 숨쉬기 일시정지(Pause) 적용
      setTimeout(playNextChunk, chunk.pause || 300);
    };

    utterance.onerror = (e) => {
      console.error('Bilingual TTS error:', e);
      playNextChunk();
    };

    window.speechSynthesis.speak(utterance);
  };

  playNextChunk();
}

function setupSpeechRecognition() {
  const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SpeechRecognition) {
    console.warn("Speech Recognition API non-supported in this browser");
    return;
  }

  recognition = new SpeechRecognition();
  recognition.continuous = true;
  recognition.interimResults = true;
  recognition.lang = 'en-US';

  recognition.onstart = () => {
    isListening = true;
    accumulatedTranscript = '';
    setAvatarState('listening');
    if (giantMicBtn) giantMicBtn.classList.add('listening');
    if (micIcon) micIcon.innerText = "🔴";
    if (micLabel) micLabel.innerText = "화상 통화 중...";
    if (lingoStatusTag) lingoStatusTag.innerText = "🎤 편하게 말씀을 이어나가세요. Chloe 선생님이 경청하고 있어요...";
  };

  recognition.onresult = (event) => {
    let interim = '';
    let hasNewFinal = false;

    for (let i = event.resultIndex; i < event.results.length; ++i) {
      const transcriptChunk = event.results[i][0].transcript;
      if (event.results[i].isFinal) {
        accumulatedTranscript += (accumulatedTranscript ? ' ' : '') + transcriptChunk;
        hasNewFinal = true;
      } else {
        interim += transcriptChunk;
      }
    }

    // 화면 입력창에는 실시간으로 말하는 내용 표시
    const displayText = accumulatedTranscript + (interim ? ' ' + interim : '');
    if (chatInput) chatInput.value = displayText;

    // 🛑 중요: 완벽히 확정된 문장(hasNewFinal)이 들어왔을 때만 전송 타이머 작동!
    // 사용자가 말하는 중간의 불확실한 임시 텍스트(interim) 때문에 앞 단어가 싹 잘려서 들어가는 현상 완전 차단.
    if (hasNewFinal || accumulatedTranscript.trim().length > 0) {
      if (speechPauseTimer) clearTimeout(speechPauseTimer);

      speechPauseTimer = setTimeout(() => {
        const textToSend = accumulatedTranscript.trim() || (chatInput ? chatInput.value.trim() : '');
        
        // 헛소리/잡음 1단어(예: "A", "The", "Um") 잘림 방지: 최소 3글자 이상 의미있는 완성문장일 때만 전송
        if (textToSend.length >= 3 && !window.speechSynthesis.speaking) {
          console.log("🎤 Final sentence ready to send:", textToSend);
          stopListening();
          handleSendMessage();
        }
      }, 1800);
    }
  };

  recognition.onerror = (e) => {
    console.warn("Speech recognition error", e);
    stopListening();
  };

  recognition.onend = () => {
    if (isListening && chatInput && chatInput.value.trim().length > 0) {
      handleSendMessage();
    }
    stopListening();
  };
}

function toggleListening() {
  if (!recognition) {
    alert("이 브라우저에서는 마이크 음성 인식이 지원되지 않습니다. 하단 키보드로 입력해 보세요!");
    return;
  }

  if (isListening) {
    if (speechPauseTimer) clearTimeout(speechPauseTimer);
    recognition.stop();
    stopListening();
    if (chatInput && chatInput.value.trim().length > 0) {
      handleSendMessage();
    }
  } else {
    if (chatInput) chatInput.value = '';
    accumulatedTranscript = '';
    recognition.start();
  }
}

function startListening() {
  if (!recognition || isListening) return;
  // 선생님이 아직 말하고 있을 때는 마이크가 절대로 켜지지 않도록 철저한 에코 방지!
  if ('speechSynthesis' in window && window.speechSynthesis.speaking) {
    console.log("Speech synthesis is currently active. Delaying mic activation.");
    return;
  }
  try {
    if (chatInput) chatInput.value = '';
    accumulatedTranscript = '';
    recognition.start();
  } catch (e) {
    console.warn("Could not auto start listening:", e);
  }
}

function stopListening() {
  isListening = false;
  if (speechPauseTimer) clearTimeout(speechPauseTimer);
  if (giantMicBtn) giantMicBtn.classList.remove('listening');
  if (micIcon) micIcon.innerText = "🎙️";
  if (micLabel) micLabel.innerText = "화상 대화 시작하기";
  if (lingoStatusTag) lingoStatusTag.innerText = "👩‍🏫 마이크를 누르거나 화면을 터치해 실제 화상 통화처럼 대화하세요!";
}

function renderQuickChips() {
  if (!quickChipsContainer) return;
  quickChipsContainer.innerHTML = '';
  if (!activeProfile) return;

  let chips = [];
  if (activeProfile.age <= 5) {
    chips = ["I played with my toys!", "I had delicious snacks!", "Can you tell me a story?"];
  } else if (activeProfile.age <= 7) {
    chips = ["I love T-Rex dinosaurs!", "I played with friends today!", "Teach me a fun word!"];
  } else if (activeProfile.age <= 9) {
    chips = ["I love playing games!", "I listened to my favorite song!", "Let me tell you something!"];
  } else {
    chips = ["How was your day today?", "What topic should we explore?", "Can you teach me a native idiom?"];
  }

  chips.forEach(text => {
    const btn = document.createElement('button');
    btn.className = 'chip';
    btn.innerText = text;
    btn.addEventListener('click', () => {
      if (chatInput) chatInput.value = text;
      handleSendMessage();
    });
    quickChipsContainer.appendChild(btn);
  });
}

function checkUserEnglishGrammar(text) {
  const lower = text.toLowerCase().trim();
  let fixNote = "";

  if (lower.includes("yesterday") && (lower.includes(" i go ") || lower.includes(" i eat ") || lower.includes(" i play ") || lower.startsWith("i go") || lower.startsWith("i eat"))) {
    fixNote = "어제(yesterday) 있었던 일이므로 현재형(go/eat) 대신 과거형(went/ate)을 사용하셔야 원어민 표현입니다!";
  } else if (lower.includes("me like") || lower.includes("me eat") || lower.includes("me go")) {
    fixNote = "주어로 목적격 'Me' 대신 주격 'I'를 사용하세요! (I like / I eat / I go)";
  } else if (lower.includes("pizza eat") || lower.includes("game play") || lower.includes("food eat")) {
    fixNote = "영어는 목적어가 동사 뒤로 와야 합니다! (eat pizza / play games)";
  } else if (lower.includes("i is") || lower.includes("he go") || lower.includes("she like")) {
    fixNote = "3인칭 단수 주어 뒤의 동사에는 -s/es를 붙이거나 수일치(he goes / she likes)를 해주는 것이 정확합니다!";
  } else if (lower.includes("listen music") || lower.includes("go market")) {
    fixNote = "방향과 대상을 나타낼 때 전치사 'to'를 붙여주세요! (listen to music / go to the market)";
  }

  return fixNote;
}

async function handleSendMessage() {
  if (!chatInput) return;
  const text = chatInput.value.trim();
  if (!text || !activeProfile) return;

  chatInput.value = '';
  accumulatedTranscript = '';

  const userMsg = {
    sender: 'user',
    content: text,
    timestamp: new Date().toISOString()
  };

  chatHistories[activeProfile.id].push(userMsg);
  saveHistories();
  renderMessages();

  setAvatarState('thinking');
  if (lingoStatusTag) lingoStatusTag.innerText = "🤔 Chloe 선생님이 대화를 깊이 이해하며 생각을 정리하는 중...";

  try {
    const resp = await fetchRealGeminiResponse(activeProfile, text);
    if (resp && resp.reply) {
      handleAiResponseReceived(resp, text);
      return;
    }
  } catch (e) {
    console.error("API Error:", e);
    if (lingoStatusTag) lingoStatusTag.innerText = "⚠️ AI 연결 중... 오프라인 모드로 전환: " + e.message;
  }

  setTimeout(() => {
    const aiResponse = generateNaturalHumanResponse(activeProfile, text);
    handleAiResponseReceived(aiResponse, text);
  }, 400);
}

function handleAiResponseReceived(aiResponse, userText) {
  const grammarFixNote = checkUserEnglishGrammar(userText);
  
  // Analytics Tracking
  const words = userText.toLowerCase().match(/\b[a-z']+\b/g) || [];
  words.forEach(w => uniqueWordsUsed.add(w));
  if (words.length > 0) sentenceLengths.push(words.length);

  if (grammarFixNote) {
    if (grammarFixNote.includes("과거형")) userErrorPatterns.tense++;
    else if (grammarFixNote.includes("전치사")) userErrorPatterns.preposition++;
    else if (grammarFixNote.includes("목적어가 동사 뒤")) userErrorPatterns.wordOrder++;
    else if (grammarFixNote.includes("수일치") || grammarFixNote.includes("-s/es")) userErrorPatterns.agreement++;
    else if (grammarFixNote.includes("주격")) userErrorPatterns.other++;
    else userErrorPatterns.other++;
  }

  const aiMsg = {
    sender: 'ai',
    content: aiResponse.reply,
    translation: aiResponse.translation,
    grammarHint: aiResponse.grammarHint,
    phonemeTip: aiResponse.phonemeTip,
    pronunciationTip: aiResponse.pronunciationTip,
    practiceSentence: aiResponse.practiceSentence,
    nativeUpgrade: aiResponse.nativeUpgrade,
    advancedUpgrade: aiResponse.advancedUpgrade,
    grammarFixNote: aiResponse.grammarFixNote || grammarFixNote,
    timestamp: new Date().toISOString()
  };

  chatHistories[activeProfile.id].push(aiMsg);
  saveHistories();
  renderMessages();

  // 🎴 자동 어휘 저장: 교정된 원어민 추천 표현이 있으면 단어장에 자동 수집
  if (aiResponse.nativeUpgrade && aiResponse.nativeUpgrade.length > 3) {
    const exists = userFlashcards.some(card => card.native === aiResponse.nativeUpgrade);
    if (!exists) {
      userFlashcards.unshift({
        id: 'fc_' + Date.now(),
        original: userText,
        native: aiResponse.nativeUpgrade,
        advanced: aiResponse.advancedUpgrade || '',
        date: new Date().toLocaleDateString('ko-KR')
      });
      if (userFlashcards.length > 50) userFlashcards.pop(); // 최신 50개 유지
      saveFlashcards();
    }
  }

  updateVideoOverlaySubtitles(aiResponse.reply, aiResponse.translation);

  // Avatar Mood selection (happy, curious, focused, warm)
  let mood = 'warm';
  if (aiMsg.grammarFixNote || aiMsg.pronunciationTip) {
    mood = 'focused';
  } else if (userText.includes('?') || aiResponse.reply.includes('?')) {
    mood = 'curious';
  } else if (/great|happy|love|fun|awesome|good|wonderful|nice|playing/i.test(aiResponse.reply + ' ' + userText)) {
    mood = 'happy';
  }
  setAvatarMood(mood);
  checkMissionCompletion(userText, aiResponse.reply);

  speakText(aiResponse.reply);
}

function correctPhoneticMishearings(text) {
  if (!text) return text;
  let cleaned = text;
  
  const phoneticMap = [
    [/\blight\b/gi, "right"], [/\blice\b/gi, "rice"], [/\blead\b/gi, "read"], [/\blily\b/gi, "really"], [/\bload\b/gi, "road"],
    [/\bpray\b/gi, "play"], [/\bfry\b/gi, "fly"],
    [/\bsink\b/gi, "think"], [/\b(sree|tree)\b/gi, "three"], [/\bdis\b/gi, "this"], [/\bdat\b/gi, "that"],
    [/\bmass\b/gi, "math"], [/\bbass\b/gi, "bath"],
    [/\bberry\b/gi, "very"], [/\bbest\b/gi, "vest"], [/\bwine\b/gi, "vine"], [/\bban\b/gi, "van"],
    [/\bpun\b/gi, "fun"], [/\bpish\b/gi, "fish"], [/\bcopy\b/gi, "coffee"], [/\bpone\b/gi, "phone"],
    [/\bwant to skull\b/gi, "went to school"],
    [/\bwant to store\b/gi, "went to store"],
    [/\bi am go to\b/gi, "I am going to"],
    [/\bwhat did you did\b/gi, "what did you do"],
    [/\bi have go\b/gi, "I have to go"],
    [/\bcopy shop\b/gi, "coffee shop"],
    [/\bi play a piano\b/gi, "I play the piano"],
    [/\bhe don't\b/gi, "he doesn't"],
    [/\byesterday i go\b/gi, "yesterday I went"],
    [/\bi am agree\b/gi, "I agree"],
    [/\bshe is have\b/gi, "she has"],
    [/\bmore better\b/gi, "better"],
    [/\bmost fastest\b/gi, "fastest"],
    [/\bi am boring\b/gi, "I am bored"],
    [/\bi am interesting\b/gi, "I am interested"],
    [/\blisten music\b/gi, "listen to music"],
    [/\bgo market\b/gi, "go to the market"],
    [/\bdiscuss about\b/gi, "discuss"],
    [/\bexplain me\b/gi, "explain to me"],
    [/\bplay game\b/gi, "playing games"],
    [/\bme like\b/gi, "I like"],
    [/\bme go\b/gi, "I go"],
    [/\bi scream\b/gi, "ice cream"],
    [/\ban ice\b/gi, "a nice"],
    [/\bits snot\b/gi, "it's not"]
  ];

  phoneticMap.forEach(([regex, replacement]) => {
    cleaned = cleaned.replace(regex, replacement);
  });

  return cleaned;
}

async function fetchRealGeminiResponse(profile, userText) {
  const { krName, enName } = getProfileNameInfo(profile);
  
  // 발음 오인식 1차 자동 보정
  const correctedUserText = correctPhoneticMishearings(userText);

  // 최근 16턴의 대화 기록을 넉넉하게 전달하여 AI가 이전 대답/질문을 100% 기억
  const historySnippet = (chatHistories[profile.id] || [])
    .slice(-16)
    .map(m => `${m.sender === 'user' ? enName : 'Chloe'}: ${m.content}`)
    .join("\n");

  const requestBody = {
    userName: `${enName} (${krName})`,
    userAge: profile.age,
    userText: correctedUserText,
    history: historySnippet,
    flashcards: userFlashcards.slice(0, 10),
    apiKey: userGeminiApiKey || ''
  };

  // 15초 타임아웃
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 15000);

  try {
    if (lingoStatusTag) lingoStatusTag.innerText = "🔄 Chloe 교수님과 연결 중...";

    const res = await fetch('/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(requestBody),
      signal: controller.signal
    });

    clearTimeout(timeoutId);

    if (!res.ok) {
      const errText = await res.text().catch(() => 'Unknown error');
      console.error("API response error:", res.status, errText);
      throw new Error(`서버 응답 에러 (${res.status}): ${errText.substring(0, 100)}`);
    }

    const data = await res.json();
    if (!data.reply) {
      console.error("No reply in data:", data);
      throw new Error("AI 응답에 reply가 없습니다");
    }
    
    if (lingoStatusTag) lingoStatusTag.innerText = "✅ Chloe 교수님 응답 완료!";
    return data;
  } catch (err) {
    clearTimeout(timeoutId);
    if (err.name === 'AbortError') {
      throw new Error("서버 응답 시간 초과 (15초)");
    }
    throw err;
  }
}

const OFFLINE_TOPICS = {
  travel: [
    "I love traveling! Where is the best place you have ever visited?",
    "Traveling is so fun. Do you prefer the beach or the mountains?",
    "If you could travel anywhere in the world right now, where would you go?"
  ],
  school: [
    "School can be fun! What's your favorite subject?",
    "Did you learn anything interesting at school today?",
    "What do you usually do during recess at school?"
  ],
  family: [
    "Family is so important! Do you have a favorite thing you do with your family?",
    "What's the funniest thing that happened with your family recently?",
    "Do you help your parents at home? What chores do you do?"
  ],
  emotions: [
    "It's good to talk about feelings. What made you smile today?",
    "I understand. How do you usually cheer yourself up when you're sad?",
    "That sounds intense. What are you most excited about right now?"
  ],
  hobbies: [
    "Hobbies are great! How did you get into your favorite hobby?",
    "What do you enjoy doing in your free time the most?",
    "Is there a new hobby you'd like to try someday?"
  ],
  dreams: [
    "Dreams are magical! What do you want to be when you grow up?",
    "If you had a superpower, what would it be?",
    "What is your biggest dream right now?"
  ],
  health: [
    "Health is wealth! What's your favorite way to exercise?",
    "Did you drink enough water today? It's really important!",
    "What's your favorite healthy snack to eat?"
  ],
  weather: [
    "The weather affects our mood. Do you like rainy days or sunny days?",
    "What's the weather like where you are today?",
    "What's your favorite season of the year?"
  ],
  food: [
    "Food is delicious! What's your absolute favorite meal?",
    "If you could only eat one food for the rest of your life, what would it be?",
    "Do you like cooking or baking? What's the best thing you can make?"
  ],
  culture: [
    "Culture is fascinating! What's a traditional dish from your country that you love?",
    "Do you have a favorite festival or holiday in your culture?",
    "What's something unique about your country that you think everyone should know?"
  ],
  movies: [
    "I love movies! What's the best movie you've seen recently?",
    "If you could be any character in a movie, who would you be?",
    "Do you prefer action movies or funny ones?"
  ],
  music: [
    "Music is a universal language! What kind of music do you listen to?",
    "Do you play any musical instruments, or do you want to learn one?",
    "Who is your favorite singer or band?"
  ],
  sports: [
    "Sports keep us active! What's your favorite sport to play or watch?",
    "Have you ever been to a live sports game?",
    "Who is your favorite athlete?"
  ],
  technology: [
    "Technology is amazing! What's your favorite app or gadget?",
    "How do you think technology will change the world in the future?",
    "Do you like playing video games? Which one is your favorite?"
  ],
  work: [
    "Work can be rewarding! What do you think is the hardest job in the world?",
    "If you could have any job for a day, what would it be?",
    "What do you think is the best part about having a job?"
  ],
  relationships: [
    "Relationships are important! What makes a good friend?",
    "Who is someone you look up to and why?",
    "What's the best way to show someone you care about them?"
  ],
  pets: [
    "Pets are so cute! Do you have any pets, or do you want one?",
    "If you could have any animal as a pet, what would you choose?",
    "What's the funniest thing you've seen a pet do?"
  ],
  holidays: [
    "Holidays are the best! What's your favorite holiday of the year?",
    "How do you usually celebrate your favorite holiday?",
    "If you could invent a new holiday, what would it celebrate?"
  ],
  nature: [
    "Nature is beautiful! What's your favorite animal in the wild?",
    "Do you like camping or hiking in nature?",
    "What's the most beautiful place in nature you've ever seen?"
  ],
  science: [
    "Science is cool! What's the most interesting science fact you know?",
    "If you could travel to space, which planet would you visit?",
    "What's a scientific invention you wish existed?"
  ]
};

// 🧠 문맥을 100% 반영해 질문에 '진짜 대답'하는 초스마트 오프라인 추론 엔진
function generateNaturalHumanResponse(profile, userText) {
  conversationTurnCount++;
  const { krName, enName } = getProfileNameInfo(profile);
  const lower = userText.toLowerCase().trim();

  let reply = "";
  let trans = "";
  let native = "";
  let adv = "";
  
  const grammarFixNote = checkUserEnglishGrammar(userText);

  // Determine Topic
  let matchedTopic = null;
  const topicKeywords = {
    travel: ["travel", "trip", "visit", "go to", "vacation"],
    school: ["school", "study", "teacher", "class", "homework"],
    family: ["family", "mom", "dad", "sister", "brother", "parents"],
    emotions: ["happy", "sad", "angry", "excited", "tired", "feel"],
    hobbies: ["hobby", "play", "game", "read", "watch", "fun"],
    dreams: ["dream", "want to be", "future", "hope"],
    health: ["health", "sick", "doctor", "hospital", "exercise"],
    weather: ["weather", "rain", "sun", "cold", "hot", "snow"],
    food: ["food", "eat", "lunch", "dinner", "hungry", "delicious"],
    culture: ["culture", "korea", "tradition", "country"],
    movies: ["movie", "cinema", "film", "watch"],
    music: ["music", "song", "sing", "listen"],
    sports: ["sport", "soccer", "baseball", "basketball", "play"],
    technology: ["computer", "phone", "app", "internet", "tech"],
    work: ["work", "job", "office", "money"],
    relationships: ["friend", "love", "meet", "people"],
    pets: ["pet", "dog", "cat", "animal", "cute"],
    holidays: ["holiday", "christmas", "halloween", "vacation", "party"],
    nature: ["nature", "tree", "mountain", "sea", "flower", "animal"],
    science: ["science", "space", "star", "planet", "math"]
  };

  for (const [topic, keywords] of Object.entries(topicKeywords)) {
    if (keywords.some(kw => lower.includes(kw))) {
      matchedTopic = topic;
      break;
    }
  }

  if (lower.includes("name") || lower.includes("who are you")) {
    reply = `My name is Chloe! I'm your native English teacher. What's your name, ${enName}?`;
    trans = `제 이름은 클로이예요! 여러분의 원어민 영어 선생님이죠. ${krName}님의 이름은 무엇인가요?`;
    native = `I'm Chloe, nice to meet you!`;
    adv = `My name is Chloe, I serve as your native English instructor.`;
  } else if (matchedTopic && OFFLINE_TOPICS[matchedTopic]) {
    const options = OFFLINE_TOPICS[matchedTopic];
    // Repetition Prevention
    let availableOptions = options.filter(opt => !recentRepliesBuffer.includes(opt));
    if (availableOptions.length === 0) availableOptions = options; // fallback
    
    reply = availableOptions[Math.floor(Math.random() * availableOptions.length)];
    recentRepliesBuffer.push(reply);
    if (recentRepliesBuffer.length > 5) recentRepliesBuffer.shift();
    
    trans = `(오프라인 모드: ${matchedTopic} 주제 질문)`;
    native = `Tell me more about ${matchedTopic}!`;
    adv = `Could you elaborate on the topic of ${matchedTopic}?`;
  } else {
    // Contextual Follow-up or Generic fallback
    const options = [
      `That is really interesting, ${enName}. Tell me a bit more about it!`,
      `Wow, I see. What do you think about that?`,
      `Oh, really? Why is that?`,
      `That makes sense. Can you explain more?`
    ];
    let availableOptions = options.filter(opt => !recentRepliesBuffer.includes(opt));
    if (availableOptions.length === 0) availableOptions = options;
    
    reply = availableOptions[Math.floor(Math.random() * availableOptions.length)];
    recentRepliesBuffer.push(reply);
    if (recentRepliesBuffer.length > 5) recentRepliesBuffer.shift();

    trans = `그것에 대해 조금 더 말씀해 주시겠어요, ${krName}님?`;
    native = `Tell me more!`;
    adv = `Please elaborate on your previous statement.`;
  }

  return {
    reply,
    translation: trans,
    nativeUpgrade: native,
    advancedUpgrade: adv,
    grammarFixNote: grammarFixNote
  };
}

function renderRoleplayModal() {
  if (!roleplayGrid) return;
  roleplayGrid.innerHTML = '';
  ROLEPLAY_SCENARIOS.forEach(s => {
    const item = document.createElement('div');
    item.className = 'roleplay-item';
    item.innerHTML = `
      <div class="roleplay-title">${s.title}</div>
      <div class="roleplay-desc">${s.desc}</div>
    `;
    item.addEventListener('click', () => startRoleplayScenario(s));
    roleplayGrid.appendChild(item);
  });
}

function startRoleplayScenario(scenario) {
  activeRoleplay = scenario;
  if (roleplayModal) roleplayModal.classList.add('hidden');

  const startMsg = {
    sender: 'ai',
    content: `Hi! Ready for our ${scenario.title}? What's up?`,
    translation: `안녕! ${scenario.title} 역할극 준비됐어! 무슨 일이야?`,
    timestamp: new Date().toISOString()
  };

  chatHistories[activeProfile.id].push(startMsg);
  saveHistories();
  renderMessages();

  updateVideoOverlaySubtitles(startMsg.content, startMsg.translation);
  speakText(startMsg.content);
}

function setupEventListeners() {
  if (backToProfilesBtn) {
    backToProfilesBtn.addEventListener('click', () => {
      renderProfiles();
      if (chatSection) chatSection.classList.remove('active');
      if (profileSection) profileSection.classList.add('active');
    });
  }

  if (sendBtn) sendBtn.addEventListener('click', handleSendMessage);
  if (giantMicBtn) giantMicBtn.addEventListener('click', toggleListening);
  if (aiHumanStage) aiHumanStage.addEventListener('click', toggleListening);
  if (deckBtn) deckBtn.addEventListener('click', () => { if (deckModal) deckModal.classList.remove('hidden'); });

  if (hintToggleBtn) {
    hintToggleBtn.addEventListener('click', () => {
      if (speechKrSub) {
        speechKrSub.style.display = speechKrSub.style.display === 'none' ? 'block' : 'none';
      }
    });
  }

  const clearChatBtn = document.getElementById('clear-chat-btn');
  if (clearChatBtn) {
    clearChatBtn.addEventListener('click', () => {
      if (activeProfile && confirm('대화 기록을 초기화할까요?')) {
        chatHistories[activeProfile.id] = [];
        saveHistories();
        renderMessages();
        if (lingoStatusTag) lingoStatusTag.innerText = "🗑️ 대화 기록이 초기화되었습니다. 새로운 대화를 시작하세요!";
      }
    });
  }

  if (roleplayBtn) {
    roleplayBtn.addEventListener('click', () => {
      if (roleplayModal) roleplayModal.classList.remove('hidden');
    });
  }

  if (closeRoleplayBtn) {
    closeRoleplayBtn.addEventListener('click', () => {
      if (roleplayModal) roleplayModal.classList.add('hidden');
    });
  }

  if (closeDeckBtn) {
    closeDeckBtn.addEventListener('click', () => {
      if (deckModal) deckModal.classList.add('hidden');
    });
  }

  if (chatInput) {
    chatInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') handleSendMessage();
    });
  }

  if (settingsBtn) {
    settingsBtn.addEventListener('click', () => {
      if (settingsModal) settingsModal.classList.remove('hidden');
    });
  }

  if (closeSettingsBtn) {
    closeSettingsBtn.addEventListener('click', () => {
      if (settingsModal) settingsModal.classList.add('hidden');
    });
  }

  if (saveSettingsBtn) {
    saveSettingsBtn.addEventListener('click', () => {
      if (geminiKeyInput) userGeminiApiKey = geminiKeyInput.value.trim();
      localStorage.setItem('lingo_gemini_api_key', userGeminiApiKey);
      alert('설정이 성공적으로 저장되었습니다! 이제 Gemini AI가 100% 똑똑하게 대화합니다.');
      if (settingsModal) settingsModal.classList.add('hidden');
    });
  }

  if (reportBtn) {
    reportBtn.addEventListener('click', openReportModal);
  }

  if (closeReportBtn) {
    closeReportBtn.addEventListener('click', () => {
      if (reportModal) reportModal.classList.add('hidden');
    });
  }
}

document.addEventListener('DOMContentLoaded', initApp);
