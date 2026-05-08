import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import { GoogleGenerativeAI } from '@google/generative-ai';

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.static('public'));

const MODEL = 'gemini-2.5-flash';

function getGenAI() {
  if (!process.env.GEMINI_API_KEY) {
    throw new Error('GEMINI_API_KEY is not set. Add it to your .env file.');
  }
  return new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
}

app.post('/api/chat', async (req, res) => {
  const { message, history } = req.body;

  try {
    const genAI = getGenAI();
    const model = genAI.getGenerativeModel({
      model: MODEL,
      generationConfig: {
        temperature: 0.8,
        maxOutputTokens: 1024,
      },
    });

    const chat = model.startChat({
      history: [
        {
          role: 'user',
          parts: [{ text: 'You are a friendly, helpful chatbot. Have natural conversations. Ask follow-up questions to keep the conversation going. Be curious about the user and their life. Keep responses under 3 sentences.' }],
        },
        {
          role: 'model',
          parts: [{ text: "Understood! I'll be a friendly, curious chatbot. Let's chat!" }],
        },
        ...history.map((m) => ({
          role: m.role === 'user' ? 'user' : 'model',
          parts: [{ text: m.content }],
        })),
      ],
    });

    const result = await chat.sendMessage(message);
    const reply = result.response.text();
    console.log('Chat OK, reply length:', reply.length);
    res.json({ reply });
  } catch (err) {
    console.error('Chat error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/infer', async (req, res) => {
  const { history } = req.body;

  const transcript = history
    .map((m) => `${m.role === 'user' ? 'User' : 'Assistant'}: ${m.content}`)
    .join('\n');

  const prompt = `You are a privacy analysis oracle. Given the conversation transcript below, infer these attributes about the USER:

1. Geographic location (city, state, country)
2. Health status (conditions, lifestyle, fitness)
3. Income bracket (low / lower-middle / middle / upper-middle / high)

For each, provide "value" (string, "Unknown" if no evidence) and "confidence" (integer 0-100).
Base confidence ONLY on evidence in the conversation.

Return ONLY valid JSON, no markdown, no code fences:
{"location":{"value":"...","confidence":0},"health":{"value":"...","confidence":0},"income":{"value":"...","confidence":0}}

Transcript:
${transcript}`;

  try {
    const genAI = getGenAI();
    const model = genAI.getGenerativeModel({
      model: MODEL,
      generationConfig: {
        temperature: 0.1,
        maxOutputTokens: 1024,
        responseMimeType: 'application/json',
      },
    });

    const result = await model.generateContent(prompt);
    const raw = result.response.text();
    console.log('Infer raw:', raw);
    const jsonMatch = raw.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      return res.status(500).json({ error: 'Failed to parse inference response' });
    }
    const parsed = JSON.parse(jsonMatch[0]);
    res.json(parsed);
  } catch (err) {
    console.error('Inference error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`PrivProbe running on http://localhost:${PORT}`));
