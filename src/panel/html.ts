import * as vscode from 'vscode';
import { AtomicTask, PlannerOutput } from '../types';

export function getPanelHtml(webview: vscode.Webview): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8"/>
<meta name="viewport" content="width=device-width, initial-scale=1.0"/>
<title>CodeStratum</title>
<style>
  :root {
    --bg: #0d0f12;
    --surface: #13161b;
    --border: #1e2530;
    --accent: #00d4aa;
    --accent-dim: #00d4aa22;
    --warn: #f59e0b;
    --error: #ef4444;
    --done: #22c55e;
    --text: #c8d0dc;
    --text-dim: #5a6478;
    --mono: 'Cascadia Code', 'Fira Code', 'Consolas', monospace;
    --sans: system-ui, -apple-system, sans-serif;
  }

  * { box-sizing: border-box; margin: 0; padding: 0; }

  body {
    background: var(--bg);
    color: var(--text);
    font-family: var(--mono);
    font-size: 12px;
    height: 100vh;
    display: flex;
    flex-direction: column;
    overflow: hidden;
  }

  /* Header */
  .header {
    padding: 14px 18px 10px;
    border-bottom: 1px solid var(--border);
    display: flex;
    align-items: baseline;
    gap: 10px;
  }
  .header-logo {
    font-family: var(--sans);
    font-size: 15px;
    font-weight: 800;
    letter-spacing: 0.08em;
    color: var(--accent);
    text-transform: uppercase;
  }
  .header-sub {
    font-size: 10px;
    color: var(--text-dim);
    letter-spacing: 0.05em;
  }
  .status-dot {
    width: 6px; height: 6px;
    border-radius: 50%;
    background: var(--text-dim);
    margin-left: auto;
    transition: background 0.3s;
  }
  .status-dot.ready { background: var(--accent); box-shadow: 0 0 6px var(--accent); }
  .status-dot.working { background: var(--warn); box-shadow: 0 0 6px var(--warn); animation: pulse 1s infinite; }

  @keyframes pulse { 0%,100% { opacity: 1; } 50% { opacity: 0.3; } }

  /* Init banner */
  .init-banner {
    margin: 12px 18px;
    padding: 10px 14px;
    background: var(--accent-dim);
    border: 1px solid var(--accent);
    border-radius: 4px;
    color: var(--accent);
    font-size: 11px;
    display: none;
    align-items: center;
    gap: 10px;
  }
  .init-banner.visible { display: flex; }
  .init-banner button {
    margin-left: auto;
    background: var(--accent);
    color: var(--bg);
    border: none;
    padding: 4px 10px;
    border-radius: 3px;
    font-family: var(--mono);
    font-size: 10px;
    font-weight: 600;
    cursor: pointer;
    text-transform: uppercase;
    letter-spacing: 0.05em;
  }

  /* Input area */
  .input-area {
    padding: 12px 18px;
    border-bottom: 1px solid var(--border);
    display: flex;
    gap: 8px;
  }
  .task-input {
    flex: 1;
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: 4px;
    color: var(--text);
    font-family: var(--mono);
    font-size: 12px;
    padding: 8px 12px;
    outline: none;
    resize: none;
    min-height: 36px;
    max-height: 80px;
    transition: border-color 0.2s;
  }
  .task-input:focus { border-color: var(--accent); }
  .task-input::placeholder { color: var(--text-dim); }
  .btn-run {
    background: var(--accent);
    color: var(--bg);
    border: none;
    border-radius: 4px;
    padding: 0 16px;
    font-family: var(--sans);
    font-size: 11px;
    font-weight: 700;
    letter-spacing: 0.08em;
    text-transform: uppercase;
    cursor: pointer;
    transition: opacity 0.2s;
    white-space: nowrap;
  }
  .btn-run:disabled { opacity: 0.3; cursor: not-allowed; }

  /* Main content */
  .content {
    flex: 1;
    overflow-y: auto;
    padding: 14px 18px;
    display: flex;
    flex-direction: column;
    gap: 12px;
  }
  .content::-webkit-scrollbar { width: 4px; }
  .content::-webkit-scrollbar-track { background: transparent; }
  .content::-webkit-scrollbar-thumb { background: var(--border); border-radius: 2px; }

  /* Empty state */
  .empty-state {
    flex: 1;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 8px;
    color: var(--text-dim);
    text-align: center;
  }
  .empty-glyph {
    font-size: 28px;
    opacity: 0.3;
    font-family: var(--sans);
    font-weight: 800;
    letter-spacing: -0.02em;
  }

  /* Section */
  .section-label {
    font-size: 9px;
    letter-spacing: 0.12em;
    text-transform: uppercase;
    color: var(--text-dim);
    margin-bottom: 6px;
  }

  /* Task list */
  .task-list { display: flex; flex-direction: column; gap: 4px; }

  .task-item {
    display: flex;
    align-items: flex-start;
    gap: 10px;
    padding: 8px 10px;
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: 4px;
    transition: border-color 0.2s;
  }
  .task-item.running { border-color: var(--warn); }
  .task-item.done { border-color: var(--done); opacity: 0.7; }
  .task-item.error { border-color: var(--error); }

  .task-checkbox {
    width: 14px; height: 14px;
    border: 1px solid var(--border);
    border-radius: 2px;
    background: transparent;
    cursor: pointer;
    flex-shrink: 0;
    margin-top: 1px;
    accent-color: var(--accent);
  }

  .task-body { flex: 1; }
  .task-desc { font-size: 12px; color: var(--text); line-height: 1.4; }
  .task-file {
    font-size: 10px;
    color: var(--accent);
    margin-top: 2px;
    opacity: 0.7;
  }

  .task-status {
    font-size: 10px;
    flex-shrink: 0;
    margin-top: 2px;
  }
  .task-status.pending { color: var(--text-dim); }
  .task-status.running { color: var(--warn); }
  .task-status.done { color: var(--done); }
  .task-status.error { color: var(--error); }

  /* Action bar */
  .action-bar {
    display: flex;
    gap: 8px;
    padding: 10px 18px;
    border-top: 1px solid var(--border);
  }
  .btn-secondary {
    background: transparent;
    color: var(--text-dim);
    border: 1px solid var(--border);
    border-radius: 4px;
    padding: 6px 12px;
    font-family: var(--mono);
    font-size: 11px;
    cursor: pointer;
    transition: color 0.2s, border-color 0.2s;
  }
  .btn-secondary:hover { color: var(--text); border-color: var(--text-dim); }
  .btn-execute {
    flex: 1;
    background: var(--accent);
    color: var(--bg);
    border: none;
    border-radius: 4px;
    padding: 6px 12px;
    font-family: var(--sans);
    font-size: 11px;
    font-weight: 700;
    letter-spacing: 0.08em;
    text-transform: uppercase;
    cursor: pointer;
    transition: opacity 0.2s;
  }
  .btn-execute:disabled { opacity: 0.3; cursor: not-allowed; }

  .btn-apply {
    background: transparent;
    color: var(--done);
    border: 1px solid var(--done);
    border-radius: 3px;
    padding: 2px 8px;
    font-family: var(--mono);
    font-size: 10px;
    cursor: pointer;
    flex-shrink: 0;
    margin-top: 1px;
    transition: background 0.2s, color 0.2s;
  }
  .btn-apply:hover { background: var(--done); color: var(--bg); }
  .btn-apply.applied { opacity: 0.4; cursor: default; pointer-events: none; }

  /* Executor log */
  .exec-log {
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: 4px;
    padding: 10px 12px;
    font-size: 11px;
    color: var(--text-dim);
    white-space: pre-wrap;
    max-height: 180px;
    overflow-y: auto;
    font-family: var(--mono);
    line-height: 1.5;
  }

  .hidden { display: none !important; }
</style>
</head>
<body>

<div class="header">
  <span class="header-logo">CodeStratum</span>
  <span class="header-sub" id="cacheStatus">no index</span>
  <div class="status-dot" id="statusDot"></div>
</div>

<div class="init-banner" id="initBanner">
  <span>⚠ Project not indexed or stale. Run Init first.</span>
  <button onclick="runInit()">Init</button>
</div>

<div class="input-area">
  <textarea
    class="task-input"
    id="taskInput"
    placeholder="Describe what you want to do..."
    rows="1"
    onkeydown="handleKey(event)"
  ></textarea>
  <button class="btn-run" id="btnRun" onclick="runPlan()">Plan</button>
</div>

<div class="content" id="mainContent">
  <div class="empty-state" id="emptyState">
    <div class="empty-glyph">CS</div>
    <div>Describe a task above to get started</div>
    <div style="font-size:10px;margin-top:4px">CodeStratum will decompose it into atomic steps</div>
  </div>

  <div id="planSection" class="hidden">
    <div class="section-label">Planned Tasks — select to approve</div>
    <div class="task-list" id="taskList"></div>
  </div>

  <div id="logSection" class="hidden">
    <div class="section-label">Execution Log</div>
    <div class="exec-log" id="execLog"></div>
  </div>
</div>

<div class="action-bar hidden" id="actionBar">
  <button class="btn-secondary" onclick="resetAll()">Reset</button>
  <button class="btn-secondary" onclick="selectAll()">Select All</button>
  <button class="btn-execute" id="btnExecute" onclick="runExecute()">Execute Selected</button>
</div>

<script>
  const vscode = acquireVsCodeApi();
  let tasks = [];
  let isWorking = false;

  function setState(working) {
    isWorking = working;
    document.getElementById('statusDot').className = 'status-dot ' + (working ? 'working' : 'ready');
    document.getElementById('btnRun').disabled = working;
    document.getElementById('btnExecute').disabled = working;
  }

  function handleKey(e) {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); runPlan(); }
  }

  function runInit() {
    vscode.postMessage({ type: 'init' });
    setState(true);
  }

  function runPlan() {
    const input = document.getElementById('taskInput');
    const task = input.value.trim();
    if (!task || isWorking) { return; }
    setState(true);
    document.getElementById('emptyState').classList.add('hidden');
    document.getElementById('planSection').classList.add('hidden');
    document.getElementById('logSection').classList.add('hidden');
    document.getElementById('actionBar').classList.add('hidden');
    vscode.postMessage({ type: 'plan', task });
  }

  function runExecute() {
    const approved = tasks.filter(t => t.approved);
    if (!approved.length || isWorking) { return; }
    setState(true);
    document.getElementById('logSection').classList.remove('hidden');
    vscode.postMessage({ type: 'execute', taskIds: approved.map(t => t.id) });
  }

  function selectAll() {
    tasks.forEach(t => { t.approved = true; });
    renderTasks();
  }

  function resetAll() {
    tasks = [];
    document.getElementById('emptyState').classList.remove('hidden');
    document.getElementById('planSection').classList.add('hidden');
    document.getElementById('logSection').classList.add('hidden');
    document.getElementById('actionBar').classList.add('hidden');
    document.getElementById('execLog').textContent = '';
    document.getElementById('taskInput').value = '';
    setState(false);
  }

  function applyResult(id) {
    const t = tasks.find(t => t.id === id);
    if (t && !t.applied) {
      vscode.postMessage({ type: 'applyResult', taskId: t.id, targetFile: t.targetFile, result: t.result });
    }
  }

  function toggleTask(id) {
    const t = tasks.find(t => t.id === id);
    if (t) { t.approved = !t.approved; renderTasks(); }
  }

  function renderTasks() {
    const list = document.getElementById('taskList');
    list.innerHTML = tasks.map(t => \`
      <div class="task-item \${t.status}" data-id="\${t.id}">
        <input type="checkbox" class="task-checkbox"
          \${t.approved ? 'checked' : ''}
          \${t.status !== 'pending' ? 'disabled' : ''}
          onchange="toggleTask(\${t.id})"
        />
        <div class="task-body">
          <div class="task-desc">\${t.description}</div>
          \${t.targetFile ? \`<div class="task-file">\${t.targetFile}</div>\` : ''}
        </div>
        <div class="task-status \${t.status}">
          \${t.status === 'pending' ? '○' : t.status === 'running' ? '⟳' : t.status === 'done' ? '✓' : '✗'}
        </div>
        \${t.status === 'done' && t.targetFile && t.result
          ? \`<button class="btn-apply \${t.applied ? 'applied' : ''}" onclick="applyResult(\${t.id})">\${t.applied ? 'Applied' : 'Apply'}</button>\`
          : ''}
      </div>
    \`).join('');
  }

  function appendLog(text) {
    const log = document.getElementById('execLog');
    log.textContent += text;
    log.scrollTop = log.scrollHeight;
  }

  window.addEventListener('message', e => {
    const msg = e.data;

    if (msg.type === 'initDone') {
      document.getElementById('cacheStatus').textContent = msg.summary;
      document.getElementById('initBanner').classList.remove('visible');
      setState(false);
    }

    if (msg.type === 'initError') {
      document.getElementById('initBanner').classList.add('visible');
      setState(false);
    }

    if (msg.type === 'cacheStatus') {
      document.getElementById('cacheStatus').textContent = msg.summary;
      document.getElementById('statusDot').classList.add('ready');
      if (msg.stale) { document.getElementById('initBanner').classList.add('visible'); }
    }

    if (msg.type === 'planDone') {
      tasks = msg.tasks;
      renderTasks();
      document.getElementById('planSection').classList.remove('hidden');
      document.getElementById('actionBar').classList.remove('hidden');
      setState(false);
    }

    if (msg.type === 'planError') {
      appendLog('Planner error: ' + msg.error);
      document.getElementById('logSection').classList.remove('hidden');
      setState(false);
    }

    if (msg.type === 'taskStart') {
      const t = tasks.find(t => t.id === msg.taskId);
      if (t) { t.status = 'running'; renderTasks(); }
      appendLog(\`\\n▶ Task \${msg.taskId}: \${msg.description}\\n\`);
    }

    if (msg.type === 'taskChunk') {
      appendLog(msg.chunk);
    }

    if (msg.type === 'taskDone') {
      const t = tasks.find(t => t.id === msg.taskId);
      if (t) { t.status = 'done'; t.result = msg.result; renderTasks(); }
      appendLog(\`\\n✓ Done\\n\`);
    }

    if (msg.type === 'applyDone') {
      const t = tasks.find(t => t.id === msg.taskId);
      if (t) { t.applied = true; renderTasks(); }
      appendLog(\`\\n✓ Applied → \${msg.targetFile}\\n\`);
    }

    if (msg.type === 'applyError') {
      appendLog(\`\\n✗ Apply failed: \${msg.error}\\n\`);
    }

    if (msg.type === 'taskError') {
      const t = tasks.find(t => t.id === msg.taskId);
      if (t) { t.status = 'error'; renderTasks(); }
      appendLog(\`\\n✗ Error: \${msg.error}\\n\`);
    }

    if (msg.type === 'executeDone') {
      setState(false);
    }
  });
</script>
</body>
</html>`;
}
