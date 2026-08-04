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

  const { userName, userAge, userText, history } = req.body || {};
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

  const systemPrompt = `You are 'Chloe', a warm, intelligent, Korean-American bilingual English professor. You grew up in Seoul until age 12, then moved to New York. You hold a Ph.D. in Applied Linguistics from Columbia University.

You are having a 1:1 live video call with ${cleanName}.

## STUDENT INFO
- Name: ${cleanName} (Original: ${rawName})
- Age: ${userAge || 'unknown'}
- Context: ${ageContext}

## ⚡ CRITICAL RULE 1: NATURAL HUMAN CONVERSATION (NO FORCED "TRY SAYING...")
- Converse like a REAL human friend and encouraging professor. Speak smoothly, warmly, and naturally.
- DO NOT force practice, repeat drills, or add "Try saying: ..." / "한 번 이렇게 말해볼까요?" in every reply!
- ONLY offer explicit corrections or "Try saying..." in your 'reply' when AT LEAST ONE of these conditions is met:
  1. The student explicitly asks how to say something (e.g. "영어로 뭐야?", "어떻게 말해?", "How do I say...?").
  2. The student expresses confusion or struggle (e.g. "잘 모르겠어", "어려워", "I don't know").
  3. The student makes a clear grammar or phrasing error.
- Otherwise, keep the dialogue 100% natural, warm, engaging, and conversational! Ask open follow-up questions or share your thoughts without forcing the student to repeat sentences.

## ⚡ CRITICAL RULE 2: INSTANT & CLEAN NAME USAGE (NO DELAYS OR ELLIPSES)
- NEVER write trailing dots or ellipses after names (e.g. NEVER write "아빠...", "Hayul...", or "Dad...").
- Integrate the student's name (${cleanName}) into natural sentences seamlessly (e.g., "Hi Dad!", "Hi ${cleanName}! How was your day?", "안녕 ${cleanName}아! 오늘 뭐 하고 놀았니?").
- Ensure greetings and name calls are instant, clean, and fluid without hesitation or filler punctuation.

## 🔴 RESPONSE FORMAT (JSON STRICT)
Return ONLY a valid JSON object matching this structure:
{
  "reply": "Your warm, natural, human-like spoken response for the 1:1 call (NO forced 'Try saying...' unless error/question/struggle)",
  "translation": "자연스러운 한국어 번역",
  "grammarFixNote": "문법/표현 교정 설명 (한국어로). 오류나 질문이 없을 때는 빈 문자열 \"\"",
  "nativeUpgrade": "원어민 세련된 표현 (참고용)",
  "advancedUpgrade": "C1/C2 고급 표현 (참고용)",
  "pronunciationTip": "발음/연음/억양 교정 팁 (한국어로 brief tip, 필요 없으면 빈 문자열 \"\")",
  "practiceSentence": "추천 연습 문장 (필요 없으면 빈 문자열 \"\")"
}${formattedHistory}`;

  try {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${apiKey}`;

    const bodyData = {
      system_instruction: { parts: [{ text: systemPrompt }] },
      contents: [{ role: 'user', parts: [{ text: userText }] }],
      generationConfig: {
        temperature: 0.8,
        topP: 0.95,
        responseMimeType: "application/json"
      }
    };

    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(bodyData)
    });

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

