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
let naturalVoices = [];

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
  const savedProfiles = localStorage.getItem('lingo_profiles_v7');
  if (savedProfiles) {
    profiles = JSON.parse(savedProfiles);
  } else {
    profiles = JSON.parse(JSON.stringify(DEFAULT_PROFILES));
    saveProfiles();
  }

  const savedHistories = localStorage.getItem('lingo_chat_histories_v7');
  if (savedHistories) {
    chatHistories = JSON.parse(savedHistories);
  }

  userGeminiApiKey = localStorage.getItem('lingo_gemini_api_key') || '';
  if (geminiKeyInput) geminiKeyInput.value = userGeminiApiKey;
}

function saveProfiles() {
  localStorage.setItem('lingo_profiles_v7', JSON.stringify(profiles));
}

function saveHistories() {
  localStorage.setItem('lingo_chat_histories_v7', JSON.stringify(chatHistories));
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
    return `Hello ${shortName}! I am Chloe. Tell me what you did today! 🎈`;
  } else if (profile.age <= 9) {
    return `Hey ${shortName}! I am Chloe! What are you doing right now? 🎮`;
  } else {
    return `Hello ${profile.name}! I'm Chloe. What topic would you like to discuss today? ✨`;
  }
}

function getWelcomeTranslation(profile) {
  const shortName = profile.name.split(' ')[1] || profile.name;
  if (profile.age <= 5) {
    return `안녕 ${shortName}! 나는 클로이야. 오늘 어떤 일을 했는지 말해줘! 🎈`;
  } else if (profile.age <= 9) {
    return `안녕 ${shortName}! 클로이 선생님이야! 지금 뭐 하고 있니? 🎮`;
  } else {
    return `안녕하세요 ${profile.name}님! 클로이입니다. 오늘 어떤 주제에 대해 이야기해 볼까요? ✨`;
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
          <span>💡 원어민 표현 팁:</span> ${msg.grammarHint}
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
    utterance.pitch = 1.05;
    utterance.rate = activeProfile && activeProfile.age <= 5 ? 0.85 : 0.93;

    utterance.onstart = () => {
      updateTeacherFaceState('speaking', '👩‍🏫 클로이 선생님이 대화 중...');
    };

    utterance.onend = () => {
      updateTeacherFaceState('idle', '👩‍🏫 아래 마이크를 누르거나 선생님을 터치해 말하세요!');
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
    giantMicBtn.classList.add('listening');
    micIcon.innerText = "🔴";
    micLabel.innerText = "음성 듣는 중...";
    lingoStatusTag.innerText = "🎤 목소리를 듣고 있어요! 말씀해 주세요...";
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
    alert("이 브라우저에서는 마이크 음성 인식이 지원되지 않습니다. 하단 키보드로 입력해 보세요!");
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
  giantMicBtn.classList.remove('listening');
  micIcon.innerText = "🎙️";
  micLabel.innerText = "눌러서 말하기";
  lingoStatusTag.innerText = "👩‍🏫 아래 마이크를 누르거나 선생님을 터치해 말하세요!";
}

function renderQuickChips() {
  quickChipsContainer.innerHTML = '';
  if (!activeProfile) return;

  let chips = [];
  if (activeProfile.age <= 5) {
    chips = ["I played with toys today!", "I ate delicious snacks!", "I want to watch cartoons!"];
  } else if (activeProfile.age <= 7) {
    chips = ["I played with my friends!", "I saw a huge dinosaur!", "I love drawing pictures!"];
  } else if (activeProfile.age <= 9) {
    chips = ["I finished my homework today!", "I listened to my favorite song!", "Let's play a fun game!"];
  } else {
    chips = ["I had a productive day at work.", "How can I express this naturally?", "Can you give me a travel phrase?"];
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

  updateTeacherFaceState('thinking', '🤔 클로이 선생님이 답변을 생각하고 있어요...');

  const xpEarned = text.split(' ').length >= 4 ? 30 : 20;
  const didLevelUp = addXpToActiveProfile(xpEarned);

  if (userGeminiApiKey && userGeminiApiKey.trim().length > 10) {
    try {
      const resp = await fetchRealGeminiResponse(activeProfile, text);
      handleAiResponseReceived(resp, didLevelUp);
      return;
    } catch (e) {
      console.warn("Gemini API Call fallback to contextual NLP engine", e);
    }
  }

  setTimeout(() => {
    const aiResponse = generateContextualSmartResponse(activeProfile, text);
    handleAiResponseReceived(aiResponse, didLevelUp);
  }, 800);
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
  
  const historySnippet = (chatHistories[profile.id] || [])
    .slice(-6)
    .map(m => `${m.sender === 'user' ? 'Student' : 'Chloe'}: ${m.content}`)
    .join("\n");

  const systemPrompt = `You are 'Chloe', a brilliant, warm, charming bilingual AI English Tutor for ${profile.name} (Age: ${profile.age}).
CRITICAL INSTRUCTION:
- Read the student's message "${userText}" carefully.
- Directly respond to what the student JUST SAID. Never use canned template responses.
- Build upon their topic and ask a natural, interesting follow-up question.
${profile.age <= 5 ? '- Use max 3-5 simple words.' : profile.age <= 9 ? '- Use 5-8 engaging words.' : '- Elevate vocabulary and suggest natural native idioms.'}
Recent History:
${historySnippet}

Respond strictly in JSON format: {"reply": "...", "translation": "...", "grammarHint": "..."}`;

  const bodyData = {
    system_instruction: { parts: [{ text: systemPrompt }] },
    contents: [{ role: 'user', parts: [{ text: userText }] }],
    generationConfig: { 
      temperature: 0.85,
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

function generateContextualSmartResponse(profile, userText) {
  const clean = userText.trim();
  const lower = clean.toLowerCase();
  const shortName = profile.name.split(' ')[1] || profile.name;

  if (lower.includes("영어로") || lower.includes("뜻") || lower.includes("어떻게 말해") || lower.includes("무슨")) {
    return {
      reply: `That is a great question, ${shortName}! You can express "${clean}" naturally in English. Would you like to practice it together? ✨`,
      translation: `정말 좋은 질문이야, ${shortName}! "${clean}"에 대한 원어민 표현을 함께 연습해 볼까? ✨`,
      grammarHint: `Tip: "${clean}"을 영어 문장으로 완성해 보세요!`
    };
  }

  let mainTopic = "";
  if (lower.includes("weather") || lower.includes("rain") || lower.includes("sun") || lower.includes("날씨") || lower.includes("비") || lower.includes("더워") || lower.includes("추워")) {
    mainTopic = "weather";
  } else if (lower.includes("food") || lower.includes("eat") || lower.includes("pizza") || lower.includes("rice") || lower.includes("snack") || lower.includes("먹") || lower.includes("밥") || lower.includes("맛")) {
    mainTopic = "food";
  } else if (lower.includes("game") || lower.includes("play") || lower.includes("toy") || lower.includes("놀") || lower.includes("게임")) {
    mainTopic = "game";
  } else if (lower.includes("school") || lower.includes("study") || lower.includes("friend") || lower.includes("학교") || lower.includes("친구") || lower.includes("공부")) {
    mainTopic = "school";
  } else if (lower.includes("work") || lower.includes("busy") || lower.includes("office") || lower.includes("회사") || lower.includes("일") || lower.includes("바빠")) {
    mainTopic = "work";
  }

  if (mainTopic === "weather") {
    return {
      reply: `I heard you mention the weather! Speaking of '${clean}', how is the sky looking near you right now, ${shortName}? ☀️`,
      translation: `날씨 이야기를 해주셨군요! "${clean}"에 대해 말씀해 주셨는데, 지금 창밖 날씨는 어떤가요, ${shortName}? ☀️`,
      grammarHint: "Tip: 'It is sunny today!' 처럼 대답해 보세요!"
    };
  } else if (mainTopic === "food") {
    return {
      reply: `Oh, speaking about food like '${clean}' makes me hungry! What is your absolute favorite dish to eat, ${shortName}? 🍕`,
      translation: `맛있는 이야기("${clean}")를 들으니 출출해지네요! ${shortName}님이 제일 좋아하는 음식은 무엇인가요? 🍕`,
      grammarHint: "Tip: 'I love pizza!' 라고 대답해 보세요!"
    };
  } else if (mainTopic === "game") {
    return {
      reply: `Playing and having fun with '${clean}' sounds amazing! Who do you usually play with, ${shortName}? 🎮`,
      translation: `"${clean}" 이야기처럼 신나게 노는 건 정말 즐겁지! ${shortName}님은 보통 누구와 함께 노나요? 🎮`,
      grammarHint: "Tip: 'I play with my family!' 처럼 대답해 보세요."
    };
  } else if (mainTopic === "school") {
    return {
      reply: `That is really interesting about '${clean}'! What subject or activity do you enjoy the most at school, ${shortName}? 📚`,
      translation: `"${clean}"에 대한 이야기가 정말 흥미롭네요! 학교나 생활에서 가장 즐거운 활동은 무엇인가요, ${shortName}? 📚`,
      grammarHint: null
    };
  } else if (mainTopic === "work") {
    return {
      reply: `I hear you regarding '${clean}'. Balancing daily tasks can be intense. How do you usually unwind after a long day? ☕`,
      translation: `"${clean}"에 관한 말씀을 들으니 바쁜 하루였군요! 긴 하루를 보낸 후 보통 어떻게 휴식을 취하시나요? ☕`,
      grammarHint: "Tip: 'unwind' = 긴장을 풀고 편안히 쉬다"
    };
  }

  return {
    reply: `You said, "${clean}". That's really interesting! Can you tell me more details about that, ${shortName}? ✨`,
    translation: `방금 "${clean}"라고 말씀해 주셨군요! 참 흥미로워요. 그것에 대해 조금 더 자세히 이야기해 주실 수 있나요, ${shortName}? ✨`,
    grammarHint: "Tip: 'Because...' 로 이유를 이어 말해보세요!"
  };
}

function updateTeacherFaceState(state, statusText) {
  teacherMouth.className = `teacher-mouth ${state}`;
  lingoStatusTag.innerText = statusText;
}

function addXpToActiveProfile(amount) {
  if (!activeProfile) return;

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
  giantMicBtn.addEventListener('click', toggleListening);
  aiHumanStage.addEventListener('click', toggleListening);

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
      localStorage.removeItem('lingo_profiles_v7');
      localStorage.removeItem('lingo_chat_histories_v7');
      profiles = JSON.parse(JSON.stringify(DEFAULT_PROFILES));
      chatHistories = {};
      saveProfiles();
      renderProfiles();
    }
  });
}

document.addEventListener('DOMContentLoaded', initApp);
