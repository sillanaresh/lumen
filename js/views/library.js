// views/library.js — note list, reader/editor, and the connections rail.

import { state, noteById, upsertNote, createNote, deleteNote, allTags, on, embedder } from '../store.js';
import { chunkNote, cosine, stripMarkdown } from '../pipeline.js';
import { el, escapeHtml, renderMarkdown, toast, openModal } from '../ui.js';
import { navigate } from '../app.js';

let filterTag = null;
let searchQuery = '';
let editing = false;
let highlightChunkId = null;
let unsubscribe = null;

export function render(root, params = {}) {
  if (params.noteId && noteById(params.noteId)) state.selectedNoteId = params.noteId;
  if (!state.selectedNoteId || !noteById(state.selectedNoteId)) state.selectedNoteId = state.notes[0]?.id ?? null;
  highlightChunkId = params.chunk || null;
  editing = params.edit === true;

  root.innerHTML = `
    <div class="three-pane">
      <aside class="pane pane-left" aria-label="Note list">
        <div class="pane-left-head">
          <input id="lib-search" type="search" class="input" placeholder="Filter notes…" value="${escapeHtml(searchQuery)}" aria-label="Filter notes" />
          <div id="lib-tags" class="tag-row"></div>
        </div>
        <div id="lib-list" class="note-list" role="list"></div>
        <div class="pane-left-foot">
          <button id="lib-new" class="btn btn-primary btn-block">+ New note</button>
        </div>
      </aside>
      <main class="pane pane-center" id="lib-main" aria-label="Note content"></main>
      <aside class="pane pane-right" id="lib-rail" aria-label="Note context"></aside>
    </div>
  `;

  root.querySelector('#lib-search').addEventListener('input', (e) => {
    searchQuery = e.target.value;
    renderList(root);
  });
  root.querySelector('#lib-new').addEventListener('click', () => startNewNote(root));

  renderTags(root);
  renderList(root);
  renderMain(root);
  renderRail(root);

  unsubscribe?.();
  unsubscribe = on('notes', () => {
    if (!document.body.contains(root.firstElementChild)) return;
    renderTags(root); renderList(root); renderMain(root); renderRail(root);
  });
}

function visibleNotes() {
  let notes = state.notes;
  if (filterTag) notes = notes.filter(n => (n.tags || []).includes(filterTag));
  if (searchQuery.trim()) {
    const q = searchQuery.toLowerCase();
    notes = notes.filter(n => (n.title + ' ' + n.content + ' ' + (n.tags || []).join(' ')).toLowerCase().includes(q));
  }
  return notes;
}

function renderTags(root) {
  const wrap = root.querySelector('#lib-tags');
  wrap.innerHTML = allTags().map(t =>
    `<button class="chip ${filterTag === t ? 'chip-active' : ''}" data-tag="${escapeHtml(t)}">${escapeHtml(t)}</button>`
  ).join('');
  wrap.querySelectorAll('button').forEach(b => b.addEventListener('click', () => {
    filterTag = filterTag === b.dataset.tag ? null : b.dataset.tag;
    renderTags(root); renderList(root);
  }));
}

function renderList(root) {
  const wrap = root.querySelector('#lib-list');
  const notes = visibleNotes();
  if (!notes.length) {
    wrap.innerHTML = `<div class="empty-hint">No notes match.<br/>${filterTag ? 'Clear the tag filter or ' : ''}try a different search.</div>`;
    return;
  }
  wrap.innerHTML = notes.map(n => `
    <button class="note-item ${n.id === state.selectedNoteId ? 'selected' : ''}" data-id="${escapeHtml(n.id)}" role="listitem">
      <span class="note-item-title">${escapeHtml(n.title)}</span>
      <span class="note-item-snippet">${escapeHtml(stripMarkdown(n.content).slice(0, 90))}</span>
      <span class="note-item-meta">${(n.tags || []).slice(0, 3).map(t => `<span class="minitag">${escapeHtml(t)}</span>`).join('')}<span class="mono dim">${escapeHtml(n.id)}</span></span>
    </button>
  `).join('');
  wrap.querySelectorAll('.note-item').forEach(b => b.addEventListener('click', () => {
    state.selectedNoteId = b.dataset.id;
    editing = false;
    highlightChunkId = null;
    renderList(root); renderMain(root); renderRail(root);
  }));
}

function renderMain(root) {
  const main = root.querySelector('#lib-main');
  const note = noteById(state.selectedNoteId);
  if (!note) {
    main.innerHTML = `<div class="empty-state">
      <div class="empty-state-art">📝</div>
      <h2>No note selected</h2>
      <p>Pick a note from the list, or create one. Notes live only in this browser.</p>
    </div>`;
    return;
  }
  if (editing) return renderEditor(main, root, note);

  const chunks = state.chunksByNote.get(note.id) || [];
  const cited = highlightChunkId ? chunks.find(c => c.chunkId === highlightChunkId) : null;
  main.innerHTML = `
    <div class="reader">
      <div class="reader-toolbar">
        <span class="mono dim">${escapeHtml(note.id)} · ${chunks.length} chunk${chunks.length === 1 ? '' : 's'}${note.source ? ' · imported' : ''}</span>
        <span class="reader-actions">
          <button class="btn btn-ghost btn-sm" id="reader-edit">Edit</button>
          <button class="btn btn-ghost btn-sm" id="reader-delete" aria-label="Delete note">Delete</button>
        </span>
      </div>
      ${cited ? `
        <div class="cited-chunk" id="cited-chunk">
          <div class="cited-chunk-head mono">cited chunk [${escapeHtml(cited.chunkId)}] · ${escapeHtml(cited.headingPath)}</div>
          <div class="cited-chunk-body">${renderMarkdown(cited.text)}</div>
        </div>` : ''}
      <article class="prose">${renderMarkdown(note.content)}</article>
      ${note.source ? `<div class="reader-source mono">source: ${escapeHtml(note.source)}</div>` : ''}
    </div>
  `;
  main.querySelector('#reader-edit').addEventListener('click', () => { editing = true; renderMain(root); });
  main.querySelector('#reader-delete').addEventListener('click', () => confirmDelete(root, note));
  const citedEl = main.querySelector('#cited-chunk');
  if (citedEl) {
    citedEl.scrollIntoView({ block: 'start', behavior: 'auto' });
    setTimeout(() => citedEl.classList.add('cited-chunk-fade'), 1600);
  }
}

function renderEditor(main, root, note) {
  const isNew = !note.id;
  main.innerHTML = `
    <div class="editor">
      <div class="reader-toolbar">
        <span class="mono dim">${isNew ? 'new note' : escapeHtml(note.id)} · markdown</span>
        <span class="reader-actions">
          <button class="btn btn-ghost btn-sm" id="ed-cancel">Cancel</button>
          <button class="btn btn-primary btn-sm" id="ed-save">Save</button>
        </span>
      </div>
      <input id="ed-title" class="input input-title" placeholder="Title…" value="${escapeHtml(note.title || '')}" aria-label="Note title" />
      <input id="ed-tags" class="input mono" placeholder="tags, comma separated" value="${escapeHtml((note.tags || []).join(', '))}" aria-label="Tags" />
      <textarea id="ed-content" class="input editor-textarea" placeholder="Write in markdown. # headings become chunk boundaries." aria-label="Note content">${escapeHtml(note.content || '')}</textarea>
      <div class="editor-hint dim">Saving re-chunks the note locally. Headings shape chunk boundaries — the chunk map updates on the right.</div>
    </div>
  `;
  main.querySelector('#ed-cancel').addEventListener('click', () => {
    editing = false;
    if (isNew) state.selectedNoteId = state.notes[0]?.id ?? null;
    renderMain(root); renderRail(root); renderList(root);
  });
  main.querySelector('#ed-save').addEventListener('click', () => {
    const title = main.querySelector('#ed-title').value.trim();
    const content = main.querySelector('#ed-content').value.trim();
    const tags = main.querySelector('#ed-tags').value.split(',').map(s => s.trim()).filter(Boolean);
    if (!title || !content) { toast('Title and content are both required.', { kind: 'warn' }); return; }
    editing = false;
    if (isNew) {
      const created = createNote({ title, tags, content });
      state.selectedNoteId = created.id;
      toast('Note created — it joins the graph and the retrieval index.', { kind: 'success' });
    } else {
      upsertNote({ ...note, title, tags, content });
      toast('Note saved and re-chunked.', { kind: 'success' });
    }
  });
}

function startNewNote(root) {
  state.selectedNoteId = null;
  editing = true;
  const main = root.querySelector('#lib-main');
  renderEditor(main, root, { title: '', tags: [], content: '' });
}

function confirmDelete(root, note) {
  const body = el('div', {}, `<p class="dim" style="margin-bottom:12px">Delete <strong>${escapeHtml(note.title)}</strong>? This only affects this browser. There is no undo.</p>`);
  const foot = el('div', { class: 'btn-row' });
  const cancel = el('button', { class: 'btn btn-ghost' }, 'Cancel');
  const ok = el('button', { class: 'btn btn-danger' }, 'Delete note');
  foot.append(cancel, ok);
  const m = openModal({ title: 'Delete note', kicker: 'Library', body, footer: foot });
  cancel.addEventListener('click', m.close);
  ok.addEventListener('click', () => { m.close(); deleteNote(note.id); toast('Note deleted.', { kind: 'info' }); });
}

function renderRail(root) {
  const rail = root.querySelector('#lib-rail');
  const note = noteById(state.selectedNoteId);
  if (!note) { rail.innerHTML = ''; return; }
  const chunks = state.chunksByNote.get(note.id) || [];

  // Connections: shared tags always; semantic neighbors when index is warm.
  const tagNeighbors = state.notes
    .filter(n => n.id !== note.id)
    .map(n => ({ n, shared: (n.tags || []).filter(t => (note.tags || []).includes(t)) }))
    .filter(x => x.shared.length > 0)
    .sort((a, b) => b.shared.length - a.shared.length)
    .slice(0, 5);

  let semanticNeighbors = [];
  const myVec = embedder.status === 'ready' ? embedder.noteVec(note.id) : null;
  if (myVec) {
    semanticNeighbors = state.notes
      .filter(n => n.id !== note.id)
      .map(n => ({ n, sim: cosine(myVec, embedder.noteVec(n.id) || new Float32Array(myVec.length)) }))
      .filter(x => x.sim > 0.3)
      .sort((a, b) => b.sim - a.sim)
      .slice(0, 5);
  }

  rail.innerHTML = `
    <section class="rail-section">
      <h3 class="rail-title">Connections</h3>
      ${tagNeighbors.length ? tagNeighbors.map(({ n, shared }) => `
        <button class="rail-link" data-id="${escapeHtml(n.id)}">
          <span>${escapeHtml(n.title)}</span>
          <span class="mono dim">${shared.length} tag${shared.length > 1 ? 's' : ''}</span>
        </button>`).join('') : '<div class="dim rail-empty">No shared tags yet.</div>'}
    </section>
    <section class="rail-section">
      <h3 class="rail-title">Semantic neighbors</h3>
      ${embedder.status === 'ready'
        ? (semanticNeighbors.length
            ? semanticNeighbors.map(({ n, sim }) => `
              <button class="rail-link" data-id="${escapeHtml(n.id)}">
                <span>${escapeHtml(n.title)}</span>
                <span class="mono dim">${sim.toFixed(2)}</span>
              </button>`).join('')
            : '<div class="dim rail-empty">No close neighbors above 0.30 cosine.</div>')
        : `<div class="dim rail-empty">Loads after the local model is ready — meaning-based links computed from chunk embeddings, in this browser.</div>`}
    </section>
    <section class="rail-section">
      <h3 class="rail-title">Chunk map <span class="dim mono">(${chunks.length})</span></h3>
      <p class="rail-hint dim">How retrieval sees this note. Citations like [${escapeHtml(note.id)}.1] point at these.</p>
      ${chunks.map(c => `
        <button class="rail-chunk ${c.chunkId === highlightChunkId ? 'rail-chunk-active' : ''}" data-chunk="${escapeHtml(c.chunkId)}">
          <span class="mono">[${escapeHtml(c.chunkId)}]</span>
          <span class="dim">${escapeHtml(c.headingPath)}</span>
          <span class="mono dim">${c.text.length} chars</span>
        </button>`).join('')}
    </section>
  `;
  rail.querySelectorAll('.rail-link').forEach(b => b.addEventListener('click', () => {
    state.selectedNoteId = b.dataset.id;
    highlightChunkId = null; editing = false;
    renderList(root); renderMain(root); renderRail(root);
  }));
  rail.querySelectorAll('.rail-chunk').forEach(b => b.addEventListener('click', () => {
    highlightChunkId = b.dataset.chunk;
    renderMain(root); renderRail(root);
  }));
}

// Used by other views (citations, graph) to open a note at a chunk.
export function openNote(noteId, chunkId = null) {
  state.selectedNoteId = noteId;
  navigate(chunkId ? `#/library/${noteId}/${chunkId}` : `#/library/${noteId}`);
}
