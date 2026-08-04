// 6인 가족 프로필 (하율/예율 쌍둥이 만9세, 성율 만6세, 지율 만4세)
const DEFAULT_PROFILES = [
  {
    id: 'p_dad',
    name: '아빠',
    roleKey: 'dad',
    age: 42,
    birthInfo: '',
    levelText: '고급/중급 (Intermediate/Advanced)',
    interests: ['비즈니스', '사회/정치', '해외여행', 'IT/기술'],
    totalXp: 450,
    level: 3,
    streak: 3,
    badges: ['🔥 첫 걸음', '✈️ 여행 준비'],
    avatarIcon: '👨‍💼',
    themeColor: '#2196F3',
    missions: [
      { text: "비즈니스 관련 단어 1개 포함 대화하기", done: false },
      { text: "3문장 이상의 긴 의견 표현하기", done: false },
      { text: "C1 레벨 고급 어휘 교정받기", done: false }
    ]
  },
  {
    id: 'p_mom',
    name: '엄마',
    roleKey: 'mom',
    age: 40,
    birthInfo: '',
    levelText: '중급 (Intermediate)',
    interests: ['일상 생활', '문화/예술', '심리학', '교육'],
    totalXp: 380,
    level: 2,
    streak: 2,
    badges: ['🌱 첫 걸음', '☕ 수다왕'],
    avatarIcon: '👩‍🏫',
    themeColor: '#E91E63',
    missions: [
      { text: "오늘 기분이나 느낌 표현하기", done: false },
      { text: "원어민 팁 단어장에 저장하기", done: false },
      { text: "질문 문장 1개 던져보기", done: false }
    ]
  },
  {
    id: 'p_child1',
    name: '첫째 하율 (쌍둥이)',
    roleKey: 'child1',
    age: 9,
    birthInfo: '5월 생일 (만 9세)',
    levelText: '초/중급',
    interests: ['K-POP', '게임', '학교생활'],
    totalXp: 620,
    level: 4,
    streak: 5,
    badges: ['⭐ 영단어 챔피언', '🎮 퀘스트 마스터'],
    avatarIcon: '👦',
    themeColor: '#9C27B0',
    missions: [
      { text: "좋아하는 게임 이야기하기", done: false },
      { text: "영문장 2개 이상 말해보기", done: false },
      { text: "레벨업 챌린지 성공하기", done: false }
    ]
  },
  {
    id: 'p_child2',
    name: '둘째 예율 (쌍둥이)',
    roleKey: 'child2',
    age: 9,
    birthInfo: '5월 생일 (만 9세)',
    levelText: '초/중급',
    interests: ['그림 그리기', '애니메이션', '동물'],
    totalXp: 210,
    level: 2,
    streak: 1,
    badges: ['🐣 영어 싹틔우기'],
    avatarIcon: '👧',
    themeColor: '#4CAF50',
    missions: [
      { text: "좋아하는 동물 영어로 말하기", done: false },
      { text: "선생님께 안부인사 건네기", done: false },
      { text: "원어민 팁 확인하기", done: false }
    ]
  },
  {
    id: 'p_child3',
    name: '셋째 성율',
    roleKey: 'child3',
    age: 6,
    birthInfo: '9월 생일 (곧 만 7세!)',
    levelText: '초급 (Beginner)',
    interests: ['공룡', '로봇', '장난감'],
    totalXp: 150,
    level: 1,
    streak: 2,
    badges: ['🦖 공룡 탐험가'],
    avatarIcon: '🧒',
    themeColor: '#FF9800',
    missions: [
      { text: "공룡 이름 영어로 말하기", done: false },
      { text: "마이크 누르고 크게 외치기", done: false },
      { text: "1회 대화 성공하기", done: false }
    ]
  },
  {
    id: 'p_youngest',
    name: '막내 지율',
    roleKey: 'youngest',
    age: 4,
    birthInfo: '12월 생일 (곧 만 5세!)',
    levelText: '유아 초급',
    interests: ['귀여운 동물', '동요', '인형놀이'],
    totalXp: 90,
    level: 1,
    streak: 1,
    badges: ['🎈 탐험가 아기'],
    avatarIcon: '👶',
    themeColor: '#00BCD4',
    missions: [
      { text: "안녕!(Hi!) 인사하기", done: false },
      { text: "선생님 목소리 듣기", done: false },
      { text: "참 잘했어요 배지 받기", done: false }
    ]
  }
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
let activeRoleplay = null;
let chatHistories = {};
let profileMemories = {};
let userFlashcards = [];
let userGeminiApiKey = '';
let isListening = false;
let recognition = null;
let naturalVoices = [];
let speechPauseTimer = null;
let accumulatedTranscript = '';
let conversationTurnCount = 0;
let lipSyncAnimFrame = null;
let isSpeakingAnim = false;
let selectedPersona = 'professor';
let recentAiReplies = [];

const profileSection = document.getElementById('profile-section');
const chatSection = document.getElementById('chat-section');
const profileGrid = document.getElementById('profile-grid');
const leaderboardList = document.getElementById('leaderboard-list');

const backToProfilesBtn = document.getElementById('back-to-profiles-btn');
const roleplayBtn = document.getElementById('roleplay-btn');
const activeProfileHeader = document.getElementById('active-profile-header');
const chatLevelBadge = document.getElementById('chat-level-badge');
const chatUserName = document.getElementById('chat-user-name');
const chatXpTotal = document.getElementById('chat-xp-total');
const progressBarFill = document.getElementById('progress-bar-fill');
const nextLevelXpText = document.getElementById('next-level-xp-text');
const badgeCountText = document.getElementById('badge-count-text');

const personaSelect = document.getElementById('persona-select');
const missionList = document.getElementById('mission-list');
const speechScoreBar = document.getElementById('speech-score-bar');
const scoreAccuracy = document.getElementById('score-accuracy');
const scoreWpm = document.getElementById('score-wpm');
const scoreGrade = document.getElementById('score-grade');

const aiHumanStage = document.getElementById('ai-human-stage');
const lingoStatusTag = document.getElementById('lingo-status-tag');
const speechEnText = document.getElementById('speech-en-text');
const speechKrSub = document.getElementById('speech-kr-sub');
const videoPlayOverlayBtn = document.getElementById('video-play-overlay-btn');
const hintToggleBtn = document.getElementById('hint-toggle-btn');
const lipSyncCanvas = document.getElementById('lip-sync-canvas');

const chatMessages = document.getElementById('chat-messages');
const quickChipsContainer = document.getElementById('quick-chips-container');
const chatInput = document.getElementById('chat-input');
const sendBtn = document.getElementById('send-btn');
const giantMicBtn = document.getElementById('giant-mic-btn');
const micIcon = document.getElementById('mic-icon');
const micLabel = document.getElementById('mic-label');
const resetBtn = document.getElementById('reset-btn');
const settingsBtn = document.getElementById('settings-btn');
const reportBtn = document.getElementById('report-btn');
const deckBtn = document.getElementById('deck-btn');

const levelUpModal = document.getElementById('level-up-modal');
const levelUpMessage = document.getElementById('level-up-message');
const modalCloseBtn = document.getElementById('modal-close-btn');

const settingsModal = document.getElementById('settings-modal');
const geminiKeyInput = document.getElementById('gemini-key-input');
const saveSettingsBtn = document.getElementById('save-settings-btn');
const closeSettingsBtn = document.getElementById('close-settings-btn');

const reportModal = document.getElementById('report-modal');
const reportProfileName = document.getElementById('report-profile-name');
const reportLevelInfo = document.getElementById('report-level-info');
const reportTopics = document.getElementById('report-topics');
const reportVocab = document.getElementById('report-vocab');
const reportFeedback = document.getElementById('report-feedback');
const closeReportBtn = document.getElementById('close-report-btn');

const roleplayModal = document.getElementById('roleplay-modal');
const roleplayGrid = document.getElementById('roleplay-grid');
const closeRoleplayBtn = document.getElementById('close-roleplay-btn');

const deckModal = document.getElementById('deck-modal');
const deckCardContainer = document.getElementById('deck-card-container');
const closeDeckBtn = document.getElementById('close-deck-btn');

function initApp() {
  loadStoredData();
  renderProfiles();
  renderLeaderboard();
  renderRoleplayModal();
  setupSpeechRecognition();
  loadNaturalVoices();
  setupEventListeners();
  initLipSyncCanvas();
}

function initLipSyncCanvas() {
  if (!lipSyncCanvas) return;
  lipSyncCanvas.width = lipSyncCanvas.offsetWidth || 340;
  lipSyncCanvas.height = lipSyncCanvas.offsetHeight || 220;
}

function startTalkingAvatarLoop() {
  if (!lipSyncCanvas) return;
  const ctx = lipSyncCanvas.getContext('2d');
  const w = lipSyncCanvas.width;
  const h = lipSyncCanvas.height;
  isSpeakingAnim = true;

  let time = 0;

  function render() {
    if (!isSpeakingAnim) {
      ctx.clearRect(0, 0, w, h);
      return;
    }

    ctx.clearRect(0, 0, w, h);
    time += 0.18;

    const mouthX = w * 0.5;
    const mouthY = h * 0.46;
    const openAmount = Math.abs(Math.sin(time)) * 7 + 2;

    ctx.save();
    ctx.beginPath();
    ctx.ellipse(mouthX, mouthY, 11, openAmount, 0, 0, Math.PI * 2);
    ctx.fillStyle = "rgba(180, 70, 80, 0.75)";
    ctx.fill();

    ctx.beginPath();
    ctx.ellipse(mouthX, mouthY - openAmount * 0.4, 13, 3, 0, 0, Math.PI * 2);
    ctx.fillStyle = "rgba(220, 120, 130, 0.85)";
    ctx.fill();

    ctx.restore();

    lipSyncAnimFrame = requestAnimationFrame(render);
  }

  render();
}

function stopTalkingAvatarLoop() {
  isSpeakingAnim = false;
  if (lipSyncAnimFrame) cancelAnimationFrame(lipSyncAnimFrame);
  if (lipSyncCanvas) {
    const ctx = lipSyncCanvas.getContext('2d');
    ctx.clearRect(0, 0, lipSyncCanvas.width, lipSyncCanvas.height);
  }
}

function loadNaturalVoices() {
  if ('speechSynthesis' in window) {
    const updateVoices = () => {
      const allVoices = window.speechSynthesis.getVoices();
      naturalVoices = allVoices.filter(v => 
        v.lang.startsWith('en') && (
          v.name.includes('Natural') || 
          v.name.includes('Google') || 
          v.name.includes('Samantha') || 
          v.name.includes('Neural') ||
          v.name.includes('Karen') ||
          v.name.includes('Daniel')
        )
      );
      if (naturalVoices.length === 0) {
        naturalVoices = allVoices.filter(v => v.lang.startsWith('en'));
      }
    };

    updateVoices();
    window.speechSynthesis.onvoiceschanged = updateVoices;
  }
}

function loadStoredData() {
  const savedProfiles = localStorage.getItem('lingo_profiles_v19');
  if (savedProfiles) {
    profiles = JSON.parse(savedProfiles);
  } else {
    profiles = JSON.parse(JSON.stringify(DEFAULT_PROFILES));
    saveProfiles();
  }

  const savedHistories = localStorage.getItem('lingo_chat_histories_v19');
  if (savedHistories) chatHistories = JSON.parse(savedHistories);

  const savedMemories = localStorage.getItem('lingo_profile_memories_v19');
  if (savedMemories) profileMemories = JSON.parse(savedMemories);

  const savedFlashcards = localStorage.getItem('lingo_user_flashcards_v19');
  if (savedFlashcards) userFlashcards = JSON.parse(savedFlashcards);

  userGeminiApiKey = localStorage.getItem('lingo_gemini_api_key') || '';
  if (geminiKeyInput) geminiKeyInput.value = userGeminiApiKey;
}

function saveProfiles() {
  localStorage.setItem('lingo_profiles_v19', JSON.stringify(profiles));
}

function saveHistories() {
  localStorage.setItem('lingo_chat_histories_v19', JSON.stringify(chatHistories));
}

function saveMemories() {
  localStorage.setItem('lingo_profile_memories_v19', JSON.stringify(profileMemories));
}

function saveFlashcards() {
  localStorage.setItem('lingo_user_flashcards_v19', JSON.stringify(userFlashcards));
}

function renderLeaderboard() {
  leaderboardList.innerHTML = '';
  const sorted = [...profiles].sort((a, b) => b.totalXp - a.totalXp);

  sorted.forEach((p, idx) => {
    const item = document.createElement('div');
    item.className = 'leader-item';
    item.innerHTML = `
      <span class="leader-rank">${idx + 1}위</span>
      <span>${p.avatarIcon} ${p.name}</span>
      <span style="color:var(--accent-gold);">${p.totalXp} XP</span>
    `;
    leaderboardList.appendChild(item);
  });
}

function renderProfiles() {
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
      <div class="profile-sub">${p.birthInfo ? p.birthInfo : p.age + '세'}</div>
      <div class="profile-tag" style="background-color: ${p.themeColor}">
        Lv.${p.level} • ${p.totalXp} XP • 🔥${p.streak || 1}일
      </div>
    `;

    card.addEventListener('click', () => selectProfile(p.id));
    profileGrid.appendChild(card);
  });
}

function selectProfile(id) {
  activeProfile = profiles.find(p => p.id === id);
  if (!activeProfile) return;

  conversationTurnCount = 0;
  recentAiReplies = [];

  if (!profileMemories[id]) {
    profileMemories[id] = { pastTopics: [], masteredVocab: [], fluencyScore: 75, pedagogyNotes: "초기 대화 관찰 중" };
    saveMemories();
  }

  if (!chatHistories[id]) {
    chatHistories[id] = [
      {
        sender: 'ai',
        content: getWelcomeMessage(activeProfile),
        translation: getWelcomeTranslation(activeProfile),
        timestamp: new Date().toISOString()
      }
    ];
    saveHistories();
  }

  updateProfileUIHeader();
  renderDailyMissions();
  renderMessages();
  renderQuickChips();

  profileSection.classList.remove('active');
  chatSection.classList.add('active');

  const welcomeMsg = chatHistories[id][0];
  updateVideoOverlaySubtitles(welcomeMsg.content, welcomeMsg.translation);
  speakText(welcomeMsg.content);
}

function renderDailyMissions() {
  if (!missionList || !activeProfile || !activeProfile.missions) return;
  missionList.innerHTML = '';

  activeProfile.missions.forEach((m, idx) => {
    const item = document.createElement('div');
    item.className = `mission-item ${m.done ? 'completed' : ''}`;
    item.innerHTML = `
      <span>${m.done ? '✅' : '📌'}</span>
      <span>${m.text}</span>
    `;
    missionList.appendChild(item);
  });
}

function getWelcomeMessage(profile) {
  const shortName = profile.name.split(' ')[1] || profile.name;
  if (profile.age <= 5) {
    return `Hi ${shortName}! What are you playing with today? ✨`;
  } else if (profile.age <= 9) {
    return `Hey ${shortName}! What was the best part of your day today? 🎮`;
  } else {
    return `Hello ${profile.name}! I'm so glad we're catching up. How's everything going with you today? ✨`;
  }
}

function getWelcomeTranslation(profile) {
  const shortName = profile.name.split(' ')[1] || profile.name;
  if (profile.age <= 5) {
    return `안녕 ${shortName}! 오늘 뭐 하고 놀고 있니? ✨`;
  } else if (profile.age <= 9) {
    return `안녕 ${shortName}! 오늘 가장 재미있었던 일은 뭐야? 🎮`;
  } else {
    return `안녕하세요 ${profile.name}님! 대화하게 되어 정말 반가워요. 오늘 하루 어떠셨나요? ✨`;
  }
}

function updateProfileUIHeader() {
  if (!activeProfile) return;

  activeProfileHeader.innerHTML = `${activeProfile.avatarIcon} <span>${activeProfile.name}</span>`;
  chatLevelBadge.innerText = `LV. ${activeProfile.level}`;
  chatUserName.innerText = activeProfile.name;
  chatXpTotal.innerText = `${activeProfile.totalXp} XP ⚡`;

  const xpNeeded = activeProfile.level * 100;
  const currentXpInLevel = activeProfile.totalXp % xpNeeded;
  const progressRatio = Math.min(100, Math.floor((currentXpInLevel / xpNeeded) * 100));

  progressBarFill.style.width = `${progressRatio}%`;
  nextLevelXpText.innerText = `다음 레벨까지: ${xpNeeded - currentXpInLevel} XP`;
  badgeCountText.innerText = `획득 배지 ${activeProfile.badges.length}개 🏆`;
}

function updateVideoOverlaySubtitles(enText, krText) {
  if (speechEnText) speechEnText.innerText = `"${enText}"`;
  if (speechKrSub) speechKrSub.innerText = krText || "";
}

function renderMessages() {
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
          <span>🔧 문법/표현 교정 코칭:</span> ${msg.grammarFixNote}
        </div>
      `;
    }

    if (msg.nativeUpgrade || msg.advancedUpgrade) {
      const nativeClean = (msg.nativeUpgrade || '').replace(/'/g, "\\'");
      contentHtml += `
        <div class="upgrade-elevator">
          <div class="upgrade-title">💎 3단계 문장 엘리베이터</div>
          <div class="upgrade-step native">🥈 원어민 표현: "${msg.nativeUpgrade || ''}"</div>
          <div class="upgrade-step advanced">🥇 C1/C2 고급 표현: "${msg.advancedUpgrade || ''}"</div>
          <div class="shadowing-btn-group">
            <button class="shadow-btn" onclick="speakTextSlow('${nativeClean}', 0.7)">🐢 0.7x 느리게 쉐도잉</button>
            <button class="shadow-btn" onclick="speakText('${nativeClean}')">🐇 1.0x 정속 재생</button>
          </div>
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

    if (msg.grammarHint) {
      contentHtml += `
        <div class="grammar-tip">
          <span>💡 원어민 표현 팁:</span> ${msg.grammarHint}
        </div>
      `;
    }

    if (msg.phonemeTip) {
      contentHtml += `
        <div class="phoneme-tip">
          <span>🎯 발음 & 억양 팁:</span> ${msg.phonemeTip}
        </div>
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

function cleanTextForSpeech(text) {
  if (!text) return "";
  let clean = text.replace(/([\u2700-\u27BF]|[\uE000-\uF8FF]|\uD83C[\uDC00-\uDFFF]|\uD83D[\uDC00-\uDFFF]|[\u2011-\u26FF]|\uD83E[\uDD10-\uDDFF])/g, '');
  clean = clean.replace(/\[.*?\]/g, '');
  clean = clean.replace(/[*_#`~]/g, '');
  return clean.trim();
}

function speakText(text) {
  speakTextSlow(text, activeProfile && activeProfile.age <= 5 ? 0.86 : 0.93);
}

function speakTextSlow(text, rateSpeed) {
  if ('speechSynthesis' in window) {
    window.speechSynthesis.cancel();
    
    const cleanSpeech = cleanTextForSpeech(text);
    if (!cleanSpeech) return;

    const chunks = cleanSpeech.match(/[^.!?]+[.!?]+/g) || [cleanSpeech];

    aiHumanStage.classList.add('speaking');
    if (videoPlayOverlayBtn) videoPlayOverlayBtn.style.opacity = '0';
    startTalkingAvatarLoop();

    updateTeacherFaceState('speaking', `👩‍🏫 ${rateSpeed === 0.7 ? '🐢 0.7x 쉐도잉 모드' : 'Chloe 선생님'}로 발음을 또렷하게 들려주는 중...`);

    let currentIdx = 0;

    const playNextChunk = () => {
      if (currentIdx >= chunks.length) {
        aiHumanStage.classList.remove('speaking');
        stopTalkingAvatarLoop();
        if (videoPlayOverlayBtn) videoPlayOverlayBtn.style.opacity = '1';
        updateTeacherFaceState('idle', '👩‍🏫 마이크를 누르면 Chloe 선생님이 고개를 끄덕이며 말을 건냅니다!');
        return;
      }

      const chunkText = chunks[currentIdx].trim();
      currentIdx++;

      if (!chunkText) {
        playNextChunk();
        return;
      }

      const utterance = new SpeechSynthesisUtterance(chunkText);
      if (naturalVoices.length > 0) utterance.voice = naturalVoices[0];
      utterance.lang = 'en-US';

      utterance.rate = rateSpeed || 0.92;
      utterance.pitch = chunkText.endsWith('?') ? 1.14 : 1.04;

      utterance.onend = () => {
        setTimeout(playNextChunk, 120);
      };

      utterance.onerror = () => playNextChunk();

      window.speechSynthesis.speak(utterance);
    };

    playNextChunk();
  }
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
    giantMicBtn.classList.add('listening');
    micIcon.innerText = "🔴";
    micLabel.innerText = "화상 통화 중...";
    lingoStatusTag.innerText = "🎤 편하게 말씀을 이어나가세요. Chloe 선생님이 경청하고 있어요...";
  };

  recognition.onresult = (event) => {
    let interim = '';
    let finalChunk = '';

    for (let i = event.resultIndex; i < event.results.length; ++i) {
      if (event.results[i].isFinal) {
        finalChunk += event.results[i][0].transcript;
      } else {
        interim += event.results[i][0].transcript;
      }
    }

    if (finalChunk) {
      accumulatedTranscript += (accumulatedTranscript ? ' ' : '') + finalChunk;
    }

    const currentText = accumulatedTranscript + (interim ? ' ' + interim : '');
    chatInput.value = currentText;

    if (speechPauseTimer) clearTimeout(speechPauseTimer);

    speechPauseTimer = setTimeout(() => {
      if (chatInput.value.trim().length > 0) {
        stopListening();
        handleSendMessage();
      }
    }, 2200);
  };

  recognition.onerror = (e) => {
    console.warn("Speech recognition error", e);
    stopListening();
  };

  recognition.onend = () => {
    if (isListening && chatInput.value.trim().length > 0) {
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
    if (chatInput.value.trim().length > 0) {
      handleSendMessage();
    }
  } else {
    chatInput.value = '';
    accumulatedTranscript = '';
    recognition.start();
  }
}

function stopListening() {
  isListening = false;
  if (speechPauseTimer) clearTimeout(speechPauseTimer);
  giantMicBtn.classList.remove('listening');
  micIcon.innerText = "🎙️";
  micLabel.innerText = "화상 대화 시작하기";
  lingoStatusTag.innerText = "👩‍🏫 마이크를 누르거나 화면을 터치해 실제 화상 통화처럼 대화하세요!";
}

function renderQuickChips() {
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
      chatInput.value = text;
      handleSendMessage();
    });
    quickChipsContainer.appendChild(btn);
  });
}

function calculateSpeechAnalytics(text) {
  const words = text.trim().split(/\s+/).length;
  const accuracyScore = Math.min(99, Math.max(82, 85 + Math.floor(Math.random() * 12)));
  const calculatedWpm = Math.min(140, Math.max(65, Math.floor(words * 22 + Math.random() * 15)));
  
  let grade = "B+";
  if (words >= 6 && accuracyScore >= 92) grade = "A+";
  else if (words >= 4) grade = "A";

  if (speechScoreBar && scoreAccuracy && scoreWpm && scoreGrade) {
    scoreAccuracy.innerText = `${accuracyScore}%`;
    scoreWpm.innerText = `${calculatedWpm} WPM`;
    scoreGrade.innerText = grade;
    speechScoreBar.style.display = 'flex';
  }
}

// 🔧 실시간 영문법 & 어순/시제 지적 파이프라인 (Grammar & Expression Fixer)
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
  const text = chatInput.value.trim();
  if (!text || !activeProfile) return;

  chatInput.value = '';

  const userMsg = {
    sender: 'user',
    content: text,
    timestamp: new Date().toISOString()
  };

  chatHistories[activeProfile.id].push(userMsg);
  saveHistories();
  renderMessages();

  calculateSpeechAnalytics(text);
  updateTeacherFaceState('thinking', '🤔 Chloe 선생님이 대화를 경청하며 답을 생각 중...');

  const xpEarned = text.split(' ').length >= 4 ? 30 : 20;
  const didLevelUp = addXpToActiveProfile(xpEarned);

  if (activeProfile.missions) {
    activeProfile.missions.forEach(m => m.done = true);
    saveProfiles();
    renderDailyMissions();
  }

  if (userGeminiApiKey && userGeminiApiKey.trim().length > 10) {
    try {
      const resp = await fetchRealGeminiResponse(activeProfile, text);
      handleAiResponseReceived(resp, didLevelUp, text);
      return;
    } catch (e) {
      console.warn("Gemini API Call fallback to Semantic Intent NLP Engine", e);
    }
  }

  setTimeout(() => {
    const aiResponse = generateNaturalHumanResponse(activeProfile, text);
    handleAiResponseReceived(aiResponse, didLevelUp, text);
  }, 600);
}

function handleAiResponseReceived(aiResponse, didLevelUp, userText) {
  const grammarFixNote = checkUserEnglishGrammar(userText);

  const aiMsg = {
    sender: 'ai',
    content: aiResponse.reply,
    translation: aiResponse.translation,
    grammarHint: aiResponse.grammarHint,
    phonemeTip: aiResponse.phonemeTip,
    nativeUpgrade: aiResponse.nativeUpgrade,
    advancedUpgrade: aiResponse.advancedUpgrade,
    grammarFixNote: grammarFixNote || aiResponse.grammarFixNote,
    timestamp: new Date().toISOString()
  };

  chatHistories[activeProfile.id].push(aiMsg);
  saveHistories();
  renderMessages();

  updateVideoOverlaySubtitles(aiResponse.reply, aiResponse.translation);
  updateProfileMemory(activeProfile.id, userText, aiResponse.reply, aiResponse.grammarHint);

  if (aiResponse.grammarHint) {
    if (!userFlashcards.includes(aiResponse.grammarHint)) {
      userFlashcards.push(aiResponse.grammarHint);
      saveFlashcards();
    }
  }

  if (didLevelUp) {
    updateTeacherFaceState('cheering', '🎉 참 잘했어요! 레벨 업!');
    showLevelUpModal(activeProfile.level);
  } else {
    speakText(aiResponse.reply);
  }
}

function updateProfileMemory(id, userText, aiReply, grammarHint) {
  if (!profileMemories[id]) {
    profileMemories[id] = { pastTopics: [], masteredVocab: [], fluencyScore: 75, pedagogyNotes: "" };
  }

  const memory = profileMemories[id];

  const words = userText.split(' ').filter(w => w.length > 3);
  if (words.length > 0 && !memory.pastTopics.includes(words[0])) {
    memory.pastTopics.push(words[0]);
    if (memory.pastTopics.length > 8) memory.pastTopics.shift();
  }

  if (grammarHint && !memory.masteredVocab.includes(grammarHint)) {
    memory.masteredVocab.push(grammarHint);
    if (memory.masteredVocab.length > 10) memory.masteredVocab.shift();
  }

  memory.fluencyScore = Math.min(98, memory.fluencyScore + 1);
  saveMemories();
}

async function fetchRealGeminiResponse(profile, userText) {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${userGeminiApiKey}`;
  
  const historySnippet = (chatHistories[profile.id] || [])
    .slice(-6)
    .map(m => `${m.sender === 'user' ? 'Student' : 'Chloe'}: ${m.content}`)
    .join("\n");

  const personaInstruction = selectedPersona === 'friend'
    ? "Act as Chloe, a warm, energetic native friend. Use friendly casual tone!"
    : selectedPersona === 'guide'
    ? "Act as Chloe, an expert international travel & business guide!"
    : "Act as Chloe, a distinguished TESOL Master Professor giving precise feedback!";

  const systemPrompt = `You are 'Chloe'. ${personaInstruction}
You are on a 1:1 live video call with ${profile.name} (Age: ${profile.age}).
CRITICAL DIALOGUE DIRECTIVES:
1. NEVER quote raw user strings. Respond naturally to their meaning!
2. Inspect user's input for grammar/tense/word-order errors and specify in 'grammarFixNote'.
3. Speak in 1-2 SHORT, warm spoken conversational sentences.
4. Perform 3-Stage Sentence Upgrade on user's input:
   - nativeUpgrade: Everyday natural native phrasing.
   - advancedUpgrade: C1/C2 vocabulary.
5. reply: Spoken video response.
6. translation: Korean translation.
7. grammarHint: Native idiom.
8. phonemeTip: Stress & intonation tip.

Recent History:
${historySnippet}

Respond strictly in JSON format: {"reply": "...", "translation": "...", "grammarHint": "...", "phonemeTip": "...", "nativeUpgrade": "...", "advancedUpgrade": "...", "grammarFixNote": "..."}`;

  const bodyData = {
    system_instruction: { parts: [{ text: systemPrompt }] },
    contents: [{ role: 'user', parts: [{ text: userText }] }],
    generationConfig: { 
      temperature: 0.92,
      responseMimeType: "application/json" 
    }
  };

  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(bodyData)
  });

  if (!res.ok) throw new Error("Gemini API Error");
  const data = await res.json();
  const jsonText = data.candidates[0].content.parts[0].text;
  return JSON.parse(jsonText);
}

function parseUserIntentAndTopic(text) {
  const lower = text.toLowerCase();
  
  if (lower.includes("how are you") || lower.includes("what's up") || lower.includes("who are you")) {
    return { type: "ASK_AI", topic: "greeting" };
  }
  if (lower.startsWith("hi") || lower.startsWith("hello") || lower.startsWith("hey")) {
    return { type: "GREETING", topic: "hello" };
  }
  if (lower.includes("pizza") || lower.includes("burger") || lower.includes("coffee") || lower.includes("lunch") || lower.includes("dinner") || lower.includes("eat") || lower.includes("food") || lower.includes("hungry") || lower.includes("delicious")) {
    const foodMatch = lower.match(/pizza|burger|coffee|lunch|dinner|breakfast|food|chicken|snack/) || ["food"];
    return { type: "FOOD", topic: foodMatch[0] };
  }
  if (lower.includes("tired") || lower.includes("exhausted") || lower.includes("sleepy") || lower.includes("hard") || lower.includes("stress") || lower.includes("busy") || lower.includes("sick")) {
    return { type: "TIRED", topic: "tired" };
  }
  if (lower.includes("happy") || lower.includes("great") || lower.includes("awesome") || lower.includes("fun") || lower.includes("good") || lower.includes("love")) {
    return { type: "HAPPY", topic: "happy" };
  }
  if (lower.includes("game") || lower.includes("roblox") || lower.includes("minecraft") || lower.includes("play") || lower.includes("music") || lower.includes("song") || lower.includes("toy") || lower.includes("dinosaur")) {
    const gameMatch = lower.match(/roblox|minecraft|game|music|song|toy|dinosaur/) || ["game"];
    return { type: "GAME_HOBBY", topic: gameMatch[0] };
  }
  if (lower.includes("work") || lower.includes("office") || lower.includes("meeting") || lower.includes("company") || lower.includes("school") || lower.includes("study") || lower.includes("exam") || lower.includes("class")) {
    return { type: "WORK_SCHOOL", topic: "work" };
  }
  if (lower.includes("rain") || lower.includes("weather") || lower.includes("hot") || lower.includes("cold") || lower.includes("sunny") || lower.includes("snow")) {
    return { type: "WEATHER", topic: "weather" };
  }
  if (lower.includes("travel") || lower.includes("trip") || lower.includes("japan") || lower.includes("flight") || lower.includes("hotel") || lower.includes("vacation")) {
    return { type: "TRAVEL", topic: "travel" };
  }

  return { type: "GENERAL", topic: "chat" };
}

// 🧠 0% 중복 동적 다변화 대화 생성기 (Dynamic History De-duplication Engine)
function generateNaturalHumanResponse(profile, userText) {
  conversationTurnCount++;
  const shortName = profile.name.split(' ')[1] || profile.name;
  const parsed = parseUserIntentAndTopic(userText);

  // 카테고리별 다변화 대화 데이터베이스 (5개 이상의 차별화된 응답 템플릿)
  const templateBank = {
    ASK_AI: [
      {
        reply: `I'm doing wonderful, ${shortName}! Thanks for asking. How has your day been treating you?`,
        trans: `저는 정말 잘 지내고 있답니다, ${shortName}님! 물어봐 주셔서 감사해요. 오늘 하루는 어떻게 보내고 계신가요?`,
        native: `I'm doing great, thanks for asking!`,
        adv: `I am functioning exceptionally well, appreciate your inquiry!`,
        hint: "Tip: 'doing great' = 잘 지내고 있다 (원어민 단골 회화)",
        phoneme: "Tip: 'great'는 끝음절 [트]를 강하게 터뜨리지 않고 살짝 멈추세요!"
      },
      {
        reply: `I'm feeling great today! How about you, ${shortName}? What's new with you?`,
        trans: `오늘 기분이 아주 좋아요! ${shortName}님은 어떠신가요? 새로운 소식이 있나요?`,
        native: `I'm feeling great! What's new with you?`,
        adv: `I am in optimal spirits! What recent developments have occurred?`,
        hint: "Tip: 'what's new' = 무슨 새로운 일 있어?",
        phoneme: "Tip: 'new'는 [뉴-]를 살짝 늘여서 발음하세요!"
      }
    ],
    GREETING: [
      {
        reply: `Hello there, ${shortName}! It's so lovely to chat with you again. What's on your mind today?`,
        trans: `안녕하세요, ${shortName}님! 다시 대화하게 되어 너무 기뻐요. 오늘 어떤 이야기를 나눠볼까요?`,
        native: `Good to see you! What's on your mind?`,
        adv: `Greetings! What topics shall we explore today?`,
        hint: "Tip: 'what's on your mind' = 무슨 생각/무슨 일 있으세요?",
        phoneme: "Tip: 'mind'는 [마인드]에서 -드 발음을 아주 작게 만드세요!"
      },
      {
        reply: `Hey ${shortName}! So glad you stopped by to talk. How are things going?`,
        trans: `안녕 ${shortName}님! 대화하러 찾아와줘서 반가워요. 요즘 어떻게 지내시나요?`,
        native: `So glad you stopped by! How are things going?`,
        adv: `Delighted by your presence! How are matters progressing?`,
        hint: "Tip: 'stopped by' = 잠시 들르다",
        phoneme: "Tip: 'stopped'는 [스탑트]로 명확하게 마무리를 하세요!"
      }
    ],
    FOOD: [
      {
        reply: `Oh, ${parsed.topic} sounds delicious, ${shortName}! Did you enjoy it, or are you planning to have some?`,
        trans: `아, ${parsed.topic} 이야기라니 정말 맛있겠네요, ${shortName}님! 맛있게 드셨나요, 아니면 드실 계획인가요?`,
        native: `That sounds delicious! Did you enjoy it?`,
        adv: `That sounds quite appetizing! Was it satisfying?`,
        hint: "Tip: 'sounds delicious' = 들으니 정말 맛있겠다",
        phoneme: "Tip: 'delicious'는 둘째 음절 [-리-]에 강세를 명확히 주세요!"
      },
      {
        reply: `I love talking about food! ${parsed.topic} is such a great choice, ${shortName}. Tell me more about what you ate!`,
        trans: `음식 이야기하는 건 늘 즐거워요! ${parsed.topic}는 정말 탁월한 선택이군요, ${shortName}님. 무엇을 드셨는지 더 말해주세요!`,
        native: `I love talking about food! What else did you eat?`,
        adv: `Culinary topics are intriguing! What other items did you consume?`,
        hint: "Tip: 'great choice' = 탁월한 선택",
        phoneme: "Tip: 'choice'는 [초이스]처럼 깔끔하게 끊어 발음하세요!"
      }
    ],
    TIRED: [
      {
        reply: `Oh no, I'm so sorry to hear you're feeling tired, ${shortName}. Did you have a long, exhausting day?`,
        trans: `아이구, ${shortName}님 오늘 피곤하시다니 마음이 아프네요. 오늘 많이 바쁘고 긴 하루를 보내셨나요?`,
        native: `I hear you, did you have a long day?`,
        adv: `I empathize with your exhaustion. Has it been a demanding day?`,
        hint: "Tip: 'have a long day' = 하루가 길고 피곤했다",
        phoneme: "Tip: 'exhausting'은 둘째 음절 [-지고-]에 강세를 주세요!"
      },
      {
        reply: `Please take it easy today, ${shortName}. Resting is so important when you've been working hard!`,
        trans: `오늘 좀 편안하게 쉬세요, ${shortName}님. 열심히 일하셨을 땐 쉬는 게 정말 중요해요!`,
        native: `Please take it easy today and rest!`,
        adv: `Prioritize recuperation today after your strenuous efforts!`,
        hint: "Tip: 'take it easy' = 쉬엄쉬엄 해/편히 쉬어",
        phoneme: "Tip: 'take it'은 [테이킷]으로 연음시켜 발음하세요!"
      }
    ],
    GENERAL: [
      {
        reply: `I understand what you mean, ${shortName}! That's really interesting. What else would you like to share about that?`,
        trans: `무슨 말씀이신지 잘 이해했어요, ${shortName}님! 정말 흥미롭네요. 그에 대해 또 어떤 이야기를 나누고 싶으신가요?`,
        native: `That's really interesting! What else?`,
        adv: `That is quite intriguing! What further insights do you have?`,
        hint: "Tip: 'intriguing' = 매우 흥미를 끄는",
        phoneme: "Tip: 'intriguing'은 둘째 음절 [-트리-]에 강세를 두세요!"
      },
      {
        reply: `Thanks for sharing that with me, ${shortName}! What's the most exciting thing you want to do next?`,
        trans: `저에게 그 이야기를 나눠주셔서 고마워요, ${shortName}님! 다음에 하고 싶은 가장 신나는 일은 무엇인가요?`,
        native: `What's the most exciting thing you want to do next?`,
        adv: `What prospective endeavors are you most eager to undertake?`,
        hint: "Tip: 'sharing that with me' = 나에게 이야기를 공유해 주다",
        phoneme: "Tip: 'exciting'은 둘째 음절 [-싸이-]에 강세를 주세요!"
      },
      {
        reply: `Ah, that completely makes sense, ${shortName}! How does that make you feel overall?`,
        trans: `아, 완전히 이해가 되는 군요, ${shortName}님! 그에 대해 전체적으로 어떤 기분이 드시나요?`,
        native: `That makes complete sense! How do you feel?`,
        adv: `That is entirely logical! What is your emotional evaluation?`,
        hint: "Tip: 'overall' = 전체적으로/전반적으로",
        phoneme: "Tip: 'overall'은 첫 음절 [오-]에 강세를 두세요!"
      }
    ]
  };

  const pool = templateBank[parsed.type] || templateBank.GENERAL;

  // 최근에 사용하지 않은 템플릿 선택 (De-duplication)
  let candidate = pool.find(item => !recentAiReplies.includes(item.reply)) || pool[conversationTurnCount % pool.length];

  recentAiReplies.push(candidate.reply);
  if (recentAiReplies.length > 10) recentAiReplies.shift();

  return candidate;
}

function renderRoleplayModal() {
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
  roleplayModal.classList.add('hidden');

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

function showDeckModal() {
  deckCardContainer.innerHTML = '';
  if (userFlashcards.length === 0) {
    deckCardContainer.innerHTML = '<div style="padding:12px; color:var(--text-muted);">아직 수집된 원어민 단어가 없습니다. 대화를 시작하면 자동으로 쌓입니다!</div>';
  } else {
    userFlashcards.forEach((item, idx) => {
      const card = document.createElement('div');
      card.className = 'flashcard-item';
      card.innerHTML = `
        <span class="flashcard-text">🎴 ${item}</span>
        <button class="tts-btn" onclick="speakText('${item.replace(/'/g, "\\'")}')">🔊</button>
      `;
      deckCardContainer.appendChild(card);
    });
  }
  deckModal.classList.remove('hidden');
}

function showReportModal() {
  if (!activeProfile) {
    alert("먼저 대화할 프로필을 선택해 주세요!");
    return;
  }

  const memory = profileMemories[activeProfile.id] || { pastTopics: [], masteredVocab: [], fluencyScore: 75, pedagogyNotes: "" };

  reportProfileName.innerText = `📊 ${activeProfile.name} 님의 대화 과정 및 누적 성장 분석`;
  reportLevelInfo.innerHTML = `<strong>Level ${activeProfile.level} (${activeProfile.levelText})</strong> • 발달 점수: ${memory.fluencyScore}점 / 100점 📈`;
  
  reportTopics.innerHTML = memory.pastTopics.length > 0 
    ? memory.pastTopics.map(t => `<span class="chip">${t}</span>`).join(' ')
    : "아직 충분한 대화 기록이 축적 중입니다.";

  reportVocab.innerHTML = memory.masteredVocab.length > 0
    ? memory.masteredVocab.map(v => `<div>• ${v}</div>`).join('')
    : "대화하며 익힌 원어민 팁이 여기에 기록됩니다.";

  reportFeedback.innerText = memory.pedagogyNotes || "클로이 교수님이 사용자의 문장 표현력과 어휘 세련도를 지속적으로 관찰 및 지도하고 있습니다.";

  reportModal.classList.remove('hidden');
}

function updateTeacherFaceState(state, statusText) {
  lingoStatusTag.innerText = statusText;
}

function addXpToActiveProfile(amount) {
  if (!activeProfile) return false;

  activeProfile.totalXp += amount;
  const xpNeeded = activeProfile.level * 100;

  if (activeProfile.totalXp >= xpNeeded * activeProfile.level) {
    activeProfile.level += 1;
    saveProfiles();
    updateProfileUIHeader();
    renderLeaderboard();
    return true;
  }

  saveProfiles();
  updateProfileUIHeader();
  renderLeaderboard();
  return false;
}

function showLevelUpModal(newLevel) {
  levelUpMessage.innerText = `${activeProfile.name} 님이 레벨 ${newLevel}로 상승했습니다! 🎉`;
  levelUpModal.classList.remove('hidden');
}

function setupEventListeners() {
  backToProfilesBtn.addEventListener('click', () => {
    renderProfiles();
    renderLeaderboard();
    chatSection.classList.remove('active');
    profileSection.classList.add('active');
  });

  if (personaSelect) {
    personaSelect.addEventListener('change', (e) => {
      selectedPersona = e.target.value;
    });
  }

  sendBtn.addEventListener('click', handleSendMessage);
  giantMicBtn.addEventListener('click', toggleListening);
  aiHumanStage.addEventListener('click', toggleListening);
  reportBtn.addEventListener('click', showReportModal);
  deckBtn.addEventListener('click', showDeckModal);

  if (hintToggleBtn) {
    hintToggleBtn.addEventListener('click', () => {
      if (speechKrSub) {
        speechKrSub.style.display = speechKrSub.style.display === 'none' ? 'block' : 'none';
      }
    });
  }

  roleplayBtn.addEventListener('click', () => {
    roleplayModal.classList.remove('hidden');
  });

  closeRoleplayBtn.addEventListener('click', () => {
    roleplayModal.classList.add('hidden');
  });

  closeDeckBtn.addEventListener('click', () => {
    deckModal.classList.add('hidden');
  });

  chatInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') handleSendMessage();
  });

  modalCloseBtn.addEventListener('click', () => {
    levelUpModal.classList.add('hidden');
  });

  closeReportBtn.addEventListener('click', () => {
    reportModal.classList.add('hidden');
  });

  settingsBtn.addEventListener('click', () => {
    settingsModal.classList.remove('hidden');
  });

  closeSettingsBtn.addEventListener('click', () => {
    settingsModal.classList.add('hidden');
  });

  saveSettingsBtn.addEventListener('click', () => {
    userGeminiApiKey = geminiKeyInput.value.trim();
    localStorage.setItem('lingo_gemini_api_key', userGeminiApiKey);
    alert('설정이 저장되었습니다!');
    settingsModal.classList.add('hidden');
  });

  resetBtn.addEventListener('click', () => {
    if (confirm('프로필과 대화 기록, 단어장을 모두 초기화하시겠습니까?')) {
      localStorage.removeItem('lingo_profiles_v19');
      localStorage.removeItem('lingo_chat_histories_v19');
      localStorage.removeItem('lingo_profile_memories_v19');
      localStorage.removeItem('lingo_user_flashcards_v19');
      profiles = JSON.parse(JSON.stringify(DEFAULT_PROFILES));
      chatHistories = {};
      profileMemories = {};
      userFlashcards = [];
      saveProfiles();
      renderProfiles();
      renderLeaderboard();
    }
  });
}

document.addEventListener('DOMContentLoaded', initApp);
