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
  const savedProfiles = localStorage.getItem('lingo_profiles_v6');
  if (savedProfiles) {
    profiles = JSON.parse(savedProfiles);
  } else {
    profiles = JSON.parse(JSON.stringify(DEFAULT_PROFILES));
    saveProfiles();
  }

  const savedHistories = localStorage.getItem('lingo_chat_histories_v6');
  if (savedHistories) {
    chatHistories = JSON.parse(savedHistories);
  }

  userGeminiApiKey = localStorage.getItem('lingo_gemini_api_key') || '';
  if (geminiKeyInput) geminiKeyInput.value = userGeminiApiKey;
}

function saveProfiles() {
  localStorage.setItem('lingo_profiles_v6', JSON.stringify(profiles));
}

function saveHistories() {
  localStorage.setItem('lingo_chat_histories_v6', JSON.stringify(chatHistories));
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
    return `Hello ${shortName}! I am Chloe, your AI English coach. Let's talk about fun things! What animal makes you smile? 🐶`;
  } else if (profile.age <= 9) {
    return `Hey ${shortName}! I'm Chloe! I'm super excited to talk with you today. What fun thing did you do today? 🎮`;
  } else {
    return `Hello ${profile.name}! I'm Chloe, your personal bilingual English coach. Let's make your English sound completely natural and charming today. What's on your mind? ✨`;
  }
}

function getWelcomeTranslation(profile) {
  const shortName = profile.name.split(' ')[1] || profile.name;
  if (profile.age <= 5) {
    return `안녕 ${shortName}! 나는 너의 전담 AI 영어 코치 클로이야. 재미있는 이야기를 나눠보자! 어떤 동물을 좋아하니? 🐶`;
  } else if (profile.age <= 9) {
    return `안녕 ${shortName}! 클로이 선생님이야! 오늘 너랑 수다 떨 생각에 신난다. 오늘 뭐 하고 놀았니? 🎮`;
  } else {
    return `안녕하세요 ${profile.name}님! 저는 전담 원어민 튜터 클로이입니다. 오늘 대화를 통해 더욱 매끄럽고 고급스러운 영어를 완성해 드릴게요. 어떤 이야기를 나눠볼까요? ✨`;
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
      updateTeacherFaceState('speaking', '👩‍🏫 클로이 선생님이 원어민 목소리로 대화 중...');
    };

    utterance.onend = () => {
      updateTeacherFaceState('idle', '👩‍🏫 아래 마이크를 누르거나 선생님을 터치해 대화하세요!');
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
  lingoStatusTag.innerText = "👩‍🏫 아래 마이크를 누르거나 선생님을 터치해 대화하세요!";
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
    chips = ["I had a busy day at work.", "I want to improve my speaking.", "이 표현을 자연스럽게 교정해 줄 수 있나요?"];
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

  updateTeacherFaceState('thinking', '🤔 클로이 선생님이 지적이면서 매력적인 답변을 생각하고 있어요...');

  const xpEarned = text.split(' ').length >= 4 ? 30 : 20;
  const didLevelUp = addXpToActiveProfile(xpEarned);

  if (userGeminiApiKey && userGeminiApiKey.trim().length > 10) {
    try {
      const resp = await fetchRealGeminiResponse(activeProfile, text);
      handleAiResponseReceived(resp, didLevelUp);
      return;
    } catch (e) {
      console.warn("Gemini API Call fallback to smart conversation engine", e);
    }
  }

  setTimeout(() => {
    const aiResponse = generateIntelligentDynamicResponse(activeProfile, text);
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
    .map(m => `${m.sender === 'user' ? 'Student' : 'Chloe'}: ${m.content}`)
    .join("\n");

  const systemPrompt = `You are 'Chloe', an incredibly charming, highly intelligent, Ivy-League educated bilingual English Master Tutor for ${profile.name} (Age: ${profile.age}).
Rules:
1. NEVER repeat previous sentences. Make every dialogue original, conversational, charming, and deeply engaging.
2. Act like a real native friend and mentor. Ask natural follow-up questions.
3. Gently elevate the user's vocabulary and phrasing. If they speak Korean or broken English, guide them with elegant native idioms.
${profile.age <= 5 ? '4. For young kids: Use 3-5 simple encouraging words with high praise.' : profile.age <= 9 ? '4. For kids: Use 5-8 fun, warm words.' : '4. For adults/parents: Discuss real life, business, culture, and native idioms.'}
Recent Dialogue History:
${historySnippet}

Respond strictly in JSON format: {"reply": "...", "translation": "...", "grammarHint": "..."}`;

  const bodyData = {
    system_instruction: { parts: [{ text: systemPrompt }] },
    contents: [{ role: 'user', parts: [{ text: userText }] }],
    generationConfig: { 
      temperature: 0.8,
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

function generateIntelligentDynamicResponse(profile, userText) {
  const lower = userText.toLowerCase();
  const shortName = profile.name.split(' ')[1] || profile.name;
  const historyCount = (chatHistories[profile.id] || []).length;

  if (profile.age <= 5) {
    const kidAnswers = [
      {
        reply: `Oh wow, ${shortName}! You speak so well! Tell me, do you like fluffy puppies or cute kittens? 🐶`,
        translation: `와, ${shortName}! 정말 말을 잘하는구나! 푹신한 강아지가 좋아, 아니면 귀여운 아기 고양이가 좋아? 🐶`,
        grammarHint: "Tip: 'I like puppies!' 하고 대답해 보세요!"
      },
      {
        reply: `That is so delightful, ${shortName}! Let's sing a happy song together! 🎶`,
        translation: `정말 기분 좋은 이야기야, ${shortName}! 우리 함께 신나는 노래를 불러볼까? 🎶`,
        grammarHint: null
      },
      {
        reply: `Big applause for ${shortName}! You are getting smarter every single day! 🌟`,
        translation: `${shortName}에게 큰 박수! 매일매일 더 똑똑해지고 있구나! 🌟`,
        grammarHint: "Tip: 'Thank you!' 라고 감사 인사를 해볼까요?"
      }
    ];
    return kidAnswers[historyCount % kidAnswers.length];
  } else if (profile.age <= 7) {
    if (lower.includes('dinosaur') || lower.includes('공룡')) {
      return {
        reply: `T-Rex is legendary, ${shortName}! Which dinosaur do you think is the strongest? 🦖`,
        translation: `티라노사우루스는 정말 전설적이지, ${shortName}! 넌 어떤 공룡이 가장 힘이 세다고 생각하니? 🦖`,
        grammarHint: "Tip: 'T-Rex is the strongest!' 라고 말해보세요."
      };
    }
    const youthAnswers = [
      {
        reply: `That sounds like a fantastic adventure, ${shortName}! What was the best part of your story? 🚀`,
        translation: `정말 환상적인 모험 이야기 같구나, ${shortName}! 너의 이야기 중 가장 신났던 부분은 어디니? 🚀`,
        grammarHint: null
      },
      {
        reply: `You have such a creative mind, ${shortName}! What new exciting thing shall we explore next? 🎨`,
        translation: `너는 정말 창의적인 상상력을 가졌구나, ${shortName}! 다음엔 또 어떤 재미있는 것을 탐험해볼까? 🎨`,
        grammarHint: "Tip: 'I want to play!' 처럼 말해보세요."
      }
    ];
    return youthAnswers[historyCount % youthAnswers.length];
  } else if (profile.age <= 9) {
    if (lower.includes('draw') || lower.includes('picture') || lower.includes('그림')) {
      return {
        reply: `Drawing is such an artistic way to express yourself, ${shortName}! What are you painting today? 🎨`,
        translation: `그림을 그리는 건 너의 생각과 마음을 표현하는 정말 멋진 방법이야, ${shortName}! 오늘은 무엇을 그리고 있니? 🎨`,
        grammarHint: "Tip: 'I am drawing a picture.' 라고 정중하게 말해볼까요?"
      };
    }
    const twinAnswers = [
      {
        reply: `That is brilliant, ${shortName}! You expressed your thought so clearly. How did that make you feel? ✨`,
        translation: `정말 명쾌하고 멋진 표현이야, ${shortName}! 생각을 정말 또렷하게 말했어. 그때 기분이 어땠니? ✨`,
        grammarHint: null
      },
      {
        reply: `I love your enthusiasm, ${shortName}! Shall we practice one more exciting native phrase together? 💡`,
        translation: `너의 열정이 정말 보기 좋아, ${shortName}! 우리 함께 멋진 원어민 표현을 하나 더 연습해볼까? 💡`,
        grammarHint: "Tip: 'Yes, let's practice!' 라고 대답해 보세요."
      }
    ];
    return twinAnswers[historyCount % twinAnswers.length];
  } else {
    if (lower.includes('improve') || lower.includes('향상') || lower.includes('영어로') || lower.includes('교정')) {
      return {
        reply: "To make your English sound genuinely sophisticated, focus on natural collocations rather than word-for-word translation. For instance, instead of 'make a speech', try 'deliver a speech'. How does that feel to you?",
        translation: "영어를 훨씬 고급스럽게 만들려면 직역보다는 원어민들이 자주 쓰는 자연스러운 연어(Collocation) 조합에 집중해 보세요. 예를 들어 'make a speech' 대신 'deliver a speech'를 쓰시면 훨씬 지적입니다. 어떠신가요?",
        grammarHint: "Tip: 'deliver a speech' = 세련되게 연설을 하다"
      };
    }
    const adultAnswers = [
      {
        reply: "That is a very insightful point. When communicating in real life, nuance makes all the difference. What particular topic would you like to master today?",
        translation: "매우 통찰력 있는 말씀입니다. 실제 원어민 대화에서는 뉘앙스의 차이가 품격을 만듭니다. 오늘 특히 정복하고 싶으신 주제가 있으신가요?",
        grammarHint: "Tip: 'nuance' = 세심한 어감의 차이"
      },
      {
        reply: "I completely agree with your perspective. If you want to articulate this even more eloquently, we could refine the phrasing together. Shall we try?",
        translation: "선생님의 의견에 깊이 공감합니다. 이 표현을 훨씬 더 매끄럽고 설득력 있게 가다듬어 볼까요? 함께 시도해 보시겠어요?",
        grammarHint: "Tip: 'articulate eloquently' = 논리정연하고 우아하게 표현하다"
      }
    ];
    return adultAnswers[historyCount % adultAnswers.length];
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
      localStorage.removeItem('lingo_profiles_v6');
      localStorage.removeItem('lingo_chat_histories_v6');
      profiles = JSON.parse(JSON.stringify(DEFAULT_PROFILES));
      chatHistories = {};
      saveProfiles();
      renderProfiles();
    }
  });
}

document.addEventListener('DOMContentLoaded', initApp);
