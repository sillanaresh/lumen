// views/lab.js — the Eval Lab. Runs the published benchmark against the SAME
// retrieval functions Ask uses, persists runs locally, compares them, and
// exports results. "I don't claim it works — I measured it."

import { state, corpusMatchesSeed, resetWorkspace, embedder, idbAll, idbSet, idbDel } from '../store.js';
import { rankChunks, rankOfFirstGold, isNoAnswer, computeMetrics, metricsMarkdownTable } from '../pipeline.js';
import { escapeHtml, pct, fmtMs, toast, download, scoreBar, countUp, infoTip } from '../ui.js';
import { openNote } from './library.js';

let benchmark = null;     // loaded benchmark.json
let running = false;
let cancelRequested = false;
let lastRun = null;       // most recent run (this session or from idb)
let compareSelection = new Set();
let caseFilter = 'all';   // all | miss | no-answer

export function render(root) {
  root.innerHTML = `
    <div class="lab">
      <header class="lab-head">
        <div>
          <div class="kicker">Eval Lab</div>
          <h1>Measured, <span class="grad-text">not vibes</span></h1>
          <p class="dim lab-sub">Lumen ships its own benchmark: 58 hand-written questions, authored against the
          12 seeded notes <em>before</em> any tuning, each mapped to the note that should answer it — including
          no-answer traps that test hallucination resistance. The runner calls the exact retrieval pipeline Ask uses —
          same functions, same data. Everything runs and persists in this browser.</p>
        </div>
        <div class="lab-controls">
          <label class="lab-control"><span>mode ${infoTip('Lexical ranks chunks by keyword overlap — instant, works offline, no model needed. Semantic + lexical blends meaning-vectors (72%) with keywords (28%) — the same scoring Ask uses once the local embedding model has loaded.', { wide: true })}</span>
            <select id="lab-mode" class="input input-sm">
              <option value="lexical">lexical (no model needed)</option>
              <option value="semantic">semantic + lexical (MiniLM)</option>
            </select>
          </label>
          <label class="lab-control"><span>top-k ${infoTip('How many chunks retrieval returns per question. Smaller = stricter, less noise in the prompt; larger = better recall, but weaker chunks ride along.')}</span>
            <select id="lab-topk" class="input input-sm">
              <option>3</option><option selected>5</option><option>8</option>
            </select>
          </label>
          <button id="lab-run" class="btn btn-primary">Run benchmark</button>
        </div>
      </header>
      <div id="lab-corpus" class="lab-corpus"></div>
      <div id="lab-progress" class="lab-progress" hidden>
        <div class="lab-progress-bar"><div id="lab-progress-fill" class="lab-progress-fill"></div></div>
        <span id="lab-progress-text" class="mono dim"></span>
        <button id="lab-cancel" class="btn btn-ghost btn-sm">Cancel</button>
      </div>
      <div id="lab-metrics" class="metric-grid"></div>
      <div class="lab-columns">
        <section class="lab-cases">
          <div class="lab-cases-head">
            <h2 class="rail-title">Per-case results</h2>
            <div class="seg">
              <button class="seg-btn ${caseFilter === 'all' ? 'seg-active' : ''}" data-filter="all">All</button>
              <button class="seg-btn ${caseFilter === 'miss' ? 'seg-active' : ''}" data-filter="miss">Misses</button>
              <button class="seg-btn ${caseFilter === 'no-answer' ? 'seg-active' : ''}" data-filter="no-answer">No-answer</button>
            </div>
          </div>
          <div id="lab-rows"></div>
        </section>
        <aside class="lab-history">
          <h2 class="rail-title">Run history <span class="dim">· stored in this browser</span></h2>
          <p class="rail-hint dim">Select two runs to compare. Export feeds the README results table.</p>
          <div id="lab-runs"></div>
          <div id="lab-compare"></div>
          <div class="btn-row">
            <button id="lab-export-json" class="btn btn-ghost btn-sm">Export JSON</button>
            <button id="lab-export-md" class="btn btn-ghost btn-sm">Export Markdown</button>
          </div>
        </aside>
      </div>
    </div>
  `;

  root.querySelector('#lab-run').addEventListener('click', () => runBenchmark(root));
  root.querySelector('#lab-cancel').addEventListener('click', () => { cancelRequested = true; });
  root.querySelector('#lab-export-json').addEventListener('click', () => {
    if (!lastRun) return toast('Run the benchmark first.', { kind: 'warn' });
    download(`lumen-eval-${lastRun.runId}.json`, lastRun);
  });
  root.querySelector('#lab-export-md').addEventListener('click', async () => {
    const runs = await savedRuns();
    if (!runs.length) return toast('Run the benchmark first.', { kind: 'warn' });
    download('lumen-eval-results.md', metricsMarkdownTable(runs.slice(0, 8)), 'text/markdown');
  });
  root.querySelectorAll('[data-filter]').forEach(b => b.addEventListener('click', () => {
    caseFilter = b.dataset.filter;
    root.querySelectorAll('[data-filter]').forEach(x => x.classList.toggle('seg-active', x === b));
    renderRows(root);
  }));

  loadBenchmark().then(async () => {
    renderCorpus(root);
    if (!lastRun) {
      const runs = await savedRuns();
      lastRun = runs[0] || null;
    }
    renderMetrics(root);
    renderRows(root);
    renderHistory(root);
  }).catch(err => {
    root.querySelector('#lab-corpus').innerHTML =
      `<div class="callout callout-danger">Couldn't load <span class="mono">benchmark.json</span> (${escapeHtml(String(err.message || err))}). If you opened index.html as a file, serve the folder instead: <span class="mono">python3 -m http.server</span>.</div>`;
  });
}

async function loadBenchmark() {
  if (benchmark) return benchmark;
  const resp = await fetch('./benchmark.json');
  if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
  benchmark = await resp.json();
  return benchmark;
}

async function savedRuns() {
  const runs = await idbAll('evalRuns').catch(() => []);
  return runs.sort((a, b) => String(b.timestamp).localeCompare(String(a.timestamp)));
}

function renderCorpus(root) {
  const elc = root.querySelector('#lab-corpus');
  const counts = benchmark.cases.reduce((acc, c) => { acc[c.category] = (acc[c.category] || 0) + 1; return acc; }, {});
  const drift = !corpusMatchesSeed();
  elc.innerHTML = `
    <div class="lab-corpus-line mono dim">
      benchmark v${escapeHtml(benchmark.version)} · ${benchmark.cases.length} cases
      (${Object.entries(counts).map(([k, v]) => `${v} ${k}`).join(' · ')}) · corpus: ${state.chunks.length} chunks from ${state.notes.length} notes
    </div>
    ${drift ? `
      <div class="callout callout-warn">
        <span>Your workspace differs from the 12 seeded notes these questions were written against, so scores aren't comparable —
        the gold answers point at notes that may have changed. Benchmarking <em>your own</em> documents needs questions written
        for them (LLM-drafted, human-approved cases are on the roadmap).</span>
        <button id="lab-reset-corpus" class="btn btn-ghost btn-sm">Reset corpus to benchmark</button>
        <span class="dim">or run anyway — the runner won't stop you.</span>
      </div>` : ''}
  `;
  elc.querySelector('#lab-reset-corpus')?.addEventListener('click', () => {
    resetWorkspace();
    toast('Workspace reset to the seeded benchmark corpus.', { kind: 'success' });
    renderCorpus(root);
  });
}

// ---------- Runner ----------
async function runBenchmark(root) {
  if (running) return;
  await loadBenchmark();
  const mode = root.querySelector('#lab-mode').value;
  const topK = Number(root.querySelector('#lab-topk').value);
  running = true;
  cancelRequested = false;
  const runBtn = root.querySelector('#lab-run');
  runBtn.disabled = true;
  const prog = root.querySelector('#lab-progress');
  const fill = root.querySelector('#lab-progress-fill');
  const text = root.querySelector('#lab-progress-text');
  prog.hidden = false;

  // Whole-note baseline: each note as ONE chunk — the v0.4 behavior we measure against.
  const wholeNoteChunks = state.notes.map(n => ({
    chunkId: `${n.id}.1`, noteId: n.id, noteTitle: n.title, ordinal: 1,
    headingPath: n.title, tags: n.tags || [], text: n.content, contentHash: 'wn-' + n.id,
  }));

  let getVec = null;
  let embedQuery = null;
  if (mode === 'semantic') {
    try {
      text.textContent = 'loading local embedding model…';
      await embedder.ensureIndex((done, total) => { text.textContent = `embedding chunks ${done}/${total}…`; });
      getVec = (c) => embedder.getVec(c);
      embedQuery = (q) => embedder.embed(q);
    } catch {
      toast('Local model failed to load — falling back to lexical mode.', { kind: 'error' });
    }
  }
  const effectiveMode = getVec ? 'semantic' : 'lexical';

  const perCase = [];
  const cases = benchmark.cases;
  try {
    for (let i = 0; i < cases.length; i++) {
      if (cancelRequested) break;
      const c = cases[i];
      fill.style.width = `${Math.round(((i + 1) / cases.length) * 100)}%`;
      text.textContent = `case ${i + 1}/${cases.length} · ${c.id}`;
      const t0 = performance.now();
      const queryVec = embedQuery ? await embedQuery(c.question) : null;
      const opts = { queryVec, getVec: queryVec ? getVec : null, topK };
      const results = rankChunks(c.question, state.chunks, opts);
      const baseline = rankChunks(c.question, wholeNoteChunks, { ...opts, getVec: null, queryVec: null });
      const latencyMs = performance.now() - t0;
      perCase.push({
        id: c.id,
        question: c.question,
        expected: c.expected || [],
        category: c.category,
        rubric: c.rubric || '',
        rank: rankOfFirstGold(results, c.expected),
        baselineRank: rankOfFirstGold(baseline, c.expected),
        noAnswerCorrect: (c.expected || []).length === 0 ? isNoAnswer(results, effectiveMode) : null,
        latencyMs,
        retrieved: results.slice(0, topK).map(r => ({
          chunkId: r.chunk.chunkId, noteId: r.chunk.noteId, headingPath: r.chunk.headingPath,
          score: r.score, lexical: r.lexical, semantic: r.semantic,
        })),
      });
      await new Promise(r => setTimeout(r, 0)); // keep the UI breathing
    }

    const run = {
      runId: 'run_' + Date.now().toString(36),
      timestamp: new Date().toISOString(),
      incomplete: cancelRequested,
      config: { mode: effectiveMode, topK, chunking: 'chunked', corpusMatchesSeed: corpusMatchesSeed() },
      metrics: computeMetrics(perCase),
      perCase,
    };
    lastRun = run;
    await idbSet('evalRuns', run.runId, run).catch(() => {});
    renderMetrics(root); renderRows(root); renderHistory(root);
    toast(cancelRequested
      ? 'Run cancelled — partial results saved with an incomplete badge.'
      : `Run complete: Hit@5 ${pct(run.metrics.hit5)}, MRR ${run.metrics.mrr.toFixed(2)}, no-answer ${pct(run.metrics.noAnswerAccuracy)}.`,
      { kind: cancelRequested ? 'warn' : 'success' });
  } finally {
    running = false;
    runBtn.disabled = false;
    prog.hidden = true;
  }
}

// ---------- Rendering ----------
function renderMetrics(root) {
  const grid = root.querySelector('#lab-metrics');
  if (!lastRun) {
    grid.innerHTML = `
      <div class="callout">
        No runs yet in this browser. Pick a mode and hit <strong>Run benchmark</strong> —
        lexical mode finishes in seconds and needs no API key or model download.
      </div>`;
    return;
  }
  const m = lastRun.metrics;
  const tile = (value, label, sub = '') => `
    <div class="metric">
      <div class="metric-value">${value}</div>
      <div class="metric-label">${label}</div>
      ${sub ? `<div class="metric-sub dim">${sub}</div>` : ''}
    </div>`;
  grid.innerHTML =
    tile(pct(m.hit1), 'Hit@1', 'gold note ranked first') +
    tile(pct(m.hit5), 'Hit@5', `whole-note baseline ${pct(m.baselineHit5)} → lift ${m.liftHit5 >= 0 ? '+' : ''}${pct(m.liftHit5)}`) +
    tile(m.mrr.toFixed(2), 'MRR', 'mean reciprocal rank') +
    tile(pct(m.noAnswerAccuracy), 'No-answer accuracy', `${m.noAnswer} hallucination traps`) +
    tile(m.latencyP50 != null ? fmtMs(m.latencyP50) : '—', 'Retrieval p50', `p95 ${m.latencyP95 != null ? fmtMs(m.latencyP95) : '—'}`) +
    `<div class="metric metric-note">
      <div class="metric-label">run</div>
      <div class="metric-sub dim mono">${escapeHtml(lastRun.config.mode)} · top-${lastRun.config.topK} · ${new Date(lastRun.timestamp).toLocaleString()}${lastRun.incomplete ? ' · <span class="warn-text">incomplete</span>' : ''}${lastRun.config.corpusMatchesSeed === false ? ' · <span class="warn-text">corpus drifted</span>' : ''}</div>
    </div>`;
  grid.querySelectorAll('.metric-value').forEach(el => countUp(el));
}

function renderRows(root) {
  const wrap = root.querySelector('#lab-rows');
  if (!lastRun) { wrap.innerHTML = ''; return; }
  let rows = lastRun.perCase;
  if (caseFilter === 'miss') rows = rows.filter(r => r.expected.length > 0 && r.rank !== 1);
  if (caseFilter === 'no-answer') rows = rows.filter(r => r.expected.length === 0);
  if (!rows.length) { wrap.innerHTML = '<div class="dim rail-empty">Nothing in this filter — that\'s a good sign.</div>'; return; }

  wrap.innerHTML = rows.map(r => {
    const isNA = r.expected.length === 0;
    const status = isNA
      ? (r.noAnswerCorrect ? ['pass', 'declined ✓'] : ['fail', 'over-retrieved'])
      : (r.rank === 1 ? ['pass', 'rank 1'] : r.rank ? ['warn', `rank ${r.rank}`] : ['fail', 'miss']);
    return `
    <details class="case case-${status[0]}">
      <summary class="case-summary">
        <span class="mono dim">${escapeHtml(r.id)}</span>
        <span class="case-q">${escapeHtml(r.question)}</span>
        <span class="mono case-status">${status[1]}</span>
        <span class="mono dim">${escapeHtml(r.category)}</span>
      </summary>
      <div class="case-detail">
        <div class="dim">gold: ${r.expected.length ? r.expected.map(escapeHtml).join(', ') : 'none — correct behavior is to decline'}${r.baselineRank ? ` · whole-note baseline rank ${r.baselineRank}` : ''}</div>
        ${r.rubric ? `<div class="dim">rubric: ${escapeHtml(r.rubric)}</div>` : ''}
        <div class="case-retrieved">
          ${r.retrieved.map(x => `
            <div class="ev-score">
              <button class="cite-chip" data-open="${escapeHtml(x.chunkId)}">[${escapeHtml(x.chunkId)}]</button>
              ${scoreBar(x.score)}
              <span class="mono">${x.score.toFixed(2)}</span>
              <span class="dim">${escapeHtml(x.headingPath)}</span>
            </div>`).join('')}
        </div>
      </div>
    </details>`;
  }).join('');
  wrap.querySelectorAll('[data-open]').forEach(b => b.addEventListener('click', (e) => {
    e.preventDefault();
    openNote(b.dataset.open.split('.')[0], b.dataset.open);
  }));
}

async function renderHistory(root) {
  const wrap = root.querySelector('#lab-runs');
  const runs = await savedRuns();
  if (!runs.length) { wrap.innerHTML = '<div class="dim rail-empty">No saved runs yet.</div>'; return; }
  wrap.innerHTML = runs.slice(0, 12).map(r => `
    <div class="run-row ${lastRun?.runId === r.runId ? 'run-row-active' : ''}">
      <input type="checkbox" data-cmp="${escapeHtml(r.runId)}" ${compareSelection.has(r.runId) ? 'checked' : ''} aria-label="Select for compare" />
      <button class="run-load" data-load="${escapeHtml(r.runId)}">
        <span class="mono">${escapeHtml(r.config.mode)} · k${r.config.topK}</span>
        <span class="dim">${new Date(r.timestamp).toLocaleString()}</span>
        <span class="mono dim">Hit@5 ${pct(r.metrics.hit5)} · NA ${pct(r.metrics.noAnswerAccuracy)}${r.incomplete ? ' · partial' : ''}</span>
      </button>
      <button class="icon-btn" data-del="${escapeHtml(r.runId)}" aria-label="Delete run">✕</button>
    </div>`).join('');

  wrap.querySelectorAll('[data-load]').forEach(b => b.addEventListener('click', () => {
    lastRun = runs.find(r => r.runId === b.dataset.load);
    renderMetrics(root); renderRows(root); renderHistory(root);
  }));
  wrap.querySelectorAll('[data-del]').forEach(b => b.addEventListener('click', async () => {
    await idbDel('evalRuns', b.dataset.del);
    compareSelection.delete(b.dataset.del);
    if (lastRun?.runId === b.dataset.del) lastRun = null;
    renderMetrics(root); renderRows(root); renderHistory(root);
  }));
  wrap.querySelectorAll('[data-cmp]').forEach(cb => cb.addEventListener('change', () => {
    if (cb.checked) compareSelection.add(cb.dataset.cmp); else compareSelection.delete(cb.dataset.cmp);
    if (compareSelection.size > 2) {
      const first = compareSelection.values().next().value;
      compareSelection.delete(first);
    }
    renderHistory(root);
  }));
  renderCompare(root, runs);
}

function renderCompare(root, runs) {
  const wrap = root.querySelector('#lab-compare');
  if (compareSelection.size !== 2) { wrap.innerHTML = ''; return; }
  const [a, b] = Array.from(compareSelection).map(id => runs.find(r => r.runId === id)).filter(Boolean);
  if (!a || !b) { wrap.innerHTML = ''; return; }
  const rows = [
    ['Hit@1', a.metrics.hit1, b.metrics.hit1, pct],
    ['Hit@5', a.metrics.hit5, b.metrics.hit5, pct],
    ['MRR', a.metrics.mrr, b.metrics.mrr, (n) => n.toFixed(2)],
    ['No-answer', a.metrics.noAnswerAccuracy, b.metrics.noAnswerAccuracy, pct],
  ];
  wrap.innerHTML = `
    <div class="compare">
      <div class="compare-head mono dim">
        <span>metric</span><span>${escapeHtml(a.config.mode)}·k${a.config.topK}</span><span>${escapeHtml(b.config.mode)}·k${b.config.topK}</span><span>Δ</span>
      </div>
      ${rows.map(([label, va, vb, fmt]) => {
        const d = vb - va;
        return `<div class="compare-row">
          <span>${label}</span><span class="mono">${fmt(va)}</span><span class="mono">${fmt(vb)}</span>
          <span class="mono ${d > 0.0001 ? 'delta-up' : d < -0.0001 ? 'delta-down' : 'dim'}">${d >= 0 ? '+' : ''}${fmt === pct ? pct(d) : d.toFixed(2)}</span>
        </div>`;
      }).join('')}
    </div>`;
}
