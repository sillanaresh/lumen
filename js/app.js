// app.js — shell: routing, top bar, command palette, settings, onboarding, import.

import { initWorkspace, state, on, embedder, loadSettings, saveSettings, loadFeedback,
         createNote, duplicateOf, resetWorkspace, isOnboarded, setOnboarded, MODELS,
         idbCount } from './store.js';
import { stripMarkdown } from './pipeline.js';
import { testKey } from './openrouter.js';
import { el, escapeHtml, toast, openModal, download } from './ui.js';
import * as library from './views/library.js';
import * as graph from './views/graph.js';
import * as ask from './views/ask.js';
import * as lab from './views/lab.js';
import * as about from './views/about.js';

const ROUTES = {
  graph: { title: 'Graph', render: graph.render },
  library: { title: 'Library', render: library.render },
  ask: { title: 'Ask', render: ask.render },
  lab: { title: 'Eval Lab', render: lab.render },
  about: { title: 'About', render: about.render },
};

let currentRoute = null;

export function navigate(hash) {
  if (location.hash === hash) route();
  else location.hash = hash;
}

function parseHash() {
  const h = location.hash.replace(/^#\/?/, '');
  // legacy deep links from v0.x
  if (h === 'eval' || h === 'quality') return { name: 'lab', parts: [] };
  if (h === 'app' || h === '') return { name: 'graph', parts: [] };
  const parts = h.split('/').filter(Boolean);
  return { name: ROUTES[parts[0]] ? parts[0] : 'graph', parts: parts.slice(1) };
}

function route() {
  const { name, parts } = parseHash();
  const changedView = currentRoute !== name;
  currentRoute = name;
  const rootEl = document.getElementById('view-root');
  const params = {};
  if (name === 'library') {
    if (parts[0]) params.noteId = parts[0];
    if (parts[1]) params.chunk = parts[1];
  }
  rootEl.classList.remove('route-anim');
  ROUTES[name].render(rootEl, params);
  if (changedView) {
    void rootEl.offsetWidth; // restart the entrance animation
    rootEl.classList.add('route-anim');
  }
  document.querySelectorAll('[data-nav]').forEach(b =>
    b.classList.toggle('nav-active', b.dataset.nav === name));
  document.title = `Lumen — ${ROUTES[name].title}`;
}

// ---------- Theme ----------
const THEME_KEY = 'lumen2.theme';
const ICON_SUN = '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/></svg>';
const ICON_MOON = '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z"/></svg>';

function currentTheme() {
  return document.documentElement.dataset.theme === 'dark' ? 'dark' : 'light';
}
function applyTheme(theme) {
  document.documentElement.dataset.theme = theme;
  try { localStorage.setItem(THEME_KEY, theme); } catch { /* private mode */ }
  window.dispatchEvent(new CustomEvent('lumen:theme')); // graph re-inks its palette
  const btn = document.getElementById('theme-toggle');
  if (btn) {
    btn.innerHTML = theme === 'dark' ? ICON_SUN : ICON_MOON;
    const next = theme === 'dark' ? 'light' : 'dark';
    btn.title = `Switch to ${next} mode`;
    btn.setAttribute('aria-label', `Switch to ${next} mode`);
  }
}

// ---------- AI status pill ----------
function renderAiPill() {
  const pill = document.getElementById('ai-pill');
  if (!pill) return;
  const map = {
    idle: ['ai-idle', 'local AI idle', 'The embedding model loads on first semantic use.'],
    loading: ['ai-loading', `local AI ${embedder.progress}%`, 'Downloading MiniLM (~22 MB, cached after first load).'],
    ready: ['ai-ready', 'local AI ready', 'MiniLM-L6-v2 running in this browser.'],
    error: ['ai-error', 'local AI failed', 'Model download failed — search falls back to keywords. Click to retry.'],
  };
  const [cls, label, title] = map[embedder.status];
  pill.className = `ai-pill ${cls}`;
  pill.title = title;
  pill.innerHTML = `<span class="ai-dot"></span>${escapeHtml(label)}`;
}

// ---------- Settings ----------
export function openSettings() {
  const s = loadSettings();
  const body = el('div', { class: 'settings' });
  body.innerHTML = `
    <section class="set-section">
      <h3 class="rail-title">OpenRouter API key</h3>
      <div class="set-key-row">
        <input id="set-key" type="password" class="input mono" placeholder="sk-or-…" value="${escapeHtml(s.apiKey || '')}" autocomplete="off" />
        <button id="set-key-show" class="btn btn-ghost btn-sm" aria-label="Show or hide key">show</button>
        <button id="set-key-test" class="btn btn-ghost btn-sm">test key</button>
      </div>
      <p class="dim set-hint" id="set-key-status">Stored only in this browser's localStorage; sent only to OpenRouter.
        <a href="https://openrouter.ai/keys" target="_blank" rel="noopener">Get a free key →</a></p>
    </section>
    <section class="set-section">
      <h3 class="rail-title">Model</h3>
      <select id="set-model" class="input">
        ${MODELS.map(m => `<option value="${escapeHtml(m.id)}" ${m.id === s.model ? 'selected' : ''}>${escapeHtml(m.label)}</option>`).join('')}
      </select>
      <p class="dim set-hint">All free-tier; OpenRouter rate-limits them. Answers cite chunks regardless of model.</p>
    </section>
    <section class="set-section">
      <h3 class="rail-title">What leaves your machine</h3>
      <ul class="set-privacy dim">
        <li><strong>Ask</strong> — the retrieved chunks shown in Evidence + your question → OpenRouter, with your key.</li>
        <li><strong>URL import</strong> — the URL you paste → r.jina.ai for a readable copy.</li>
        <li><strong>Send feedback</strong> — opens a GitHub issue draft you review before posting.</li>
        <li>Everything else (notes, PDFs, embeddings, eval runs, feedback, this key) stays in this browser.</li>
      </ul>
    </section>
    <section class="set-section">
      <h3 class="rail-title">Feedback <span class="dim" id="set-fb-count"></span></h3>
      <p class="dim set-hint">Thumbs and relevance labels are stored locally. Nothing is ever auto-sent.</p>
      <div class="btn-row">
        <button id="set-fb-export" class="btn btn-ghost btn-sm">Export JSON</button>
        <button id="set-fb-send" class="btn btn-ghost btn-sm">Send to maker (GitHub)</button>
      </div>
    </section>
    <section class="set-section">
      <h3 class="rail-title">Local data</h3>
      <div class="btn-row">
        <button id="set-clear-cache" class="btn btn-ghost btn-sm">Clear embedding cache (<span id="set-cache-count">…</span> vectors)</button>
        <button id="set-reset" class="btn btn-danger btn-sm">Reset workspace…</button>
      </div>
      <p class="dim set-hint">Reset restores the 12 seeded notes and deletes your notes and ask history. Eval runs are kept.</p>
    </section>
  `;
  const foot = el('div', { class: 'btn-row' });
  const cancel = el('button', { class: 'btn btn-ghost' }, 'Cancel');
  const save = el('button', { class: 'btn btn-primary' }, 'Save');
  foot.append(cancel, save);
  const m = openModal({ title: 'Settings', kicker: 'Lumen', body, footer: foot });

  idbCount('embeddings').then(n => { const c = body.querySelector('#set-cache-count'); if (c) c.textContent = n; }).catch(() => {});
  const fb = loadFeedback();
  body.querySelector('#set-fb-count').textContent = `· ${fb.length} item${fb.length === 1 ? '' : 's'}`;

  body.querySelector('#set-key-show').addEventListener('click', (e) => {
    const input = body.querySelector('#set-key');
    const showing = input.type === 'text';
    input.type = showing ? 'password' : 'text';
    e.currentTarget.textContent = showing ? 'show' : 'hide';
  });
  body.querySelector('#set-key-test').addEventListener('click', async () => {
    const key = body.querySelector('#set-key').value.trim();
    const status = body.querySelector('#set-key-status');
    if (!key) { status.textContent = 'Enter a key first.'; return; }
    status.textContent = 'Testing…';
    const res = await testKey(key).catch(() => ({ ok: false, reason: 'Network error reaching OpenRouter.' }));
    status.textContent = res.ok ? '✓ Key works.' : `✗ ${res.reason}`;
  });
  body.querySelector('#set-fb-export').addEventListener('click', () => {
    download(`lumen-feedback-${new Date().toISOString().slice(0, 10)}.json`, { exportedAt: new Date().toISOString(), feedback: loadFeedback() });
  });
  body.querySelector('#set-fb-send').addEventListener('click', () => {
    const payload = JSON.stringify(loadFeedback(), null, 1).slice(0, 5500); // API keys never touch feedback records
    const url = `https://github.com/sillanaresh/lumen/issues/new?title=${encodeURIComponent('Lumen feedback')}&body=${encodeURIComponent('```json\n' + payload + '\n```')}`;
    window.open(url, '_blank', 'noopener');
    toast('Opened a GitHub issue draft — you see everything before posting.', { kind: 'info' });
  });
  body.querySelector('#set-clear-cache').addEventListener('click', async () => {
    await embedder.clearCache();
    toast('Embedding cache cleared — vectors recompute on next semantic use.', { kind: 'success' });
    idbCount('embeddings').then(n => { const c = body.querySelector('#set-cache-count'); if (c) c.textContent = n; }).catch(() => {});
  });
  body.querySelector('#set-reset').addEventListener('click', () => {
    m.close();
    confirmReset();
  });
  cancel.addEventListener('click', m.close);
  save.addEventListener('click', () => {
    saveSettings({ ...s, apiKey: body.querySelector('#set-key').value.trim(), model: body.querySelector('#set-model').value });
    m.close();
    toast('Settings saved in this browser.', { kind: 'success' });
    route(); // refresh hints (e.g., ask composer model hint)
  });
}

function confirmReset() {
  const body = el('div');
  body.innerHTML = `
    <p class="dim">This deletes your notes and ask history in this browser and restores the seeded corpus.
    Type <span class="mono">RESET</span> to confirm.</p>
    <input id="reset-confirm" class="input mono" placeholder="RESET" autocomplete="off" />`;
  const foot = el('div', { class: 'btn-row' });
  const cancel = el('button', { class: 'btn btn-ghost' }, 'Cancel');
  const ok = el('button', { class: 'btn btn-danger', disabled: true }, 'Reset workspace');
  foot.append(cancel, ok);
  const m = openModal({ title: 'Reset workspace', kicker: 'Danger zone', body, footer: foot });
  body.querySelector('#reset-confirm').addEventListener('input', (e) => {
    ok.disabled = e.target.value.trim() !== 'RESET';
  });
  cancel.addEventListener('click', m.close);
  ok.addEventListener('click', () => {
    m.close();
    resetWorkspace();
    toast('Workspace reset to the seeded corpus.', { kind: 'success' });
    route();
  });
}

// ---------- Import (PDF / URL) ----------
function openImport() {
  const body = el('div');
  body.innerHTML = `
    <div class="seg" role="tablist">
      <button class="seg-btn seg-active" id="imp-tab-pdf" role="tab">PDF file</button>
      <button class="seg-btn" id="imp-tab-url" role="tab">Web URL</button>
    </div>
    <div id="imp-pdf" class="imp-pane">
      <label id="imp-drop" class="dropzone" for="imp-file">
        <div>Drop a PDF here, or click to choose</div>
        <div class="dim">Parsed entirely in your browser — the file is never uploaded.</div>
        <input id="imp-file" type="file" accept="application/pdf,.pdf" hidden />
      </label>
    </div>
    <div id="imp-url" class="imp-pane" hidden>
      <div class="set-key-row">
        <input id="imp-url-input" type="url" class="input mono" placeholder="https://example.com/article" />
        <button id="imp-fetch" class="btn btn-primary btn-sm">Fetch</button>
      </div>
      <p class="dim set-hint">Fetched via r.jina.ai (a public reader that returns clean markdown). The URL — and nothing else — leaves your browser.</p>
    </div>
    <div id="imp-status" class="dim" hidden></div>
    <div id="imp-review" hidden>
      <input id="imp-title" class="input input-title" placeholder="Title" aria-label="Title" />
      <input id="imp-tags" class="input mono" placeholder="tags, comma separated" aria-label="Tags" />
      <textarea id="imp-content" class="input editor-textarea" style="height:180px" aria-label="Extracted content"></textarea>
      <p class="dim set-hint" id="imp-stats"></p>
    </div>`;
  const foot = el('div', { class: 'btn-row' });
  const cancel = el('button', { class: 'btn btn-ghost' }, 'Cancel');
  const save = el('button', { class: 'btn btn-primary', hidden: true }, 'Add to workspace');
  foot.append(cancel, save);
  const m = openModal({ title: 'Import', kicker: 'PDF or URL → chunks → graph', body, footer: foot, wide: true });
  cancel.addEventListener('click', m.close);

  const status = body.querySelector('#imp-status');
  const review = body.querySelector('#imp-review');
  const setStatus = (msg, isError = false) => {
    status.hidden = !msg;
    status.textContent = msg || '';
    status.className = isError ? 'warn-text' : 'dim';
  };
  const showReview = ({ title, content, source }) => {
    review.hidden = false;
    save.hidden = false;
    body.querySelector('#imp-title').value = title;
    body.querySelector('#imp-content').value = content;
    body.querySelector('#imp-stats').textContent = `${content.length.toLocaleString()} chars · will become ~${Math.max(1, Math.ceil(content.length / 1200))} chunks · editable before saving`;
    save.onclick = () => {
      const t = body.querySelector('#imp-title').value.trim();
      const c = body.querySelector('#imp-content').value.trim();
      const tags = body.querySelector('#imp-tags').value.split(',').map(x => x.trim()).filter(Boolean);
      if (!t || !c) { setStatus('Title and content are required.', true); return; }
      const dupe = duplicateOf(c);
      if (dupe) {
        setStatus(`Looks like you already imported this ("${dupe.title}"). Edit the content to import anyway.`, true);
        return;
      }
      const note = createNote({ title: t, tags: tags.length ? tags : ['imported'], content: c, source });
      m.close();
      toast('Imported — chunked and added to the graph.', { kind: 'success', actionLabel: 'Open note', onAction: () => navigate(`#/library/${note.id}`) });
    };
  };

  // tabs
  const tabPdf = body.querySelector('#imp-tab-pdf');
  const tabUrl = body.querySelector('#imp-tab-url');
  const paneP = body.querySelector('#imp-pdf');
  const paneU = body.querySelector('#imp-url');
  const setTab = (pdf) => {
    tabPdf.classList.toggle('seg-active', pdf);
    tabUrl.classList.toggle('seg-active', !pdf);
    paneP.hidden = !pdf; paneU.hidden = pdf;
  };
  tabPdf.addEventListener('click', () => setTab(true));
  tabUrl.addEventListener('click', () => setTab(false));

  // PDF
  const drop = body.querySelector('#imp-drop');
  const file = body.querySelector('#imp-file');
  drop.addEventListener('dragover', (e) => { e.preventDefault(); drop.classList.add('dropzone-hot'); });
  drop.addEventListener('dragleave', () => drop.classList.remove('dropzone-hot'));
  drop.addEventListener('drop', (e) => {
    e.preventDefault();
    drop.classList.remove('dropzone-hot');
    const f = e.dataTransfer.files?.[0];
    if (f) handlePdf(f);
  });
  file.addEventListener('change', () => file.files?.[0] && handlePdf(file.files[0]));

  async function handlePdf(f) {
    if (!/pdf$/i.test(f.name) && f.type !== 'application/pdf') { setStatus('That file is not a PDF.', true); return; }
    if (!window.pdfjsLib) { setStatus('PDF engine (pdf.js) failed to load from CDN — check your connection.', true); return; }
    try {
      setStatus(`Parsing ${f.name} locally…`);
      const buf = await f.arrayBuffer();
      const pdf = await window.pdfjsLib.getDocument({ data: buf }).promise;
      let text = '';
      for (let p = 1; p <= Math.min(pdf.numPages, 60); p++) {
        setStatus(`Parsing page ${p}/${Math.min(pdf.numPages, 60)}…`);
        const page = await pdf.getPage(p);
        const content = await page.getTextContent();
        text += content.items.map(i => i.str).join(' ') + '\n\n';
      }
      text = text.replace(/[ \t]+/g, ' ').replace(/\n{3,}/g, '\n\n').trim().slice(0, 24000);
      if (text.replace(/\s/g, '').length < 50) {
        setStatus("This PDF appears to be scanned images — Lumen can't read it yet. Try a text-based PDF.", true);
        return;
      }
      setStatus('');
      showReview({ title: f.name.replace(/\.pdf$/i, ''), content: text, source: `pdf:${f.name}` });
    } catch (err) {
      setStatus(`Couldn't parse this PDF (${String(err.message || err).slice(0, 80)}). Try another file.`, true);
    }
  }

  // URL
  body.querySelector('#imp-fetch').addEventListener('click', async () => {
    const url = body.querySelector('#imp-url-input').value.trim();
    if (!/^https?:\/\//i.test(url)) { setStatus('Enter a full http(s):// URL.', true); return; }
    try {
      setStatus('Fetching a readable copy via r.jina.ai…');
      const resp = await fetch('https://r.jina.ai/' + url);
      if (!resp.ok) throw new Error(`reader responded ${resp.status}`);
      let text = (await resp.text()).trim().slice(0, 24000);
      if (text.length < 80) throw new Error('the page returned almost no text');
      const firstHeading = text.match(/^Title:\s*(.+)$/m)?.[1] || text.match(/^#\s+(.+)$/m)?.[1];
      setStatus('');
      showReview({ title: (firstHeading || url.replace(/^https?:\/\//, '').slice(0, 60)).trim(), content: text, source: url });
    } catch (err) {
      setStatus(`Couldn't fetch this URL — the reader may be blocked or the page requires login (${String(err.message || err).slice(0, 80)}).`, true);
    }
  });
}

// ---------- Command palette ----------
function openPalette() {
  const body = el('div', { class: 'palette' });
  body.innerHTML = `
    <input id="pal-input" class="input palette-input" placeholder="Search notes, jump anywhere, run a command…" aria-label="Command palette" autocomplete="off" />
    <div id="pal-list" class="palette-list" role="listbox"></div>`;
  const m = openModal({ title: 'Command palette', kicker: '⌘K', body });
  const input = body.querySelector('#pal-input');
  const list = body.querySelector('#pal-list');
  let items = [];
  let active = 0;

  const COMMANDS = [
    { label: 'Go to Graph', hint: 'view', run: () => navigate('#/graph') },
    { label: 'Go to Library', hint: 'view', run: () => navigate('#/library') },
    { label: 'Go to Ask', hint: 'view', run: () => navigate('#/ask') },
    { label: 'Go to Eval Lab', hint: 'view', run: () => navigate('#/lab') },
    { label: 'Go to About', hint: 'view', run: () => navigate('#/about') },
    { label: 'New note', hint: 'command', run: () => { navigate('#/library'); setTimeout(() => document.getElementById('lib-new')?.click(), 60); } },
    { label: 'Import PDF or URL', hint: 'command', run: openImport },
    { label: 'Run benchmark', hint: 'command', run: () => { navigate('#/lab'); setTimeout(() => document.getElementById('lab-run')?.click(), 120); } },
    { label: 'Settings', hint: 'command', run: openSettings },
  ];

  const compute = (q) => {
    const lq = q.toLowerCase().trim();
    const cmds = COMMANDS.filter(c => !lq || c.label.toLowerCase().includes(lq));
    const notes = !lq ? [] : state.notes
      .filter(n => (n.title + ' ' + stripMarkdown(n.content) + ' ' + (n.tags || []).join(' ')).toLowerCase().includes(lq))
      .slice(0, 6)
      .map(n => ({ label: n.title, hint: 'note', sub: stripMarkdown(n.content).slice(0, 70), run: () => navigate(`#/library/${n.id}`) }));
    return [...notes, ...cmds].slice(0, 12);
  };

  const draw = () => {
    list.innerHTML = items.map((it, i) => `
      <button class="palette-item ${i === active ? 'palette-active' : ''}" data-i="${i}" role="option" ${i === active ? 'aria-selected="true"' : ''}>
        <span class="palette-label">${escapeHtml(it.label)}</span>
        ${it.sub ? `<span class="palette-sub dim">${escapeHtml(it.sub)}…</span>` : ''}
        <span class="mono dim palette-hint">${escapeHtml(it.hint)}</span>
      </button>`).join('') || '<div class="dim rail-empty">No matches.</div>';
    list.querySelectorAll('.palette-item').forEach(b => b.addEventListener('click', () => pick(Number(b.dataset.i))));
  };
  const pick = (i) => { const it = items[i]; if (it) { m.close(); it.run(); } };

  input.addEventListener('input', () => { items = compute(input.value); active = 0; draw(); });
  input.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); active = Math.min(items.length - 1, active + 1); draw(); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); active = Math.max(0, active - 1); draw(); }
    else if (e.key === 'Enter') { e.preventDefault(); pick(active); }
  });
  items = compute('');
  draw();
}

// ---------- Onboarding ----------
const TOUR = [
  {
    title: 'Notes are dots. Ideas are lines.',
    body: 'This workspace is pre-seeded with 12 notes on how to learn effectively. The graph maps them — drag nodes, switch to semantic links, click anything to read it. Your own notes never leave this browser.',
    cta: 'Next',
  },
  {
    title: 'Ask, and see the receipts.',
    body: 'Ask a question and Lumen retrieves the best chunks locally, shows every score and the exact prompt in the Evidence panel, and answers with citations. No key? Retrieval still works. Notes don\'t cover it? Lumen says so.',
    cta: 'Next',
  },
  {
    title: "Don't trust it — measure it.",
    body: 'The Eval Lab runs a published benchmark (including trick questions that should be refused) against the same pipeline, and keeps every run so you can compare configurations. That\'s the whole product thesis.',
    cta: 'Start exploring',
  },
];

function startOnboarding(step = 0) {
  const t = TOUR[step];
  const body = el('div');
  body.innerHTML = `
    <div class="tour-dots">${TOUR.map((_, i) => `<span class="tour-dot ${i === step ? 'tour-dot-on' : ''}"></span>`).join('')}</div>
    <p class="tour-body">${escapeHtml(t.body)}</p>`;
  const foot = el('div', { class: 'btn-row' });
  const skip = el('button', { class: 'btn btn-ghost' }, 'Skip tour');
  const next = el('button', { class: 'btn btn-primary' }, escapeHtml(t.cta));
  foot.append(skip, next);
  const m = openModal({ title: t.title, kicker: `Welcome to Lumen · ${step + 1}/${TOUR.length}`, body, footer: foot, onClose: setOnboarded });
  skip.addEventListener('click', m.close);
  next.addEventListener('click', () => {
    if (step + 1 < TOUR.length) {
      m.close();
      startOnboarding(step + 1);
    } else {
      m.close();
    }
  });
}

// ---------- Boot ----------
function boot() {
  initWorkspace();

  document.getElementById('topbar').innerHTML = `
    <a class="brand" href="#/graph">
      <span class="brand-dot"></span>
      <span class="brand-name">Lumen</span>
      <span class="brand-ver mono">2.0</span>
    </a>
    <nav class="main-nav" aria-label="Primary">
      <button data-nav="graph">Graph</button>
      <button data-nav="library">Library</button>
      <button data-nav="ask">Ask</button>
      <button data-nav="lab">Eval Lab</button>
      <button data-nav="about">About</button>
    </nav>
    <div class="topbar-right">
      <button id="palette-open" class="btn btn-ghost btn-sm palette-trigger" title="Search & commands">
        <span>Search</span><kbd class="mono">⌘K</kbd>
      </button>
      <button id="import-open" class="btn btn-ghost btn-sm">Import</button>
      <button id="ai-pill" class="ai-pill ai-idle"></button>
      <button id="theme-toggle" class="icon-btn"></button>
      <button id="settings-open" class="icon-btn" title="Settings" aria-label="Settings">⚙</button>
      <a class="icon-btn" href="https://github.com/sillanaresh/lumen" target="_blank" rel="noopener" title="Source on GitHub" aria-label="GitHub">
        <svg width="15" height="15" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true"><path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27s1.36.09 2 .27c1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.01 8.01 0 0 0 16 8c0-4.42-3.58-8-8-8z"/></svg>
      </a>
    </div>`;

  document.querySelectorAll('[data-nav]').forEach(b =>
    b.addEventListener('click', () => navigate(`#/${b.dataset.nav}`)));
  applyTheme(currentTheme());
  document.getElementById('theme-toggle').addEventListener('click', () =>
    applyTheme(currentTheme() === 'dark' ? 'light' : 'dark'));
  document.getElementById('settings-open').addEventListener('click', openSettings);
  document.getElementById('import-open').addEventListener('click', openImport);
  document.getElementById('palette-open').addEventListener('click', openPalette);
  document.getElementById('ai-pill').addEventListener('click', () => {
    if (embedder.status === 'idle' || embedder.status === 'error') {
      embedder.ensureIndex().then(() => toast('Local model ready — semantic retrieval is on.', { kind: 'success' }))
        .catch(() => toast('Model download failed — check connection. Keyword search still works.', { kind: 'error' }));
    }
  });

  // mobile bottom nav
  document.getElementById('mobile-nav').innerHTML = ['library', 'ask', 'lab', 'about']
    .map(n => `<button data-nav="${n}">${ROUTES[n].title}</button>`).join('');
  document.querySelectorAll('#mobile-nav [data-nav]').forEach(b =>
    b.addEventListener('click', () => navigate(`#/${b.dataset.nav}`)));

  on('embedder', renderAiPill);
  renderAiPill();

  document.addEventListener('keydown', (e) => {
    if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); openPalette(); }
  });

  window.addEventListener('hashchange', route);
  route();

  // ?notour suppresses the first-run tour (used by headless smoke tests)
  if (!isOnboarded() && !location.search.includes('notour')) startOnboarding();

  // Warm the embedding index quietly in the background after first paint, so
  // the first semantic ask doesn't pay the full cold-start.
  setTimeout(() => { embedder.ensureIndex().catch(() => {}); }, 2500);
}

boot();
