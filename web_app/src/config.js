/**
 * web_app/src/config.js
 * ----------------------------------------------------------------------------
 * 앱 전역 설정. 비용/성능에 관련된 숫자는 전부 여기 모아둡니다.
 * ----------------------------------------------------------------------------
 */

/** 가족 프로필 (표시용). 실제 페르소나는 서버(api/_persona.js)가 결정합니다. */
export const PROFILES = [
  { id: 'p_dad',      name: '아빠',   enName: 'Dad',      age: 42, icon: '👨‍💼', color: '#3b82f6', kind: 'adult' },
  { id: 'p_mom',      name: '엄마',   enName: 'Mom',      age: 40, icon: '👩‍🏫', color: '#ec4899', kind: 'adult' },
  { id: 'p_child1',   name: '하율',   enName: 'Hayul',    age: 9,  icon: '👦',   color: '#a855f7', sub: '쌍둥이 첫째', kind: 'child', defaultStage: 2, canRead: true },
  { id: 'p_child2',   name: '예율',   enName: 'Yeyul',    age: 9,  icon: '👧',   color: '#22c55e', sub: '쌍둥이 둘째', kind: 'child', defaultStage: 2, canRead: true },
  { id: 'p_child3',   name: '성율',   enName: 'Seongyul', age: 6,  icon: '🧒',   color: '#f97316', sub: '셋째',       kind: 'child', defaultStage: 1, canRead: 'partial' },
  { id: 'p_youngest', name: '지율',   enName: 'Jiyul',    age: 4,  icon: '👶',   color: '#06b6d4', sub: '막내',       kind: 'child', defaultStage: 0, canRead: false },
];

/**
 * 아이 학습 단계 (화면 표시용 — 실제 교수법은 서버 api/_stages.js가 결정)
 *
 * 단어는 아는데 문장을 못 만드는 아이를 위한 사다리입니다.
 * 한국어를 많이 섞은 상태에서 시작해, 편해질 때마다 영어를 조금씩 늘립니다.
 */
export const CHILD_STAGES = [
  { id: 0, name: '영어 소리와 친해지기', short: '단어 듣기',   korean: 80, desc: '한국어 속에 영어 단어를 하나씩' },
  { id: 1, name: '두 단어 붙이기',       short: '두 단어',     korean: 65, desc: 'big dog, more please 처럼 둘씩' },
  { id: 2, name: '문장 틀에 갈아끼우기', short: '문장 틀',     korean: 45, desc: 'I like ___ 틀에 단어 바꿔넣기' },
  { id: 3, name: '틀 바꿔보기',          short: '틀 변형',     korean: 25, desc: '외운 틀을 조금씩 비틀어 쓰기' },
  { id: 4, name: '스스로 문장 만들기',   short: '자유 문장',   korean: 10, desc: '하고 싶은 말을 스스로 만들기' },
];

/** 단계별 말놀이 — 아이에게는 역할극보다 이쪽이 맞습니다 */
export const CHILD_GAMES = {
  0: [
    { id: 'name_it',      title: '🧸 이게 뭐게?',   desc: '눈앞의 물건 영어 이름 맞히기' },
    { id: 'animal_sound', title: '🐶 동물 소리',    desc: '동물 소리 내고 이름 배우기' },
    { id: 'color_hunt',   title: '🌈 색깔 찾기',    desc: '방에서 색깔 찾아 말하기' },
  ],
  1: [
    { id: 'big_small',    title: '🐘 크다 작다',    desc: 'big/small 붙여 두 단어로' },
    { id: 'i_like',       title: '💛 나는 좋아',    desc: '"I like" 뒤에 아무거나' },
    { id: 'count_it',     title: '🔢 몇 개게?',     desc: '숫자 + 물건 두 단어로' },
  ],
  2: [
    { id: 'frame_relay',  title: '🎯 이어 말하기',  desc: '같은 틀로 돌아가며 말하기' },
    { id: 'shop',         title: '🛒 가게 놀이',    desc: '"Can I have ___?" 로 사기' },
    { id: 'my_bag',       title: '🎒 내 가방 속',   desc: '"It\'s a ___" 로 소개하기' },
  ],
  3: [
    { id: 'quiz_me',      title: '❓ 내가 물어볼게', desc: '아이가 선생님에게 질문' },
    { id: 'yes_no',       title: '🙆 맞아 아니야',   desc: 'Do you like ~? 주고받기' },
    { id: 'dino',         title: '🦖 공룡 탐험',     desc: '정글에서 공룡 찾기' },
  ],
  4: [
    { id: 'show_tell',    title: '🎤 자랑하기',      desc: '좋아하는 걸 3문장으로' },
    { id: 'story',        title: '📖 이야기 잇기',   desc: '한 문장씩 번갈아 만들기' },
    { id: 'cafe',         title: '☕ 카페 주문',     desc: '음료 주문하고 요청하기' },
  ],
};

/**
 * 지금 실행 중인 버전.
 *
 * 화면과 진단 파일에 함께 찍힙니다. "고쳤다는데 여전히 같은 증상"일 때,
 * 새 버전이 실제로 배포된 건지부터 확인할 수 있어야 합니다.
 */
export const APP_VERSION = 'v9-turn';

/* ═══════════════════════════════════════════════════════════════════════════
   오디오 규격 (바꾸지 마세요)
   ═══════════════════════════════════════════════════════════════════════════ */
export const AUDIO = {
  /** 마이크 → Gemini: PCM16 mono 16kHz */
  INPUT_SAMPLE_RATE: 16000,
  /** Gemini TTS → 우리: PCM16 mono 24kHz
      ⚠️ api/tts.js 가 돌려주는 sampleRate 와 반드시 같아야 합니다.
         다르면 선생님 목소리가 느려지거나 다람쥐처럼 들립니다. */
  OUTPUT_SAMPLE_RATE: 24000,
  /** 우리 → Simli: PCM16 mono 16kHz */
  AVATAR_SAMPLE_RATE: 16000,
  /** AudioWorklet 한 번에 내보내는 샘플 수 (16kHz에서 1280 = 80ms) */
  FRAME_SAMPLES: 1280,
};

/* ═══════════════════════════════════════════════════════════════════════════
   💰 비용 절감 설정  ── 여기가 요금의 90%를 결정합니다
   ═══════════════════════════════════════════════════════════════════════════

   Gemini Live 요금은 "연결된 시간 동안 흘려보낸 오디오"로 매겨집니다.
   즉 아무 말 안 하고 가만히 있어도 마이크 스트림을 계속 올리면 돈이 나갑니다.
   영어 학습은 특히 "생각하는 침묵"이 길기 때문에, 침묵을 걸러내면
   입력 비용이 절반~3분의 1로 줄어듭니다.

   ⚠️ 단, 침묵을 100% 막으면 서버가 "말이 끝났다"는 걸 감지할 수 없습니다.
      그래서 말이 끝난 뒤 SILENCE_TAIL_MS 동안은 침묵도 그대로 보내주고,
      그 다음부터 끊습니다.
   ═══════════════════════════════════════════════════════════════════════════ */
export const COST = {
  /** 침묵 구간 오디오 전송 차단 (가장 큰 절감 레버) */
  SILENCE_GATE_ENABLED: true,

  /**
   * 발화 판정은 **고정 임계값이 아니라 주변 소음 대비**로 합니다.
   *
   * 고정값으로 하면 둘 중 하나가 반드시 깨집니다:
   *   - 값이 높으면 → 조용조용 말하는 4살 지율이 목소리를 아예 못 잡음
   *   - 값이 낮으면 → 시끄러운 거실에서 생활소음을 발화로 잡아 요금이 계속 나감
   *
   * 그래서 주변 소음의 평균과 변동폭을 계속 추정하고,
   * "소음 평균 + 변동폭 × 계수" 보다 큰 소리만 발화로 봅니다.
   * (평균만 쓰면 출렁이는 생활소음의 봉우리가 계속 발화로 잡힙니다)
   */

  /**
   * 발화 판정 기준 = 소음 평균 + 소음 변동폭 × 이 계수.
   * 키우면 소음에 둔감해져 요금이 줄고, 낮추면 작은 목소리를 더 잘 잡습니다.
   * 아이 목소리가 잘 안 잡히면 3 정도로 낮춰보세요.
   */
  NOISE_DEV_K: 4,

  /** 아무리 조용해도 이보다 작으면 발화로 보지 않음 (마이크 자체 노이즈) */
  MIN_SPEECH_RMS: 0.0045,

  /** 아무리 시끄러워도 이보다 높은 기준은 쓰지 않음 (아이 목소리를 놓치지 않게) */
  MAX_SPEECH_RMS: 0.055,

  /**
   * 실제로 말을 하면 중간중간 반드시 쉬는 구간이 생깁니다.
   * 이 시간 넘게 **한 번도 안 쉬고** 계속 "발화 중"이면 사람 말이 아니라
   * 생활소음(TV·에어컨 등)일 가능성이 큽니다.
   * → 소음 기준을 다시 잡고 게이트를 닫아 요금 폭주를 막습니다.
   *
   * ⚠️ 예전에는 45초였습니다. 너무 깁니다. 게이트가 잘못 열려 있으면
   *    45초 동안 모인 **방 안 소음 덩어리**가 통째로 서버에 올라가고,
   *    모델은 그 잡음에서 하지도 않은 말을 지어냅니다.
   *    ("혼자 말을 만들어내서 대화한다"의 원료가 이것이었습니다)
   *
   *    이제 쉬었다가 다시 말하면 이 타이머가 초기화되므로(gate.js 의
   *    TAIL→SPEAKING 참고), 짧게 줄여도 길게 말하는 사람이 잘리지 않습니다.
   */
  MAX_CONTINUOUS_STREAM_MS: 20_000,

  /**
   * 이 시간 동안 소음 통계를 한 번도 갱신하지 못하면 추정기가 굶은 것으로 봅니다.
   *
   * 소음 추정은 "문턱보다 조용한 프레임"에서만 배웁니다. 그런데 거실 밑소음이
   * 문턱보다 커지면 그런 프레임이 하나도 없어서 **영영 못 배웁니다.**
   * 그때는 관찰된 가장 조용한 순간을 밑소음으로 받아들여 빠져나옵니다.
   * @see gate.js _rescueNoiseStats
   */
  NOISE_STARVED_MS: 4_000,

  /**
   * 말이 시작되기 직전 오디오를 얼마나 되돌려 보낼지 (선행 버퍼).
   * 이게 없으면 첫 음절("I..."의 I)이 잘립니다.
   */
  PREROLL_MS: 320,

  /**
   * 말이 끝난 뒤 침묵을 계속 보내주는 시간.
   * 서버 VAD가 턴 종료를 감지할 수 있어야 하므로 서버의
   * silenceDurationMs(최대 1800ms)보다 넉넉해야 합니다.
   */
  SILENCE_TAIL_MS: 2400,

  /**
   * 끼어든 직후, 이미 날아오고 있던 선생님 음성을 버리는 시간.
   *
   * 서버가 "멈췄다"(interrupted)고 알려주기까지 왕복 지연이 있습니다.
   * 그 사이에 도착하는 조각을 그대로 재생하면, 끼어들었는데도 선생님이
   * 계속 말하는 것처럼 들립니다. 보통 서버 신호가 먼저 도착해서 해제되므로
   * 이 값은 "신호가 안 올 때의 최대 대기"입니다.
   */
  BARGE_GUARD_MS: 1200,

  /**
   * 선생님 말이 끝난 뒤 문턱(duck)을 원래대로 되돌리기까지의 지연.
   *
   * 사진 아바타는 우리가 직접 재생하므로 거의 정확합니다(짧게).
   * 실사 영상(Simli)은 소리가 별도 <audio>에서 나와 우리 재생기보다
   * 늦게 끝납니다. 그때 문턱을 먼저 내리면 스피커에 남은 선생님 목소리를
   * 사람 말로 잡아서, 선생님이 자기 목소리에 대답합니다.
   */
  DUCK_RELEASE_MS: { photo: 150, video: 700 },

  /**
   * 이 시간 동안 아무 말이 없으면 세션을 끊습니다 (요금 정지).
   *
   * 너무 짧으면 재연결이 잦아지고, 재연결할 때마다 대화 맥락이 흔들립니다.
   * 침묵 구간은 어차피 오디오를 안 보내서 요금이 거의 안 나가므로,
   * 넉넉하게 잡는 편이 대화 품질에 훨씬 유리합니다.
   */
  IDLE_DISCONNECT_MS: 180_000,

  /** 세션이 끊겨도 대화 맥락은 유지 → 다시 누르면 이어서 대화 */
  RESUME_ENABLED: true,

  /** 프로필별 하루 음성 대화 상한 (분). 0이면 무제한. */
  DAILY_LIMIT_MIN: {
    p_dad: 20,
    p_mom: 20,
    p_child1: 15,
    p_child2: 15,
    p_child3: 12,
    p_youngest: 8,
  },

  /** 참고용 단가 (2026-08 기준, USD/분) — 사용량 표시에만 씁니다. */
  RATE_USD_PER_MIN: {
    audioIn: 0.005,
    audioOut: 0.018,
    /** Simli 영상 아바타 (플랜에 따라 다름 — 대략값) */
    avatarVideo: 0.03,
  },

  /** 환율 (사용량 원화 표시용) */
  USD_TO_KRW: 1380,
};

/* ═══════════════════════════════════════════════════════════════════════════
   아바타 모드
   ═══════════════════════════════════════════════════════════════════════════ */
export const AVATAR_MODE = {
  /** 무료. 사진 + 오디오 기반 립싱크. */
  PHOTO: 'photo',
  /**
   * 무료. 3D 아바타 — 실제 머리 뼈대와 얼굴 모프타겟이 있어서
   * 고개를 돌리고, 눈을 깜빡이고, 말할 때 턱이 내려갑니다. **기본값.**
   */
  THREE: 'three',
  /** 유료. Simli 실사 영상 아바타. 특별한 날 / 주말용. */
  VIDEO: 'video',
};

export const DEFAULTS = {
  /**
   * 기본은 3D. 무료이면서 사진보다 훨씬 살아있어 보입니다.
   * (유료인 영상 모드는 여전히 사용자가 직접 켜야만 켜집니다 — 요금 사고 방지)
   */
  avatarMode: AVATAR_MODE.THREE,

  /** 3D 아바타 GLB 주소. 비워두면 기본 아바타를 씁니다. */
  avatarModelUrl: '',

  /**
   * 반이중(안전) 모드 — **기본값은 켬입니다.**
   *
   * true  = 선생님이 말하는 동안 마이크를 완전히 닫습니다.
   *         스피커 소리가 마이크로 되돌아갈 길이 물리적으로 없어집니다.
   * false = 마이크를 열어둡니다. 목소리로 끼어들 수 있지만, 스피커로 들으면
   *         선생님 목소리가 되돌아가 "내가 한 말이 또 인식되는" 증상이 납니다.
   *         **이어폰을 쓸 때만** 켜세요.
   *
   * ⚠️ 한때 기본값을 false 로 바꿨다가 되돌렸습니다.
   *    이 앱의 선생님은 **일부러 아이 말을 따라 말합니다**
   *    (아이: "Dog!" → 선생님: "Big dog!"). 마이크가 열려 있으면 그 소리가
   *    되돌아와 아이가 두 번 말한 것처럼 기록되고, 선생님은 자기 말에
   *    대답합니다. 소리 크기로 걸러내려 여러 방법을 시도했지만, 어느 것도
   *    "아이 말을 삼키지 않으면서 에코만 막는" 데 성공하지 못했습니다.
   *
   *    끼어들기는 **✋ 버튼**으로 해결합니다. 안전 모드에서도 항상 눌러서
   *    선생님 말을 끊고 바로 말할 수 있습니다.
   */
  halfDuplex: true,

  /** 한글 자막 표시 */
  showKoreanSubtitle: true,

  /** 진단 정보 표시 (대화가 이상할 때 켜서 원인을 봅니다) */
  showDiagnostics: false,
};

/** 오늘의 미션 표현 풀 (레벨별) */
export const DAILY_MISSIONS = {
  starter: [
    'I like it!',
    'Look at me!',
    'I want more, please.',
    'That is so fun!',
    'Can you help me?',
  ],
  beginner: [
    'Could you say that again?',
    'I think it was really fun.',
    'Let me tell you what happened.',
    'That sounds awesome!',
    'I am not sure, but maybe...',
  ],
  intermediate: [
    'Could you tell me more about that?',
    'That makes a lot of sense.',
    "I'd say it depends on the situation.",
    'To be honest, I felt a bit overwhelmed.',
    "Now that you mention it, I've been thinking about that too.",
  ],
};

/** 어른용 상황 연습 (아이는 CHILD_GAMES를 씁니다) */
export const ADULT_SCENARIOS = [
  { id: 'cafe',     title: '☕ 해외 카페 주문',     desc: '음료 커스텀 주문하기',       minAge: 6  },
  { id: 'airport',  title: '✈️ 공항 입국 심사',     desc: '심사관 질문에 답하기',       minAge: 9  },
  { id: 'hotel',    title: '🏨 호텔 체크인',        desc: '체크인하고 요청하기',         minAge: 9  },
  { id: 'business', title: '💼 비즈니스 미팅',      desc: '해외 파트너와 협의하기',      minAge: 18 },
  { id: 'smalltalk',title: '🗣️ 가벼운 잡담',       desc: '처음 만난 사람과 스몰토크',   minAge: 18 },
  { id: 'opinion',  title: '🧠 의견 나누기',        desc: '생각을 논리적으로 말하기',    minAge: 18 },
];

/** localStorage / IndexedDB 키 */
export const STORAGE = {
  DB_NAME: 'family_english_app',
  DB_VERSION: 1,
  SETTINGS_KEY: 'fea_settings_v2',
  USAGE_KEY: 'fea_usage_v2',
  /** 아이별 학습 단계 */
  STAGE_KEY: 'fea_stages_v1',
};
