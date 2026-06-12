// store.js — workspace state, persistence, and the local embedding engine.
//
// Storage map (all in THIS browser):
//   localStorage  lumen2.notes.v1     — the workspace notes (seeded on first run)
//   localStorage  lumen2.settings.v1  — API key, model, flags
//   localStorage  lumen2.feedback.v1  — thumbs feedback (never auto-sent)
//   IndexedDB     embeddings          — chunk vectors keyed by contentHash
//   IndexedDB     evalRuns            — saved benchmark runs

import { chunkAll, contentHash } from './pipeline.js';
import { SEED_NOTES, SEED_VERSION } from './seed.js';

const LS_NOTES = 'lumen2.notes.v1';
const LS_SETTINGS = 'lumen2.settings.v1';
const LS_FEEDBACK = 'lumen2.feedback.v1';
const LS_ONBOARDED = 'lumen2.onboarded.v1';
const LEGACY_USER_NOTES = 'lumen.userNotes.v1'; // v0.x format, migrated on first boot

// Static fallback if the live catalog can't be fetched (offline). Verified
// against openrouter.ai/api/v1/models — free models churn, so Settings
// fetches the live list and this only backstops it.
export const DEFAULT_MODEL = 'meta-llama/llama-3.3-70b-instruct:free';
export const FALLBACK_MODELS = [
  { id: 'meta-llama/llama-3.3-70b-instruct:free', name: 'Llama 3.3 70B Instruct (free)' },
  { id: 'openai/gpt-oss-120b:free', name: 'GPT-OSS 120B (free)' },
  { id: 'qwen/qwen3-next-80b-a3b-instruct:free', name: 'Qwen3 Next 80B (free)' },
  { id: 'google/gemma-4-31b-it:free', name: 'Gemma 4 31B (free)' },
  { id: 'nvidia/nemotron-3-super-120b-a12b:free', name: 'Nemotron 3 Super 120B (free)' },
];
// Models that used to ship as defaults but no longer exist on OpenRouter;
// saved settings pointing at them are migrated to DEFAULT_MODEL.
const RETIRED_MODELS = new Set([
  'google/gemini-2.0-flash-exp:free',
  'deepseek/deepseek-chat-v3.1:free',
  'meta-llama/llama-3.1-8b-instruct:free',
]);

// Live free-model catalog from OpenRouter's public endpoint (a plain GET —
// no key, nothing personal). Cached for the session; null on failure.
let catalogPromise = null;
export function fetchModelCatalog() {
  if (!catalogPromise) {
    catalogPromise = (async () => {
      const ctrl = new AbortController();
      const t = setTimeout(() => ctrl.abort(), 6000);
      try {
        const resp = await fetch('https://openrouter.ai/api/v1/models', { signal: ctrl.signal });
        if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
        const data = await resp.json();
        const free = (data.data || [])
          .filter(m => m.id.endsWith(':free'))
          .map(m => ({ id: m.id, name: m.name || m.id, ctx: m.context_length || 0 }))
          .sort((a, b) => b.ctx - a.ctx || a.id.localeCompare(b.id));
        return free.length ? free : null;
      } catch {
        catalogPromise = null; // allow a retry next open
        return null;
      } finally {
        clearTimeout(t);
      }
    })();
  }
  return catalogPromise;
}

// Local embedding models (transformers.js / ONNX). All run fully in-browser;
// bigger = better retrieval, slower first index, larger one-time download.
export const EMBEDDERS = [
  { id: 'minilm', hf: 'Xenova/all-MiniLM-L6-v2', label: 'MiniLM-L6-v2 — 22 MB, fastest', short: 'MiniLM', dims: 384 },
  { id: 'bge-small', hf: 'Xenova/bge-small-en-v1.5', label: 'BGE-small-en-v1.5 — 34 MB, better quality', short: 'BGE-small', dims: 384 },
  { id: 'bge-base', hf: 'Xenova/bge-base-en-v1.5', label: 'BGE-base-en-v1.5 — 110 MB, best quality', short: 'BGE-base', dims: 768 },
];
export const DEFAULT_EMBEDDER = 'minilm';

// ---------- Tiny IndexedDB promise wrapper ----------
const IDB_NAME = 'lumen2';
const IDB_VERSION = 2; // v2 adds the 'benchmarks' store
let dbPromise = null;

function db() {
  if (!dbPromise) {
    dbPromise = new Promise((resolve, reject) => {
      const req = indexedDB.open(IDB_NAME, IDB_VERSION);
      req.onupgradeneeded = () => {
        const d = req.result;
        if (!d.objectStoreNames.contains('embeddings')) d.createObjectStore('embeddings');
        if (!d.objectStoreNames.contains('evalRuns')) d.createObjectStore('evalRuns');
        if (!d.objectStoreNames.contains('benchmarks')) d.createObjectStore('benchmarks');
      };
      req.onsuccess = () => {
        // If a future version opens elsewhere, close so that tab can upgrade.
        req.result.onversionchange = () => req.result.close();
        resolve(req.result);
      };
      req.onerror = () => reject(req.error);
      req.onblocked = () => reject(new Error('Storage is locked by another Lumen tab — close other Lumen tabs and reload.'));
    });
  }
  return dbPromise;
}

async function idb(storeName, mode, fn) {
  const d = await db();
  return new Promise((resolve, reject) => {
    const tx = d.transaction(storeName, mode);
    const store = tx.objectStore(storeName);
    const req = fn(store);
    tx.oncomplete = () => resolve(req?.result);
    tx.onerror = () => reject(tx.error);
  });
}

export const idbGet = (s, k) => idb(s, 'readonly', (st) => st.get(k));
export const idbSet = (s, k, v) => idb(s, 'readwrite', (st) => st.put(v, k));
export const idbDel = (s, k) => idb(s, 'readwrite', (st) => st.delete(k));
export const idbClear = (s) => idb(s, 'readwrite', (st) => st.clear());
export const idbAll = async (s) => {
  const d = await db();
  return new Promise((resolve, reject) => {
    const out = [];
    const tx = d.transaction(s, 'readonly');
    const cur = tx.objectStore(s).openCursor();
    cur.onsuccess = () => {
      const c = cur.result;
      if (c) { out.push(c.value); c.continue(); } else resolve(out);
    };
    cur.onerror = () => reject(cur.error);
  });
};
export const idbCount = (s) => idb(s, 'readonly', (st) => st.count());

// ---------- Settings / feedback / onboarding ----------
function lsJson(key, fallback) {
  try { return JSON.parse(localStorage.getItem(key)) ?? fallback; } catch { return fallback; }
}

export function loadSettings() {
  const s = { apiKey: '', model: DEFAULT_MODEL, embedder: DEFAULT_EMBEDDER, ...lsJson(LS_SETTINGS, {}) };
  if (RETIRED_MODELS.has(s.model)) s.model = DEFAULT_MODEL;
  if (!EMBEDDERS.some(e => e.id === s.embedder)) s.embedder = DEFAULT_EMBEDDER;
  return s;
}

// ---------- Custom benchmark (one per workspace, IndexedDB) ----------
export const saveCustomBenchmark = (b) => idbSet('benchmarks', 'custom', b);
export const loadCustomBenchmark = () => idbGet('benchmarks', 'custom').catch(() => null);
export const deleteCustomBenchmark = () => idbDel('benchmarks', 'custom');
export function saveSettings(s) { localStorage.setItem(LS_SETTINGS, JSON.stringify(s)); }

export function loadFeedback() { return lsJson(LS_FEEDBACK, []); }
export function saveFeedback(items) { localStorage.setItem(LS_FEEDBACK, JSON.stringify(items)); }
export function addFeedback(item) {
  const all = loadFeedback();
  all.push({ feedbackId: 'fb_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6), ts: new Date().toISOString(), ...item });
  saveFeedback(all);
  emit('feedback');
  return all;
}

export const isOnboarded = () => localStorage.getItem(LS_ONBOARDED) === '1';
export const setOnboarded = () => localStorage.setItem(LS_ONBOARDED, '1');

// ---------- Workspace (notes + derived chunks) ----------
export const state = {
  notes: [],
  chunks: [],
  chunksByNote: new Map(),
  selectedNoteId: null,
  askHistory: [],        // session-only ask records (question, results, answer…)
};

const listeners = new Map();
export function on(event, fn) {
  if (!listeners.has(event)) listeners.set(event, new Set());
  listeners.get(event).add(fn);
  return () => listeners.get(event).delete(fn);
}
export function emit(event, payload) {
  listeners.get(event)?.forEach(fn => { try { fn(payload); } catch (e) { console.error(e); } });
}

function persistNotes() {
  localStorage.setItem(LS_NOTES, JSON.stringify({ seedVersion: SEED_VERSION, notes: state.notes }));
}

function rebuildDerived() {
  state.chunks = chunkAll(state.notes);
  state.chunksByNote = new Map();
  for (const c of state.chunks) {
    if (!state.chunksByNote.has(c.noteId)) state.chunksByNote.set(c.noteId, []);
    state.chunksByNote.get(c.noteId).push(c);
  }
}

export function initWorkspace() {
  const saved = lsJson(LS_NOTES, null);
  if (saved?.notes?.length) {
    state.notes = saved.notes;
  } else {
    state.notes = SEED_NOTES.map(n => ({ ...n }));
    // migrate any notes created in Lumen v0.x
    const legacy = lsJson(LEGACY_USER_NOTES, []);
    if (Array.isArray(legacy) && legacy.length) state.notes.push(...legacy);
    persistNotes();
  }
  rebuildDerived();
}

export function noteById(id) { return state.notes.find(n => n.id === id); }

export function upsertNote(note) {
  const i = state.notes.findIndex(n => n.id === note.id);
  if (i >= 0) state.notes[i] = note;
  else state.notes.push(note);
  persistNotes();
  rebuildDerived();
  embedder.invalidate();
  emit('notes');
  return note;
}

export function createNote({ title, tags = [], content, source }) {
  const id = 'u' + Date.now().toString(36);
  return upsertNote({ id, title, tags, content, source, createdAt: new Date().toISOString() });
}

export function deleteNote(id) {
  state.notes = state.notes.filter(n => n.id !== id);
  if (state.selectedNoteId === id) state.selectedNoteId = null;
  persistNotes();
  rebuildDerived();
  emit('notes');
}

export function resetWorkspace() {
  state.notes = SEED_NOTES.map(n => ({ ...n }));
  state.selectedNoteId = null;
  state.askHistory = [];
  persistNotes();
  rebuildDerived();
  embedder.invalidate();
  emit('notes');
}

// True when the workspace still matches the corpus the benchmark was written
// against (used for the Eval Lab drift warning).
const notesHash = (notes) => contentHash(notes.map(n => `${n.id}\n${n.title}\n${n.content}`).sort().join('\n---\n'));
export function workspaceHash() { return notesHash(state.notes); }
export function corpusMatchesSeed() {
  return state.notes.length === SEED_NOTES.length && notesHash(state.notes) === notesHash(SEED_NOTES);
}

export function allTags() {
  const set = new Set();
  for (const n of state.notes) (n.tags || []).forEach(t => set.add(t));
  return Array.from(set).sort();
}

export function duplicateOf(content) {
  const h = contentHash(content);
  return state.notes.find(n => contentHash(n.content) === h) || null;
}

// ---------- Embedding engine (transformers.js MiniLM, lazy) ----------
// status: idle → loading → ready | error. The app is fully usable in lexical
// mode while the model loads or if it never loads.
export const embedder = {
  status: 'idle',
  progress: 0,
  error: null,
  _pipe: null,
  _loading: null,
  _modelId: null,          // EMBEDDERS id the pipe was built for
  _cache: new Map(),       // `${modelId}:${contentHash}` → Float32Array (session)
  _indexReady: null,

  invalidate() { this._indexReady = null; },

  current() {
    return EMBEDDERS.find(e => e.id === loadSettings().embedder) || EMBEDDERS[0];
  },

  // Called when the user picks a different local model in Settings.
  reset() {
    this._pipe = null;
    this._loading = null;
    this._modelId = null;
    this._indexReady = null;
    this.status = 'idle';
    this.progress = 0;
    this.error = null;
    emit('embedder');
  },

  _key(contentHash) { return `${this.current().id}:${contentHash}`; },

  async load() {
    const want = this.current();
    if (this._pipe && this._modelId === want.id) return this._pipe;
    if (this._loading && this._modelId === want.id) return this._loading;
    this._modelId = want.id;
    this.status = 'loading';
    this.progress = 0;
    emit('embedder');
    this._loading = (async () => {
      try {
        const { pipeline, env } = await import('https://cdn.jsdelivr.net/npm/@xenova/transformers@2.17.2');
        env.allowLocalModels = false;
        env.useBrowserCache = true;
        this._pipe = await pipeline('feature-extraction', want.hf, {
          progress_callback: (d) => {
            if (d && typeof d.progress === 'number') {
              this.progress = Math.max(this.progress, Math.round(d.progress));
              emit('embedder');
            }
          },
        });
        this.status = 'ready';
        this.progress = 100;
        emit('embedder');
        return this._pipe;
      } catch (err) {
        this.status = 'error';
        this.error = err;
        emit('embedder');
        throw err;
      }
    })();
    return this._loading;
  },

  async embed(text) {
    const pipe = await this.load();
    const out = await pipe(String(text), { pooling: 'mean', normalize: true });
    return new Float32Array(out.data);
  },

  // Ensure every current chunk has a vector, hitting the IndexedDB cache by
  // contentHash so unchanged text is never re-embedded.
  async ensureIndex(onProgress) {
    if (this._indexReady) return this._indexReady;
    this._indexReady = (async () => {
      await this.load();
      const missing = [];
      for (const c of state.chunks) {
        const key = this._key(c.contentHash);
        if (this._cache.has(key)) continue;
        const cached = await idbGet('embeddings', key).catch(() => null);
        if (cached) this._cache.set(key, new Float32Array(cached));
        else missing.push(c);
      }
      for (let i = 0; i < missing.length; i++) {
        const c = missing[i];
        const key = this._key(c.contentHash);
        const vec = await this.embed(`${c.noteTitle}\n${c.headingPath}\n${c.text}`);
        this._cache.set(key, vec);
        idbSet('embeddings', key, vec.buffer.slice(0)).catch(() => {});
        onProgress?.(i + 1, missing.length);
        // yield so a big import never freezes the UI
        if (i % 4 === 3) await new Promise(r => setTimeout(r, 0));
      }
    })();
    try { await this._indexReady; } catch (err) { this._indexReady = null; throw err; }
    return this._indexReady;
  },

  getVec(chunk) { return this._cache.get(this._key(chunk.contentHash)) || null; },

  // Mean of chunk vectors per note — used for semantic graph edges.
  noteVec(noteId) {
    const chunks = state.chunksByNote.get(noteId) || [];
    const vecs = chunks.map(c => this.getVec(c)).filter(Boolean);
    if (!vecs.length) return null;
    const dim = vecs[0].length;
    const mean = new Float32Array(dim);
    for (const v of vecs) for (let i = 0; i < dim; i++) mean[i] += v[i] / vecs.length;
    let norm = 0;
    for (let i = 0; i < dim; i++) norm += mean[i] * mean[i];
    norm = Math.sqrt(norm) || 1;
    for (let i = 0; i < dim; i++) mean[i] /= norm;
    return mean;
  },

  async clearCache() {
    this._cache.clear();
    this._indexReady = null;
    await idbClear('embeddings');
    emit('embedder');
  },
};
