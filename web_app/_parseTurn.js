/**
 * api/_parseTurn.js
 * ----------------------------------------------------------------------------
 * 모델이 돌려준 글자에서 "아이가 한 말(HEARD)" 과 "선생님 대사(REPLY)" 를
 * 갈라내는 곳. talk.js 안에 있던 것을 따로 뺐습니다 — 여기서 난 사고가
 * 화면까지 그대로 흘러갔기 때문에, 이 부분만 따로 검사할 수 있어야 합니다.
 *
 * ── 실제로 있었던 사고 ──────────────────────────────────────────────────
 * 예전 코드는 이랬습니다:
 *     rawText.match(/^\s*HEARD:\s*(.*)$/im)
 *
 * 자바스크립트의 `\s` 는 **줄바꿈도 포함**합니다. 그래서 모델이 지시대로
 * HEARD 를 비워두면(= "HEARD:" 바로 뒤에 줄바꿈) `\s*` 가 그 줄바꿈을
 * 삼키고 `(.*)` 가 **다음 줄 전체**를 잡아갔습니다.
 *
 *     HEARD:
 *     REPLY: I'm ready whenever you are! What did you do today?
 *
 * 위 입력에서 heard 가 "REPLY: I'm ready whenever you are! ..." 가 됐고,
 * 그게 아이 말풍선에 찍히고 대화 기록에 아이 말로 저장되어,
 * 다음 턴에 선생님이 자기 말에 대답하는 자문자답이 시작됐습니다.
 *
 * 그래서 지금은 줄바꿈을 절대 넘지 않는 `[^\S\r\n]*` (줄바꿈이 아닌 공백)
 * 만 허용하고, 캡처도 `[^\r\n]*` 로 그 줄 안에서 끝냅니다.
 * ----------------------------------------------------------------------------
 */

/** HEARD: 뒤, 같은 줄 안에서만. 줄바꿈을 넘지 않습니다. */
const HEARD_RE = /^[^\S\r\n]*HEARD:[^\S\r\n]*([^\r\n]*)$/im;

/** REPLY: 뒤는 여러 줄이어도 됩니다(선생님이 두 문장 말할 수 있음). */
const REPLY_RE = /^[^\S\r\n]*REPLY:[^\S\r\n]*([\s\S]*)$/im;

/**
 * @param {object}  opts
 * @param {string}  opts.rawText   모델이 돌려준 글자 전체
 * @param {string}  [opts.userText] 글자로 보낸 턴이면 아이가 친 글자
 * @param {boolean} [opts.hasAudio] 목소리로 보낸 턴인지
 * @returns {{heard: string, reply: string, heardEmpty: boolean, formatted: boolean}}
 */
function parseTurnText({ rawText = '', userText = '', hasAudio = false } = {}) {
  const text = String(rawText || '').trim();

  let heard = String(userText || '');
  let reply = text;

  const heardMatch = text.match(HEARD_RE);
  const replyMatch = text.match(REPLY_RE);

  /* 모델이 약속한 형식을 지켰는지. 이걸 알아야 "아무 말도 안 들렸다" 와
     "형식을 안 지켰다" 를 구분할 수 있습니다. 둘을 섞으면, 형식을 안 지킨
     턴에서 아이 말을 통째로 버리게 됩니다. */
  const formatted = !!replyMatch;

  if (formatted) {
    reply = replyMatch[1].trim();
    heard = heardMatch ? heardMatch[1].trim() : heard;
  }

  /* 이중 안전장치. 어떤 이유로든 받아쓴 말에 우리 형식 딱지가 묻어 있으면
     그건 아이가 한 말이 아닙니다. 화면에 절대 내보내지 않습니다. */
  if (/^\s*(HEARD|REPLY)\s*:/i.test(heard)) heard = '';

  /* 목소리를 보냈는데 모델이 형식을 지키면서 HEARD 를 비워뒀다 =
     "말소리가 없었다" (프롬프트에 그렇게 시켰습니다).
     이때 선생님이 대답하면 아무도 말 안 했는데 혼자 떠드는 꼴이 됩니다. */
  const heardEmpty = !!hasAudio && formatted && !heard;

  /* 가르치는 내용은 **대사와 같은 응답 안에서** 뽑아냅니다. @see extractTeaching */
  const toolCalls = extractTeaching(text);

  /* ⚠️ REPLY_RE 는 여러 줄을 잡습니다(선생님이 두 문장 말할 수 있으므로).
     그래서 그 아래 붙은 FIX/WORD 줄까지 대사에 딸려 들어옵니다.
     그대로 두면 선생님이 "FIX: ... || ..." 를 **소리내어 읽습니다.**
     반드시 걷어냅니다. */
  reply = stripTeachingLines(reply);

  return { heard, reply, heardEmpty, formatted, toolCalls };
}

/* ═══════════════════════════════════════════════════════════════════════════
   가르치기(교정·단어)를 **글자에서** 뽑아냅니다.

   ⚠️ 2026-08-19 — "계속 문장만 고치고 Tell me more about it! 만 한다"

   예전에는 교정 카드를 Gemini 의 **함수 호출(function calling)** 로 받았습니다.
   그런데 REST generateContent 에서 모델이 함수를 부르면, 그 응답에는
   **함수 호출만 있고 글자가 없습니다.** 모델 입장에서는 함수 결과를 받은
   뒤에 말을 이어갈 생각이기 때문입니다. 하지만 이 앱은 무상태 REST 라
   함수 결과를 돌려주는 왕복이 없습니다.

   그래서 매 턴 대사가 비었고, 서버 안전망이 대신 만든
   "Ah, you mean "...". Tell me more about it!" 이 **주력이 되어버렸습니다.**
   화면이 그 문장으로 도배된 이유입니다. 대화가 이어질 수가 없었습니다.

   해법: 함수 호출을 걷어내고 **한 번의 응답 안에 글자로** 같이 받습니다.
       HEARD: ...
       REPLY: ...                    ← 항상 채워짐 (대화가 끊기지 않음)
       FIX: 틀린문장 || 고친문장 || 한국어 설명
       WORD: 단어 || 뜻 || 예문

   이러면 왕복이 늘지 않고(Vercel Hobby 10초 제한 안전), 대사는 언제나
   존재하며, 카드도 그대로 뜹니다. 화면 코드는 한 줄도 안 바꿔도 됩니다 —
   기존 toolCalls 모양으로 변환해서 넘기기 때문입니다.
   ═══════════════════════════════════════════════════════════════════════════ */

/** `FIX: a || b || c` — 줄 하나 안에서만 찾습니다(REPLY 를 삼키지 않도록). */
const FIX_RE = /^[^\S\r\n]*FIX:[^\S\r\n]*([^\r\n]*)$/im;
const WORD_RE = /^[^\S\r\n]*WORD:[^\S\r\n]*([^\r\n]*)$/im;

function splitFields(line) {
  return String(line || '')
    .split('||')
    .map((x) => x.trim())
    .filter(Boolean);
}

function extractTeaching(text) {
  const calls = [];

  const fix = text.match(FIX_RE);
  if (fix) {
    const [original, corrected, explanation_ko] = splitFields(fix[1]);
    /* 원문과 고친 문장이 **둘 다** 있고 서로 달라야 카드를 띄웁니다.
       같은 문장을 "고쳤다"고 보여주면 학습자가 뭐가 틀렸는지 못 찾습니다. */
    if (original && corrected && original !== corrected) {
      calls.push({
        name: 'correct_sentence',
        args: {
          original,
          corrected,
          explanation_ko: explanation_ko || '',
          error_type: '자연스러움',
        },
      });
    }
  }

  const word = text.match(WORD_RE);
  if (word) {
    const [w, meaning_ko, example_en] = splitFields(word[1]);
    if (w && meaning_ko) {
      calls.push({
        name: 'teach_word',
        args: { word: w, meaning_ko, example_en: example_en || '' },
      });
    }
  }

  return calls;
}

/** 대사에서 FIX/WORD 줄을 걷어냅니다 (선생님이 그걸 소리내어 읽으면 안 됩니다). */
function stripTeachingLines(reply) {
  return String(reply || '')
    .split(/\r?\n/)
    .filter((l) => !/^[^\S\r\n]*(FIX|WORD)[^\S\r\n]*:/i.test(l))
    .join('\n')
    .trim();
}

module.exports = {
  parseTurnText,
  extractTeaching,
  stripTeachingLines,
  HEARD_RE,
  REPLY_RE,
  FIX_RE,
  WORD_RE,
};
