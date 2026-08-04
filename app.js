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
let speechPauseTimer = null;
let accumulatedTranscript = '';

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
  const savedProfiles = localStorage.getItem('lingo_profiles_v8');
  if (savedProfiles) {
    profiles = JSON.parse(savedProfiles);
  } else {
    profiles = JSON.parse(JSON.stringify(DEFAULT_PROFILES));
    saveProfiles();
  }

  const savedHistories = localStorage.getItem('lingo_chat_histories_v8');
  if (savedHistories) {
    chatHistories = JSON.parse(savedHistories);
  }

  userGeminiApiKey = localStorage.getItem('lingo_gemini_api_key') || '';
  if (geminiKeyInput) geminiKeyInput.value = userGeminiApiKey;
}

function saveProfiles() {
  localStorage.setItem('lingo_profiles_v8', JSON.stringify(profiles));
}

function saveHistories() {
  localStorage.setItem('lingo_chat_histories_v8', JSON.stringify(chatHistories));
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
    return `Hello ${shortName}! I am Professor Chloe. Take your time and talk to me naturally whenever you are ready! 🎈`;
  } else if (profile.age <= 9) {
    return `Hey ${shortName}! I am Professor Chloe! Speak comfortably—I am listening closely to everything you share. 🎮`;
  } else {
    return `Hello ${profile.name}! I'm Professor Chloe, your Master Pedagogy English Coach. Take all the time you need to express your thoughts on society, culture, travel, or psychology. What shall we explore today? ✨`;
  }
}

function getWelcomeTranslation(profile) {
  const shortName = profile.name.split(' ')[1] || profile.name;
  if (profile.age <= 5) {
    return `안녕 ${shortName}! 나는 클로이 교수님이야. 천천히 편하게 생각나대로 말해보렴! 🎈`;
  } else if (profile.age <= 9) {
    return `안녕 ${shortName}! 클로이 교수님이야! 말씀 도중에 멈추셔도 끝까지 잘 듣고 있으니 편하게 말하렴. 🎮`;
  } else {
    return `안녕하세요 ${profile.name}님! 영어 교수법 및 박학다식 전담 코치 클로이 교수입니다. 생각하시는 도중 잠시 멈추셔도 편안히 기다려 드릴 테니, 사회/문화/여행/심리 등 다양한 생각을 편하게 말씀해 주세요. ✨`;
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
          <span>💡 원어민 고급 지도 팁:</span> ${msg.grammarHint}
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
    chips = ["I played with my family today!", "I ate delicious lunch!", "Can you tell me a funny story?"];
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

  updateTeacherFaceState('thinking', '🤔 클로이 교수님이 박학다식한 지식과 교수법으로 답변을 생각하고 있어요...');

  const xpEarned = text.split(' ').length >= 4 ? 30 : 20;
  const didLevelUp = addXpToActiveProfile(xpEarned);

  if (userGeminiApiKey && userGeminiApiKey.trim().length > 10) {
    try {
      const resp = await fetchRealGeminiResponse(activeProfile, text);
      handleAiResponseReceived(resp, didLevelUp);
      return;
    } catch (e) {
      console.warn("Gemini API Call fallback to Polymath TESOL Engine", e);
    }
  }

  setTimeout(() => {
    const aiResponse = generatePolymathTESOLResponse(activeProfile, text);
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
  
  const historySnippet = (chatHistories[profile.id] || [])
    .slice(-6)
    .map(m => `${m.sender === 'user' ? 'Student' : 'Professor Chloe'}: ${m.content}`)
    .join("\n");

  const systemPrompt = `You are 'Professor Chloe', a world-class TESOL/TEFL Master Pedagogy Specialist & Polymath Scholar.
You possess deep expertise across Society, Culture, Politics, Religion, Travel, Psychology, Education, and Philosophy.
Pedagogical Directives for ${profile.name} (Age: ${profile.age}):
1. LISTEN PATIENTLY: Validate the student's thought with insightful commentary.
2. PEDAGOGICAL SCAFFOLDING: Elevate their English by introducing 1 sophisticated native idiom/collocation in context.
3. EXTEND DIALOGUE: Ask a thought-provoking open-ended question that encourages deeper reflection on culture, society, psychology, or daily life.
4. If student speaks Korean, translate seamlessly into native English and explain with warm encouragement.
${profile.age <= 5 ? 'For toddlers: Max 4 simple encouraging words with high praise.' : profile.age <= 9 ? 'For kids: 5-8 fun, warm, intellectually stimulating words.' : 'For adults/parents: High-level intellectual discourse, native collocations, and psychological/cultural insights.'}

Recent Conversation:
${historySnippet}

Respond strictly in JSON format: {"reply": "...", "translation": "...", "grammarHint": "..."}`;

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

function generatePolymathTESOLResponse(profile, userText) {
  const clean = userText.trim();
  const lower = clean.toLowerCase();
  const shortName = profile.name.split(' ')[1] || profile.name;

  let domain = "general";
  if (lower.includes("psychology") || lower.includes("mind") || lower.includes("feel") || lower.includes("심리") || lower.includes("마음") || lower.includes("감정")) {
    domain = "psychology";
  } else if (lower.includes("travel") || lower.includes("trip") || lower.includes("country") || lower.includes("여행") || lower.includes("비행기") || lower.includes("문화")) {
    domain = "travel_culture";
  } else if (lower.includes("society") || lower.includes("politic") || lower.includes("religion") || lower.includes("사회") || lower.includes("정치") || lower.includes("종교")) {
    domain = "society";
  } else if (lower.includes("education") || lower.includes("teach") || lower.includes("learn") || lower.includes("교육") || lower.includes("공부") || lower.includes("영어로")) {
    domain = "education";
  }

  if (domain === "psychology") {
    return {
      reply: `Human psychology is fascinating, ${shortName}. When you say '${clean}', it touches on emotional intelligence. How do you process those emotions in daily life? 🌿`,
      translation: `인간 심리학은 참 흥미롭습니다, ${shortName}님. "${clean}"에 관한 말씀은 감정 지능(EQ)과도 연결되네요. 일상에서 이런 감정들을 어떻게 다스리시나요? 🌿`,
      grammarHint: "Tip: 'emotional intelligence' = 감정 지능(EQ)"
    };
  } else if (domain === "travel_culture") {
    return {
      reply: `Exploring global cultures and travel opens a whole new world, ${shortName}! Regarding '${clean}', what cultural aspect interests you most when visiting a new place? ✈️`,
      translation: `세계 문화 탐구와 여행은 새로운 시야를 열어주죠, ${shortName}님! "${clean}"에 대해 언급하셨는데, 새로운 장소를 찾으실 때 어떤 문화적 요소에 가장 끌리시나요? ✈️`,
      grammarHint: "Tip: 'opens a whole new world' = 완전히 새로운 세상을 열어주다"
    };
  } else if (domain === "society") {
    return {
      reply: `That is a profound perspective on society and human values, ${shortName}. Regarding '${clean}', how do you see this shaping our community's future? 🏛️`,
      translation: `사회와 인간 가치에 관한 매우 깊이 있는 관점이십니다, ${shortName}님. "${clean}"에 대한 말씀이 우리 공동체의 미래에 어떤 영향을 줄 것이라 생각하시나요? 🏛️`,
      grammarHint: "Tip: 'profound perspective' = 깊이 있고 심오한 관점"
    };
  } else if (domain === "education") {
    return {
      reply: `As a language educator, I love your passion for learning, ${shortName}! Regarding '${clean}', active expression is key to fluency. What goal would you like to achieve next? 🎓`,
      translation: `언어 교육자로서 ${shortName}님의 배움에 대한 열정에 깊이 찬사를 보냅니다! "${clean}"에 관한 말씀처럼 능통함의 핵심은 적극적 표현이죠. 다음엔 어떤 목표를 달성하고 싶으신가요? 🎓`,
      grammarHint: "Tip: 'key to fluency' = 언어 유창성의 핵심"
    };
  }

  return {
    reply: `You thoughtfully shared, "${clean}". That brings up great insights, ${shortName}! Could you elaborate a bit more on your perspective? ✨`,
    translation: `"${clean}"라는 사려 깊은 생각을 나누어 주셨군요! 매우 뛰어난 통찰입니다, ${shortName}님. 본인의 관점에 대해 조금 더 깊이 말씀해 주실 수 있나요? ✨`,
    grammarHint: "Tip: 'elaborate on your perspective' = 자신의 관점을 더 구체적으로 상술하다"
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
      localStorage.removeItem('lingo_profiles_v8');
      localStorage.removeItem('lingo_chat_histories_v8');
      profiles = JSON.parse(JSON.stringify(DEFAULT_PROFILES));
      chatHistories = {};
      saveProfiles();
      renderProfiles();
    }
  });
}

document.addEventListener('DOMContentLoaded', initApp);
