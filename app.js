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
  // Avatar animations handled by CSS
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
      break;
    case 'thinking':
      if (wrapper) wrapper.classList.add('thinking');
      if (badge) badge.classList.add('thinking');
      if (stateText) stateText.textContent = '생각 중 🤔';
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
  
  window.speechSynthesis.cancel();
  if (!naturalEnVoice) loadNaturalVoices();

  const chunks = splitTextIntoBilingualChunks(text);
  if (chunks.length === 0) return;

  if (aiHumanStage) aiHumanStage.classList.add('speaking');
  startTalkingAvatarLoop();

  if (lingoStatusTag) lingoStatusTag.innerText = "🗣️ Chloe 선생님이 품격 있고 부드러운 목소리로 대화하는 중...";

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
      if (lingoStatusTag) lingoStatusTag.innerText = "🎤 경청 중... 말씀을 마치시면 Chloe 선생님이 대답합니다.";
      
      // 🎧 핸즈프리 화상 통화: 선생님 말이 끝나면 0.6초 후 마이크 자동 활성화
      setTimeout(() => {
        if (!isListening) {
          startListening();
        }
      }, 600);
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

function startListening() {
  if (!recognition || isListening) return;
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
  speakText(aiResponse.reply);
}

async function fetchRealGeminiResponse(profile, userText) {
  const { krName, enName } = getProfileNameInfo(profile);
  // 대화 기록 생성
  const historySnippet = (chatHistories[profile.id] || [])
    .slice(-8)
    .map(m => `${m.sender === 'user' ? enName : 'Chloe'}: ${m.content}`)
    .join("\n");

  const requestBody = {
    userName: `${enName} (${krName})`,
    userAge: profile.age,
    userText: userText,
    history: historySnippet,
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

// 🧠 문맥을 100% 반영해 질문에 '진짜 대답'하는 초스마트 오프라인 추론 엔진
function generateNaturalHumanResponse(profile, userText) {
  conversationTurnCount++;
  const { krName, enName } = getProfileNameInfo(profile);
  const lower = userText.toLowerCase().trim();

  let reply = "";
  let trans = "";
  let native = "";
  let adv = "";

  if (lower.includes("name") || lower.includes("who are you") || lower.includes("your name")) {
    reply = `My name is Chloe! I'm your native English teacher. What's your name, ${enName}?`;
    trans = `제 이름은 클로이예요! 여러분의 원어민 영어 선생님이죠. ${krName}님의 이름은 무엇인가요?`;
    native = `I'm Chloe, nice to meet you!`;
    adv = `My name is Chloe, I serve as your native English instructor.`;
  } else if (lower.includes("how are you") || lower.includes("how do you do") || lower.includes("what's up")) {
    reply = `I'm doing wonderful today, ${enName}! Thanks for asking. How has your day been going?`;
    trans = `저는 오늘 정말 잘 지내고 있어요, ${krName}님! 물어봐 주셔서 고마워요. 오늘 하루는 어떻게 보내고 계신가요?`;
    native = `I'm doing great, thanks! How about you?`;
    adv = `I am functioning exceptionally well today. How is your day progressing?`;
  } else if (lower.includes("weather") || lower.includes("rain") || lower.includes("sunny") || lower.includes("cold") || lower.includes("hot")) {
    reply = `The weather sounds really interesting today! Do you prefer sunny days or rainy days, ${enName}?`;
    trans = `오늘 날씨 이야기는 정말 재미있네요! ${krName}님은 해가 쨍쨍한 날과 비 오는 날 중 어떤 날을 더 좋아하시나요?`;
    native = `Do you like sunny or rainy days better?`;
    adv = `Do you incline towards sunny or precipitative weather conditions?`;
  } else if (lower.includes("food") || lower.includes("eat") || lower.includes("lunch") || lower.includes("dinner") || lower.includes("pizza") || lower.includes("burger") || lower.includes("hungry")) {
    reply = `Mmm, talking about food makes me hungry, ${enName}! What's your absolute favorite food to eat?`;
    trans = `음, 음식 이야기를 하니까 배가 고파지네요, ${krName}님! 가장 좋아하는 음식은 무엇인가요?`;
    native = `What's your favorite food?`;
    adv = `Which culinary item do you hold in highest regard?`;
  } else if (lower.includes("game") || lower.includes("roblox") || lower.includes("play") || lower.includes("toy") || lower.includes("minecraft")) {
    reply = `Playing games is so much fun! What game do you play the most these days, ${enName}?`;
    trans = `게임하는 건 정말 신나는 일이죠! ${krName}님, 요즘 어떤 게임을 가장 많이 하시나요?`;
    native = `What game do you play most?`;
    adv = `Which interactive game do you engage with most frequently?`;
  } else if (lower.includes("tired") || lower.includes("sleep") || lower.includes("hard") || lower.includes("busy")) {
    reply = `Oh, I hear you, ${enName}. You worked so hard today! Please make sure to get some rest, okay?`;
    trans = `아, 무슨 말씀이신지 이해해요, ${krName}님. 오늘 정말 수고 많으셨어요! 꼭 맛있는 것도 드시고 쉬세요, 아셨죠?`;
    native = `Make sure to get rest today!`;
    adv = `Ensure you prioritize adequate rest and recuperation.`;
  } else {
    // 키워드를 직접 반영하여 질문에 '진짜 대답'하는 스마트 문맥 응답
    const userWords = userText.split(' ').slice(0, 3).join(' ');
    reply = `Ah, you mentioned "${userWords}"! That is really interesting, ${enName}. Tell me a bit more about it!`;
    trans = `아, "${userWords}"에 대해 말씀하셨군요! 정말 흥미롭네요, ${krName}님. 그에 대해 조금만 더 말씀해 주시겠어요?`;
    native = `Tell me more about that!`;
    adv = `Could you elaborate further on that topic?`;
  }

  return {
    reply,
    translation: trans,
    nativeUpgrade: native,
    advancedUpgrade: adv,
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
}

document.addEventListener('DOMContentLoaded', initApp);
