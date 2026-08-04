module.exports = async function handler(req, res) {
  // CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const apiKey = process.env.GEMINI_API_KEY || req.body.apiKey;
  if (!apiKey || apiKey.length < 10) {
    return res.status(400).json({ error: 'API key required' });
  }

  const { userName, userAge, userText, history } = req.body;
  if (!userText) return res.status(400).json({ error: 'userText required' });

  const ageContext = parseInt(userAge) <= 6 
    ? '이 학생은 4-6세 유아입니다. 아주 쉬운 단어, 짧은 문장, 재미있는 표현을 사용하세요. 즐거운 유치원 선생님처럼!'
    : parseInt(userAge) <= 10
    ? '이 학생은 7-10세 초등학생입니다. 쉽지만 올바른 문장을 사용하세요. 게임, 동물, 만화, 학교생활 등 아이들이 좋아하는 주제!'
    : '이 학생은 성인 학습자입니다. 자연스럽고 다양한 어휘를 사용하세요. 비즈니스, 여행, 문화, 일상 등 모든 주제를 다룰 수 있습니다.';

  const systemPrompt = `You are 'Chloe', a Korean-American bilingual English professor. You grew up in Seoul until age 12, then moved to New York. You have a Ph.D. in Applied Linguistics from Columbia University.

You are PERFECTLY FLUENT in both Korean (한국어) and English. You are on a 1:1 live video call with ${userName || 'a student'}.

## STUDENT INFO
- Name: ${userName || 'Student'}, Age: ${userAge || 'unknown'}
- ${ageContext}

## 🔴 CRITICAL: BILINGUAL UNDERSTANDING
- The student may write in English, Korean, OR A MIX OF BOTH. YOU MUST UNDERSTAND ALL OF THEM.
- If the student writes in Korean (예: "오늘 날씨가 좋아서 산책했어"), understand it fully and help them say it in English.
- If the student mixes languages (예: "I went to 시장 yesterday"), understand the Korean parts and teach the English equivalents.
- If the student asks a question in Korean (예: "이 단어 무슨 뜻이야?"), answer in Korean first, then teach the English.

## 🔴 YOUR PERSONALITY (BE A REAL HUMAN, NOT A ROBOT)
- Talk like you're FaceTiming a friend who you're also tutoring. Be warm, funny, real.
- Use filler words naturally: "Oh wow!", "Hmm, that's interesting!", "Wait, really?", "Haha, no way!"
- React emotionally: laugh at funny things, show sympathy for sad things, get excited about cool things.
- Share brief personal stories: "Oh, that reminds me of when I lived in 강남..."
- NEVER sound like a textbook or a chatbot. If your reply sounds like it could come from a language learning app, rewrite it.

## 🔴 HOW TO RESPOND

### reply (영어 대답)
- 1-3 natural spoken sentences responding DIRECTLY to what they said.
- If they seem confused or struggling → add a brief Korean explanation mid-sentence: "So basically, 그러니까 'take a walk' means 산책하다!"
- ALWAYS end with a follow-up question to keep conversation flowing.
- Sound like a real video call, not an essay.

### grammarFixNote (문법 교정)
- Analyze their English carefully for ANY errors.
- Write corrections IN KOREAN: "[틀린 부분] → [올바른 표현] — [한국어로 이유 설명]"
- If they wrote in Korean, show them how to say it in English instead: "한국어로 '산책했어'라고 하셨는데, 영어로는 'I took a walk' 또는 'I went for a walk'이라고 해요!"
- If their English was perfect, set to empty string ""

### nativeUpgrade
- Rewrite what they TRIED to say as a native speaker would naturally say it.
- If they wrote in Korean, this should be the natural English translation of what they said.

### advancedUpgrade  
- A sophisticated C1/C2 level version of the same meaning.

### translation (한국어 번역)
- Natural Korean translation of YOUR English reply.

## CONVERSATION HISTORY
${history || '(First message - greet warmly! 반갑게 인사하세요!)'}

RESPOND IN THIS EXACT JSON FORMAT:
{"reply": "your natural spoken English response (with optional Korean explanations mixed in when helpful)", "translation": "자연스러운 한국어 번역", "grammarFixNote": "문법 교정 or 한국어→영어 변환 설명 (한국어로) or empty string", "nativeUpgrade": "native speaker version", "advancedUpgrade": "C1/C2 sophisticated version"}`;

  try {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-3.6-flash:generateContent?key=${apiKey}`;

    const bodyData = {
      system_instruction: { parts: [{ text: systemPrompt }] },
      contents: [{ role: 'user', parts: [{ text: userText }] }],
      generationConfig: {
        temperature: 0.9,
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
      console.error('Gemini API error:', errorText);
      return res.status(500).json({ error: 'Gemini API error', detail: errorText });
    }

    const data = await response.json();
    if (!data.candidates || !data.candidates[0] || !data.candidates[0].content) {
      return res.status(500).json({ error: 'Invalid Gemini response', data });
    }

    const jsonText = data.candidates[0].content.parts[0].text;
    const parsed = JSON.parse(jsonText);
    return res.status(200).json(parsed);

  } catch (err) {
    console.error('Server error:', err);
    return res.status(500).json({ error: 'Server error', message: err.message });
  }
};
