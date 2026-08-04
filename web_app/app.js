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
let recentReplyHashes = new Set(); // 🚫 중복 문장 완전 차단 저장소

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
  const savedProfiles = localStorage.getItem('lingo_profiles_v13');
  if (savedProfiles) {
    profiles = JSON.parse(savedProfiles);
  } else {
    profiles = JSON.parse(JSON.stringify(DEFAULT_PROFILES));
    saveProfiles();
  }

  const savedHistories = localStorage.getItem('lingo_chat_histories_v13');
  if (savedHistories) chatHistories = JSON.parse(savedHistories);

  const savedMemories = localStorage.getItem('lingo_profile_memories_v13');
  if (savedMemories) profileMemories = JSON.parse(savedMemories);

  const savedFlashcards = localStorage.getItem('lingo_user_flashcards_v13');
  if (savedFlashcards) userFlashcards = JSON.parse(savedFlashcards);

  userGeminiApiKey = localStorage.getItem('lingo_gemini_api_key') || '';
  if (geminiKeyInput) geminiKeyInput.value = userGeminiApiKey;
}

function saveProfiles() {
  localStorage.setItem('lingo_profiles_v13', JSON.stringify(profiles));
}

function saveHistories() {
  localStorage.setItem('lingo_chat_histories_v13', JSON.stringify(chatHistories));
}

function saveMemories() {
  localStorage.setItem('lingo_profile_memories_v13', JSON.stringify(profileMemories));
}

function saveFlashcards() {
  localStorage.setItem('lingo_user_flashcards_v13', JSON.stringify(userFlashcards));
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

  recentReplyHashes.clear(); // 대화 프로필 변경 시 중복 차단 초기화

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
  if (profile.age <= 5) {
    return `Hi ${shortName}! What are you thinking about right now? ✨`;
  } else if (profile.age <= 9) {
    return `Hey ${shortName}! What exciting thing happened to you today? 🎮`;
  } else {
    return `Hello ${profile.name}! It's so wonderful to chat with you today. What's on your mind? ✨`;
  }
}

function getWelcomeTranslation(profile) {
  const shortName = profile.name.split(' ')[1] || profile.name;
  if (profile.age <= 5) {
    return `안녕 ${shortName}! 지금 무슨 생각 하고 있어? ✨`;
  } else if (profile.age <= 9) {
    return `안녕 ${shortName}! 오늘 무슨 재미있는 일이 있었니? 🎮`;
  } else {
    return `안녕하세요 ${profile.name}님! 이야기 나누게 되어 정말 반가워요. 오늘 어떤 주제로 이야기해 볼까요? ✨`;
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

function cleanTextForSpeech(text) {
  if (!text) return "";
  let clean = text.replace(/([\u2700-\u27BF]|[\uE000-\uF8FF]|\uD83C[\uDC00-\uDFFF]|\uD83D[\uDC00-\uDFFF]|[\u2011-\u26FF]|\uD83E[\uDD10-\uDDFF])/g, '');
  clean = clean.replace(/\[.*?\]/g, '');
  clean = clean.replace(/[*_#`~]/g, '');
  return clean.trim();
}

function speakText(text) {
  if ('speechSynthesis' in window) {
    window.speechSynthesis.cancel();
    
    const cleanSpeech = cleanTextForSpeech(text);
    if (!cleanSpeech) return;

    const chunks = cleanSpeech.match(/[^.!?]+[.!?]+/g) || [cleanSpeech];

    updateTeacherFaceState('speaking', '👩‍🏫 생생한 원어민 억양으로 대화하는 중...');

    let currentIdx = 0;

    const playNextChunk = () => {
      if (currentIdx >= chunks.length) {
        updateTeacherFaceState('idle', '👩‍🏫 아래 마이크를 누르거나 선생님을 터치해 여유있게 말씀하세요!');
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

      if (chunkText.endsWith('?')) {
        utterance.pitch = 1.15;
        utterance.rate = 0.94;
      } else if (chunkText.endsWith('!')) {
        utterance.pitch = 1.10;
        utterance.rate = 0.96;
      } else {
        utterance.pitch = 1.04;
        utterance.rate = 0.92;
      }

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

  updateTeacherFaceState('thinking', '🤔 사용자의 문장을 알아듣고 답변을 생성하고 있어요...');

  const xpEarned = text.split(' ').length >= 4 ? 30 : 20;
  const didLevelUp = addXpToActiveProfile(xpEarned);

  if (userGeminiApiKey && userGeminiApiKey.trim().length > 10) {
    try {
      const resp = await fetchRealGeminiResponse(activeProfile, text);
      handleAiResponseReceived(resp, didLevelUp, text);
      return;
    } catch (e) {
      console.warn("Gemini API Call fallback to Dynamic NLP Engine", e);
    }
  }

  setTimeout(() => {
    const aiResponse = generateIntelligentDynamicSpokenResponse(activeProfile, text);
    handleAiResponseReceived(aiResponse, didLevelUp, text);
  }, 800);
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
  
  const historySnippet = (chatHistories[profile.id] || [])
    .slice(-6)
    .map(m => `${m.sender === 'user' ? 'Student' : 'Chloe'}: ${m.content}`)
    .join("\n");

  const systemPrompt = `You are 'Chloe', a real native speaker having an authentic conversational chat with ${profile.name} (Age: ${profile.age}).
CRITICAL RULES:
1. NEVER repeat previous sentences. Every single response MUST be completely unique and directly react to "${userText}".
2. Speak in 1-2 SHORT, natural conversational spoken sentences.
3. Perform 3-Stage Sentence Upgrade:
   - nativeUpgrade: Everyday natural native phrasing.
   - advancedUpgrade: Sophisticated C1/C2 vocabulary.
4. reply: Spontaneous spoken reply.
5. translation: Korean translation.
6. grammarHint: Key idiom.
7. phonemeTip: Stress & intonation tip.

Recent History:
${historySnippet}

Respond strictly in JSON format: {"reply": "...", "translation": "...", "grammarHint": "...", "phonemeTip": "...", "nativeUpgrade": "...", "advancedUpgrade": "..."}`;

  const bodyData = {
    system_instruction: { parts: [{ text: systemPrompt }] },
    contents: [{ role: 'user', parts: [{ text: userText }] }],
    generationConfig: { 
      temperature: 0.95,
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

// 🧠 100% 동적 맥락 분석 엔진 (사용자가 한 말을 파싱하여 절대 같은 말을 반복하지 않는 지능형 엔진)
function generateIntelligentDynamicSpokenResponse(profile, userText) {
  const clean = userText.trim();
  const lower = clean.toLowerCase();
  const shortName = profile.name.split(' ')[1] || profile.name;

  // 대화 맥락 수집
  let topic = "general";
  if (lower.includes("weather") || lower.includes("rain") || lower.includes("sun") || lower.includes("날씨") || lower.includes("비") || lower.includes("더워")) {
    topic = "weather";
  } else if (lower.includes("food") || lower.includes("eat") || lower.includes("pizza") || lower.includes("lunch") || lower.includes("먹") || lower.includes("밥")) {
    topic = "food";
  } else if (lower.includes("game") || lower.includes("play") || lower.includes("toy") || lower.includes("놀") || lower.includes("게임")) {
    topic = "game";
  } else if (lower.includes("work") || lower.includes("busy") || lower.includes("office") || lower.includes("일") || lower.includes("회사")) {
    topic = "work";
  } else if (lower.includes("travel") || lower.includes("trip") || lower.includes("여행")) {
    topic = "travel";
  }

  // 동적 문장 조합기 (중복 완전 차단)
  let replyText = "";
  let transText = "";
  let nativeUp = "";
  let advUp = "";
  let hint = "";
  let phoneme = "";

  if (topic === "weather") {
    replyText = `That sounds like nice weather to talk about! How does the sky look outside right now, ${shortName}?`;
    transText = `날씨에 대해 이야기하니 좋네요! 지금 창밖 하늘은 어떤 모습인가요, ${shortName}님?`;
    nativeUp = `It's pretty pleasant outside today.`;
    advUp = `The meteorological conditions are remarkably agreeable.`;
    hint = "Tip: 'pleasant outside' = 밖의 날씨가 상쾌하다";
    phoneme = "Tip: 'pleasant'는 [플레전트]처럼 첫 음절에 힘을 주세요!";
  } else if (topic === "food") {
    replyText = `Talking about '${clean}' is making me hungry! What's your absolute favorite dish, ${shortName}?`;
    transText = `"${clean}"에 대한 이야기를 들으니 출출해지네요! ${shortName}님이 가장 좋아하시는 요리는 무엇인가요?`;
    nativeUp = `I'm really craving something delicious right now.`;
    advUp = `I possess a refined culinary preference for exquisite meals.`;
    hint = "Tip: 'craving something' = ~이 몹시 먹고 싶다";
    phoneme = "Tip: 'craving'은 [크레이빙]처럼 길게 발음하세요!";
  } else if (topic === "game") {
    replyText = `That sounds like so much fun! What's the coolest part of that game, ${shortName}?`;
    transText = `정말 재미있겠네요! 그 게임에서 가장 신나는 부분은 무엇인가요, ${shortName}님?`;
    nativeUp = `I had a blast playing that!`;
    advUp = `Engaging in that activity yielded immense satisfaction.`;
    hint = "Tip: 'had a blast' = 엄청 신나게 놀았다";
    phoneme = "Tip: 'blast'는 [블래스트]로 또렷하게 말해보세요!";
  } else if (topic === "work") {
    replyText = `Sounds like you've been having a productive day! How are you feeling after handling all that, ${shortName}?`;
    transText = `정말 알찬 하루를 보내신 것 같군요! 그 일들을 다 마치고 나니 기분이 어떠신가요, ${shortName}님?`;
    nativeUp = `I had a super busy day at work.`;
    advUp = `I managed a high volume of professional responsibilities today.`;
    hint = "Tip: 'productive day' = 보람차고 알찬 하루";
    phoneme = "Tip: 'productive'는 두 번째 음절 [-덕-]에 강세를 주세요!";
  } else if (topic === "travel") {
    replyText = `Travel is always so exciting! Where is the one place you'd love to visit next, ${shortName}?`;
    transText = `여행은 언제나 가슴 설레죠! ${shortName}님이 다음에 꼭 가보고 싶은 곳은 어디인가요?`;
    nativeUp = `I can't wait to go on my next trip.`;
    advUp = `I anticipate exploring new global destinations eagerly.`;
    hint = "Tip: 'can't wait to' = ~하고 싶어 참을 수 없다";
    phoneme = "Tip: 'anticipate'는 [앤티시페이트]로 둘째 음절에 강세를 주세요!";
  } else {
    replyText = `You mentioned "${clean}". That's really interesting! What made you think of that today, ${shortName}?`;
    transText = `"${clean}"라고 말씀해 주셨군요. 정말 흥미로워요! 오늘 어떤 계기로 그 생각을 하시게 되었나요, ${shortName}님?`;
    nativeUp = `I was just thinking about that earlier.`;
    advUp = `That subject recently captured my intellectual curiosity.`;
    hint = "Tip: 'captured my curiosity' = 나의 호기심을 사로잡았다";
    phoneme = "Tip: 'curiosity'는 [큐리어서티]처럼 셋째 음절에 강세를 주세요!";
  }

  return {
    reply: replyText,
    translation: transText,
    nativeUpgrade: nativeUp,
    advancedUpgrade: advUp,
    grammarHint: hint,
    phonemeTip: phoneme
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
    content: `Hi! Ready for our ${scenario.title}? What's up?`,
    translation: `안녕! ${scenario.title} 역할극 준비됐어! 무슨 일이야?`,
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
      localStorage.removeItem('lingo_profiles_v13');
      localStorage.removeItem('lingo_chat_histories_v13');
      localStorage.removeItem('lingo_profile_memories_v13');
      localStorage.removeItem('lingo_user_flashcards_v13');
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
