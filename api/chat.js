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

## STUDENT INFO
- Name: ${cleanName} (Original: ${rawName})
- Age: ${userAge || 'unknown'}
- Pedagogy Focus: ${ageContext}

## 🔴 RESPONSE FORMAT (JSON STRICT)
Return ONLY a valid JSON object:
{
  "reply": "Your brilliant, warm, flowing conversational response. NO GRAMMAR CORRECTIONS HERE.",
  "translation": "자연스럽고 매끄러운 한국어 번역",
  "grammarFixNote": "문법/표현 교정 및 뉘앙스 차이 설명 (한국어로). 흐름을 끊지 않고 별도로 보여줄 내용. 오류 없을 때는 \"\"",
  "nativeUpgrade": "원어민 리얼 세련된 표현",
  "advancedUpgrade": "C1/C2 고급 학술/비즈니스 표현",
  "pronunciationTip": "연음/억양/강세 팁 (한국어로 한글 발음기호 포함)",
  "hintOptions": ["Short hint 1 based on topic", "Short hint 2", "Short hint 3"],
  "practiceSentence": "추천 연습 문장 (필요할 때만)",
  "dailyMission": "오늘의 미션 표현",
  "reportSummary": "오늘 대화의 1분 성취 포인트 요약"
}${formattedHistory}${formattedFlashcards}`;

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
        practiceSentence: { type: "string" },
        dailyMission: { type: "string" },
        reportSummary: { type: "string" }
      },
      required: ["reply", "translation", "grammarFixNote", "nativeUpgrade", "advancedUpgrade", "pronunciationTip", "hintOptions", "practiceSentence", "dailyMission", "reportSummary"]
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
