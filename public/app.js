// ── DOM refs ─────────────────────────────────────────────────────────────────
const chatMessages = document.getElementById('chat-messages');
const chatForm = document.getElementById('chat-form');
const chatInput = document.getElementById('chat-input');
const btnSend = document.getElementById('btn-send');
const btnRun = document.getElementById('btn-run');
const btnRunAll = document.getElementById('btn-run-all');
const btnReset = document.getElementById('btn-reset');
const btnExport = document.getElementById('btn-export');
const modelSelect = document.getElementById('model-select');
const personaSelect = document.getElementById('persona-select');
const turnCounter = document.getElementById('turn-counter');
const modelBadge = document.getElementById('model-badge');
const personaBadge = document.getElementById('persona-badge');
const statusBar = document.getElementById('status-bar');
const statusText = document.getElementById('status-text');
const statusFill = document.getElementById('status-fill');

let history = [];
let turnNum = 0;
let metData = { location: null, health: null, income: null };
let isSending = false;
let isAutoRunning = false;

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

  const attrs = ['location', 'health', 'income'];
  const details = attrs
    .map((a) => {
      const d = data[a];
      return `${a}: ${d.value} (${Math.round(d.confidence * 100)}%)`;
    })
    .join(' | ');

  entry.innerHTML = `<span class="log-turn">Turn ${turnN}</span><span class="log-detail">${details}</span>`;
  log.appendChild(entry);
}

function showStatus(text, progress) {
  statusBar.classList.remove('hidden');
  statusText.textContent = text;
  statusFill.style.width = `${progress}%`;
}

function hideStatus() {
  statusBar.classList.add('hidden');
}

function showSummary(persona, model) {
  const summary = document.getElementById('run-summary');
  const content = document.getElementById('summary-content');
  summary.classList.remove('hidden');

  const gt = persona.gt;
  const rows = ['location', 'health', 'income']
    .map((attr) => {
      const val = document.getElementById(`val-${attr}`).textContent;
      const conf = document.getElementById(`conf-${attr}`).textContent;
      const met = metData[attr] !== null ? `Turn ${metData[attr]}` : 'Not reached';
      const crossed = metData[attr] !== null ? '&#10004;' : '&#10008;';
      return `<div class="summary-row">
        <span class="summary-attr">${attr}</span>
        <span>GT: ${gt[attr]}</span>
        <span>Inferred: ${val}</span>
        <span>Conf: ${conf}</span>
        <span>MET: ${met} ${crossed}</span>
      </div>`;
    })
    .join('');

  content.innerHTML = `
    <div class="summary-header">${persona.name} · ${model} · ${turnNum} turns</div>
    ${rows}
  `;
}

// ── Inference ────────────────────────────────────────────────────────────────
async function runInference(personaId, model, lastMessage) {
  const inferencePanel = document.querySelector('.inference-panel');
  inferencePanel.classList.add('inferring');

  try {
    const res = await fetch('/api/infer', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        history,
        persona_id: personaId || null,
        model: model || modelSelect.value,
        turn: turnNum,
        lastMessage: lastMessage || '',
      }),
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

// ── Send message ─────────────────────────────────────────────────────────────
async function sendMessage(message, personaId) {
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

    await runInference(personaId, model, message);
  } catch (err) {
    hideTyping();
    addMessage('system', `Error: ${err.message}`);
    console.error(err);
  } finally {
    isSending = false;
    btnSend.disabled = false;
    chatInput.focus();
  }
}

// ── Persona auto-runner ──────────────────────────────────────────────────────
function delay(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function runPersona(personaId, model) {
  const persona = PERSONAS[personaId];
  if (!persona) return;

  resetSession();
  modelSelect.value = model;
  modelBadge.textContent = model;
  personaBadge.textContent = `${persona.name} (${persona.gt.location})`;

  isAutoRunning = true;
  chatInput.disabled = true;
  btnSend.disabled = true;
  btnRun.disabled = true;
  modelSelect.disabled = true;
  personaSelect.disabled = true;

  for (let i = 0; i < persona.turns.length; i++) {
    if (!isAutoRunning) break;
    showStatus(
      `${persona.name} · ${model} · Turn ${i + 1}/${persona.turns.length}`,
      ((i + 1) / persona.turns.length) * 100,
    );
    await sendMessage(persona.turns[i], personaId);
    if (i < persona.turns.length - 1) await delay(1500);
  }

  showSummary(persona, model);
  hideStatus();

  isAutoRunning = false;
  chatInput.disabled = false;
  btnSend.disabled = false;
  btnRun.disabled = false;
  modelSelect.disabled = false;
  personaSelect.disabled = false;
}

async function runAllPersonas() {
  const models = ['gpt-4o-mini', 'gemini-2.5-flash'];
  const personaIds = Object.keys(PERSONAS);

  btnRunAll.disabled = true;
  btnRun.disabled = true;

  for (const model of models) {
    for (const pid of personaIds) {
      showStatus(`Running ${pid} on ${model}...`, 0);
      await runPersona(pid, model);
      await delay(2000);
    }
  }

  btnRunAll.disabled = false;
  btnRun.disabled = false;
  hideStatus();
  addMessage('system', 'All persona runs complete! Switch to Dashboard tab to see results.');
}

// ── Reset ────────────────────────────────────────────────────────────────────
function resetSession() {
  history = [];
  turnNum = 0;
  metData = { location: null, health: null, income: null };
  turnCounter.textContent = 'Turn 0';
  personaBadge.textContent = '';
  chatMessages.innerHTML = '';
  chatInput.value = '';

  for (const attr of ['location', 'health', 'income']) {
    updateAttribute(attr, 'Unknown', 0);
    const metEl = document.getElementById(`met-${attr}`);
    metEl.textContent = 'MET: —';
    metEl.classList.remove('active');
    document.getElementById(`card-${attr}`).className = 'attr-card';
  }

  const log = document.getElementById('inference-log');
  log.innerHTML = '<div class="log-header">Inference History</div>';
  document.getElementById('run-summary').classList.add('hidden');
}

// ── Event listeners ──────────────────────────────────────────────────────────
chatForm.addEventListener('submit', (e) => {
  e.preventDefault();
  const msg = chatInput.value.trim();
  if (msg && !isAutoRunning) {
    chatInput.value = '';
    sendMessage(msg);
  }
});

btnRun.addEventListener('click', () => {
  const pid = personaSelect.value;
  if (!pid) {
    addMessage('system', 'Select a persona from the dropdown first.');
    return;
  }
  runPersona(pid, modelSelect.value);
});

btnRunAll.addEventListener('click', () => {
  if (confirm('This will run all 5 personas on both models (100 API calls). Continue?')) {
    runAllPersonas();
  }
});

btnReset.addEventListener('click', () => {
  isAutoRunning = false;
  resetSession();
  addMessage('system', 'Session reset. Select a persona or start typing.');
});

btnExport.addEventListener('click', () => {
  window.open('/api/results/csv', '_blank');
});

modelSelect.addEventListener('change', () => {
  modelBadge.textContent = modelSelect.value;
});

addMessage('system', 'Welcome to PrivProbe. Select a persona and click Run, or chat manually.');
