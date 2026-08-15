/**
 * web_app/app.js
 * ----------------------------------------------------------------------------
 * 전체 오케스트레이션.
 *
 *   [마이크] ──침묵게이트──▶ [Gemini Live] ──음성──▶ [아바타 + 스피커]
 *                                  │
 *                                  ├── 자막 (내 말 / 선생님 말)
 *                                  └── 도구 호출 ──▶ 단어카드 · 교정카드 · 칭찬
 *
 * 비용 절감의 핵심 동작:
 *   마이크는 계속 켜져 있지만(로컬 처리는 무료),
 *   말을 안 하면 서버 연결을 끊고, 다시 말하면 즉시 이어붙입니다.
 *   사용자 입장에서는 "항상 켜져 있는" 느낌인데 요금은 말한 시간만 나갑니다.
 * ----------------------------------------------------------------------------
 */
 
import {
  PROFILES, COST, AVATAR_MODE, DAILY_MISSIONS, ADULT_SCENARIOS,
  CHILD_STAGES, CHILD_GAMES, AUDIO, APP_VERSION,
} from './src/config.js';
import { MicStream } from './src/mic.js';
import { AudioPlayer } from './src/player.js';
/* ⚠️ 원래 './src/liveSession.js' (Gemini Live API, WebSocket 실시간 음성) 였습니다.
      Live API 가 이 계정에서 열리지 않는 것을 확인해서, 한 턴씩 주고받는
      방식(일반 Gemini + Gemini TTS)으로 바꿨습니다.
      chatSession.js 가 **같은 신호 규격**을 그대로 내보내므로 아래 코드는
      거의 그대로입니다. 3D 아바타·재생기·마이크는 손대지 않았습니다.
      liveSession.js 는 지우지 않고 남겨뒀습니다 — Live API 가 열리면
      이 import 한 줄만 되돌리면 됩니다. */
import { LiveSession, LiveState } from './src/chatSession.js';
import { AvatarManager } from './src/avatar.js';
import { UsageMeter } from './src/usage.js';
import { translate, makeQuiz } from './src/assist.js';
import * as UI from './src/ui.js';
import {
  saveVocabulary, promoteVocabulary, listVocabulary, listDueVocabulary, deleteVocabulary,
  saveCorrection, listCorrections, errorTypeStats,
  saveSession, buildRecentSummary,
  loadSettings, saveSettings,
  getStage, getStageInfo, setStage, recordStageSuggestion,
  getCurrentFrame, setCurrentFrame,
  appendMessage, listRecentConversations, pruneOldMessages,
} from './src/storage.js';
import { buildReportText, downloadText, copyText } from './src/report-export.js';
 
/* ═══════════════════════════════════════════════════════════════════════════
   앱 상태
   ═══════════════════════════════════════════════════════════════════════════ */
 
const app = {
  settings: loadSettings(),
  usage: new UsageMeter(),
 
  profile: null,
  mic: null,
  player: null,
  live: null,
  avatar: null,
 
  /** 통화 중인지 (사용자가 시작했는지) */
  inCall: false,
  /** 재연결 진행 중 (중복 연결 방지) */
  reconnecting: false,
  /** 연속 재연결 실패 횟수 (백오프 계산용) */
  resumeFailStreak: 0,
  /** 이 시각 전에는 재연결을 시도하지 않습니다 */
  resumeBackoffUntil: 0,
  /**
   * 설정 오류처럼 "다시 해도 소용없는" 이유. 값이 있으면 재시도를 멈춥니다.
   * 통화를 새로 시작하면 지워집니다.
   */
  resumeBlockedReason: null,
  /** 재연결 동안 잠시 담아두는 오디오 프레임 */
  pendingFrames: [],
 
  /**
   * 끼어든 직후, 이미 날아오고 있던 선생님 음성을 버리는 기간(타임스탬프).
   *
   * 끼어들면 서버가 생성을 멈추지만, 그 신호가 도착하기까지 수백 ms 동안
   * 이미 전송된 음성 조각이 계속 들어옵니다. 그걸 그대로 재생하면
   *  ① 끼어들었는데 선생님이 계속 말하고
   *  ② player.speaking 이 다시 true 가 되면서 문턱(duck)이 다시 올라가
   *     방금 말하기 시작한 아이 목소리가 문턱 아래로 떨어져 발화가 잘립니다.
   * 서버가 interrupted / turnComplete 를 보내주면 즉시 해제됩니다.
   */
  bargeGuardUntil: 0,
 
  /** 마지막으로 확정된 "내 말" (같은 말이 두 번 찍히는 걸 막습니다) */
  lastUserFinal: null,
  /** 선생님이 **지금 말하고 있는** 문장 (스피커 되돌림 판별용) */
  teacherOnAirText: '',
  /** 스피커 소리가 마이크로 되돌아온 것으로 확인된 횟수 */
  echoHits: 0,
  /** 통화 시작이 진행 중 (두 번 눌림 방지) */
  starting: false,
 
  idleTimer: null,
  mission: { text: '', done: false },
  /** 이번 통화 식별자 (대화 기록을 묶는 값) */
  sessionId: '',
  /** 아이의 현재 학습 단계 (어른이면 null) */
  stage: null,
  /** 단계가 바뀌어서 다음 턴에 세션을 새로 열어야 하는지 */
  pendingStageReconnect: false,
 
  /**
   * 진단 정보.
   * 실제 통화가 이상할 때 무엇이 잘못됐는지 알려면 이 숫자들이 필요합니다.
   * (설정에서 "진단 정보 보기"를 켜면 화면에 표시됩니다)
   */
  diag: {
    connects: 0,
    activityStart: 0,
    activityEnd: 0,
    framesSent: 0,
    turns: 0,
    interrupts: 0,
    endOfSpeechMs: 0,
    resumed: false,
    lastError: '',
    /** 선생님 목소리가 마이크로 되돌아와서 버린 인식 결과 수 */
    echoDropped: 0,
    /** 같은 말이 두 번 인식되어 하나로 합친 횟수 */
    dupMerged: 0,
    /** 선생님이 말하는 중에 발화가 시작된 횟수 (에코인지 진짜 끼어들기인지 판단) */
    startsWhileTeacher: 0,
    /** 측정된 스피커 누출 크기 (0에 가까울수록 좋음. 이어폰이면 거의 0) */
    echoFloor: 0,
  },
  /** 마지막으로 선생님이 한 말 (번역 버튼용) */
  lastTeacherLine: '',
  /** 이번 통화에서 이미 카드로 띄운 표현 (같은 걸 반복해서 띄우지 않게) */
  seenKeywords: new Set(),
 
  session: {
    startedAt: 0,
    /** 세션 시작 시점의 오늘 누적 사용량 (세션 분량 계산용) */
    startUsageMin: 0,
    turns: 0,
    newWords: [],
    highlights: [],
    topics: [],
    /** 이번 대화에서 연습한 문장 틀 */
    frames: [],
  },
};
 
/* ═══════════════════════════════════════════════════════════════════════════
   시작
   ═══════════════════════════════════════════════════════════════════════════ */
 
function boot() {
  UI.initUi();
  const v = document.getElementById('app-version');
  if (v) v.textContent = APP_VERSION;
  // 오래된 대화는 정리합니다 (저장 공간 보호)
  void pruneOldMessages(30).catch(() => {});
  renderProfileScreen();
  wireGlobalControls();
  UI.showScreen('profile');
 
  // 저장돼 있던 "안전 모드"를 자동으로 껐다면 반드시 알려줍니다.
  // 조용히 바꿔놓으면, 에코 때문에 일부러 켜뒀던 분은 이유도 모른 채
  // 소리가 울리기 시작합니다.
  if (app.settings._notifyHalfDuplexReset) {
    delete app.settings._notifyHalfDuplexReset;
    saveSettings(app.settings);
    UI.toast(
      '내 말이 두 번 인식되던 문제를 고쳤습니다. 선생님 말을 끊고 싶을 땐 ' +
      '화면의 ✋ 버튼을 누르세요.',
      { variant: 'info', ttlMs: 9000 }
    );
  }
}
 
function renderProfileScreen() {
  UI.renderProfiles(PROFILES, {
    usageOf: (id) => ({
      usedMin: app.usage.todayMinutes(id),
      limitMin: app.usage.dailyLimit(id),
      exhausted: app.usage.isExhausted(id),
    }),
    onSelect: (profile) => startCall(profile).catch(handleFatal),
  });
}
 
/**
 * 놀이/상황 목록.
 * 아이는 지금 단계에 맞는 말놀이만 보여줍니다 —
 * 0단계 아이에게 "비즈니스 미팅"을 보여주면 아무 의미가 없습니다.
 */
function renderGameList() {
  const isChild = app.stage !== null;
  const items = isChild ? (CHILD_GAMES[app.stage] || []) : ADULT_SCENARIOS;
 
  UI.renderRoleplay(items, {
    onSelect: (item) => {
      UI.closeModal('roleplay-modal');
      if (!app.inCall) {
        UI.toast('먼저 대화를 시작해 주세요.', { variant: 'warn' });
        return;
      }
 
      // 텍스트 한 줄만 넣어주면 됩니다 (음성 토큰 소모 없음)
      const prompt = isChild
        ? `[놀이 시작] 지금부터 "${item.title}" 놀이를 하자. ${item.desc}. ` +
          `${app.stage}단계 규칙을 그대로 지키면서, 짧게 한마디로 시작해줘.`
        : `[상황 설정] 지금부터 "${item.title}" 상황으로 역할극을 시작하자. ` +
          `${item.desc}. 너가 상대 역할을 맡고, 짧게 첫 대사를 던져줘.`;
 
      sendTextToTeacher(prompt, { echo: false });
      UI.toast(`${item.title} 시작!`, { variant: 'success' });
    },
  });
}
 
/* ═══════════════════════════════════════════════════════════════════════════
   통화 시작 / 종료
   ═══════════════════════════════════════════════════════════════════════════ */
 
async function startCall(profile) {
  // 두 번 눌리면(두 번 탭, 더블클릭) 마이크와 세션이 **두 벌** 생깁니다.
  // 그러면 같은 목소리가 두 번 전송되어 인식도 두 번 됩니다.
  if (app.inCall || app.starting) return;
  if (app.usage.isExhausted(profile.id)) {
    UI.toast(`${profile.name}는 오늘 목표를 다 채웠어요! 내일 또 만나요 🎉`, {
      variant: 'warn', ttlMs: 6000,
    });
    return;
  }
  app.starting = true;
  try {
    await startCallInner(profile);
  } finally {
    app.starting = false;
  }
}
 
async function startCallInner(profile) {
  app.profile = profile;
  app.inCall = true;
  // 아이는 저장된 학습 단계를 불러옵니다 (선생님이 판단해 올려둔 값)
  app.stage = profile.kind === 'child' ? getStage(profile.id) : null;
  app.pendingStageReconnect = false;
  // 새 통화니까 지난 실패 기록은 지웁니다.
  // (설정을 고치고 다시 시작했는데 계속 막혀 있으면 안 됩니다)
  // liveAnnounced: '연결됐다'를 이미 셌는지. @see handleLiveState
  app.liveAnnounced = false;
  app.resumeFailStreak = 0;
  app.resumeBackoffUntil = 0;
  app.resumeBlockedReason = null;
  app.diag = {
    connects: 0, activityStart: 0, activityEnd: 0, framesSent: 0,
    turns: 0, interrupts: 0, endOfSpeechMs: 0, resumed: false, lastError: '', level: 0,
    echoDropped: 0, dupMerged: 0, startsWhileTeacher: 0, echoFloor: 0,
  };
  app.lastUserFinal = null;
  app.teacherOnAirText = '';
  app.echoHits = 0;
  app.bargeGuardUntil = 0;
  // 이번 통화를 식별할 값 (대화 기록을 묶는 데 씁니다)
  app.sessionId = `${profile.id}-${Date.now()}`;
  app.session = {
    startedAt: Date.now(),
    startUsageMin: app.usage.todayMinutes(profile.id),
    turns: 0, newWords: [], highlights: [], topics: [], frames: [],
  };
 
  UI.showScreen('call');
  UI.setActiveProfile(profile);
  UI.setStageChip(app.stage !== null ? CHILD_STAGES[app.stage] : null);
  renderGameList();
  UI.clearTranscript();
  UI.clearTeachingCards();
  app.seenKeywords.clear();
  UI.setUserEcho('');
  UI.setTeacherSubtitle('');
  UI.setKoreanSubtitle('');
  UI.setTranslateAvailable(false);
  app.lastTeacherLine = '';
  UI.setAvatarState('connecting');
  UI.setStatus('선생님을 연결하고 있어요...');
  // 프로필을 막 바꿨으므로 throttle을 무시하고 즉시 갱신합니다
  // (안 그러면 직전 아이의 사용량이 잠깐 그대로 보입니다)
  refreshUsageUi({ force: true });
 
  pickMission(profile);
 
  // ── 1. 오디오 재생기 ──────────────────────────────────────────────
  app.player = new AudioPlayer({
    onSpeakingChange: (speaking) => {
      UI.setAvatarState(speaking ? 'speaking' : app.live?.isLive ? 'listening' : 'idle');
      app.avatar?.setState(speaking ? 'speaking' : 'listening');
      // 선생님이 말하는 동안 마이크를 어떻게 다룰지.
      //  barge(기본) = 끄지 않고 문턱만 높임 → 언제든 끼어들 수 있음
      //  mute        = 완전히 닫음 → 에코는 확실히 막지만 끼어들 수 없음
      app.mic?.setTeacherSpeaking(speaking, app.settings.halfDuplex ? 'mute' : 'barge');
      // ✋ 버튼은 **모드와 상관없이** 띄웁니다.
      // 안전 모드에서는 마이크가 닫혀 있어서 목소리로는 끼어들 수 없으므로,
      // 오히려 이 버튼이 유일한 방법입니다. (forceSpeak가 억제를 풀어줍니다)
      UI.setInterruptVisible(speaking);
    },
  });
  await app.player.init();
 
  // ── 2. 아바타 ────────────────────────────────────────────────────
  app.avatar = new AvatarManager({
    container: UI.refs()['avatar-stage'],
    imageSrc: 'assets/chloe_teacher_avatar.jpg',
    getLevel: () => app.player?.getLevel() ?? 0,
    getMouthWidth: () => app.player?.getMouthWidth() ?? 0.5,
    faceMap: app.settings.faceMap,
    // 목사님이 readyplayer.me 에서 직접 만드신 아바타가 있으면 그걸 씁니다.
    avatarModelUrl: app.settings.avatarModelUrl,
    onAvatarMs: (ms) => app.usage.addAvatar(profile.id, ms),
    onModeChange: (mode, note) => {
      // 영상(Simli) 모드에서만 Simli가 직접 소리를 냅니다. 그때만 로컬 재생을
      // 끕니다. 사진·3D 모드는 **반드시** 우리 재생기가 소리를 내야 합니다.
      // ⚠️ 예전에 이 조건이 `=== PHOTO` 였습니다. 3D 모드를 추가하는 순간
      //    3D에서 소리가 통째로 사라지는 버그가 됩니다. 반드시 "영상이 아닐 때"
      //    로 적어야 모드를 더 늘려도 안전합니다.
      app.player?.setLocalOutputEnabled(mode !== AVATAR_MODE.VIDEO);
      // 영상 모드는 스피커 소리가 우리 재생기보다 늦게 끝납니다.
      // 문턱을 먼저 내리면 남은 선생님 목소리를 사람 말로 잡습니다.
      applyDuckRelease(mode);
      if (note) UI.toast(note, { variant: 'warn', ttlMs: 7000 });
    },
  });
  // ⚠️ 아바타가 안 뜨는 건 대화를 막을 이유가 아닙니다.
  //    예전에는 사진 파일이 404 나면 여기서 예외가 통째로 튀어나가
  //    inCall 이 true 인 채로 죽은 통화 화면에 갇혔습니다.
  //    얼굴 없이라도 대화는 되게 하고, 사용자에게만 알려줍니다.
  try {
    await app.avatar.mount(app.settings.avatarMode);
  } catch (err) {
    console.error('[app] 아바타를 붙이지 못했습니다', err);
    UI.toast('선생님 얼굴을 불러오지 못했어요. 목소리로는 그대로 대화할 수 있습니다.', {
      variant: 'warn', ttlMs: 7000,
    });
  }
 
  // ── 3. Live 세션 ─────────────────────────────────────────────────
  app.live = new LiveSession({
    // 말의 시작과 끝을 서버에 직접 알립니다.
    // 이게 없으면 서버가 끊긴 조각을 하나로 이어붙여 턴이 끝나지 않습니다.
    onVadConfig: (ms) => {
      app.diag.endOfSpeechMs = ms;
      app.mic?.setEndOfSpeechMs(ms);
      // 자동 검사에서 확인할 수 있게 남겨둡니다 (동작에는 영향 없음)
      window.__eosApplied = ms;
    },
 
    /* 설정 사다리를 타는 중이라는 걸 화면에 보여줍니다.
       아무 말 없이 몇 초씩 멈춰 있으면 고장난 줄 아시기 때문입니다. */
    onLadderStep: (text) => {
      UI.setStatus(text);
    },
    onAudio: handleTeacherAudio,
    onUserText: handleUserText,
    onTeacherText: handleTeacherText,
    onToolCall: handleToolCall,
    onInterrupted: handleInterrupted,
    onTurnComplete: handleTurnComplete,
    onState: handleLiveState,
  });
 
  // ── 4. 마이크 ────────────────────────────────────────────────────
  app.mic = new MicStream({
    onActivity: (kind) => {
      // 세션이 끊겨 있으면 LiveSession이 알아서 무시합니다.
      // (중복 start / 고아 end 를 막는 책임은 LiveSession에 있습니다)
      if (kind === 'start') {
        if (app.live?.sendActivityStart()) app.diag.activityStart++;
        if (app.player?.speaking) app.diag.startsWhileTeacher++;
 
        // 선생님이 말하는 중에 사람이 말을 시작했다 = 끼어들기.
        // (이 신호는 MIN_UTTERANCE_MS 만큼 확인된 "진짜 말"일 때만 옵니다.
        //  문 닫는 소리로는 여기까지 오지 않습니다)
        if (app.player?.speaking && !app.settings.halfDuplex) beginBarge();
      } else {
        if (app.live?.sendActivityEnd()) app.diag.activityEnd++;
      }
      updateDiagnostics({ force: true });
    },
    onAudioFrame: handleMicFrame,
    onLevel: (level, speaking) => {
      UI.setMicLevel(level, speaking);
      app.diag.level = level;
      if (app.settings.showDiagnostics) updateDiagnostics();
      if (speaking && !app.player?.speaking) {
        UI.setAvatarState('listening');
        app.avatar?.setState('listening');
      }
    },
    onStreamedMs: (ms) => app.usage.addAudioIn(profile.id, ms),
  });
  // ⚠️ 설정값이 아니라 **실제로 붙은** 아바타 모드를 봐야 합니다.
  //    영상 아바타 연결이 실패하면 사진으로 되돌아가는데, 설정값은 여전히
  //    'video'입니다. 그대로 쓰면 사진 모드인데도 문턱이 0.7초씩 더 높게
  //    유지되어, 바로 대답하는 아이 말이 그 사이에 묻힙니다.
  //    (아바타는 마이크보다 먼저 붙기 때문에 mount 중의 onModeChange 는
  //     app.mic 이 아직 null 이라 그냥 지나갑니다. 그래서 여기서 한 번 더 겁니다)
  applyDuckRelease(app.avatar?.mode ?? app.settings.avatarMode);
 
  // 자동 검사용 훅 (동작에는 영향 없음)
  window.__forceActivityStart = () => app.live?.sendActivityStart();
  window.__forceActivityEnd = () => app.live?.sendActivityEnd();
  // 선생님이 말하기 시작/끝났을 때의 마이크 상태를 검사에서 확인하기 위한 훅.
  // (실제 오디오를 재생하지 않고도 끼어들기 경로를 검증할 수 있게 합니다)
  window.__setTeacherSpeaking = (speaking) => {
    app.player.speaking = !!speaking;
    app.player.onSpeakingChange?.(!!speaking);
  };
  window.__diag = () => ({ ...app.diag });
  // 검사용: 모드를 직접 바꿔 봅니다
  window.__setHalfDuplex = (on) => {
    app.settings.halfDuplex = !!on;
    app.mic?.setTeacherSpeaking(!!app.player?.speaking, on ? 'mute' : 'barge');
  };
  window.__micState = () => ({
    suppressed: !!app.mic?.suppressed,
    duck: app.mic?.gate?.duckFactor ?? null,
    speaking: !!app.mic?.isSpeaking(),
  });
 
  try {
    await app.mic.start();
  } catch (err) {
    console.error('[app] 마이크 시작 실패', err);
    UI.setAvatarState('error');
    UI.setStatus('마이크 권한이 필요합니다.');
    UI.toast('마이크 사용을 허용해 주세요. 주소창의 자물쇠 아이콘에서 바꿀 수 있습니다.', {
      variant: 'error', ttlMs: 9000,
    });
    // ⚠️ 여기서 그냥 return하면 inCall이 true로 남습니다.
    //    그러면 마이크 버튼이 "들리지 않는데 요금은 나가는" 세션을 열고,
    //    유휴 감시도 안 돌아서 자동으로 끊기지도 않습니다. 반드시 정리합니다.
    await endCall();
    return;
  }
 
  // ── 5. 연결 ──────────────────────────────────────────────────────
  await connectLive();
  // 서버가 알려준 값이 있으면 마이크에 반영 (연결이 마이크보다 늦게 끝남)
  if (app.diag.endOfSpeechMs) app.mic?.setEndOfSpeechMs(app.diag.endOfSpeechMs);
 
  // 연결 도중 사용자가 나갔으면(뒤로가기) 여기서 멈춥니다.
  // 안 그러면 세션 수가 부풀고, 주인 없는 3초 감시 타이머가 남습니다.
  if (!app.inCall) return;
 
  // 연결이 끝나기 전에 이미 말을 시작했을 수 있습니다 (마이크가 먼저 켜짐).
  // 그 첫 마디를 새 세션에 이어붙입니다.
  flushPendingAudio();
 
  app.usage.addSession(profile.id);
  startIdleWatch();
}
 
/** Live 세션 연결 (첫 연결 및 재연결 공통) */
async function connectLive() {
  const profile = app.profile;
  if (!profile || !app.live) return;
 
  const [dueWords, allWords, recentSummary] = await Promise.all([
    listDueVocabulary(profile.id, 12),
    listVocabulary(profile.id, { limit: 60 }),
    buildRecentSummary(profile.id),
  ]);
 
  // 복습할 단어를 앞에 놓아 선생님이 우선적으로 다시 등장시키게 합니다
  const knownWords = [...dueWords.map((v) => v.word), ...allWords.map((v) => v.word)]
    .filter((w, i, arr) => arr.indexOf(w) === i)
    .slice(0, 60);
 
  await app.live.connect(profile.id, {
    recentSummary,
    knownWords,
    todayMission: app.mission.text,
    // 이번 통화에서 이미 한 번 연결한 적이 있으면 재연결입니다.
    // 그때마다 인사를 다시 하면 "같은 말을 반복"하는 것처럼 보입니다.
    isResume: app.diag.connects > 0,
    // 아이만 해당 — 서버가 이 단계에 맞는 교수법과 도구를 골라줍니다
    ...(app.stage !== null
      ? {
          stage: app.stage,
          currentFrame: getCurrentFrame(profile.id),
          // 부모가 설정에서 바꾼 읽기 여부를 선생님도 알아야 합니다.
          // 안 보내면 카드만 바뀌고 선생님은 계속 옛 기준으로 말합니다.
          canRead: currentCanRead(),
        }
      : {}),
  });
}
 
async function endCall({ backToProfiles = true } = {}) {
  stopIdleWatch();
  app.inCall = false;
 
  await saveSessionSummary();
 
  await app.live?.disconnect({ keepContext: false });
  await app.mic?.stop();
  await app.player?.close();
  await app.avatar?.unmount();
 
  app.lastTeacherLine = '';
  app.live = null;
  app.mic = null;
  app.player = null;
  app.avatar = null;
  app.pendingFrames = [];
 
  app.usage.flush();
 
  if (backToProfiles) {
    renderProfileScreen();
    UI.showScreen('profile');
  }
}
 
async function saveSessionSummary() {
  if (!app.profile || !app.session.startedAt || app.session.turns === 0) return;
  try {
    await saveSession(app.profile.id, {
      startedAt: app.session.startedAt,
      endedAt: Date.now(),
      turns: app.session.turns,
      // 오늘 누적이 아니라 **이번 세션**에서 늘어난 만큼만 기록합니다
      minutes: Math.max(
        0,
        app.usage.todayMinutes(app.profile.id) - (app.session.startUsageMin || 0)
      ),
      topics: app.session.topics.slice(-5),
      highlights: app.session.highlights.slice(-5),
      newWords: app.session.newWords.slice(-15),
      frames: app.session.frames.slice(-5),
      stage: app.stage,
    });
  } catch (err) {
    console.warn('[app] 세션 요약 저장 실패', err);
  }
}
 
/* ═══════════════════════════════════════════════════════════════════════════
   오디오 흐름
   ═══════════════════════════════════════════════════════════════════════════ */
 
/** 마이크 프레임 → 서버. 유휴로 끊겨 있으면 되살립니다. */
function handleMicFrame(base64) {
  if (!app.inCall) return;
  app.diag.framesSent++;
 
  // 화면이 안 보이는 상태(다른 탭/앱)에서는 생활소음으로 재연결되지 않게 막습니다.
  // 이게 없으면 숨겨둔 탭이 혼자 다시 연결해서 요금을 씁니다.
  if (document.hidden) return;
 
  if (app.live?.isLive) {
    app.live.sendAudio(base64);
    return;
  }
 
  // 끊긴 상태에서 다시 말을 시작함 → 조용히 이어붙입니다
  app.pendingFrames.push(base64);
  // 최근 2초분만 유지 (무한정 쌓이지 않게)
  const frameMs = (AUDIO.FRAME_SAMPLES / AUDIO.INPUT_SAMPLE_RATE) * 1000;
  const maxFrames = Math.ceil(2000 / frameMs);
  while (app.pendingFrames.length > maxFrames) app.pendingFrames.shift();
 
  void resumeLive();
}
 
/**
 * 새 세션이 열린 직후 호출합니다.
 *
 * ⭐ 세션이 없는 동안 말을 시작했다면, 새 세션에는 그 사실이 없습니다.
 *    모아둔 오디오를 그냥 보내면 발화 구간 밖의 소리가 되어 통째로 버려집니다.
 *    반드시 "말 시작"을 먼저 알린 뒤에 밀어넣어야 합니다.
 *
 * 첫 연결(startCall)과 재연결(resumeLive) 양쪽에서 씁니다. 예전에는 재연결에만
 * 있어서, 마이크 권한을 허용하자마자 말한 첫 마디가 통째로 사라졌습니다.
 */
function flushPendingAudio() {
  if (!app.inCall || !app.live?.isLive) return;
 
  const frames = app.pendingFrames;
  app.pendingFrames = [];
  if (!frames.length) {
    // 모아둔 게 없어도, 말하는 중이었다면 새 세션에 그 사실을 알려야 합니다
    if (app.mic?.isSpeaking() && app.live.sendActivityStart()) app.diag.activityStart++;
    return;
  }
 
  // ⚠️ 여기서 activityStart 를 조건부로 보내면 안 됩니다.
  //    재연결이 2.4초(SILENCE_TAIL_MS)보다 오래 걸리면 게이트는 이미 닫혀서
  //    isSpeaking()이 false 입니다. 그런데 모아둔 오디오는 그대로 보내면
  //    발화 구간 밖의 소리가 되어 서버가 통째로 버립니다.
  //    (서버 자동 감지를 껐으므로 구간 밖 오디오는 존재하지 않는 것과 같습니다)
  //    → "말 시작"을 열고, 오디오를 보내고, 게이트가 이미 닫혔으면 곧바로
  //       "말 끝"까지 알려서 선생님이 반드시 대답하게 만듭니다.
  const stillSpeaking = !!app.mic?.isSpeaking();
  if (app.live.sendActivityStart()) app.diag.activityStart++;
  for (const frame of frames) app.live.sendAudio(frame);
  if (!stillSpeaking) {
    if (app.live.sendActivityEnd()) app.diag.activityEnd++;
  }
}
 
async function resumeLive() {
  if (app.reconnecting || !app.inCall || !app.live) return;
  if (app.live.state === LiveState.CONNECTING) return;
 
  /* ⚠️ 백오프.
     resumeLive() 는 마이크 오디오 프레임 핸들러에서도 불립니다 —
     초당 수십 번입니다. 실패한 직후 곧바로 다시 부르면 토큰 발급을
     끝없이 재시도하는 열띤 루프가 됩니다. 실제로 키가 잘못됐을 때
     서버 로그가 400 으로 도배되고 화면은 오류 알림으로 덮였습니다.
     실패할수록 간격을 늘리고, 설정 오류면 아예 멈춥니다.            */
  if (app.resumeBlockedReason) return;
  if (app.resumeBackoffUntil && Date.now() < app.resumeBackoffUntil) return;
 
  // 대화 중에 하루 한도를 넘으면 여기서 멈춥니다
  if (app.usage.isExhausted(app.profile.id)) {
    UI.setStatus('오늘 목표를 다 채웠어요! 🎉');
    UI.toast(`${app.profile.name}, 오늘 영어 목표 완료! 내일 또 만나요 🎉`, {
      variant: 'success', ttlMs: 8000,
    });
    await endCall();
    return;
  }
 
  app.reconnecting = true;
  UI.setStatus('선생님을 다시 부르고 있어요...');
 
  try {
    await connectLive();
    // 연결하는 동안 사용자가 통화를 끊었을 수 있습니다 (app.live가 null이 됨)
    if (!app.inCall || !app.live) {
      app.pendingFrames = [];
      return;
    }
    flushPendingAudio();
    UI.setStatus('편하게 말해 보세요.');
    // 성공했으니 실패 기록을 지웁니다
    app.resumeFailStreak = 0;
    app.resumeBackoffUntil = 0;
  } catch (err) {
    console.error('[app] 재연결 실패', err);
    app.resumeFailStreak = (app.resumeFailStreak || 0) + 1;
 
    if (err?.permanent) {
      /* 설정 문제입니다. 다시 시도해봐야 똑같습니다.
         재시도를 완전히 멈추고, 원인을 그대로 보여줍니다.
         (숫자 대신 서버가 준 안내문이 여기까지 올라옵니다) */
      app.resumeBlockedReason = err.message;
      UI.setStatus('설정을 확인해 주세요.');
      UI.toast(err.message, { variant: 'error', ttlMs: 20000 });
    } else {
      // 일시적 문제 — 1초, 2초, 4초… 최대 30초까지 간격을 늘립니다
      const wait = Math.min(30000, 1000 * Math.pow(2, app.resumeFailStreak - 1));
      app.resumeBackoffUntil = Date.now() + wait;
      UI.setStatus('연결에 문제가 있어요. 마이크 버튼을 다시 눌러주세요.');
      // 알림은 처음 한 번만. 안 그러면 화면이 오류 알림으로 덮입니다.
      if (app.resumeFailStreak === 1) {
        UI.toast(`연결이 끊겼어요. 다시 시도합니다… (${err.message})`, {
          variant: 'warn', ttlMs: 7000,
        });
      }
    }
  } finally {
    app.reconnecting = false;
  }
}
 
/** 선생님 음성 조각 도착 */
function handleTeacherAudio(pcm16) {
  // 요금 계산용: 받은 오디오 길이 (버리더라도 서버는 이미 만들었으므로 집계합니다)
  app.usage.addAudioOut(app.profile.id, (pcm16.length / AUDIO.OUTPUT_SAMPLE_RATE) * 1000);
  refreshUsageUi();
 
  // 방금 끼어들었다면, 이미 날아오고 있던 조각은 재생하지 않고 버립니다.
  // (재생하면 끼어들었는데도 선생님이 계속 말하고, duck 이 다시 걸립니다)
  if (app.bargeGuardUntil && Date.now() < app.bargeGuardUntil) return;
  app.bargeGuardUntil = 0;
 
  // 영상 아바타 모드면 Simli가 소리까지 내주고, 사진 모드면 우리가 재생합니다.
  // player는 어느 쪽이든 타이밍/립싱크 추적용으로 계속 돌립니다.
  app.avatar?.pushAudio(pcm16);
  app.player?.push(pcm16);
}
 
/** 사용자가 끼어들었음 → 예약된 음성 전부 폐기 */
function handleInterrupted() {
  app.diag.interrupts++;
  // 서버가 "멈췄다"고 확인해줬으므로, 뒤늦게 오던 조각을 버릴 이유가 없어집니다
  app.bargeGuardUntil = 0;
  app.player?.flush();
  app.avatar?.interrupt();
  UI.setTeacherSubtitle('');
  UI.setInterruptVisible(false);
}
 
/**
 * 사람이 말을 시작해서 선생님 말을 끊는 순간에 하는 일.
 *
 * 서버의 interrupted 신호를 기다리면 몇백 ms 늦습니다. 그동안
 * 이미 받아둔 음성이 계속 재생돼서 목소리가 겹치고, player.speaking 이
 * 살아 있는 바람에 문턱이 다시 올라가 방금 시작한 말이 잘립니다.
 * 그래서 로컬에서 먼저 끊고, 뒤늦게 오는 조각도 잠깐 버립니다.
 */
/** 아바타 모드에 맞는 duck 해제 지연을 마이크에 적용합니다 */
function applyDuckRelease(mode) {
  const ms = COST.DUCK_RELEASE_MS?.[mode] ?? COST.DUCK_RELEASE_MS?.photo ?? 150;
  app.mic?.setDuckReleaseMs(ms);
}
 
function beginBarge() {
  app.bargeGuardUntil = Date.now() + COST.BARGE_GUARD_MS;
  app.player?.flush();
  app.avatar?.interrupt();
  UI.setInterruptVisible(false);
}
 
/**
 * 사용자가 ✋ 버튼으로 직접 끼어들었을 때.
 *
 * 소리로 끼어드는 경로(마이크 문턱 낮추기)가 실패하는 경우가 있습니다.
 * 스피커 볼륨이 크거나, 아이 목소리가 작거나, 반이중 모드가 켜져 있을 때입니다.
 * 이 버튼은 그 모든 경우를 무시하고 강제로 내 차례를 엽니다.
 */
function interruptTeacher() {
  app.diag.interrupts++;
 
  // 1) 재생 대기 중인 음성을 버리고, 뒤늦게 오는 조각도 잠시 버립니다
  beginBarge();
  UI.setTeacherSubtitle('');
  UI.setKoreanSubtitle('');
 
  // 2) 마이크를 즉시 엽니다.
  //    forceSpeak()는 억제와 문턱을 풀고, 게이트가 닫혀 있었다면 열면서
  //    onActivity('start')로 "말 시작"까지 알립니다(= 아래 3은 건너뜁니다).
  app.mic?.setTeacherSpeaking(false, 'barge');
  const opened = app.mic?.forceSpeak();
 
  // 3) 이미 열려 있어서 forceSpeak가 아무것도 안 했다면, 서버 쪽 발화 구간이
  //    정말로 열려 있는지 한 번 더 확인합니다. 게이트는 열려 있는데 그 사이
  //    세션이 새로 연결됐다면 서버는 발화가 시작된 걸 모릅니다. 그러면 지금
  //    보내는 오디오가 통째로 버려지고 선생님은 계속 혼자 말합니다.
  //    (forceSpeak가 이미 보냈을 때 또 세면 진단 숫자의 start/end 짝이
  //     어긋나서, 정작 진짜 어긋남을 찾을 때 못 알아봅니다)
  if (!opened && app.live?.sendActivityStart()) app.diag.activityStart++;
 
  UI.setStatus('말씀하세요. 듣고 있어요.');
  UI.setAvatarState('listening');
  app.avatar?.setState('listening');
  updateDiagnostics({ force: true });
}
 
/* ═══════════════════════════════════════════════════════════════════════════
   자막 · 대화 기록
   ═══════════════════════════════════════════════════════════════════════════ */
 
/** 비교용 정규화 — 대소문자, 문장부호, 띄어쓰기 차이는 무시합니다 */
function normalizeForCompare(text) {
  return String(text || '').toLowerCase().replace(/[^a-z0-9가-힣]/g, '');
}
 
/**
 * 두 문장이 사실상 같은 말인지.
 * 한쪽이 다른 쪽을 통째로 품고 있으면 같은 말로 봅니다
 * (인식 결과가 늦게 길어지는 경우가 흔합니다).
 */
function looksLikeSameUtterance(a, b) {
  const x = normalizeForCompare(a);
  const y = normalizeForCompare(b);
  if (!x || !y) return false;
  if (x === y) return true;
  const [short, long] = x.length <= y.length ? [x, y] : [y, x];
  if (short.length < 4) return false;
  return long.includes(short) && short.length / long.length >= 0.6;
}
 
function handleUserText(text, final) {
  UI.setUserEcho(text, final);
  if (!final) return;
 
  /* ── 1. 선생님 목소리가 마이크로 되돌아온 흔적인가? ──────────────────
     이 앱의 선생님은 **일부러 아이 말을 따라 말합니다**
     (아이: "Dog!" → 선생님: "Big dog!"). 스피커로 들으면 그 소리가 마이크로
     되돌아가 아이가 두 번 말한 것처럼 기록됩니다.
 
     ⚠️ 그렇다고 여기서 **지우지는 않습니다.**
        지우려면 "이건 사람이 아니다"를 확신해야 하는데, 소리 크기로도
        글자로도 확신할 수 없었습니다. 글자로 지웠더니 선생님을 따라 말한
        아이의 연습이 사라졌고, 소리 크기로 지웠더니 조용한 아이가 사라졌습니다.
        **아이 말을 지우는 건 어떤 경우에도 감수할 수 없는 대가입니다.**
 
        그래서 세어두고 알려주기만 합니다. 원인은 안전 모드(기본값)가
        이미 막고 있고, 끼어들기 모드를 직접 켜신 경우에만 이 경로가 열립니다.  */
  const teacherOnAir = !!app.player?.speaking || Date.now() < app.bargeGuardUntil;
  const onAirText = app.teacherOnAirText || app.lastTeacherLine;
  if (teacherOnAir && !app.settings.halfDuplex &&
      looksLikeSameUtterance(text, onAirText)) {
    app.diag.echoDropped++;
    updateDiagnostics({ force: true });
    noteEchoDetected();
    // 지우지 않고 그대로 아래로 내려갑니다
  }
 
  /* ⚠️ 합치는 조건은 아주 좁아야 합니다.
        아이가 **일부러 같은 말을 두 번** 하는 건 이 앱에서 흔한 연습이고,
        "I want juice" 와 "I want juice please" 는 서로 **다른 말**입니다.
        그런 걸 합치면 아이가 한 말이 화면에서도 기록에서도 사라집니다.
 
        진짜 중복은 하나의 발화에 대해 인식 결과가 두 번 확정된 경우이고,
        그건 2.5초 안에, 글자가 똑같거나 앞부분이 그대로 이어진 형태로
        나타납니다. 딱 그 경우만 합칩니다.                                  */
  const prev = app.lastUserFinal;
  const gap = prev ? Date.now() - prev.at : Infinity;
  const a = prev ? normalizeForCompare(prev.text) : '';
  const b = normalizeForCompare(text);
  const isRepeat = !!prev && gap < 2500 && !!a && (a === b || b.startsWith(a) || a.startsWith(b));
 
  if (isRepeat) {
    // 더 긴 쪽(= 더 완전한 인식)으로 마지막 줄을 고쳐 씁니다.
    const better = text.length >= prev.text.length ? text : prev.text;
    // ⚠️ 반드시 반환값을 봐야 합니다. 마지막 줄이 선생님 줄이면 고쳐 쓸 수
    //    없는데, 예전에는 그걸 확인하지 않고 return 해버려서 **아이 말이
    //    화면에서도 기록에서도 통째로 사라졌습니다.**
    if (UI.replaceLastTranscript('user', better)) {
      app.diag.dupMerged++;
      app.lastUserFinal = { text: better, at: Date.now() };
      // 저장된 기록에는 손대지 않습니다. 여기서 또 저장하면 기록에 같은 말이
      // 두 줄로 남아서, 정작 고치려던 증상이 기록 쪽에 그대로 생깁니다.
      updateDiagnostics({ force: true });
      setTimeout(() => UI.setUserEcho(''), 1800);
      return;
    }
  }
 
  UI.appendTranscript({ speaker: 'user', text, icon: app.profile?.icon });
  app.lastUserFinal = { text, at: Date.now() };
  void appendMessage(app.profile.id, app.sessionId, 'user', text);
  // 다음 세션에서 "지난 이야기"로 쓸 주제 조각
  if (text.length > 12) app.session.topics.push(text.slice(0, 60));
  // 배운 표현을 스스로 다시 썼는지 → 간격 반복 승급
  void checkReuse(text).catch((err) => console.warn('[app] 복습 승급 실패', err));
  setTimeout(() => UI.setUserEcho(''), 1800);
}
 
/**
 * 스피커 소리가 마이크로 되돌아오고 있다는 게 확인되면,
 * 조용히 넘어가지 말고 실제로 해결해 줍니다.
 *
 * 세 번 잡히면 자동으로 안전 모드를 켭니다. 안전 모드에서는 선생님이
 * 말하는 동안 마이크를 완전히 닫으므로 이 문제가 물리적으로 사라집니다.
 * 대신 말을 끊고 들어갈 수 없게 되므로, ✋ 버튼을 안내합니다.
 */
function noteEchoDetected() {
  app.echoHits = (app.echoHits || 0) + 1;
  if (app.echoHits === 1) {
    UI.toast('스피커 소리가 마이크로 들어가고 있어요. 이어폰을 쓰면 깨끗해집니다.', {
      variant: 'warn', ttlMs: 8000,
    });
    return;
  }
  if (app.echoHits !== 3 || app.settings.halfDuplex) return;
 
  // 끼어들기 모드를 직접 켜신 상태에서 되돌림이 계속되면 안전 모드로 돌립니다.
  // 안전 모드에서는 선생님이 말할 때 마이크가 닫혀 이 문제가 물리적으로
  // 사라집니다. 끼어들기는 ✋ 버튼으로 계속 가능합니다.
  app.settings.halfDuplex = true;
  saveSettings(app.settings);
  app.mic?.setTeacherSpeaking(!!app.player?.speaking, 'mute');
  UI.setInterruptVisible(!!app.player?.speaking);
  UI.toast(
    '선생님 목소리가 계속 되돌아와서 안전 모드로 되돌렸습니다. ' +
    '끼어들고 싶을 땐 ✋ 버튼을 눌러주세요.',
    { variant: 'warn', ttlMs: 10000 }
  );
}
 
function handleTeacherText(text, final) {
  UI.setTeacherSubtitle(text);
  // 지금 말하고 있는 문장. 스피커 되돌림을 걸러낼 때 이 값과 비교합니다.
  app.teacherOnAirText = text;
  if (final) {
    UI.appendTranscript({ speaker: 'teacher', text, icon: '👩‍🏫' });
    void appendMessage(app.profile.id, app.sessionId, 'teacher', text);
    app.lastTeacherLine = text;
    UI.setTranslateAvailable(true);
    // 새 문장이 나오면 이전 번역은 지웁니다
    UI.setKoreanSubtitle('', false);
 
    // 자동 번역은 아이에게만. 어른은 영어로 이해하는 게 학습이므로
    // 필요할 때 "무슨 뜻이야?" 버튼을 직접 누르게 합니다.
    // (텍스트 모델이라 요금은 호출당 0.1원 수준입니다)
    const autoTranslate = app.settings.showKoreanSubtitle && (app.profile?.age ?? 99) <= 10;
    if (autoTranslate) void showTranslation(text, { auto: true });
  }
}
 
/** 선생님 말을 한국어로 풀어 자막에 보여줍니다 */
/** 한글 글자 비율 */
function koreanRatio(text) {
  const letters = text.replace(/[^A-Za-z가-힣]/g, '');
  if (!letters.length) return 0;
  const korean = letters.replace(/[^가-힣]/g, '').length;
  return korean / letters.length;
}
 
async function showTranslation(text, { auto = false } = {}) {
  if (!text || !app.profile) return;
 
  // 어린 단계에서는 선생님이 이미 한국어를 많이 섞어 말합니다.
  // 그걸 또 번역하면 아무 의미 없고 요금만 나갑니다.
  if (auto && koreanRatio(text) > 0.5) return;
 
  try {
    const { korean, keyWords } = await translate(text, app.profile.age);
    // 그동안 선생님이 다른 말을 했으면 덮어쓰지 않습니다
    if (app.lastTeacherLine !== text) return;
    UI.setKoreanSubtitle(korean, true);
 
    // 핵심 표현 카드는 아껴서 띄웁니다.
    // 매 턴 띄우면 카드가 화면을 계속 덮어 아바타와 자막을 가립니다.
    // 이미 단어장에 있는 표현이면 건너뜁니다.
    const kw = (keyWords || [])[0];
    if (kw?.word && !app.seenKeywords.has(kw.word.toLowerCase())) {
      app.seenKeywords.add(kw.word.toLowerCase());
      const entry = {
        word: kw.word,
        meaning_ko: kw.meaning,
        example_en: text,
        example_ko: korean,
      };
      UI.showVocabCard(entry, { canRead: currentCanRead(), onSpeak: speakWord });
      // 화면에만 띄우고 끝내면 아이가 가장 많이 본 표현이 단어장에 안 남습니다
      void saveVocabulary(app.profile.id, entry).catch(console.error);
    }
  } catch (err) {
    console.warn('[app] 번역 실패', err);
    UI.toast(`번역 실패: ${err.message}`, { variant: 'warn' });
  }
}
 
function handleTurnComplete() {
  app.diag.turns++;
  // 턴이 끝났으면 뒤늦게 오던 조각을 더 기다릴 이유가 없습니다.
  // (다음 턴의 첫 음성을 잘라먹지 않도록 반드시 여기서 풉니다)
  app.bargeGuardUntil = 0;
  updateDiagnostics({ force: true });
  app.session.turns += 1;
  app.usage.addTurn(app.profile.id);
  refreshUsageUi({ force: true });
 
  // 단계가 바뀌었으면 여기서 세션을 새로 엽니다.
  // 프롬프트와 도구가 토큰에 잠겨 있어 재접속해야 새 단계가 적용됩니다.
  // 대화 맥락은 유지되고, 아이는 잠깐 끊긴 것도 못 느낍니다.
  if (app.pendingStageReconnect) {
    app.pendingStageReconnect = false;
    console.info('[app] 학습 단계 변경 → 세션을 새 단계로 다시 엽니다');
    app.live?.disconnect({ keepContext: true })
      .then(() => resumeLive())
      .catch(console.error);
  }
}
 
/** 학습자가 배운 표현을 스스로 다시 사용했는지 검사 (간격 반복 승급) */
async function checkReuse(userText) {
  if (!app.profile) return;
  const haystack = ` ${userText.toLowerCase().replace(/[^a-z0-9\s']/g, ' ')} `;
  const vocab = await listVocabulary(app.profile.id, { limit: 100 });
  for (const item of vocab) {
    const word = item.word.toLowerCase().trim();
    if (word.length < 3) continue;
    if (haystack.includes(` ${word} `)) {
      await promoteVocabulary(app.profile.id, item.word);
    }
  }
}
 
/* ═══════════════════════════════════════════════════════════════════════════
   교육 도구 처리
 
   ⚠️ 반드시 동기로 즉시 반환해야 합니다.
      Live API의 function calling은 동기라서, 응답이 늦으면 그만큼
      선생님이 말을 못 하고 대화가 어색하게 멈춥니다.
      화면만 먼저 그리고, 저장은 기다리지 않고 백그라운드로 넘깁니다.
   ═══════════════════════════════════════════════════════════════════════════ */
 
function handleToolCall(name, args) {
  const canRead = currentCanRead();
 
  switch (name) {
    case 'teach_word': {
      UI.showWordCard(args, { canRead, onSpeak: speakWord });
      if (args.word) app.session.newWords.push(args.word);
      // await 하지 않습니다 — 모델을 기다리게 하면 안 됩니다
      void saveVocabulary(app.profile.id, args).catch(console.error);
      return { ok: true, saved: true };
    }
 
    case 'show_sentence_frame': {
      UI.showFrameCard(args, { canRead, onSpeak: speakWord });
      // 다음 대화에서 같은 틀을 이어 연습시키기 위해 기억해 둡니다
      if (args.frame) {
        setCurrentFrame(app.profile.id, args.frame);
        app.session.frames.push(args.frame);
      }
      return { ok: true };
    }
 
    case 'correct_sentence': {
      UI.showCorrectionCard(args, { onSpeak: speakWord });
      void saveCorrection(app.profile.id, args).catch(console.error);
      return { ok: true, saved: true };
    }
 
    case 'log_progress': {
      UI.showProgressToast(args);
      if (args.detail_ko) app.session.highlights.push(args.detail_ko);
      if (args.kind === 'mission_complete') {
        app.mission.done = true;
        UI.setMission(app.mission.text, true);
      }
      return { ok: true };
    }
 
    case 'suggest_stage_change': {
      // 아이에게는 알리지 않습니다. 부모에게만 보입니다.
      // 한 번의 판단으로 바로 바꾸지 않고, 같은 방향 제안이 쌓여야 움직입니다.
      if (app.stage === null) return { ok: false, error: 'adult profile' };
 
      const result = recordStageSuggestion(
        app.profile.id, args.direction, args.reason_ko || ''
      );
      if (result.changed) {
        app.stage = result.stage;
        UI.setStageChip(CHILD_STAGES[result.stage]);
        UI.announceStageChange(result.from, result.stage, CHILD_STAGES);
        renderGameList();
        app.session.stageChange = { from: result.from, to: result.stage, reason: args.reason_ko };
      }
      // ⚠️ 지금 세션의 프롬프트와 도구는 토큰에 잠겨 있어서 바로 바뀌지 않습니다.
      //    다음 턴이 끝날 때 세션을 새로 열어야 실제로 반영됩니다.
      if (result.changed) app.pendingStageReconnect = true;
 
      // 모델에게 결과를 알려줘야 같은 제안을 반복하지 않습니다
      return {
        ok: true,
        applied: result.changed,
        current_stage: result.stage,
        note: result.changed
          ? 'Stage recorded. It takes effect at the next connection — ' +
            'keep teaching normally for now.'
          : 'Noted. Not enough evidence yet — keep teaching at the current stage.',
      };
    }
 
    default:
      console.warn('[app] 알 수 없는 도구 호출:', name);
      return { ok: false, error: 'unknown tool' };
  }
}
 
/**
 * 단어장을 다시 그립니다.
 * 삭제 후 목록만 지우면 상단 개수와 "아직 단어가 없어요" 안내가 어긋납니다.
 */
async function refreshVocabBook() {
  if (!app.profile) return;
  const items = await listVocabulary(app.profile.id);
  UI.renderVocabBook(items, {
    onSpeak: speakWord,
    onDelete: async (word) => {
      await deleteVocabulary(app.profile.id, word);
      await refreshVocabBook();
    },
  });
}
 
/** 카드의 🔊 버튼 — 브라우저 TTS (단어 하나라 무료로 충분) */
function speakWord(text) {
  if (!text || !('speechSynthesis' in window)) return;
  window.speechSynthesis.cancel();
  const utter = new SpeechSynthesisUtterance(text);
  utter.lang = 'en-US';
  utter.rate = 0.85;
  const voices = window.speechSynthesis.getVoices();
  const preferred = voices.find(
    (v) => v.lang.startsWith('en') && /Natural|Neural|Google|Samantha/i.test(v.name)
  );
  if (preferred) utter.voice = preferred;
  window.speechSynthesis.speak(utter);
}
 
/* ═══════════════════════════════════════════════════════════════════════════
   세션 상태
   ═══════════════════════════════════════════════════════════════════════════ */
 
function handleLiveState(state, info) {
  switch (state) {
    case LiveState.CONNECTING:
      UI.setAvatarState('connecting');
      break;
 
    case LiveState.LIVE: {
      /* ⚠️ 이 상태는 두 가지 뜻으로 옵니다.
           (1) 방금 연결됐다
           (2) 대화 중인데 알릴 말이 있다 (오류, 목소리 폴백, 안내)
         한 턴씩 주고받는 방식으로 바뀐 뒤로는 연결이 끊기지 않아서
         (2)가 훨씬 많습니다. 구분하지 않으면 진단창의 '연결 횟수'가 부풀어
         정작 진짜 재연결이 몇 번 일어났는지 못 보게 됩니다. */
      if (!app.liveAnnounced) {
        app.liveAnnounced = true;
        app.diag.connects++;
        app.diag.resumed = !!app.live?.resumeHandle;
      }
      UI.setAvatarState('listening');

      if (info?.message) {
        /* ⭐ 반드시 보이게 합니다.
             여기서 info.message 를 삼키면, 선생님 목소리가 기본 목소리로
             바뀌어도 화면은 멀쩡해 보입니다. 그게 이 프로젝트에서 가장
             많은 시간을 날린 실패 방식입니다 — 조용한 폴백. */
        UI.setStatus(info.message);
        if (info.error || info.fallback) {
          app.diag.lastError = info.message;
          UI.toast(info.message);
        }
      } else {
        UI.setStatus(
          app.settings.halfDuplex
            ? '편하게 말해 보세요. 끊고 싶으면 ✋ 를 누르면 됩니다.'
            : '편하게 말해 보세요. 선생님 말 중간에 끼어들어도 괜찮아요.'
        );
      }

      updateDiagnostics({ force: true });
      UI.setMicUi({ active: true, icon: '🎙️', label: '대화 중' });
      break;
    }
 
    case LiveState.ERROR:
      app.liveAnnounced = false;
      app.diag.lastError = info?.message || '연결 오류';
      updateDiagnostics({ force: true });
      UI.setAvatarState('error');
      UI.setStatus(info?.message || '연결 오류가 발생했어요.');
      break;
 
    case LiveState.IDLE:
      app.liveAnnounced = false;
      if (app.inCall) {
        // 유휴로 끊긴 정상 상태 — 사용자에게는 "대기 중"으로만 보입니다
        UI.setAvatarState('idle');
        UI.setMicUi({ active: true, icon: '💤', label: '대기 중 (말하면 이어져요)' });
      } else {
        UI.setMicUi({ active: false, icon: '🎙️', label: '대화 시작' });
      }
      break;
  }
}
 
/* ═══════════════════════════════════════════════════════════════════════════
   유휴 감시 — 요금을 멈추는 곳
   ═══════════════════════════════════════════════════════════════════════════ */
 
function startIdleWatch() {
  stopIdleWatch();
  app.idleTimer = setInterval(() => {
    if (!app.inCall || !app.live?.isLive) return;
 
    // ── 하루 한도 확인 ────────────────────────────────────────────
    // 쉬지 않고 계속 대화하면 재연결이 일어나지 않아서
    // 연결 시점 검사만으로는 한도를 넘겨버립니다. 여기서 매번 확인합니다.
    // (선생님이 말하는 중이어도 확인해야 하므로 아래 speaking 검사보다 앞에 둡니다)
    if (app.profile && app.usage.isExhausted(app.profile.id)) {
      UI.setStatus('오늘 목표를 다 채웠어요! 🎉');
      UI.toast(`${app.profile.name}, 오늘 영어 목표 완료! 내일 또 만나요 🎉`, {
        variant: 'success', ttlMs: 8000,
      });
      endCall().catch(handleFatal);
      return;
    }
 
    // 선생님이 말하는 중이면 끊지 않습니다
    if (app.player?.speaking) return;
    if (app.mic && app.mic.msSinceLastSpeech() > COST.IDLE_DISCONNECT_MS) {
      console.info('[app] 유휴 → 세션 종료 (요금 절약). 다시 말하면 이어집니다.');
      app.live.disconnect({ keepContext: COST.RESUME_ENABLED }).catch(console.error);
      UI.setStatus('잠시 쉬는 중이에요. 말을 걸면 바로 이어집니다.');
    }
  }, 3000);
}
 
function stopIdleWatch() {
  clearInterval(app.idleTimer);
  app.idleTimer = null;
}
 
/* ═══════════════════════════════════════════════════════════════════════════
   미션 / 사용량
   ═══════════════════════════════════════════════════════════════════════════ */
 
function pickMission(profile) {
  // 아이는 단계로, 어른은 레벨로 고릅니다
  const level = app.stage !== null
    ? (app.stage <= 1 ? 'starter' : app.stage <= 3 ? 'beginner' : 'intermediate')
    : 'intermediate';
  const pool = DAILY_MISSIONS[level];
  // 날짜 + 프로필로 정해지므로 하루 동안 같은 미션이 유지됩니다
  const seed = new Date().getDate() + profile.id.length;
  app.mission = { text: pool[seed % pool.length], done: false };
  UI.setMission(app.mission.text, false);
}
 
let lastUsageUiAt = 0;
 
let lastDiagAt = 0;
 
function updateDiagnostics({ force = false } = {}) {
  // ⚠️ 이 값은 진단 화면을 켜지 않아도 채워야 합니다.
  //    내보내기 파일은 app.diag 를 그대로 읽는데, 여기서 먼저 return 해버리면
  //    에코를 확인하려고 만든 리포트가 항상 "누출 0.0000 (좋음)"이라고
  //    거짓말을 합니다.
  app.diag.echoFloor = app.mic?.gate?.echoFloor ?? app.diag.echoFloor ?? 0;
  if (!app.settings.showDiagnostics) return;
  // 오디오 프레임마다 innerHTML을 다시 그리면 오래된 아이패드에서
  // 립싱크 애니메이션과 경쟁합니다. 초당 4번이면 충분합니다.
  const now = Date.now();
  if (!force && now - lastDiagAt < 250) return;
  lastDiagAt = now;
 
  UI.setDiagnostics({
    ...app.diag,
    gateState: app.mic?.gate?.state ?? '-',
    noiseFloor: app.mic?.gate?.noiseFloor ?? 0,
    onset: app.mic?.gate?.onsetThreshold?.() ?? 0,
    live: !!app.live?.isLive,
  });
}
 
function refreshUsageUi({ force = false } = {}) {
  if (!app.profile) return;
  // 오디오 조각이 초당 수십 번 들어오므로 그대로 두면 매번 레이아웃이 다시 계산됩니다.
  // 오래된 아이패드에서는 립싱크 애니메이션과 경쟁합니다.
  const now = Date.now();
  if (!force && now - lastUsageUiAt < 1000) return;
  lastUsageUiAt = now;
 
  UI.setUsage({
    usedMin: app.usage.todayMinutes(app.profile.id),
    limitMin: app.usage.dailyLimit(app.profile.id),
    krw: app.usage.estimateKrw(app.profile.id),
  });
}
 
/* ═══════════════════════════════════════════════════════════════════════════
   입력 / 버튼 배선
   ═══════════════════════════════════════════════════════════════════════════ */
 
/**
 * 세션이 실제로 쓸 수 있는 상태(LIVE)가 될 때까지 기다립니다.
 *
 * resumeLive()는 이미 재연결이 진행 중이면 즉시 반환합니다. 그래서
 * resumeLive().then(...) 만으로는 아직 연결이 안 된 상태에서 전송을 시도해
 * 메시지가 조용히 사라집니다.
 */
function waitForLive(timeoutMs = 8000) {
  if (app.live?.isLive) return Promise.resolve(true);
  return new Promise((resolve) => {
    const startedAt = Date.now();
    const timer = setInterval(() => {
      if (app.live?.isLive) {
        clearInterval(timer);
        resolve(true);
      } else if (!app.inCall || Date.now() - startedAt > timeoutMs) {
        clearInterval(timer);
        resolve(false);
      }
    }, 120);
  });
}
 
function sendTextToTeacher(text, { echo = true } = {}) {
  if (!text?.trim() || !app.inCall) return;
 
  // 말하던 중에 타이핑했다면, 음성 발화를 먼저 정상적으로 마무리합니다.
  // 안 그러면 마이크는 계속 열린 줄 알고 오디오를 흘려보내는데 그 오디오는
  // 발화 구간 밖이라 서버가 통째로 버립니다 — 하던 말이 사라집니다.
  if (app.mic?.closeActivity()) app.diag.activityEnd++;
 
  if (echo) {
    UI.appendTranscript({ speaker: 'user', text, icon: app.profile?.icon });
    // 타이핑한 문장은 "방금 확정된 내 말"로 두지 않습니다.
    // 그래야 뒤늦게 도착한 음성 인식 결과가 이 줄을 덮어쓰지 않습니다.
    app.lastUserFinal = null;
    void appendMessage(app.profile.id, app.sessionId, 'user', text);
  }
 
  if (app.live?.isLive) {
    app.live.sendText(text);
    return;
  }
 
  void resumeLive()
    .then(() => waitForLive())
    .then((ready) => {
      if (ready) {
        app.live.sendText(text);
      } else {
        UI.toast('연결이 아직 준비되지 않아 메시지를 보내지 못했어요. 다시 시도해 주세요.', {
          variant: 'warn', ttlMs: 6000,
        });
      }
    });
}
 
function wireGlobalControls() {
  const $ = (id) => document.getElementById(id);
 
  // 통화 종료 / 프로필 전환
  $('back-button')?.addEventListener('click', () => endCall().catch(handleFatal));
 
  // 마이크 버튼: 통화 중 일시정지 토글
  $('mic-button')?.addEventListener('click', () => {
    if (!app.inCall) return;
    if (app.live?.isLive) {
      app.live.disconnect({ keepContext: true }).catch(console.error);
      UI.setStatus('일시정지했어요. 버튼을 누르거나 말을 걸면 이어집니다.');
    } else {
      void resumeLive();
    }
  });
 
  // ✋ 끼어들기: 선생님 말을 즉시 끊고 내 차례로 넘어옵니다.
  //    목소리로 끼어드는 게 잘 안 될 때를 위한 확실한 탈출구입니다.
  $('interrupt-button')?.addEventListener('click', () => {
    if (!app.inCall) return;
    interruptTeacher();
  });
 
  // 텍스트로 말 걸기 (조용한 곳 / 발음이 잘 안 잡힐 때)
  const send = () => {
    const input = $('text-input');
    const text = input?.value?.trim();
    if (!text) return;
    sendTextToTeacher(text);
    input.value = '';
  };
  $('send-button')?.addEventListener('click', send);
  $('text-input')?.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') send();
  });
 
  // 번역 ("무슨 뜻이야?")
  $('translate-button')?.addEventListener('click', () => {
    if (app.lastTeacherLine) void showTranslation(app.lastTeacherLine);
  });
 
  // 단어장
  $('vocab-button')?.addEventListener('click', async () => {
    if (!app.profile) return;
    try {
      UI.clearQuiz();
      await refreshVocabBook();
      UI.openModal('vocab-modal');
    } catch (err) {
      console.error('[app] 단어장 열기 실패', err);
      UI.toast(`단어장을 열지 못했어요: ${err.message}`, { variant: 'error', ttlMs: 7000 });
    }
  });
 
  // 복습 퀴즈 — 텍스트 모델이라 음성 대비 요금이 거의 0입니다
  $('quiz-button')?.addEventListener('click', async (e) => {
    if (!app.profile) return;
    const btn = e.currentTarget;
    btn.disabled = true;
    btn.textContent = '문제를 만들고 있어요...';
    try {
      // 복습 시점이 된 단어를 우선으로, 없으면 최근 배운 단어로
      const due = await listDueVocabulary(app.profile.id, 8);
      const pool = due.length
        ? due
        : (await listVocabulary(app.profile.id, { limit: 8 }));
      const words = pool.map((v) => v.word);
 
      if (!words.length) {
        UI.toast('아직 모은 단어가 없어요. 먼저 대화를 해보세요!', { variant: 'warn' });
        return;
      }
      const questions = await makeQuiz(words, app.profile.age);
      UI.renderQuiz(questions, { onSpeak: speakWord });
    } catch (err) {
      UI.toast(`퀴즈 생성 실패: ${err.message}`, { variant: 'error', ttlMs: 7000 });
    } finally {
      btn.disabled = false;
      btn.textContent = '📝 복습 퀴즈 풀기 (거의 무료)';
    }
  });
  $('vocab-close')?.addEventListener('click', () => UI.closeModal('vocab-modal'));
 
  // 리포트
  $('report-button')?.addEventListener('click', async () => {
    if (!app.profile) return;
    try {
    const [vocab, due, stats] = await Promise.all([
      listVocabulary(app.profile.id),
      listDueVocabulary(app.profile.id, 100),
      errorTypeStats(app.profile.id),
    ]);
    UI.renderReport({
      profile: app.profile,
      stageInfo: app.stage !== null ? getStageInfo(app.profile.id) : null,
      stages: CHILD_STAGES,
      todayMinutes: app.usage.todayMinutes(app.profile.id),
      limitMinutes: app.usage.dailyLimit(app.profile.id),
      turns: app.session.turns,
      vocabTotal: vocab.length,
      dueCount: due.length,
      errorStats: stats,
      recentDays: app.usage.recentDays(app.profile.id, 7),
      highlights: app.session.highlights,
      estimatedKrw: app.usage.estimateKrw(app.profile.id),
      monthKrw: app.usage.estimateMonthKrw(),
    });
    UI.openModal('report-modal');
    } catch (err) {
      console.error('[app] 리포트 열기 실패', err);
      UI.toast(`리포트를 열지 못했어요: ${err.message}`, { variant: 'error', ttlMs: 7000 });
    }
  });
  $('report-close')?.addEventListener('click', () => UI.closeModal('report-modal'));
 
  // 지난 대화 보기
  $('history-button')?.addEventListener('click', async () => {
    if (!app.profile) return;
    try {
      const convos = await listRecentConversations(app.profile.id, 10);
      UI.renderConversations(convos, { profileName: app.profile.name });
      UI.openModal('history-modal');
    } catch (err) {
      console.error('[app] 대화 기록 열기 실패', err);
      UI.toast(`대화 기록을 열지 못했어요: ${err.message}`, { variant: 'error', ttlMs: 7000 });
    }
  });
  $('history-close')?.addEventListener('click', () => UI.closeModal('history-modal'));
 
  // 대화 + 진단 정보를 파일로 내보내기 (문제 해결용)
  $('export-button')?.addEventListener('click', async (e) => {
    if (!app.profile) return;
    const btn = e.currentTarget;
    btn.disabled = true;
    const original = btn.textContent;
    btn.textContent = '만드는 중...';
    try {
      const text = await buildReportText({
        profile: app.profile,
        diag: app.diag,
        settings: app.settings,
      });
      const stamp = new Date().toISOString().slice(0, 16).replace(/[:T]/g, '');
      downloadText(`우리집영어_${app.profile.name}_${stamp}.txt`, text);
 
      const copied = await copyText(text);
      UI.toast(
        copied
          ? '파일로 저장했고 클립보드에도 복사했어요. 그대로 붙여넣어 보내주세요.'
          : '파일로 저장했어요. 그 파일을 보내주세요.',
        { variant: 'success', ttlMs: 8000 }
      );
    } catch (err) {
      console.error('[app] 내보내기 실패', err);
      UI.toast(`내보내기 실패: ${err.message}`, { variant: 'error', ttlMs: 7000 });
    } finally {
      btn.disabled = false;
      btn.textContent = original;
    }
  });
 
  // 롤플레이
  $('roleplay-button')?.addEventListener('click', () => UI.openModal('roleplay-modal'));
  $('roleplay-close')?.addEventListener('click', () => UI.closeModal('roleplay-modal'));
 
  // 설정
  $('settings-button')?.addEventListener('click', () => {
    syncSettingsUi();
    UI.openModal('settings-modal');
  });
  $('settings-close')?.addEventListener('click', () => UI.closeModal('settings-modal'));
 
  $('setting-half-duplex')?.addEventListener('change', (e) => {
    app.settings.halfDuplex = e.target.checked;
    // 사용자가 직접 고른 값이라는 표시. 이게 있으면 나중에 기본값을 또 바꿔도
    // 자동 보정이 이 선택을 지우지 않습니다.
    app.settings.halfDuplexUserSet = true;
    saveSettings(app.settings);
    // 모드를 바꾸면 지금 상태를 곧바로 다시 적용합니다.
    // (안 그러면 선생님이 말하는 중에 끈 경우 마이크가 닫힌 채로 남습니다)
    const speaking = !!app.player?.speaking;
    app.mic?.setTeacherSpeaking(speaking, e.target.checked ? 'mute' : 'barge');
    UI.setInterruptVisible(speaking);
    UI.toast(
      e.target.checked
        ? '안전 모드: 말이 겹치지 않습니다. 끼어들 땐 ✋ 를 누르세요.'
        : '끼어들기 모드: 목소리로 끊을 수 있습니다. 이어폰을 꼭 쓰세요.',
      { variant: 'info', ttlMs: 6000 }
    );
  });
 
  $('setting-diagnostics')?.addEventListener('change', (e) => {
    app.settings.showDiagnostics = e.target.checked;
    saveSettings(app.settings);
    if (e.target.checked) updateDiagnostics();
    else UI.hideDiagnostics();
  });
 
  $('setting-korean-sub')?.addEventListener('change', (e) => {
    app.settings.showKoreanSubtitle = e.target.checked;
    saveSettings(app.settings);
    if (!e.target.checked) UI.setKoreanSubtitle('', false);
  });
 
  $('setting-can-read')?.addEventListener('change', (e) => {
    if (!app.profile) return;
    const raw = e.target.value;
    const value = raw === 'true' ? true : raw === 'false' ? false : 'partial';
    app.settings.canRead = { ...(app.settings.canRead || {}), [app.profile.id]: value };
    saveSettings(app.settings);
    UI.toast(
      value === false
        ? '카드를 그림과 소리 중심으로 보여줍니다.'
        : value === 'partial'
          ? '쉬운 단어는 글자로, 나머지는 소리로 알려줍니다.'
          : '카드에 영어 글자를 함께 보여줍니다.',
      { variant: 'info' }
    );
  });
 
  $('setting-avatar-mode')?.addEventListener('change', async (e) => {
    const mode = e.target.value;
    app.settings.avatarMode = mode;
    // 직접 고르셨다는 표시. 다음에 기본값이 또 바뀌어도 이 선택은 유지됩니다.
    app.settings.avatarModeUserSet = true;
    saveSettings(app.settings);
    if (app.avatar) {
      UI.toast(
        mode === AVATAR_MODE.VIDEO
          ? '실사 영상 아바타로 전환합니다. (크레딧이 소모됩니다)'
          : mode === AVATAR_MODE.THREE
            ? '3D 아바타로 전환합니다. (무료)'
            : '사진 아바타로 전환합니다. (무료)',
        { variant: 'info' }
      );
      await app.avatar.mount(mode);
    }
    syncSettingsUi();
  });
 
  /* 3D 아바타 얼굴 주소.
     잘못된 주소를 넣으면 얼굴이 통째로 안 뜨므로, 저장 전에 형식을 검사하고
     morphTargets 파라미터가 빠졌으면 붙여줍니다. 이게 빠지면 모델은 뜨는데
     입과 눈이 전혀 안 움직여서 "고장난 것처럼" 보입니다. */
  $('setting-avatar-url')?.addEventListener('change', async (e) => {
    const raw = (e.target.value || '').trim();
    if (!raw) {
      app.settings.avatarModelUrl = '';
      saveSettings(app.settings);
      UI.toast('기본 선생님 얼굴로 되돌립니다.', { variant: 'info' });
    } else {
      const { normalizeAvatarUrl } = await import('./src/avatar3d.js');
      const normalized = normalizeAvatarUrl(raw);
      if (!normalized) {
        UI.toast('주소 형식이 올바르지 않습니다. https:// 로 시작하고 .glb 로 끝나야 해요.', {
          variant: 'warn', ttlMs: 7000,
        });
        e.target.value = app.settings.avatarModelUrl || '';
        return;
      }
      app.settings.avatarModelUrl = normalized;
      saveSettings(app.settings);
      e.target.value = normalized;
      UI.toast('새 얼굴을 불러옵니다...', { variant: 'info' });
    }
    if (app.avatar && app.settings.avatarMode === AVATAR_MODE.THREE) {
      app.avatar.opts.avatarModelUrl = app.settings.avatarModelUrl;
      await app.avatar.mount(AVATAR_MODE.THREE);
    }
  });
 
  // 탭을 벗어나면 요금이 새지 않게 정리하고, 돌아오면 오디오를 되살립니다
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
      // 마이크 자체를 억제합니다.
      // 프레임을 소비하는 쪽에서만 버리면 전송량 집계는 계속 올라가서,
      // 실제로는 쓰지 않은 시간이 하루 한도를 갉아먹습니다.
      // ⚠️ setSuppressed()가 아니라 setPageHidden()이어야 합니다.
      //    둘이 같은 변수였을 때는, 탭을 가린 뒤 남은 음성이 다 재생되면
      //    onSpeakingChange(false)가 억제를 풀어버려서 보이지도 않는 탭이
      //    생활소음을 계속 집계했습니다.
      app.mic?.setPageHidden(true);
      if (app.live?.isLive) {
        app.live.disconnect({ keepContext: true }).catch(console.error);
        UI.setStatus('다른 화면으로 이동해서 잠시 멈췄어요.');
      }
      return;
    }
 
    // 돌아왔을 때: iOS는 백그라운드에서 AudioContext를 suspended로 바꿔놓고
    // 자동으로 재개해주지 않습니다. 그러면 마이크가 죽은 채로 남습니다.
    if (app.inCall) {
      // 탭 숨김을 풀고, 지금 상태를 현재 모드로 다시 적용합니다.
      // (안전 모드 + 선생님이 말하는 중이면 닫힌 채로 유지되고,
      //  끼어들기 모드면 열린 채 문턱만 높아집니다)
      app.mic?.setPageHidden(false);
      app.mic?.setTeacherSpeaking(
        !!app.player?.speaking,
        app.settings.halfDuplex ? 'mute' : 'barge'
      );
      void Promise.all([app.mic?.resume(), app.player?.resume()]).then(() => {
        UI.setStatus('돌아왔어요! 말을 걸면 대화가 이어집니다.');
      });
    }
  });
 
  window.addEventListener('pagehide', () => {
    app.usage.flush();
    app.live?.disconnect({ keepContext: false }).catch(() => {});
  });
}
 
function syncSettingsUi() {
  const $ = (id) => document.getElementById(id);
  if ($('setting-half-duplex')) $('setting-half-duplex').checked = !!app.settings.halfDuplex;
  if ($('setting-korean-sub')) $('setting-korean-sub').checked = !!app.settings.showKoreanSubtitle;
  if ($('setting-diagnostics')) $('setting-diagnostics').checked = !!app.settings.showDiagnostics;
  if ($('setting-avatar-mode')) $('setting-avatar-mode').value = app.settings.avatarMode;
  if ($('setting-avatar-url')) $('setting-avatar-url').value = app.settings.avatarModelUrl || '';
  // 얼굴 주소 칸은 3D 모드일 때만 의미가 있습니다
  const urlRow = $('avatar-url-setting');
  if (urlRow) urlRow.style.display = app.settings.avatarMode === AVATAR_MODE.THREE ? '' : 'none';
 
  // 아이 프로필일 때만 학습 단계와 읽기 여부를 보여줍니다
  const isChild = app.stage !== null && app.profile;
  const readRow = $('setting-can-read')?.closest('.setting-row');
  if (readRow) readRow.style.display = isChild ? '' : 'none';
 
  if (isChild) {
    const info = getStageInfo(app.profile.id);
    UI.renderStageLadder(CHILD_STAGES, {
      current: info.stage,
      history: info.history,
      onPick: (stageId) => {
        if (stageId === app.stage) return;
        const from = app.stage;
        setStage(app.profile.id, stageId);
        app.stage = stageId;
        UI.setStageChip(CHILD_STAGES[stageId]);
        renderGameList();
        UI.toast(
          `학습 단계를 "${CHILD_STAGES[stageId].name}" 로 바꿨어요. ` +
          '다음 대화부터 적용됩니다.',
          { variant: 'success', ttlMs: 6000 }
        );
        void from;
        syncSettingsUi();
      },
    });
    if ($('setting-can-read')) {
      $('setting-can-read').value = String(currentCanRead());
    }
  } else {
    UI.renderStageLadder(CHILD_STAGES, { current: null });
  }
}
 
/** 이 아이가 영어 글자를 읽는지 (설정에서 바꾼 값 우선) */
function currentCanRead() {
  if (!app.profile) return true;
  const override = app.settings.canRead?.[app.profile.id];
  return override !== undefined ? override : (app.profile.canRead ?? true);
}
 
function handleFatal(err) {
  console.error('[app] 치명적 오류', err);
  UI.setAvatarState('error');
  UI.setStatus(err?.message || '알 수 없는 오류가 발생했어요.');
  UI.toast(err?.message || '오류가 발생했습니다.', { variant: 'error', ttlMs: 9000 });
}
 
/* ═══════════════════════════════════════════════════════════════════════════ */
 
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', boot);
} else {
  boot();
}
 
