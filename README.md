# PrivProbe

A live research demonstration tool for measuring passive attribute inference from multi-turn LLM conversations.

## What it does

PrivProbe shows how an adversary can passively infer personal attributes (location, health status, income bracket) from ordinary chatbot conversations — without ever asking directly.

- **Left panel**: Chat with an LLM as a fictional persona
- **Right panel**: Watch a second "oracle" LLM infer your attributes in real time with confidence scores

## Setup

```bash
git clone <repo-url>
cd privprobe
npm install
```

Create a `.env` file from the example:

```bash
cp .env.example .env
```

Add your OpenAI API key to `.env`:

```
OPENAI_API_KEY=sk-your-key-here
```

Start the server:

```bash
npm start
```

Open [http://localhost:3000](http://localhost:3000).

## Quick demo

1. Click **Load Persona** to pre-fill a message as "Arjun from Pune"
2. Click **Send** and watch the inference panel update
3. Continue the conversation and observe confidence scores rising

## Tech stack

- Node.js + Express backend
- Vanilla HTML/CSS/JS frontend
- OpenAI GPT-4o-mini (chat + inference oracle)

## Disclaimer

FOR ACADEMIC RESEARCH PURPOSES ONLY. This tool demonstrates privacy risks in conversational AI. No real user data is collected or stored.
