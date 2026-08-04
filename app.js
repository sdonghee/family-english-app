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

const aiHumanStage = document.getElementById('ai-human-stage');
const teacherMouth = document.getElementById('teacher-mouth');
const lingoStatusTag = document.getElementById('lingo-status-tag');

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
  const savedProfiles = localStorage.getItem('lingo_profiles_v10');
  if (savedProfiles) {
    profiles = JSON.parse(savedProfiles);
  } else {
    profiles = JSON.parse(JSON.stringify(DEFAULT_PROFILES));
    saveProfiles();
  }

  const savedHistories = localStorage.getItem('lingo_chat_histories_v10');
  if (savedHistories) chatHistories = JSON.parse(savedHistories);

  const savedMemories = localStorage.getItem('lingo_profile_memories_v10');
  if (savedMemories) profileMemories = JSON.parse(savedMemories);

  const savedFlashcards = localStorage.getItem('lingo_user_flashcards_v10');
  if (savedFlashcards) userFlashcards = JSON.parse(savedFlashcards);

  userGeminiApiKey = localStorage.getItem('lingo_gemini_api_key') || '';
  if (geminiKeyInput) geminiKeyInput.value = userGeminiApiKey;
}

function saveProfiles() {
  localStorage.setItem('lingo_profiles_v10', JSON.stringify(profiles));
}

function saveHistories() {
  localStorage.setItem('lingo_chat_histories_v10', JSON.stringify(chatHistories));
}

function saveMemories() {
  localStorage.setItem('lingo_profile_memories_v10', JSON.stringify(profileMemories));
}

function saveFlashcards() {
  localStorage.setItem('lingo_user_flashcards_v10', JSON.stringify(userFlashcards));
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
  renderMessages();
  renderQuickChips();

  profileSection.classList.remove('active');
  chatSection.classList.add('active');

  speakText(chatHistories[id][0].content);
}

function getWelcomeMessage(profile) {
  const shortName = profile.name.split(' ')[1] || profile.name;
  return `Hello ${profile.name}! I'm Professor Chloe. 3-Stage Sentence Upgrade & Live Roleplay features are now active. What topic or roleplay shall we begin with today? ✨`;
}

function getWelcomeTranslation(profile) {
  return `안녕하세요 ${profile.name}님! 클로이 교수입니다. 3단계 문장 엘리베이터 교정 및 실전 롤플레이 모드가 가동되었습니다. 어떤 자유 대화나 역할극을 시작해 볼까요? ✨`;
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

    if (msg.nativeUpgrade || msg.advancedUpgrade) {
      contentHtml += `
        <div class="upgrade-elevator">
          <div class="upgrade-title">💎 3단계 문장 엘리베이터</div>
          <div class="upgrade-step native">🥈 원어민 표현: "${msg.nativeUpgrade || ''}"</div>
          <div class="upgrade-step advanced">🥇 C1/C2 고급 표현: "${msg.advancedUpgrade || ''}"</div>
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

function speakText(text) {
  if ('speechSynthesis' in window) {
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(text);
    
    if (naturalVoices.length > 0) {
      utterance.voice = naturalVoices[0];
    }
    utterance.lang = 'en-US';
    utterance.pitch = 1.02;
    utterance.rate = activeProfile && activeProfile.age <= 5 ? 0.85 : 0.92;

    utterance.onstart = () => {
      updateTeacherFaceState('speaking', '👩‍🏫 클로이 교수님이 원어민 발음과 뉘앙스로 대화 중...');
    };

    utterance.onend = () => {
      updateTeacherFaceState('idle', '👩‍🏫 아래 마이크를 누르거나 선생님을 터치해 여유있게 말씀하세요!');
    };

    window.speechSynthesis.speak(utterance);
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
    micLabel.innerText = "음성 듣는 중...";
    lingoStatusTag.innerText = "🎤 편하게 말씀을 이어나가세요. 클로이 교수님이 여유있게 들으며 기다리고 있어요...";
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
  micLabel.innerText = "눌러서 말하기";
  lingoStatusTag.innerText = "👩‍🏫 아래 마이크를 누르거나 선생님을 터치해 여유있게 말씀하세요!";
}

function renderQuickChips() {
  quickChipsContainer.innerHTML = '';
  if (!activeProfile) return;

  let chips = [];
  if (activeProfile.age <= 5) {
    chips = ["I played with toys today!", "I ate delicious lunch!", "Can you tell me a funny story?"];
  } else if (activeProfile.age <= 7) {
    chips = ["I love exploring dinosaurs!", "I played a fun game at school!", "Can you teach me a new word?"];
  } else if (activeProfile.age <= 9) {
    chips = ["I finished my school project!", "I love listening to music!", "Let's talk about travel!"];
  } else {
    chips = ["What is your opinion on social psychology?", "How can I elevate my vocabulary naturally?", "Let's discuss global culture and travel."];
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

  updateTeacherFaceState('thinking', '🤔 3단계 문장 엘리베이터 및 발음 피드백 생성 중...');

  const xpEarned = text.split(' ').length >= 4 ? 30 : 20;
  const didLevelUp = addXpToActiveProfile(xpEarned);

  if (userGeminiApiKey && userGeminiApiKey.trim().length > 10) {
    try {
      const resp = await fetchRealGeminiResponse(activeProfile, text);
      handleAiResponseReceived(resp, didLevelUp, text);
      return;
    } catch (e) {
      console.warn("Gemini API Call fallback to Pro Engine", e);
    }
  }

  setTimeout(() => {
    const aiResponse = generateProEngineResponse(activeProfile, text);
    handleAiResponseReceived(aiResponse, didLevelUp, text);
  }, 900);
}

function handleAiResponseReceived(aiResponse, didLevelUp, userText) {
  const aiMsg = {
    sender: 'ai',
    content: aiResponse.reply,
    translation: aiResponse.translation,
    grammarHint: aiResponse.grammarHint,
    phonemeTip: aiResponse.phonemeTip,
    nativeUpgrade: aiResponse.nativeUpgrade,
    advancedUpgrade: aiResponse.advancedUpgrade,
    timestamp: new Date().toISOString()
  };

  chatHistories[activeProfile.id].push(aiMsg);
  saveHistories();
  renderMessages();

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
  const memory = profileMemories[profile.id] || { pastTopics: [], masteredVocab: [] };

  const systemPrompt = `You are 'Professor Chloe', a world-class TESOL Master Pedagogy Specialist & Polymath Scholar.
Perform 3-Stage Sentence Upgrade on user's sentence "${userText}":
1. nativeUpgrade: Natural everyday native sentence.
2. advancedUpgrade: Sophisticated C1/C2 academic/business phrasing.
3. reply: Engaging, charming response answering their thought.
4. translation: Korean translation of reply.
5. grammarHint: Key idiom or collocation learned.
6. phonemeTip: Pronunciation and word stress advice.

Respond strictly in JSON format: {"reply": "...", "translation": "...", "grammarHint": "...", "phonemeTip": "...", "nativeUpgrade": "...", "advancedUpgrade": "..."}`;

  const bodyData = {
    system_instruction: { parts: [{ text: systemPrompt }] },
    contents: [{ role: 'user', parts: [{ text: userText }] }],
    generationConfig: { 
      temperature: 0.88,
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

function generateProEngineResponse(profile, userText) {
  const clean = userText.trim();
  const shortName = profile.name.split(' ')[1] || profile.name;

  return {
    reply: `That is a wonderful perspective, ${shortName}! You said: "${clean}". I loved how clearly you expressed that! ✨`,
    translation: `정말 멋진 관점입니다, ${shortName}님! "${clean}"라고 말씀해 주셨는데, 생각을 또렷하게 표현해 주셔서 정말 좋습니다! ✨`,
    nativeUpgrade: `I was thinking about ${clean} recently.`,
    advancedUpgrade: `I have been contemplating the implications of ${clean} in depth.`,
    grammarHint: "Tip: 'contemplate in depth' = 심도 있게 숙고하다",
    phonemeTip: "Tip: 'contemplate'는 첫 음절 [콘-]에 힘주어 발음하세요!"
  };
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
    content: `[🎭 롤플레이 시작: ${scenario.title}] Hello! I am your partner for this scenario. Let's begin! 🚀`,
    translation: `[🎭 롤플레이 시작: ${scenario.title}] 안녕하세요! 이번 역할극의 상대방입니다. 자, 시작해 볼까요? 🚀`,
    timestamp: new Date().toISOString()
  };

  chatHistories[activeProfile.id].push(startMsg);
  saveHistories();
  renderMessages();
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
  teacherMouth.className = `teacher-mouth ${state}`;
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

  sendBtn.addEventListener('click', handleSendMessage);
  giantMicBtn.addEventListener('click', toggleListening);
  aiHumanStage.addEventListener('click', toggleListening);
  reportBtn.addEventListener('click', showReportModal);
  deckBtn.addEventListener('click', showDeckModal);

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
      localStorage.removeItem('lingo_profiles_v10');
      localStorage.removeItem('lingo_chat_histories_v10');
      localStorage.removeItem('lingo_profile_memories_v10');
      localStorage.removeItem('lingo_user_flashcards_v10');
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
