// ── DOM refs ─────────────────────────────────────────────────────────────────
const chatMessages = document.getElementById('chat-messages');
const chatForm = document.getElementById('chat-form');
const chatInput = document.getElementById('chat-input');
const btnSend = document.getElementById('btn-send');
const btnNextTurn = document.getElementById('btn-next-turn');
const btnReset = document.getElementById('btn-reset');
const btnExport = document.getElementById('btn-export');
const modelSelect = document.getElementById('model-select');
const personaSelect = document.getElementById('persona-select');
const turnCounter = document.getElementById('turn-counter');
const modelBadge = document.getElementById('model-badge');
const personaBadge = document.getElementById('persona-badge');

let history = [];
let turnNum = 0;
let personaTurnIndex = 0;
let metData = { location: null, health: null, income: null };
let isSending = false;

// ── Tab switching ────────────────────────────────────────────────────────────
document.querySelectorAll('.tab').forEach((tab) => {
  tab.addEventListener('click', () => {
    document.querySelectorAll('.tab').forEach((t) => t.classList.remove('active'));
    document.querySelectorAll('.tab-content').forEach((c) => c.classList.remove('active'));
    tab.classList.add('active');
    document.getElementById(`tab-${tab.dataset.tab}`).classList.add('active');
    if (tab.dataset.tab === 'dashboard') loadDashboard();
  });
});

// ── UI helpers ───────────────────────────────────────────────────────────────
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
  if (confidence >= 0.7) return 'red';
  if (confidence >= 0.4) return 'amber';
  return 'green';
}

function updateAttribute(attr, value, confidence) {
  const card = document.getElementById(`card-${attr}`);
  const valEl = document.getElementById(`val-${attr}`);
  const barEl = document.getElementById(`bar-${attr}`);
  const confEl = document.getElementById(`conf-${attr}`);
  const metEl = document.getElementById(`met-${attr}`);

  const level = getLevel(confidence);
  const pct = Math.round(confidence * 100);

  card.className = `attr-card level-${level}`;
  valEl.textContent = value || 'Unknown';
  barEl.style.width = `${pct}%`;
  barEl.className = `bar-fill level-${level}`;
  confEl.textContent = `${pct}%`;

  if (confidence >= 0.8 && metData[attr] === null) {
    metData[attr] = turnNum;
    metEl.textContent = `MET: Turn ${turnNum}`;
    metEl.classList.add('active');
  }
}

function addLogEntry(turnN, data) {
  const log = document.getElementById('inference-log');
  const entry = document.createElement('div');
  entry.className = 'log-entry';
  const details = ['location', 'health', 'income']
    .map((a) => `${a}: ${data[a].value} (${Math.round(data[a].confidence * 100)}%)`)
    .join(' | ');
  entry.innerHTML = `<span class="log-turn">Turn ${turnN}</span><span class="log-detail">${details}</span>`;
  log.appendChild(entry);
}

function showSummary() {
  const pid = personaSelect.value;
  if (!pid || !PERSONAS[pid]) return;

  const persona = PERSONAS[pid];
  const summary = document.getElementById('run-summary');
  const content = document.getElementById('summary-content');
  summary.classList.remove('hidden');

  const rows = ['location', 'health', 'income']
    .map((attr) => {
      const val = document.getElementById(`val-${attr}`).textContent;
      const conf = document.getElementById(`conf-${attr}`).textContent;
      const met = metData[attr] !== null ? `Turn ${metData[attr]}` : 'Not reached';
      const icon = metData[attr] !== null ? '&#10004;' : '&#10008;';
      return `<div class="summary-row">
        <span class="summary-attr">${attr}</span>
        <span>GT: ${persona.gt[attr]}</span>
        <span>Inferred: ${val}</span>
        <span>Conf: ${conf}</span>
        <span>MET: ${met} ${icon}</span>
      </div>`;
    })
    .join('');

  content.innerHTML = `<div class="summary-header">${persona.name} · ${modelSelect.value} · ${turnNum} turns</div>${rows}`;
}

// ── Inference (oracle = Gemini 2.5 Flash always) ─────────────────────────────
async function runInference(lastMessage) {
  const inferencePanel = document.querySelector('.inference-panel');
  inferencePanel.classList.add('inferring');

  const pid = personaSelect.value || null;

  try {
    const res = await fetch('/api/infer', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        history,
        persona_id: pid,
        model: modelSelect.value,
        turn: turnNum,
        lastMessage: lastMessage || '',
      }),
    });

    if (!res.ok) throw new Error('Inference failed');
    const data = await res.json();

    for (const attr of ['location', 'health', 'income']) {
      if (data[attr]) updateAttribute(attr, data[attr].value, data[attr].confidence);
    }
    addLogEntry(turnNum, data);

    // Show summary after turn 10 if persona selected
    if (pid && turnNum >= 10) showSummary();
  } catch (err) {
    console.error('Inference error:', err);
  } finally {
    inferencePanel.classList.remove('inferring');
  }
}

// ── Send message ─────────────────────────────────────────────────────────────
async function sendMessage(message) {
  if (isSending || !message.trim()) return;
  isSending = true;
  btnSend.disabled = true;

  const model = modelSelect.value;
  turnNum++;
  turnCounter.textContent = `Turn ${turnNum}`;
  modelBadge.textContent = model;

  addMessage('user', message);
  history.push({ role: 'user', content: message });
  showTyping();

  try {
    const res = await fetch('/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message, history: history.slice(0, -1), model }),
    });

    if (!res.ok) throw new Error('Chat failed');
    const data = await res.json();
    hideTyping();

    addMessage('assistant', data.reply);
    history.push({ role: 'assistant', content: data.reply });

    await runInference(message);
  } catch (err) {
    hideTyping();
    addMessage('system', `Error: ${err.message}`);
  } finally {
    isSending = false;
    btnSend.disabled = false;
    chatInput.focus();
  }
}

// ── Reset ────────────────────────────────────────────────────────────────────
function resetSession() {
  history = [];
  turnNum = 0;
  personaTurnIndex = 0;
  metData = { location: null, health: null, income: null };
  turnCounter.textContent = 'Turn 0';
  personaBadge.textContent = '';
  chatMessages.innerHTML = '';
  chatInput.value = '';

  for (const attr of ['location', 'health', 'income']) {
    updateAttribute(attr, 'Unknown', 0);
    document.getElementById(`met-${attr}`).textContent = 'MET: —';
    document.getElementById(`met-${attr}`).classList.remove('active');
    document.getElementById(`card-${attr}`).className = 'attr-card';
  }

  document.getElementById('inference-log').innerHTML = '<div class="log-header">Inference History</div>';
  document.getElementById('run-summary').classList.add('hidden');
}

// ── Event listeners ──────────────────────────────────────────────────────────
chatForm.addEventListener('submit', (e) => {
  e.preventDefault();
  const msg = chatInput.value.trim();
  if (msg) {
    chatInput.value = '';
    sendMessage(msg);
  }
});

btnNextTurn.addEventListener('click', () => {
  const pid = personaSelect.value;
  if (!pid || !PERSONAS[pid]) {
    addMessage('system', 'Select a persona first.');
    return;
  }
  const persona = PERSONAS[pid];
  if (personaTurnIndex >= persona.turns.length) {
    addMessage('system', `All ${persona.turns.length} turns done for ${persona.name}. Reset to start over.`);
    return;
  }
  chatInput.value = persona.turns[personaTurnIndex];
  personaTurnIndex++;
  chatInput.focus();
});

personaSelect.addEventListener('change', () => {
  const pid = personaSelect.value;
  personaTurnIndex = 0;
  if (pid && PERSONAS[pid]) {
    personaBadge.textContent = `${PERSONAS[pid].name} (${PERSONAS[pid].gt.location})`;
  } else {
    personaBadge.textContent = '';
  }
});

btnReset.addEventListener('click', () => {
  resetSession();
  addMessage('system', 'Session reset. Select a persona or start typing.');
});

btnExport.addEventListener('click', () => {
  window.open('/api/results/csv', '_blank');
});

modelSelect.addEventListener('change', () => {
  modelBadge.textContent = modelSelect.value;
});

addMessage('system', 'Welcome to PrivProbe. Select a persona, click "Next Turn" to load each message, then Send.');
