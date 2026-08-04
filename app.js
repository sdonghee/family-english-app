// 6인 가족 프로필 (하율/예율 쌍둥이 만9세, 성율 만6세, 지율 만4세)
const DEFAULT_PROFILES = [
  {
    id: 'p_dad',
    name: '아빠',
    roleKey: 'dad',
    age: 42,
    birthInfo: '',
    levelText: '중급 (Intermediate)',
    interests: ['비즈니스', '해외여행', 'IT/기술'],
    totalXp: 450,
    level: 3,
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
    interests: ['일상 생활', '요리/맛집', '문화/예술'],
    totalXp: 380,
    level: 2,
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
    badges: ['🎈 탐험가 아기'],
    avatarIcon: '👶',
    themeColor: '#00BCD4',
  }
];

let profiles = [];
let activeProfile = null;
let chatHistories = {};
let userGeminiApiKey = '';
let isListening = false;
let recognition = null;

const profileSection = document.getElementById('profile-section');
const chatSection = document.getElementById('chat-section');
const profileGrid = document.getElementById('profile-grid');

const backToProfilesBtn = document.getElementById('back-to-profiles-btn');
const activeProfileHeader = document.getElementById('active-profile-header');
const chatLevelBadge = document.getElementById('chat-level-badge');
const chatUserName = document.getElementById('chat-user-name');
const chatXpTotal = document.getElementById('chat-xp-total');
const progressBarFill = document.getElementById('progress-bar-fill');
const nextLevelXpText = document.getElementById('next-level-xp-text');
const badgeCountText = document.getElementById('badge-count-text');

const teacherMouth = document.getElementById('teacher-mouth');
const lingoStatusTag = document.getElementById('lingo-status-tag');

const chatMessages = document.getElementById('chat-messages');
const quickChipsContainer = document.getElementById('quick-chips-container');
const chatInput = document.getElementById('chat-input');
const sendBtn = document.getElementById('send-btn');
const micBtn = document.getElementById('mic-btn');
const micIcon = document.getElementById('mic-icon');
const micLabel = document.getElementById('mic-label');
const resetBtn = document.getElementById('reset-btn');
const settingsBtn = document.getElementById('settings-btn');

const levelUpModal = document.getElementById('level-up-modal');
const levelUpMessage = document.getElementById('level-up-message');
const modalCloseBtn = document.getElementById('modal-close-btn');

const settingsModal = document.getElementById('settings-modal');
const geminiKeyInput = document.getElementById('gemini-key-input');
const saveSettingsBtn = document.getElementById('save-settings-btn');
const closeSettingsBtn = document.getElementById('close-settings-btn');

function initApp() {
  loadStoredData();
  renderProfiles();
  setupSpeechRecognition();
  setupEventListeners();
}

function loadStoredData() {
  const savedProfiles = localStorage.getItem('lingo_profiles_v4');
  if (savedProfiles) {
    profiles = JSON.parse(savedProfiles);
  } else {
    profiles = JSON.parse(JSON.stringify(DEFAULT_PROFILES));
    saveProfiles();
  }

  const savedHistories = localStorage.getItem('lingo_chat_histories_v4');
  if (savedHistories) {
    chatHistories = JSON.parse(savedHistories);
  }

  userGeminiApiKey = localStorage.getItem('lingo_gemini_api_key') || '';
  if (geminiKeyInput) geminiKeyInput.value = userGeminiApiKey;
}

function saveProfiles() {
  localStorage.setItem('lingo_profiles_v4', JSON.stringify(profiles));
}

function saveHistories() {
  localStorage.setItem('lingo_chat_histories_v4', JSON.stringify(chatHistories));
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
        Lv.${p.level} • ${p.totalXp} XP
      </div>
    `;

    card.addEventListener('click', () => selectProfile(p.id));
    profileGrid.appendChild(card);
  });
}

function selectProfile(id) {
  activeProfile = profiles.find(p => p.id === id);
  if (!activeProfile) return;

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
    return `Hello ${shortName}! 🌟 I am your AI English teacher Lingo! What animal do you like? 🐶`;
  } else if (profile.age <= 9) {
    return `Hey ${shortName}! I am your AI teacher. Ready to practice fun English today? 🎮`;
  } else {
    return `Hello ${profile.name}! I am your bilingual AI teacher. How can I help your English today? ✨`;
  }
}

function getWelcomeTranslation(profile) {
  const shortName = profile.name.split(' ')[1] || profile.name;
  if (profile.age <= 5) {
    return `안녕 ${shortName}! 🌟 나는 너의 AI 영어 선생님 Lingo야! 어떤 동물을 좋아하니? 🐶`;
  } else if (profile.age <= 9) {
    return `안녕 ${shortName}! 나는 너의 AI 선생님이야. 오늘 재미있는 영어 대화를 시작해볼까? 🎮`;
  } else {
    return `안녕하세요 ${profile.name}님! 저는 한국어와 영어가 완벽한 AI 선생님입니다. 오늘 어떤 대화를 나눠볼까요? ✨`;
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
          <span>💡 팁:</span> ${msg.grammarHint}
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
    utterance.lang = 'en-US';
    utterance.rate = activeProfile && activeProfile.age <= 5 ? 0.8 : 0.95;

    utterance.onstart = () => {
      updateTeacherFaceState('speaking', '👩‍🏫 AI 선생님이 원어민 목소리로 말하고 있어요!');
    };

    utterance.onend = () => {
      updateTeacherFaceState('idle', '👩‍🏫 말씀해 주세요, 듣고 있어요!');
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
  recognition.continuous = false;
  recognition.interimResults = false;
  recognition.lang = 'en-US';

  recognition.onstart = () => {
    isListening = true;
    micBtn.classList.add('listening');
    micLabel.innerText = "듣는 중...";
    lingoStatusTag.innerText = "🎤 목소리를 듣고 있어요! 편하게 말씀하세요...";
  };

  recognition.onresult = (event) => {
    const transcript = event.results[0][0].transcript;
    chatInput.value = transcript;
    handleSendMessage();
  };

  recognition.onerror = (e) => {
    console.warn("Speech recognition error", e);
    stopListening();
  };

  recognition.onend = () => {
    stopListening();
  };
}

function toggleListening() {
  if (!recognition) {
    alert("이 브라우저에서는 마이크 음성 인식이 지원되지 않습니다. 키보드로 입력해 보세요!");
    return;
  }

  if (isListening) {
    recognition.stop();
    stopListening();
  } else {
    recognition.start();
  }
}

function stopListening() {
  isListening = false;
  micBtn.classList.remove('listening');
  micLabel.innerText = "말하기";
  lingoStatusTag.innerText = "👩‍🏫 말씀해 주세요, 듣고 있어요!";
}

function renderQuickChips() {
  quickChipsContainer.innerHTML = '';
  if (!activeProfile) return;

  let chips = [];
  if (activeProfile.age <= 5) {
    chips = ["I like puppies! 🐶", "Thank you! ❤️", "Good morning! ☀️", "I play toys! 🧸"];
  } else if (activeProfile.age <= 7) {
    chips = ["I love dinosaurs! 🦖", "Robots are cool! 🤖", "I like cartoons! 📺"];
  } else if (activeProfile.age <= 9) {
    chips = ["I love drawing pictures! 🎨", "I like playing games! 🎮", "Singing is fun! 🎵"];
  } else {
    chips = ["I had a busy day at work.", "I want to travel soon.", "이 표현은 영어로 어떻게 말하나요?"];
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

  updateTeacherFaceState('thinking', '🤔 AI 선생님이 자연스러운 대화를 생각하고 있어요...');

  const xpEarned = text.split(' ').length >= 4 ? 30 : 20;
  const didLevelUp = addXpToActiveProfile(xpEarned);

  if (userGeminiApiKey && userGeminiApiKey.trim().length > 10) {
    try {
      const resp = await fetchRealGeminiResponse(activeProfile, text);
      handleAiResponseReceived(resp, didLevelUp);
      return;
    } catch (e) {
      console.warn("Gemini API Call fallback to local smart response", e);
    }
  }

  setTimeout(() => {
    const aiResponse = generateAiResponse(activeProfile, text);
    handleAiResponseReceived(aiResponse, didLevelUp);
  }, 900);
}

function handleAiResponseReceived(aiResponse, didLevelUp) {
  const aiMsg = {
    sender: 'ai',
    content: aiResponse.reply,
    translation: aiResponse.translation,
    grammarHint: aiResponse.grammarHint,
    timestamp: new Date().toISOString()
  };

  chatHistories[activeProfile.id].push(aiMsg);
  saveHistories();
  renderMessages();

  if (didLevelUp) {
    updateTeacherFaceState('cheering', '🎉 참 잘했어요! 레벨 업!');
    showLevelUpModal(activeProfile.level);
  } else {
    speakText(aiResponse.reply);
  }
}

async function fetchRealGeminiResponse(profile, userText) {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${userGeminiApiKey}`;
  
  const systemPrompt = `You are a human-like, warm, highly fluent bilingual AI English & Korean Master Tutor for ${profile.name} (Age: ${profile.age}).
- If user speaks Korean, translate naturally to native English and explain gently.
- If user makes grammar errors, correct them naturally and encourage them.
${profile.age <= 5 ? '- Use max 3-5 simple words and high praise.' : profile.age <= 9 ? '- Use 5-8 fun engaging words.' : '- Offer idiom suggestions and practical conversations.'}
Respond strictly in JSON format: {"reply": "...", "translation": "...", "grammarHint": "..."}`;

  const bodyData = {
    system_instruction: { parts: [{ text: systemPrompt }] },
    contents: [{ role: 'user', parts: [{ text: userText }] }],
    generationConfig: { responseMimeType: "application/json" }
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
    return true;
  }

  saveProfiles();
  updateProfileUIHeader();
  return false;
}

function generateAiResponse(profile, userText) {
  const lower = userText.toLowerCase();
  const shortName = profile.name.split(' ')[1] || profile.name;

  if (profile.age <= 5) {
    if (lower.includes('hello') || lower.includes('hi') || lower.includes('안녕')) {
      return {
        reply: `Hi ${shortName}! Great job! 🌟`,
        translation: `안녕 ${shortName}! 반가워, 참 잘했어! 🌟`,
        grammarHint: "Tip: 'Hi teacher!' 하고 인사해보세요!"
      };
    } else {
      return {
        reply: `Cute sentence, ${shortName}! 🎈`,
        translation: `정말 귀여운 표현이야, ${shortName}! 🎈`,
        grammarHint: null
      };
    }
  } else if (profile.age <= 7) {
    if (lower.includes('dinosaur') || lower.includes('robot') || lower.includes('공룡')) {
      return {
        reply: `Dinosaurs and robots are super cool, ${shortName}! REX`,
        translation: `공룡이랑 로봇은 정말 멋진 주제야, ${shortName}! 🦖`,
        grammarHint: null
      };
    } else {
      return {
        reply: `Awesome job, ${shortName}! What else do you like?`,
        translation: `참 잘했어, ${shortName}! 또 어떤 것을 이야기하고 싶니?`,
        grammarHint: "Tip: 'What else do you like?'는 '또 뭘 좋아해?'라는 영단어 표현입니다."
      };
    }
  } else if (profile.age <= 9) {
    if (lower.includes('draw') || lower.includes('picture') || lower.includes('game') || lower.includes('그림')) {
      return {
        reply: `That sounds like so much fun, ${shortName}! 🎨`,
        translation: `정말 재미있겠는걸, ${shortName}! 🎨`,
        grammarHint: null
      };
    } else {
      return {
        reply: `Great English expression, ${shortName}! Keep it up! ✨`,
        translation: `훌륭한 영어 표현이야, ${shortName}! 지금처럼 자연스럽게 대화해봐! ✨`,
        grammarHint: "Tip: 'Keep it up!'은 '지금처럼 화이팅해!'라는 표현입니다."
      };
    }
  } else {
    return {
      reply: "That is a very natural expression. I am happy to guide your English anytime!",
      translation: "아주 자연스러운 표현이에요. 궁금하거나 필요한 영단어가 있다면 언제든 한글로 물어보세요!",
      grammarHint: null
    };
  }
}

function showLevelUpModal(newLevel) {
  levelUpMessage.innerText = `${activeProfile.name} 님이 레벨 ${newLevel}로 상승했습니다! 🎉`;
  levelUpModal.classList.remove('hidden');
}

function setupEventListeners() {
  backToProfilesBtn.addEventListener('click', () => {
    renderProfiles();
    chatSection.classList.remove('active');
    profileSection.classList.add('active');
  });

  sendBtn.addEventListener('click', handleSendMessage);
  micBtn.addEventListener('click', toggleListening);

  chatInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') handleSendMessage();
  });

  modalCloseBtn.addEventListener('click', () => {
    levelUpModal.classList.add('hidden');
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
    if (confirm('프로필과 대화 기록을 초기화하시겠습니까?')) {
      localStorage.removeItem('lingo_profiles_v4');
      localStorage.removeItem('lingo_chat_histories_v4');
      profiles = JSON.parse(JSON.stringify(DEFAULT_PROFILES));
      chatHistories = {};
      saveProfiles();
      renderProfiles();
    }
  });
}

document.addEventListener('DOMContentLoaded', initApp);
