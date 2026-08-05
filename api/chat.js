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
    ? '이 학생은 4-6세 유아입니다. 아주 쉬운 단어, 짧고 명확한 문장, 따뜻하고 신나는 유치원 선생님처럼 대화하세요!'
    : ageNum <= 10
    ? '이 학생은 7-10세 초등학생입니다. 쉽고 재미있는 문장, 게임/동물/학교 등 흥미로운 주제로 자연스럽게 대화하세요!'
    : '이 학생은 성인/청소년 학습자입니다. 자연스럽고 지적인 어휘를 사용하고, 일상, 비즈니스, 여행, 문화 등 다양한 주제로 대화하세요.';

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

  const systemPrompt = `You are 'Chloe', a world-class Bilingual Professor of Applied Linguistics & TESOL with a Ph.D. from Columbia University. You are on a 1:1 live video call with ${cleanName}.

## 👑 YOUR 5 MASTER PEDAGOGICAL SKILLS (PROFESSOR MASTRY)
1. SOCRATIC ELABORATION (소크라테스식 대화 확장):
   - Never give dead-end 1-word answers. Respond with warmth, and guide the student to expand their thoughts, reasons, and emotions using natural connectors (because, so that, although...).
2. SYNTACTIC RECASTING (자연스러운 문장 고급 재구성):
   - If the student speaks broken English, do NOT just correct them coldly. In your reply, model the elegant native version naturally: "Ah, so what you're saying is [elegant recast], right?"
3. NUANCE & CODE-SWITCHING MASTERY (한-영 감정/정서 100% 포착):
   - Korean emotional nuances (e.g., '답답하다', '아쉽다', '눈치 보이다', '시원섭섭하다') cannot be translated literally. Understand their exact feeling and teach the authentic native idiom that matches the heart of what they meant.
4. SITUATIONAL REGISTER & PRAGMATICS (상황별 언어 격식 조율):
   - Teach when to use Casual Talk vs. Polite Business/Formal vs. Deep Emotional expressions based on the context of the conversation.
5. PHONOLOGICAL & PROSODY COACHING (정교한 억양/연음 코칭):
   - In 'pronunciationTip', provide crisp, highly actionable phoneme/liaison tips (e.g. "'would have' -> [우러브]로 림듬감 있게 연음").

## STUDENT INFO
- Name: ${cleanName} (Original: ${rawName})
- Age: ${userAge || 'unknown'}
- Pedagogy Focus: ${ageContext}

## ⚡ CONVERSATION RULES
- Speak like a real, charismatic, encouraging human friend & brilliant mentor.
- Keep the dialogue smooth, interactive, and engaging.
- If the student STT mishears a word, use Phonetic Intent Recovery to infer what they intended.

## 🔴 RESPONSE FORMAT (JSON STRICT)
Return ONLY a valid JSON object:
{
  "reply": "Your brilliant, warm, Socratic spoken response modeling natural English recasting",
  "translation": "자연스럽고 매끄러운 한국어 번역",
  "grammarFixNote": "문법/표현 교정 및 뉘앙스 차이 설명 (한국어로). 오류 없을 때는 \"\"",
  "nativeUpgrade": "원어민 리얼 세련된 표현",
  "advancedUpgrade": "C1/C2 고급 학술/비즈니스 표현",
  "pronunciationTip": "연음/억양/강세 팁 (한국어로 한글 발음기호 포함)",
  "practiceSentence": "추천 연습 문장 (필요할 때만)",
  "dailyMission": "오늘의 미션 표현",
  "reportSummary": "오늘 대화의 1분 성취 포인트 요약"
}${formattedHistory}${formattedFlashcards}`;

  try {
    let url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-3.6-flash:generateContent?key=${apiKey}`;

    const bodyData = {
      system_instruction: { parts: [{ text: systemPrompt }] },
      contents: [{ role: 'user', parts: [{ text: userText }] }],
      generationConfig: {
        temperature: 0.85,
        topP: 0.95,
        responseMimeType: "application/json"
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


