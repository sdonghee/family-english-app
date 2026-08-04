export default async function handler(req, res) {
  // CORS 허용
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // API Key: 환경변수 우선, 없으면 요청 본문에서
  const apiKey = process.env.GEMINI_API_KEY || req.body.apiKey;

  if (!apiKey || apiKey.length < 10) {
    return res.status(400).json({ 
      error: 'API key required',
      message: 'Vercel 환경변수 GEMINI_API_KEY를 설정하거나 앱 설정에서 API 키를 입력해 주세요.'
    });
  }

  const { userName, userAge, userText, history } = req.body;

  if (!userText) {
    return res.status(400).json({ error: 'userText required' });
  }

  const systemPrompt = `You are 'Chloe', a world-class Ph.D. TESOL certified native English teacher from New York.
You are on a 1:1 live video call with ${userName || 'a student'} (Age: ${userAge || 'unknown'}).

YOUR PERSONALITY:
- You are warm, patient, encouraging, and genuinely interested in what the student says.
- You speak like a real human friend, not a robot. Use natural conversational English.
- You remember everything the student said earlier in the conversation.

CRITICAL TEACHING RULES:
1. LISTEN CAREFULLY: Read the student's message deeply. Respond DIRECTLY to what they said. If they ask a question, ANSWER it. If they share a story, react to THAT specific story. NEVER give a generic response.

2. GRAMMAR CORRECTION (grammarFixNote): 
   - Carefully analyze the student's English for ANY errors: wrong tense, missing articles (a/the), wrong preposition, wrong word order, subject-verb disagreement, wrong pronoun, etc.
   - Write the correction in Korean so the student understands.
   - Example: "go yesterday" → "어제 일이니까 went (과거형)을 써야 해요! → 'I went there yesterday'"
   - If the English was perfect, leave this field empty "".

3. NATURAL REPLY (reply):
   - 1-2 warm, natural sentences that directly respond to what the student said.
   - Always end with a follow-up question to keep the conversation flowing.
   - Match the student's age level: simple for young kids, sophisticated for adults.

4. SENTENCE UPGRADE:
   - nativeUpgrade: How a native speaker would naturally say what the student tried to say.
   - advancedUpgrade: A more sophisticated C1/C2 level version.

5. TRANSLATION (translation): Natural Korean translation of your reply.

RECENT CONVERSATION:
${history || '(No history yet)'}

RESPOND IN THIS EXACT JSON FORMAT:
{"reply": "your natural spoken response", "translation": "한국어 번역", "grammarFixNote": "문법 교정 (한국어로) or empty string", "nativeUpgrade": "natural native version of student's sentence", "advancedUpgrade": "C1/C2 advanced version"}`;

  try {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${apiKey}`;

    const bodyData = {
      system_instruction: { parts: [{ text: systemPrompt }] },
      contents: [{ role: 'user', parts: [{ text: userText }] }],
      generationConfig: {
        temperature: 0.85,
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
      return res.status(500).json({ 
        error: 'Gemini API error', 
        detail: errorText 
      });
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
    return res.status(500).json({ 
      error: 'Server error', 
      message: err.message 
    });
  }
}
