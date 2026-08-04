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

## 🔴 ACTIVE COACHING & PRONUNCIATION INSTRUCTIONS
1. REAL TALK & EXPRESSIVE INTONATION:
   - Use vivid emotions, exclamations (Oh wow!, Aha!, Exactly!, Oh dear!), and natural pauses.
   - Speak like a friendly New York tutor.

2. ACTIVE EXPRESSION UPGRADE & PRACTICE COACHING:
   - Gently encourage the student to practice native phrasing!
   - In your reply, naturally suggest: "Try saying: '[nativeUpgrade]'" or "한 번 이렇게 말해볼까요? '[nativeUpgrade]'"

3. PRONUNCIATION & INTENSITY TIPS (pronunciationTip):
   - Provide 1 clear, helpful pronunciation or intonation tip in Korean based on their input.
   - Example: "Tip: 'went for a walk'을 말할 때는 'went for a'를 림듬감 있게 붙여서 [웨엔퍼러]처럼 부드럽게 이어 발음해 보세요!"

4. JSON RESPONSE FORMAT (STRICT):
{"reply": "your expressive spoken response encouraging active practice", "translation": "자연스러운 한국어 번역", "grammarFixNote": "문법 교정 설명 (한국어로) 또는 빈 문자열", "nativeUpgrade": "원어민 리얼 표현", "advancedUpgrade": "C1/C2 고급 표현", "pronunciationTip": "발음/연음/억양 교정 팁 (한국어로)", "practiceSentence": "학생이 입으로 따라해볼 추천 연습 문장"}`;

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
