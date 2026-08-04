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
let lipSyncAnimFrame = null;
let isSpeakingAnim = false;

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
const lipSyncCanvas = document.getElementById('lip-sync-canvas');

const chatMessages = document.getElementById('chat-messages');
const quickChipsContainer = document.getElementById('quick-chips-container');
const chatInput = document.getElementById('chat-input');
const sendBtn = document.getElementById('send-btn');
const giantMicBtn = document.getElementById('giant-mic-btn');
const micIcon = document.getElementById('mic-icon');
const micLabel = document.getElementById('mic-label');
const settingsBtn = document.getElementById('settings-btn');
const deckBtn = document.getElementById('deck-btn');

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

function initApp() {
  loadStoredData();
  renderProfiles();
  renderRoleplayModal();
  setupSpeechRecognition();
  loadNaturalVoices();
  setupEventListeners();
  initLipSyncCanvas();
}

function initLipSyncCanvas() {
  if (!lipSyncCanvas) return;
  lipSyncCanvas.width = lipSyncCanvas.offsetWidth || 340;
  lipSyncCanvas.height = lipSyncCanvas.offsetHeight || 275;
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
    time += 0.22;

    const mouthX = w * 0.5;
    const mouthY = h * 0.44;
    const openAmount = Math.abs(Math.sin(time)) * 8 + 3;

    ctx.save();
    ctx.beginPath();
    ctx.ellipse(mouthX, mouthY, 12, openAmount, 0, 0, Math.PI * 2);
    ctx.fillStyle = "rgba(180, 70, 80, 0.85)";
    ctx.fill();

    ctx.beginPath();
    ctx.ellipse(mouthX, mouthY - openAmount * 0.4, 14, 3, 0, 0, Math.PI * 2);
    ctx.fillStyle = "rgba(230, 130, 140, 0.9)";
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
  profiles = JSON.parse(JSON.stringify(DEFAULT_PROFILES));

  const savedHistories = localStorage.getItem('lingo_chat_histories_v21');
  if (savedHistories) chatHistories = JSON.parse(savedHistories);

  const savedFlashcards = localStorage.getItem('lingo_user_flashcards_v21');
  if (savedFlashcards) userFlashcards = JSON.parse(savedFlashcards);

  userGeminiApiKey = localStorage.getItem('lingo_gemini_api_key') || '';
  if (geminiKeyInput) geminiKeyInput.value = userGeminiApiKey;
}

function saveHistories() {
  localStorage.setItem('lingo_chat_histories_v21', JSON.stringify(chatHistories));
}

function saveFlashcards() {
  localStorage.setItem('lingo_user_flashcards_v21', JSON.stringify(userFlashcards));
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
      <div class="profile-sub">${p.age}세 대화</div>
    `;

    card.addEventListener('click', () => selectProfile(p.id));
    profileGrid.appendChild(card);
  });
}

function selectProfile(id) {
  activeProfile = profiles.find(p => p.id === id);
  if (!activeProfile) return;

  conversationTurnCount = 0;

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

  if (activeProfileHeader) activeProfileHeader.innerHTML = `${activeProfile.avatarIcon} <span>${activeProfile.name}</span>`;
  renderMessages();
  renderQuickChips();

  if (profileSection) profileSection.classList.remove('active');
  if (chatSection) chatSection.classList.add('active');

  const welcomeMsg = chatHistories[id][0];
  updateVideoOverlaySubtitles(welcomeMsg.content, welcomeMsg.translation);
  speakText(welcomeMsg.content);
}

function getWelcomeMessage(profile) {
  const shortName = profile.name.split(' ')[1] || profile.name;
  if (profile.age <= 5) {
    return `Hi ${shortName}! What are you playing with today? ✨`;
  } else if (profile.age <= 9) {
    return `Hey ${shortName}! What was the best part of your day today? 🎮`;
  } else {
    return `Hello ${profile.name}! How is your day going today? ✨`;
  }
}

function getWelcomeTranslation(profile) {
  const shortName = profile.name.split(' ')[1] || profile.name;
  if (profile.age <= 5) {
    return `안녕 ${shortName}! 오늘 뭐 하고 놀고 있니? ✨`;
  } else if (profile.age <= 9) {
    return `안녕 ${shortName}! 오늘 가장 재미있었던 일은 뭐야? 🎮`;
  } else {
    return `안녕하세요 ${profile.name}님! 오늘 하루 어떠셨나요? ✨`;
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

    if (aiHumanStage) aiHumanStage.classList.add('speaking');
    startTalkingAvatarLoop();

    if (lingoStatusTag) lingoStatusTag.innerText = "👩‍🏫 Chloe 선생님이 실제 입을 움직이며 화상 통화 중...";

    let currentIdx = 0;

    const playNextChunk = () => {
      if (currentIdx >= chunks.length) {
        if (aiHumanStage) aiHumanStage.classList.remove('speaking');
        stopTalkingAvatarLoop();
        if (lingoStatusTag) lingoStatusTag.innerText = "👩‍🏫 마이크를 누르고 원어민 선생님과 실제 화상 통화를 시작하세요!";
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

      utterance.rate = 0.92;
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
    if (giantMicBtn) giantMicBtn.classList.add('listening');
    if (micIcon) micIcon.innerText = "🔴";
    if (micLabel) micLabel.innerText = "화상 통화 중...";
    if (lingoStatusTag) lingoStatusTag.innerText = "🎤 편하게 말씀을 이어나가세요. Chloe 선생님이 경청하고 있어요...";
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
    if (chatInput) chatInput.value = currentText;

    if (speechPauseTimer) clearTimeout(speechPauseTimer);

    speechPauseTimer = setTimeout(() => {
      if (chatInput && chatInput.value.trim().length > 0) {
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

async function handleSendMessage() {
  if (!chatInput) return;
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

  if (lingoStatusTag) lingoStatusTag.innerText = "🤔 Chloe 선생님이 대화를 깊이 이해하며 생각을 정리하는 중...";

  try {
    const resp = await fetchRealGeminiResponse(activeProfile, text);
    handleAiResponseReceived(resp, text);
    return;
  } catch (e) {
    console.warn("Gemini API Call fallback", e);
  }

  setTimeout(() => {
    const aiResponse = generateNaturalHumanResponse(activeProfile, text);
    handleAiResponseReceived(aiResponse, text);
  }, 600);
}

function handleAiResponseReceived(aiResponse, userText) {
  const aiMsg = {
    sender: 'ai',
    content: aiResponse.reply,
    translation: aiResponse.translation,
    grammarHint: aiResponse.grammarHint,
    phonemeTip: aiResponse.phonemeTip,
    nativeUpgrade: aiResponse.nativeUpgrade,
    advancedUpgrade: aiResponse.advancedUpgrade,
    grammarFixNote: aiResponse.grammarFixNote,
    timestamp: new Date().toISOString()
  };

  chatHistories[activeProfile.id].push(aiMsg);
  saveHistories();
  renderMessages();

  updateVideoOverlaySubtitles(aiResponse.reply, aiResponse.translation);
  speakText(aiResponse.reply);
}

async function fetchRealGeminiResponse(profile, userText) {
  const keyToUse = userGeminiApiKey && userGeminiApiKey.trim().length > 10 ? userGeminiApiKey : 'AIzaSyDemoKeyPlaceholderForVercel';
  const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${keyToUse}`;
  
  const historySnippet = (chatHistories[profile.id] || [])
    .slice(-8)
    .map(m => `${m.sender === 'user' ? profile.name : 'Chloe'}: ${m.content}`)
    .join("\n");

  const systemPrompt = `You are 'Chloe', a native speaker chatting on a 1:1 live video call with ${profile.name} (Age: ${profile.age}).
CRITICAL DIRECTIVES:
1. READ & UNDERSTAND ${profile.name}'s specific message context deeply! Connect logically to what they just said.
2. In 'grammarFixNote', inspect if the student's input had any grammar errors in Korean.
3. Perform 3-Stage Sentence Upgrade: nativeUpgrade & advancedUpgrade.
4. reply: Spoken video response (1-2 short, warm sentences ending with a fun follow-up question).
5. translation: Natural Korean translation of reply.

Recent History:
${historySnippet}

Respond strictly in JSON format: {"reply": "...", "translation": "...", "grammarFixNote": "...", "nativeUpgrade": "...", "advancedUpgrade": "..."}`;

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

  if (!res.ok) throw new Error("Gemini API Call Exception");
  const data = await res.json();
  const jsonText = data.candidates[0].content.parts[0].text;
  return JSON.parse(jsonText);
}

function generateNaturalHumanResponse(profile, userText) {
  conversationTurnCount++;
  const shortName = profile.name.split(' ')[1] || profile.name;

  return {
    reply: `I see! That makes total sense, ${shortName}. How are you feeling about everything right now?`,
    translation: `아 그렇군요! 무슨 뜻인지 잘 알겠어요, ${shortName}님. 지금 기분이나 마음은 어떠신가요?`,
    nativeUpgrade: `That makes complete sense to me.`,
    advancedUpgrade: `I fully comprehend your perspective.`,
    grammarFixNote: ""
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
      alert('설정이 저장되었습니다! 이제 Max AI 수준으로 자연스럽게 대화합니다.');
      if (settingsModal) settingsModal.classList.add('hidden');
    });
  }
}

document.addEventListener('DOMContentLoaded', initApp);
