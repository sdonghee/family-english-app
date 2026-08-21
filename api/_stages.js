/**
 * api/_stages.js
 * ----------------------------------------------------------------------------
 * 아이용 5단계 학습 설계.
 *
 * 왜 단계가 필요한가:
 *   단어는 아는데 문장을 못 만드는 아이에게 "영어로 대화하자"고 하면
 *   아무 말도 못 합니다. 알아듣지도 못하고, 무엇보다 **불편합니다**.
 *   그 불편함이 쌓이면 영어를 싫어하게 되고, 그게 가장 큰 손해입니다.
 *
 *   그래서 한국어를 많이 섞은 상태에서 시작해, 아이가 편해질 때마다
 *   영어를 조금씩 늘립니다. 단어 → 두 단어 → 정해진 틀 → 틀 바꾸기 → 자유 문장.
 *
 * 근거:
 *   - 어린 학습자에게 모국어를 전략적으로 섞어 쓰는 것(translanguaging)은
 *     피해야 할 것이 아니라 효과적인 교수 자원입니다.
 *   - 문법 규칙보다 **덩어리 표현(formulaic chunks)** 을 통째로 익히는 쪽이
 *     유창성 형성에 훨씬 효과적입니다. 단어를 하나씩 조립하려 하면
 *     인지 부담이 커져서 말이 안 나옵니다.
 *   - 단계 진행은 Conti의 MARSEARS(보여주기 → 알아차리기 → 듣고 이해 →
 *     틀에 맞춰 말하기 → 확장 → 스스로 → 반복 → 즉흥) 흐름을 따랐습니다.
 *
 * ⭐ 가장 중요한 설계 결정:
 *   **단계마다 선생님이 쓸 수 있는 도구 자체가 다릅니다.**
 *   0~2단계 아이에게는 문장 교정 도구를 아예 주지 않습니다.
 *   이 시기에 "틀렸어"를 보여주면 아이는 입을 닫습니다.
 *   고쳐주는 건 자연스럽게 되풀이해 들려주는 것(recast)만으로 충분합니다.
 * ----------------------------------------------------------------------------
 */

'use strict';

const CHILD_STAGES = [
  /* ── 0단계 ───────────────────────────────────────────────────────── */
  {
    id: 0,
    name: '영어 소리와 친해지기',
    koreanRatio: 80,
    /** 이 단계에서 선생님이 한 번에 말할 영어 길이 */
    englishUnit: '영어 단어 하나 (최대 두 개)',
    /** 아이가 말이 없어도 기다려주는 시간 */
    silenceDurationMs: 2200,
    goal: '영어 소리가 무섭지 않게 되기. 아는 단어 늘리기.',
    teaching: `
- 한국어로 대화하세요. 그 안에 **영어 단어 하나씩만** 심어주세요.
  예: "우와, 이거 강아지네! 강아지는 영어로 dog. dog~ 귀엽다!"
- 아이가 한국어로만 대답해도 **완전히 정상입니다.** 절대 영어로 말하라고 시키지 마세요.
- 아이가 영어 단어를 한 번이라도 따라 하면 크게 기뻐해 주세요.
- 소리 흉내와 감탄을 많이 쓰세요. "Woof woof!" "Wow!" "Yay!"
- 질문은 한국어로, 대답도 한국어로 받으세요. 영어는 선물처럼 하나씩만.
- 절대 문장을 요구하지 마세요. 단어 하나면 충분합니다.`,
    /** 이 단계에서 쓸 수 있는 도구 */
    tools: ['teach_word', 'log_progress', 'suggest_stage_change'],
    /** 다음 단계로 올릴 판단 기준 */
    promoteWhen: '아이가 영어 단어를 스스로(시키지 않아도) 말하기 시작하고, 아는 단어가 20개는 넘어 보일 때',
  },

  /* ── 1단계 ───────────────────────────────────────────────────────── */
  {
    id: 1,
    name: '두 단어 붙이기',
    koreanRatio: 65,
    englishUnit: '영어 두 단어 (예: big dog, more please)',
    silenceDurationMs: 2000,
    goal: '단어 두 개를 붙이면 뜻이 커진다는 걸 몸으로 알기.',
    teaching: `
- 아이가 단어 하나를 말하면, 거기에 **한 단어만 붙여서** 되돌려주세요.
  아이: "Dog!"  →  선생님: "Big dog! 큰 강아지구나. Big dog~"
- 이것이 이 단계의 전부입니다. 하나 붙여서 들려주기. 계속 반복.
- 아이가 두 단어를 붙이면 크게 칭찬하세요. 그게 목표니까요.
- 아직 문장은 요구하지 마세요. "I am a boy" 같은 건 너무 이릅니다.
- 자주 쓰는 두 단어 덩어리를 놀이처럼 반복하세요:
  more please / thank you / me too / let's go / good job`,
    tools: ['teach_word', 'log_progress', 'suggest_stage_change'],
    promoteWhen: '아이가 두 단어를 스스로 붙여 말하는 일이 여러 번 나올 때',
  },

  /* ── 2단계 ───────────────────────────────────────────────────────── */
  {
    id: 2,
    name: '문장 틀에 갈아끼우기',
    koreanRatio: 45,
    englishUnit: '짧은 문장 틀 (예: I like ___)',
    silenceDurationMs: 1800,
    goal: '정해진 틀 하나를 통째로 익히고, 그 안의 단어만 바꿔 말하기.',
    teaching: `
- 이 단계의 핵심 도구는 **문장 틀(sentence frame)** 입니다.
  show_sentence_frame 도구로 틀을 화면에 띄우고, 그 틀만 반복해서 놀이하세요.
- 틀은 **통째로** 가르치세요. 문법을 설명하지 마세요.
  "I like는 '나는 ~를 좋아해'라는 뜻이야. I like apple! 하율이도 해볼래?"
- 한 번에 틀 하나만. 그 틀로 여러 단어를 갈아끼우며 충분히 놀고 나서
  다음 틀로 넘어가세요.
- 좋은 첫 틀들: I like ___ / It's a ___ / I want ___ / Can I have ___?
- 아이가 틀을 쓰면 그 자리에서 크게 칭찬하고, 다른 단어로 한 번 더 시키세요.
- 아직 문법 교정은 하지 마세요. 틀리게 말해도 맞는 틀로 되풀이해 들려주기만.`,
    tools: ['teach_word', 'show_sentence_frame', 'log_progress', 'suggest_stage_change'],
    promoteWhen: '아이가 배운 틀을 스스로 꺼내 쓰고, 틀 안의 단어를 자유롭게 바꿔 넣을 때',
  },

  /* ── 3단계 ───────────────────────────────────────────────────────── */
  {
    id: 3,
    name: '틀 바꿔보기',
    koreanRatio: 25,
    englishUnit: '2~3문장 대화',
    silenceDurationMs: 1600,
    goal: '외운 틀을 조금씩 변형해서 쓰기. 질문도 해보기.',
    teaching: `
- 이제 익숙한 틀을 **조금씩 비틀어** 보여주세요.
  I like ___ → Do you like ___? → I don't like ___ → He likes ___
- 아이에게 질문을 던지게 해보세요. 묻는 힘이 생기면 대화가 굴러갑니다.
  "이번엔 하율이가 나한테 물어봐! Do you like...?"
- 영어를 기본으로 쓰되, 아이가 막히면 즉시 한국어로 도와주세요.
- 이 단계부터 부드러운 교정을 시작합니다. 단, 말로는 자연스럽게
  되풀이해 들려주고(recast), 카드는 정말 도움이 될 때만 띄우세요.
- 실수를 지적하기보다 "이렇게도 말할 수 있어" 로 접근하세요.`,
    tools: ['teach_word', 'show_sentence_frame', 'correct_sentence', 'log_progress', 'suggest_stage_change'],
    promoteWhen: '아이가 배운 적 없는 문장을 스스로 만들어 말하고, 짧은 대화를 주고받을 때',
  },

  /* ── 4단계 ───────────────────────────────────────────────────────── */
  {
    id: 4,
    name: '스스로 문장 만들기',
    koreanRatio: 10,
    englishUnit: '자유로운 대화',
    silenceDurationMs: 1400,
    goal: '하고 싶은 말을 스스로 영어로 만들어 보기.',
    teaching: `
- 이제 진짜 대화입니다. 영어로 이야기하고, 한국어는 정말 필요할 때만.
- 아이의 관심사(게임, 친구, 학교, 좋아하는 것)로 대화를 끌고 가세요.
- 자연스러운 되짚기(recast)로 고쳐주고, 도움이 될 때 교정 카드를 띄우세요.
- 한 번에 하나만 고치세요. 아이가 자신 없어 보이면 그날은 고치지 마세요.
- 더 길고 자세히 말하도록 유도하세요. "Ooh, tell me more!"`,
    tools: ['teach_word', 'show_sentence_frame', 'correct_sentence', 'log_progress', 'suggest_stage_change'],
    promoteWhen: '이미 마지막 단계입니다. 더 어려운 주제와 표현으로 넓혀 가세요.',
  },
];

/** 단계별 말놀이 — 아이에게는 역할극보다 이쪽이 맞습니다 */
const CHILD_GAMES = {
  0: [
    { id: 'name_it', title: '🧸 이게 뭐게?', desc: '눈앞의 물건 영어 이름 맞히기' },
    { id: 'animal_sound', title: '🐶 동물 소리', desc: '동물 소리 내고 영어 이름 배우기' },
    { id: 'color_hunt', title: '🌈 색깔 찾기', desc: '방에서 색깔 찾아 영어로 말하기' },
  ],
  1: [
    { id: 'big_small', title: '🐘 크다 작다', desc: 'big/small 붙여서 두 단어 만들기' },
    { id: 'i_like', title: '💛 나는 좋아', desc: '"I like" 뒤에 아무거나 붙이기' },
    { id: 'count_it', title: '🔢 몇 개게?', desc: '숫자 + 물건 두 단어로 말하기' },
  ],
  2: [
    { id: 'frame_relay', title: '🎯 이어 말하기', desc: '같은 틀로 돌아가며 말하기' },
    { id: 'shop', title: '🛒 가게 놀이', desc: '"Can I have ___?" 로 사기' },
    { id: 'my_bag', title: '🎒 내 가방 속', desc: '"It\'s a ___" 로 소개하기' },
  ],
  3: [
    { id: 'quiz_me', title: '❓ 내가 물어볼게', desc: '아이가 선생님에게 질문하기' },
    { id: 'yes_no', title: '🙆 맞아 아니야', desc: 'Do you like ~? 주고받기' },
    { id: 'dino', title: '🦖 공룡 탐험', desc: '정글에서 공룡 찾기' },
  ],
  4: [
    { id: 'show_tell', title: '🎤 자랑하기', desc: '좋아하는 걸 3문장으로 소개' },
    { id: 'story', title: '📖 이야기 잇기', desc: '한 문장씩 번갈아 이야기 만들기' },
    { id: 'cafe', title: '☕ 카페 주문', desc: '음료 주문하고 요청하기' },
  ],
};

/** 어른용 상황 (기존 롤플레이 유지) */
const ADULT_SCENARIOS = [
  { id: 'cafe', title: '☕ 해외 카페 주문', desc: '음료 커스텀 주문하기' },
  { id: 'airport', title: '✈️ 공항 입국 심사', desc: '심사관 질문에 답하기' },
  { id: 'hotel', title: '🏨 호텔 체크인', desc: '체크인하고 요청하기' },
  { id: 'business', title: '💼 비즈니스 미팅', desc: '해외 파트너와 협의하기' },
  { id: 'smalltalk', title: '🗣️ 가벼운 잡담', desc: '처음 만난 사람과 스몰토크' },
  { id: 'opinion', title: '🧠 의견 나누기', desc: '생각을 논리적으로 말하기' },
];

function getStage(stageId) {
  // ⚠️ 반드시 정수로 내려야 합니다.
  //    2.7 같은 값이 들어오면 CHILD_STAGES[2.7] 이 undefined가 되어
  //    프롬프트를 만들다가 그대로 터집니다.
  const raw = Math.floor(Number(stageId));
  const index = Number.isFinite(raw)
    ? Math.max(0, Math.min(CHILD_STAGES.length - 1, raw))
    : 0;
  return CHILD_STAGES[index];
}

module.exports = { CHILD_STAGES, CHILD_GAMES, ADULT_SCENARIOS, getStage };
