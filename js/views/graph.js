// views/graph.js — D3 force-directed map of the workspace.
// Nodes are notes (never chunks). Edges: shared tags, or semantic similarity
// between note vectors (mean of chunk embeddings) when the local model is ready.

import { state, on, embedder } from '../store.js';
import { cosine, stripMarkdown } from '../pipeline.js';
import { escapeHtml, toast } from '../ui.js';
import { openNote } from './library.js';

let edgeMode = 'tags'; // 'tags' | 'semantic'
let sim = null;
let unsubs = [];

const PALETTE = ['#ffd166', '#7dd3fc', '#c4b5fd', '#f0abfc', '#86efac', '#fca5a5', '#fdba74', '#67e8f9'];
function tagColor(tag) {
  let h = 0;
  for (const ch of tag || '') h = (h * 31 + ch.charCodeAt(0)) | 0;
  return PALETTE[Math.abs(h) % PALETTE.length];
}
const nodeColor = (n) => tagColor((n.tags || [])[0] || n.title);

export function render(root) {
  root.innerHTML = `
    <div class="graph-wrap">
      <div class="graph-overlay graph-overlay-tl">
        <div class="kicker">Workspace map</div>
        <div id="graph-stats" class="dim"></div>
      </div>
      <div class="graph-overlay graph-overlay-tr">
        <div class="seg" role="tablist" aria-label="Edge mode">
          <button id="gm-tags" role="tab" class="seg-btn ${edgeMode === 'tags' ? 'seg-active' : ''}">Tag links</button>
          <button id="gm-sem" role="tab" class="seg-btn ${edgeMode === 'semantic' ? 'seg-active' : ''}">Semantic links</button>
        </div>
        <button id="graph-list-toggle" class="btn btn-ghost btn-sm" aria-pressed="false" title="Accessible list of nodes and edges">List view</button>
      </div>
      <div class="graph-overlay graph-overlay-br dim mono">drag · scroll to zoom · click a node to open</div>
      <svg id="graph-svg" role="application" aria-label="Knowledge graph. Use list view for a screen-reader friendly alternative."></svg>
      <div id="graph-list" class="graph-list" hidden></div>
      <div id="graph-hover" class="hover-card" hidden></div>
      <div class="graph-mobile-note">The graph needs a wider screen — use Library and Ask here, or rotate your device.</div>
    </div>
  `;
  root.querySelector('#gm-tags').addEventListener('click', () => setMode(root, 'tags'));
  root.querySelector('#gm-sem').addEventListener('click', () => setMode(root, 'semantic'));
  root.querySelector('#graph-list-toggle').addEventListener('click', (e) => {
    const list = root.querySelector('#graph-list');
    const show = list.hidden;
    list.hidden = !show;
    e.currentTarget.setAttribute('aria-pressed', String(show));
  });

  draw(root);
  unsubs.forEach(u => u());
  unsubs = [
    on('notes', () => document.body.contains(root.firstElementChild) && draw(root)),
    on('embedder', () => {
      if (edgeMode === 'semantic' && embedder.status === 'ready' && document.body.contains(root.firstElementChild)) draw(root);
    }),
  ];
}

function setMode(root, mode) {
  edgeMode = mode;
  root.querySelector('#gm-tags').classList.toggle('seg-active', mode === 'tags');
  root.querySelector('#gm-sem').classList.toggle('seg-active', mode === 'semantic');
  if (mode === 'semantic' && embedder.status !== 'ready') {
    toast('Loading the local embedding model (~22 MB, cached after first load)…', { kind: 'info' });
    embedder.ensureIndex().then(() => draw(root)).catch(() =>
      toast('Local model failed to load — semantic links unavailable, tag links still work.', { kind: 'error' }));
  }
  draw(root);
}

function buildEdges(nodes) {
  const edges = [];
  if (edgeMode === 'semantic' && embedder.status === 'ready') {
    const vecs = new Map(nodes.map(n => [n.id, embedder.noteVec(n.id)]));
    for (let i = 0; i < nodes.length; i++) {
      const sims = [];
      for (let j = 0; j < nodes.length; j++) {
        if (i === j) continue;
        const a = vecs.get(nodes[i].id), b = vecs.get(nodes[j].id);
        if (!a || !b) continue;
        const s = cosine(a, b);
        if (s > 0.3) sims.push({ j, s });
      }
      sims.sort((a, b) => b.s - a.s).slice(0, 3).forEach(({ j, s }) => {
        if (i < j) edges.push({ source: nodes[i].id, target: nodes[j].id, weight: s, label: `cosine ${s.toFixed(2)}` });
      });
    }
    return edges;
  }
  for (let i = 0; i < nodes.length; i++) {
    const a = new Set(nodes[i].tags || []);
    for (let j = i + 1; j < nodes.length; j++) {
      const shared = (nodes[j].tags || []).filter(t => a.has(t));
      if (shared.length) edges.push({ source: nodes[i].id, target: nodes[j].id, weight: shared.length / 3, label: shared.join(', ') });
    }
  }
  return edges;
}

function draw(root) {
  const d3 = window.d3;
  const svgEl = root.querySelector('#graph-svg');
  if (!d3 || !svgEl) return;
  const nodes = state.notes.map(n => ({ ...n }));
  const edges = buildEdges(state.notes);

  root.querySelector('#graph-stats').textContent =
    `${nodes.length} notes · ${edges.length} ${edgeMode === 'semantic' ? 'semantic' : 'tag'} links · ${state.chunks.length} chunks indexed`;

  renderListAlternative(root, nodes, edges);

  sim?.stop();
  const svg = d3.select(svgEl);
  svg.selectAll('*').remove();
  const { width, height } = svgEl.getBoundingClientRect();
  const g = svg.append('g');

  svg.call(d3.zoom().scaleExtent([0.4, 3]).on('zoom', (e) => g.attr('transform', e.transform)));

  const link = g.append('g').selectAll('line').data(edges).join('line')
    .attr('class', 'graph-link')
    .attr('stroke-width', d => 0.8 + d.weight * 1.6);

  const node = g.append('g').selectAll('g').data(nodes).join('g').attr('class', 'graph-node');

  const degree = new Map();
  edges.forEach(e => {
    degree.set(e.source, (degree.get(e.source) || 0) + 1);
    degree.set(e.target, (degree.get(e.target) || 0) + 1);
  });

  node.append('circle')
    .attr('r', d => 9 + Math.min(8, (degree.get(d.id) || 0) * 1.1))
    .attr('fill', d => nodeColor(d) + '33')
    .attr('stroke', d => nodeColor(d))
    .attr('stroke-width', 1.6);

  node.append('text')
    .attr('class', 'graph-label')
    .attr('dy', d => 22 + Math.min(8, (degree.get(d.id) || 0) * 1.1))
    .attr('text-anchor', 'middle')
    .text(d => d.title.length > 26 ? d.title.slice(0, 24) + '…' : d.title);

  const hover = root.querySelector('#graph-hover');
  node
    .on('mouseenter', function (event, d) {
      hover.hidden = false;
      hover.innerHTML = `
        <div class="hover-title">${escapeHtml(d.title)}</div>
        <div class="hover-tags">${(d.tags || []).map(t => `<span class="minitag" style="color:${tagColor(t)}">${escapeHtml(t)}</span>`).join('')}</div>
        <div class="hover-snippet dim">${escapeHtml(stripMarkdown(d.content).slice(0, 140))}…</div>
        <div class="hover-cta mono">click to open</div>`;
      d3.select(this).select('circle').attr('stroke-width', 3);
      link.classed('graph-link-hot', l => l.source.id === d.id || l.target.id === d.id);
    })
    .on('mousemove', (event) => {
      const r = root.querySelector('.graph-wrap').getBoundingClientRect();
      hover.style.left = Math.min(event.clientX - r.left + 14, r.width - 280) + 'px';
      hover.style.top = Math.min(event.clientY - r.top + 10, r.height - 160) + 'px';
    })
    .on('mouseleave', function () {
      hover.hidden = true;
      d3.select(this).select('circle').attr('stroke-width', 1.6);
      link.classed('graph-link-hot', false);
    })
    .on('click', (event, d) => openNote(d.id));

  node.call(d3.drag()
    .on('start', (e, d) => { if (!e.active) sim.alphaTarget(0.25).restart(); d.fx = d.x; d.fy = d.y; })
    .on('drag', (e, d) => { d.fx = e.x; d.fy = e.y; })
    .on('end', (e, d) => { if (!e.active) sim.alphaTarget(0); d.fx = null; d.fy = null; }));

  sim = d3.forceSimulation(nodes)
    .force('link', d3.forceLink(edges).id(d => d.id).distance(d => 130 - d.weight * 30).strength(d => 0.2 + d.weight * 0.3))
    .force('charge', d3.forceManyBody().strength(-320))
    .force('center', d3.forceCenter(width / 2, height / 2))
    .force('collide', d3.forceCollide(34));

  const tick = () => {
    link.attr('x1', d => d.source.x).attr('y1', d => d.source.y)
      .attr('x2', d => d.target.x).attr('y2', d => d.target.y);
    node.attr('transform', d => `translate(${d.x},${d.y})`);
  };

  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
    sim.stop();
    for (let i = 0; i < 200; i++) sim.tick(); // settle statically, no animation
    tick();
  } else {
    // pre-settle so the first painted frame is already composed
    for (let i = 0; i < 80; i++) sim.tick();
    tick();
    sim.on('tick', tick);
  }
}

// Screen-reader / keyboard alternative to the canvas.
function renderListAlternative(root, nodes, edges) {
  const list = root.querySelector('#graph-list');
  list.innerHTML = `
    <h3 class="rail-title">Notes (${nodes.length})</h3>
    ${nodes.map(n => {
      const linked = edges
        .filter(e => (e.source.id ?? e.source) === n.id || (e.target.id ?? e.target) === n.id)
        .map(e => {
          const otherId = (e.source.id ?? e.source) === n.id ? (e.target.id ?? e.target) : (e.source.id ?? e.source);
          return nodes.find(x => x.id === otherId)?.title;
        }).filter(Boolean);
      return `<div class="graph-list-row">
        <button class="rail-link" data-id="${escapeHtml(n.id)}"><span>${escapeHtml(n.title)}</span><span class="mono dim">${linked.length} links</span></button>
        ${linked.length ? `<div class="dim graph-list-links">linked: ${linked.map(escapeHtml).join(' · ')}</div>` : ''}
      </div>`;
    }).join('')}
  `;
  list.querySelectorAll('button[data-id]').forEach(b => b.addEventListener('click', () => openNote(b.dataset.id)));
}
