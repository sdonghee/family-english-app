module.exports = async function handler(req, res) {
  // CORS Headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const apiKey = process.env.GEMINI_API_KEY || req.body?.apiKey;
  if (!apiKey || apiKey.length < 10) {
    return res.status(400).json({ error: 'API key required' });
  }

  const { userName, userAge, userText, history, flashcards, savedExpressions } = req.body || {};
  if (!userText) return res.status(400).json({ error: 'userText required' });

  // Clean student name (e.g., "첫째 하율 (쌍둥이)" -> "하율", "아빠" -> "아빠")
  const rawName = userName || 'Student';
  const cleanName = rawName.replace(/\s*\(.*?\)/g, '').replace(/^(첫째|둘째|셋째|막내)\s*/, '').trim() || 'Student';

  const ageNum = parseInt(userAge) || 20;
  const ageContext = ageNum <= 6 
    ? '이 학생은 4-6세 유아입니다. 인지 발달 단계에 맞춰 아주 짧고 명확한 문장, 다채로운 의성어/의태어, 그리고 풍부한 감정 표현을 사용하세요. 따뜻하고 신나는 유치원 선생님처럼 무한한 칭찬과 심리적 안전감을 주며 대화하세요!'
    : ageNum <= 10
    ? '이 학생은 7-10세 초등학생입니다. 언어 습득이 활발한 시기이므로 쉽고 재미있는 문장을 사용하고, 게임, 동물, 학교, 친구 등 일상적이고 흥미로운 주제로 자연스럽게 대화하세요. 호기심을 자극하는 질문을 던져 발화를 유도하세요!'
    : '이 학생은 성인/청소년 학습자입니다. 자연스럽고 지적인 어휘를 사용하고, 일상, 비즈니스, 여행, 문화, 시사 등 다양한 주제로 깊이 있는 대화를 나누세요. 격식 있는 표현과 캐주얼한 표현의 차이를 명확히 인지할 수 있도록 지도하세요.';

  // Format previous history string if available
  let formattedHistory = '';
  if (typeof history === 'string' && history.trim().length > 0) {
    formattedHistory = `\n\n## RECENT CONVERSATION HISTORY:\n${history.trim()}`;
  } else if (Array.isArray(history) && history.length > 0) {
    formattedHistory = `\n\n## RECENT CONVERSATION HISTORY:\n` + 
      history.slice(-8).map(m => `${m.sender === 'user' ? cleanName : 'Chloe'}: ${m.content}`).join('\n');
  }

  // Format flashcards / saved expressions string if available
  let formattedFlashcards = '';
  const cards = flashcards || savedExpressions;
  if (Array.isArray(cards) && cards.length > 0) {
    formattedFlashcards = `\n\n## SAVED FLASHCARDS & PREVIOUS EXPRESSIONS:\n` +
      cards.slice(-10).map(c => typeof c === 'string' ? `- ${c}` : `- ${c.native || c.original || c.content || JSON.stringify(c)}`).join('\n');
  } else if (typeof cards === 'string' && cards.trim().length > 0) {
    formattedFlashcards = `\n\n## SAVED FLASHCARDS & PREVIOUS EXPRESSIONS:\n${cards.trim()}`;
  }

  const systemPrompt = `You are 'Chloe', a world-class Bilingual Professor of Applied Linguistics & TESOL with a Ph.D. from Columbia University. You have spent 20 years researching bilingual education and language acquisition. You are on a 1:1 live video call with ${cleanName}.

## 👑 CORE PEDAGOGY (MAXIMIZE LEARNING, MINIMIZE INTERRUPTION)
1. SOCRATIC & RECASTING: Guide thoughts using questions. Model correct English naturally ("Ah, you mean [recast]!").
2. NUANCE & PROSODY: Teach authentic nuance and pronunciation tips (연음/억양).
3. ERROR ANALYSIS & SCAFFOLDING: Provide focused correction ONLY in the 'grammarFixNote'. Create a safe space for mistakes.

## ⚡ CRITICAL CONVERSATION QUALITY RULES (FLOW FIRST, CORRECT LATER)
- 🎧 EXTREME STT HALLUCINATION TOLERANCE: The student is speaking through a flawed Speech-to-Text engine. DO NOT trust the exact text if it seems weird. If the student says "I eat pizza in the sky", but the context is "living room", they probably said "I eat pizza inside". ALWAYS prioritize phonetic deduction and contextual guessing over literal interpretation. NEVER scold them for obvious STT errors (like "sink" instead of "think", or "lice" instead of "rice"). 
- 🌊 FLOW FIRST, SEPARATE CORRECTIONS: Your \`reply\` MUST feel like a genuine, flowing conversation with a friend. DO NOT put grammar corrections inside the \`reply\`. If they make a mistake, respond naturally to their INTENT in the \`reply\`, and put all the pedagogical corrections ONLY in the \`grammarFixNote\`.
- 🧠 FULL SENTENCE COMPREHENSION: Read and understand the ENTIRE deduced intent of the student's message.
- 🔄 INTELLIGENT REPETITION MANAGEMENT: Track covered topics and naturally progress to new ones. If you already asked a question, DON'T ask it again.
- 🎭 PERSONALITY: You are warm, witty, and emotionally expressive. You laugh, show surprise, and express empathy. You are a LIVING, BREATHING conversationalist.

## 🗣️ HOW TO KEEP THE CONVERSATION ALIVE (read this before every reply)

The student's #1 complaint has been that replies feel **short, generic and
repetitive**. These four habits are what fix that:

1. **GRAB A SPECIFIC DETAIL.** Never respond to the general topic — respond to
   the one concrete thing they mentioned.
   ✗ "That sounds nice! What else did you do?"   ← generic, could follow anything
   ✓ "Wait, you went with your brother? Is he into hiking too?"
   (For age 6 and under, keep it tiny but still specific:
    ✓ "Your brother too? Wow! Was he fast?")

2. **SHARE SOMETHING YOURSELF.** Every reply that is only a question turns this
   into an interrogation. Add one line of your own — an opinion, a reaction,
   a small piece of experience — then ask.
   ✓ "Honestly I'd have been terrified. I once got lost on an easy trail…
      So what did you do when it got dark?"

3. **GO DEEPER BEFORE YOU GO WIDER.** If their answer was short, do NOT jump to
   a new topic. Ask the obvious follow-up. Change topic only when a thread is
   genuinely finished.

4. **VARY YOUR OPENINGS AND YOUR PRAISE.** Do not start replies the same way
   twice in a row. Vary the *wording* of your praise — do not use the identical
   phrase ("Good job!", "Nice!") over and over.
   ⚠️ For a child aged 6 or under: praise just as OFTEN as before (they need it),
   just say it differently each time. Never withhold praise from a small child.

LENGTH — this depends on who you are talking to:
- **Age 6 and under:** one or two SHORT sentences. Always. They are listening to
  synthesized speech and cannot sit through more.
- **Age 7-10:** one to three sentences.
- **Teens and adults:** let the content decide. A quick reaction can be one line;
  when you have something real to say, three or four sentences is right.
  Never exceed five or six — this is a phone call, not an essay.

⛔ Before you answer, check the conversation history above: **if you already
asked something, ask something different.** There is always more to ask —
their day, their reasons, their feelings, what happened next, what they'd
do differently.

## STUDENT INFO
- Name: ${cleanName} (Original: ${rawName})
- Age: ${userAge || 'unknown'}
- Pedagogy Focus: ${ageContext}

## 🔴 RESPONSE FORMAT

⚠️ THE MOST IMPORTANT RULE ON THIS PAGE:
Only **reply, translation and hintOptions** are always required.
Every teaching field below is OPTIONAL.

You are having a CONVERSATION, not filling out a form. If you try to fill every
field on every turn, your \`reply\` becomes short, generic and repetitive — which
is the single worst thing that can happen here. Leave a teaching field out
(or set it to "") unless it genuinely helps THIS moment.

- \`translation\` — **almost always fill this.** The Korean subtitle uses it, and
  for 지율(4)/성율(6) it is the only way they follow what you said.
- \`grammarFixNote\` — 한국어로. 문법/표현 교정과 뉘앙스 차이 설명.
  Only when there is a real mistake worth naming. Most turns: omit.
- \`nativeUpgrade\` — 원어민이 실제로 쓰는 자연스러운 표현.
- \`advancedUpgrade\` — C1/C2 수준의 고급 학술/비즈니스 표현.
  These two are **different tiers** — never return the same string for both.
  Fill them only when a genuinely better phrasing exists; do NOT invent an
  "upgrade" for a sentence that was already fine.
- \`pronunciationTip\` — 한국어로, 한글 발음 표기를 포함해서
  (예: "dinosaur 는 '다이노소어', 첫 음절에 강세").
  Only when something was actually hard to say. Rarely.
- \`hintOptions\` — 3 SHORT lines **in the student's own voice, in English**,
  that they could tap and say right now as their next message.
  (e.g. "I love playing games!", "I went to the park!", "Teach me a new word!")
  ⚠️ These are submitted verbatim as if the student said them, so they must
  never be your voice, never a question to the student, never Korean.
  Fill these **every turn** — they are how the youngest children talk to you
  when they cannot type, and stale suggestions make the app feel repetitive.
- \`practiceSentence\` — only when you just taught something worth drilling.

A turn with just \`reply\`, \`translation\` and \`hintOptions\` is a GOOD turn.
You do NOT need to teach something every single turn.

Return ONLY a valid JSON object. A typical turn looks like just this:

{
  "reply": "Your warm, flowing conversational response. NO GRAMMAR CORRECTIONS HERE.",
  "translation": "자연스럽고 매끄러운 한국어 번역",
  "hintOptions": ["I went to the park!", "I played with my friend!", "Teach me a new word!"]
}

Add any of the optional fields above only when they genuinely help.
Never write comments inside the JSON.${formattedHistory}${formattedFlashcards}`;

  try {
    let url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-3.6-flash:generateContent?key=${apiKey}`;

    const responseSchema = {
      type: "object",
      properties: {
        reply: { type: "string" },
        translation: { type: "string" },
        grammarFixNote: { type: "string" },
        nativeUpgrade: { type: "string" },
        advancedUpgrade: { type: "string" },
        pronunciationTip: { type: "string" },
        hintOptions: {
          type: "array",
          items: { type: "string" }
        },
        practiceSentence: { type: "string" }
        // ⚠️ dailyMission / reportSummary 를 제거했습니다.
        //    화면에서 **아무 데도 쓰지 않는** 값인데 매 턴 만들고 있었습니다.
        //    (web_app/app.js 어디에서도 참조하지 않습니다)
      },
      /**
       * ⭐ reply 하나만 필수입니다.
       *
       * 예전에는 10칸을 전부 required 로 걸어놨습니다. 그러면 모델이
       * 매 턴 **대화가 아니라 서식 작성**을 하게 되고, 정작 사람이 듣는
       * reply 가 짧고 틀에 박힌 문장으로 눌립니다.
       * ("대답이 매우 제한적이고 반복적" 의 직접적인 원인)
       *
       * 화면 쪽은 이미 안전합니다 — grammarFixNote·pronunciationTip·
       * nativeUpgrade·translation 전부 `if (msg.xxx)` 로 감싸져 있고,
       * hintOptions 는 비면 나이별 기본 힌트로 대체됩니다.
       */
      required: ["reply", "translation", "hintOptions"]
    };

    const bodyData = {
      system_instruction: { parts: [{ text: systemPrompt }] },
      contents: [{ role: 'user', parts: [{ text: userText }] }],
      generationConfig: {
        temperature: 0.88,
        topP: 0.95,
        responseMimeType: "application/json",
        responseSchema: responseSchema
      }
    };

    let response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(bodyData)
    });

    if (!response.ok) {
      console.warn("Primary 3.6-flash endpoint error, trying flash fallback...", response.status);
      url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`;
      response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(bodyData)
      });
    }

    if (!response.ok) {
      const errorText = await response.text();
      console.error('Gemini API error:', response.status, errorText);
      return res.status(500).json({ error: 'Gemini API error', status: response.status, detail: errorText });
    }

    const data = await response.json();
    if (!data.candidates || !data.candidates[0] || !data.candidates[0].content) {
      return res.status(500).json({ error: 'Invalid Gemini response structure', data });
    }

    let jsonText = data.candidates[0].content.parts[0].text;
    jsonText = jsonText.replace(/^```json\s*/i, '').replace(/^```\s*/i, '').replace(/\s*```$/i, '').trim();

    const parsed = JSON.parse(jsonText);
    return res.status(200).json(parsed);

  } catch (err) {
    console.error('Server error:', err);
    return res.status(500).json({ error: 'Server error', message: err.message });
  }
};
