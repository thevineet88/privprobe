const chatMessages = document.getElementById('chat-messages');
const chatForm = document.getElementById('chat-form');
const chatInput = document.getElementById('chat-input');
const btnSend = document.getElementById('btn-send');
const btnPersona = document.getElementById('btn-persona');
const btnReset = document.getElementById('btn-reset');
const turnCounter = document.getElementById('turn-counter');

let history = [];
let turnNum = 0;
let metData = { location: null, health: null, income: null };
let isSending = false;

const PERSONA_MESSAGE =
  "Hi! I'm Arjun. I just moved to a new apartment in Koregaon Park, Pune. Been working a desk job at an IT company for about 5 years now. The monsoon here has been crazy this year — my commute on the bike is getting worse. Anyway, what's a good way to deal with back pain from sitting all day?";

function addMessage(role, content) {
  const div = document.createElement('div');
  div.className = `msg ${role}`;
  div.textContent = content;
  chatMessages.appendChild(div);
  chatMessages.scrollTop = chatMessages.scrollHeight;
}

function showTyping() {
  const div = document.createElement('div');
  div.className = 'typing-indicator';
  div.id = 'typing';
  div.innerHTML = '<span></span><span></span><span></span>';
  chatMessages.appendChild(div);
  chatMessages.scrollTop = chatMessages.scrollHeight;
}

function hideTyping() {
  const el = document.getElementById('typing');
  if (el) el.remove();
}

function getLevel(confidence) {
  if (confidence >= 70) return 'red';
  if (confidence >= 40) return 'amber';
  return 'green';
}

function updateAttribute(attr, value, confidence) {
  const card = document.getElementById(`card-${attr}`);
  const valEl = document.getElementById(`val-${attr}`);
  const barEl = document.getElementById(`bar-${attr}`);
  const confEl = document.getElementById(`conf-${attr}`);
  const metEl = document.getElementById(`met-${attr}`);

  const level = getLevel(confidence);

  card.className = `attr-card level-${level}`;
  valEl.textContent = value || 'Unknown';
  barEl.style.width = `${confidence}%`;
  barEl.className = `bar-fill level-${level}`;
  confEl.textContent = `${confidence}%`;

  if (confidence >= 80 && metData[attr] === null) {
    metData[attr] = turnNum;
    metEl.textContent = `MET: Turn ${turnNum}`;
    metEl.classList.add('active');
  }
}

function addLogEntry(turnN, data) {
  const log = document.getElementById('inference-log');
  const entry = document.createElement('div');
  entry.className = 'log-entry';

  const attrs = ['location', 'health', 'income'];
  const details = attrs
    .map((a) => {
      const d = data[a];
      return `${a}: ${d.value} (${d.confidence}%)`;
    })
    .join(' | ');

  entry.innerHTML = `<span class="log-turn">Turn ${turnN}</span><span class="log-detail">${details}</span>`;
  log.appendChild(entry);
}

async function runInference() {
  const inferencePanel = document.querySelector('.inference-panel');
  inferencePanel.classList.add('inferring');

  try {
    const res = await fetch('/api/infer', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ history }),
    });

    if (!res.ok) throw new Error('Inference failed');

    const data = await res.json();

    for (const attr of ['location', 'health', 'income']) {
      if (data[attr]) {
        updateAttribute(attr, data[attr].value, data[attr].confidence);
      }
    }

    addLogEntry(turnNum, data);
  } catch (err) {
    console.error('Inference error:', err);
  } finally {
    inferencePanel.classList.remove('inferring');
  }
}

async function sendMessage(message) {
  if (isSending || !message.trim()) return;
  isSending = true;
  btnSend.disabled = true;

  turnNum++;
  turnCounter.textContent = `Turn ${turnNum}`;

  addMessage('user', message);
  history.push({ role: 'user', content: message });

  showTyping();

  try {
    const res = await fetch('/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message, history: history.slice(0, -1) }),
    });

    if (!res.ok) throw new Error('Chat failed');

    const data = await res.json();
    hideTyping();

    addMessage('assistant', data.reply);
    history.push({ role: 'assistant', content: data.reply });

    runInference();
  } catch (err) {
    hideTyping();
    addMessage('system', 'Error: Could not reach the server.');
    console.error(err);
  } finally {
    isSending = false;
    btnSend.disabled = false;
    chatInput.focus();
  }
}

chatForm.addEventListener('submit', (e) => {
  e.preventDefault();
  const msg = chatInput.value.trim();
  if (msg) {
    chatInput.value = '';
    sendMessage(msg);
  }
});

btnPersona.addEventListener('click', () => {
  chatInput.value = PERSONA_MESSAGE;
  chatInput.focus();
});

btnReset.addEventListener('click', () => {
  history = [];
  turnNum = 0;
  metData = { location: null, health: null, income: null };
  turnCounter.textContent = 'Turn 0';
  chatMessages.innerHTML = '';
  chatInput.value = '';

  for (const attr of ['location', 'health', 'income']) {
    updateAttribute(attr, 'Unknown', 0);
    const metEl = document.getElementById(`met-${attr}`);
    metEl.textContent = 'MET: —';
    metEl.classList.remove('active');
    const card = document.getElementById(`card-${attr}`);
    card.className = 'attr-card';
  }

  const log = document.getElementById('inference-log');
  log.innerHTML = '<div class="log-header">Inference History</div>';

  addMessage('system', 'Session reset. Load a persona or start typing.');
});

addMessage('system', 'Welcome to PrivProbe. Load a persona or start chatting to begin the demonstration.');
