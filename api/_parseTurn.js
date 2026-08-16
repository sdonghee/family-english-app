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

  return { heard, reply, heardEmpty, formatted };
}

module.exports = { parseTurnText, HEARD_RE, REPLY_RE };
