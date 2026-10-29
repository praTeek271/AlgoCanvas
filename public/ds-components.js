/*
 * AlgoCanvas data-structure components.
 * One renderer per structure type; every panel shares the same highlight words.
 *   DSViz.render(structureState) -> HTML string   (structureState.type === 'COMPOSITE')
 *   DSViz.legend(structureState) -> HTML string
 */
(function (root) {
  'use strict';
  const HIGHLIGHTS = { current: 'Current item', active: 'Active / in use', visited: 'Visited', done: 'Finished / settled', found: 'Match / success', mismatch: 'Mismatch / error', inserted: 'Newly added', muted: 'Ignored' };
  const esc = (value) => String(value === null || value === undefined ? '' : value).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' }[c]));
  const hl = (mark) => (mark && HIGHLIGHTS[mark] ? ` ds-hl-${mark}` : '');
  const show = (value) => (value === ' ' ? '·' : esc(value));
  const entries = (object) => Object.entries(object || {});

  /* ---------- ARRAY / STRING ---------- */
  function cells(panel) {
    const values = panel.values !== undefined ? panel.values : Array.from(panel.text || '');
    const pointersAt = {};
    entries(panel.pointers).forEach(([name, index]) => { if (Number.isInteger(index) && index >= 0 && index < values.length) (pointersAt[index] = pointersAt[index] || []).push(name); });
    const range = Array.isArray(panel.range) ? panel.range : null;
    const body = values.map((value, index) => {
      const inRange = range && index >= range[0] && index <= range[1];
      return `<div class="ds-cell-wrap"><div class="ds-ptrs">${(pointersAt[index] || []).map(esc).join(' · ')}</div><div class="ds-cell${hl((panel.marks || {})[index])}${inRange ? ' ds-in-range' : ''}"><b>${show(value)}</b></div><div class="ds-index">${index}</div></div>`;
    }).join('');
    return `<div class="ds-cells">${body || '<em class="ds-empty">empty</em>'}</div>`;
  }

  /* ---------- STACK / QUEUE ---------- */
  const itemOf = (item) => (item !== null && typeof item === 'object' ? item : { value: item });
  function stack(panel) {
    const items = (panel.items || []).map(itemOf);
    const body = items.slice().reverse().map((item, i) => `<div class="ds-stack-item${hl(item.mark)}${i === 0 ? ' ds-top' : ''}"><b>${show(item.value)}</b>${i === 0 ? '<span class="ds-tag">top</span>' : ''}</div>`).join('');
    return `<div class="ds-stack">${body || '<em class="ds-empty">empty</em>'}<div class="ds-stack-base"></div></div>`;
  }
  function queue(panel) {
    const items = (panel.items || []).map(itemOf);
    const body = items.map((item, i) => `<div class="ds-queue-item${hl(item.mark)}"><b>${show(item.value)}</b><span class="ds-tag">${i === 0 ? 'front' : ''}${i === 0 && i === items.length - 1 ? ' · ' : ''}${i === items.length - 1 ? 'back' : ''}</span></div>`).join('');
    return `<div class="ds-queue"><span class="ds-end">OUT ◂</span>${body || '<em class="ds-empty">empty</em>'}<span class="ds-end">◂ IN</span></div>`;
  }

  /* ---------- LINKED LIST ---------- */
  function linkedList(panel) {
    const nodes = panel.nodes || []; const at = {};
    entries(panel.pointers).forEach(([name, id]) => { if (id !== null && id !== undefined) (at[id] = at[id] || []).push(name); });
    if (panel.head !== null && panel.head !== undefined) (at[panel.head] = at[panel.head] || []).unshift('head');
    const body = nodes.map((node, i) => {
      const following = nodes[i + 1] ? nodes[i + 1].id : null;
      let link;
      if (node.next === null || node.next === undefined) link = '<span class="ds-null">null</span>';
      else if (node.next === following) link = `<span class="ds-arrow">${panel.doubly ? '⇄' : '→'}</span>`;
      else link = `<span class="ds-jump">→ ${esc(node.next)}</span>`;
      return `<div class="ds-ll-group"><div class="ds-ptrs">${(at[node.id] || []).map(esc).join(' · ')}</div><div class="ds-ll-row"><div class="ds-node${hl(node.mark)}"><b>${show(node.value)}</b></div>${link}</div></div>`;
    }).join('');
    return `<div class="ds-ll">${body || '<em class="ds-empty">empty list</em>'}</div>`;
  }

  /* ---------- shared SVG tree layout (TREE + HEAP) ---------- */
  function layoutTree(nodes, rootId) {
    const byId = new Map(nodes.map((n) => [n.id, n])); const pos = new Map(); const seen = new Set();
    const binary = nodes.some((n) => 'left' in n || 'right' in n); let slot = 0; let maxDepth = 0;
    const kids = (n) => (n.children ? n.children : [n.left, n.right]).filter((id) => id !== null && id !== undefined && byId.has(id));
    function place(id, depth) {
      if (seen.has(id) || !byId.has(id)) return null; seen.add(id); maxDepth = Math.max(maxDepth, depth);
      const node = byId.get(id);
      if (binary) {
        if (node.left !== null && node.left !== undefined) place(node.left, depth + 1);
        const x = slot++; pos.set(id, { x, depth }); if (node.right !== null && node.right !== undefined) place(node.right, depth + 1); return x;
      }
      const children = kids(node).map((c) => place(c, depth + 1)).filter((x) => x !== null);
      const x = children.length ? (children[0] + children[children.length - 1]) / 2 : slot++;
      pos.set(id, { x, depth }); return x;
    }
    const start = rootId !== undefined && rootId !== null ? rootId : (nodes[0] ? nodes[0].id : null);
    if (start !== null) place(start, 0);
    return { byId, pos, maxDepth, slots: Math.max(slot, 1), kids };
  }
  function treeSvg(nodes, rootId, pointers, label) {
    if (!nodes.length) return '<em class="ds-empty">empty tree</em>';
    const { byId, pos, maxDepth, kids } = layoutTree(nodes, rootId);
    const px = (p) => 44 + p.x * 80; const py = (p) => 34 + p.depth * 80;
    const width = Math.max(240, 88 + (Math.max(...[...pos.values()].map((p) => p.x), 0)) * 80); const height = 68 + maxDepth * 80;
    const at = {}; entries(pointers).forEach(([name, id]) => { if (id !== null && id !== undefined) (at[id] = at[id] || []).push(name); });
    const edges = [...pos.keys()].flatMap((id) => kids(byId.get(id)).filter((c) => pos.has(c)).map((c) => `<line class="ds-edge" x1="${px(pos.get(id))}" y1="${py(pos.get(id)) + 20}" x2="${px(pos.get(c))}" y2="${py(pos.get(c)) - 20}"/>`)).join('');
    const circles = [...pos.entries()].map(([id, p]) => { const n = byId.get(id); return `<g class="ds-svg-node${hl(n.mark)}" transform="translate(${px(p)} ${py(p)})"><circle r="20"/><text class="ds-svg-text" text-anchor="middle" dy="5">${esc(n.value)}</text>${at[id] ? `<text class="ds-svg-ptr" text-anchor="middle" y="-26">${esc(at[id].join(' · '))}</text>` : ''}</g>`; }).join('');
    return `<div class="ds-svg-wrap"><svg class="ds-svg" viewBox="0 0 ${width} ${height + 12}" role="img" aria-label="${esc(label)}"><g transform="translate(0 10)">${edges}${circles}</g></svg></div>`;
  }
  const tree = (panel) => treeSvg(panel.nodes || [], panel.root, panel.pointers, 'tree');
  function heap(panel) {
    const values = panel.values || []; const marks = panel.marks || {};
    const nodes = values.map((value, i) => ({ id: i, value, left: 2 * i + 1 < values.length ? 2 * i + 1 : null, right: 2 * i + 2 < values.length ? 2 * i + 2 : null, mark: marks[i] }));
    const array = values.map((value, index) => `<div class="ds-cell-wrap"><div class="ds-cell${hl(marks[index])}"><b>${show(value)}</b></div><div class="ds-index">${index}</div></div>`).join('');
    return `<div class="ds-heap"><span class="ds-tag">${esc(panel.kind || 'min')}-heap</span>${treeSvg(nodes, 0, {}, 'heap tree')}<div class="ds-cells">${array}</div></div>`;
  }

  /* ---------- GRAPH ---------- */
  function graph(panel) {
    const nodes = panel.nodes || []; const n = nodes.length; if (!n) return '<em class="ds-empty">empty graph</em>';
    const W = 420; const H = 280; const R = 20; const place = new Map();
    nodes.forEach((node, i) => {
      if (Number.isFinite(node.x) && Number.isFinite(node.y)) place.set(node.id, { x: 30 + (node.x / 100) * (W - 60), y: 30 + (node.y / 100) * (H - 60) });
      else { const angle = (i / n) * Math.PI * 2 - Math.PI / 2; place.set(node.id, { x: W / 2 + Math.cos(angle) * Math.min(W, H) * (n === 1 ? 0 : 0.36), y: H / 2 + Math.sin(angle) * Math.min(W, H) * (n === 1 ? 0 : 0.36) }); }
    });
    const edges = (panel.edges || []).map((edge) => {
      const a = place.get(edge.from); const b = place.get(edge.to); if (!a || !b) return '';
      const cls = `ds-gedge${hl(edge.mark)}`;
      if (edge.from === edge.to) return `<path class="${cls}" d="M ${a.x - 8} ${a.y - R} c -22 -34 30 -34 16 0" fill="none"/>`;
      const dx = b.x - a.x; const dy = b.y - a.y; const len = Math.hypot(dx, dy) || 1; const ux = dx / len; const uy = dy / len;
      const x1 = a.x + ux * R; const y1 = a.y + uy * R; const x2 = b.x - ux * (R + (panel.directed ? 3 : 0)); const y2 = b.y - uy * (R + (panel.directed ? 3 : 0));
      const arrow = panel.directed ? `<polygon class="ds-garrow${hl(edge.mark)}" points="${x2},${y2} ${x2 - ux * 9 - uy * 5},${y2 - uy * 9 + ux * 5} ${x2 - ux * 9 + uy * 5},${y2 - uy * 9 - ux * 5}"/>` : '';
      const weight = edge.weight !== undefined && edge.weight !== null ? `<text class="ds-gweight" x="${(a.x + b.x) / 2}" y="${(a.y + b.y) / 2 - 5}" text-anchor="middle">${esc(edge.weight)}</text>` : '';
      return `<line class="${cls}" x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}"/>${arrow}${weight}`;
    }).join('');
    const circles = nodes.map((node) => { const p = place.get(node.id); return `<g class="ds-svg-node${hl(node.mark)}" transform="translate(${p.x} ${p.y})"><circle r="${R}"/><text class="ds-svg-text" text-anchor="middle" dy="5">${esc(node.label !== undefined ? node.label : node.id)}</text></g>`; }).join('');
    return `<div class="ds-svg-wrap"><svg class="ds-svg" viewBox="0 0 ${W} ${H}" role="img" aria-label="graph">${edges}${circles}</svg></div>`;
  }

  /* ---------- HASHMAP ---------- */
  function hashmap(panel) {
    const rows = (panel.entries || []).map((e) => `<tr class="ds-row${hl(e.mark)}"><td>${show(e.key)}</td><td>${show(e.value)}</td></tr>`).join('');
    return `<table class="ds-map"><thead><tr><th>key</th><th>value</th></tr></thead><tbody>${rows || '<tr><td colspan="2" class="ds-empty">empty</td></tr>'}</tbody></table>`;
  }

  const RENDERERS = { ARRAY: cells, STRING: cells, STACK: stack, QUEUE: queue, LINKED_LIST: linkedList, TREE: tree, GRAPH: graph, HASHMAP: hashmap, HEAP: heap };
  const TITLES = { ARRAY: 'Array', STRING: 'String', STACK: 'Stack', QUEUE: 'Queue', LINKED_LIST: 'Linked list', TREE: 'Tree', GRAPH: 'Graph', HASHMAP: 'Hash map', HEAP: 'Heap' };

  function panelMarkup(panel) {
    const draw = RENDERERS[panel && panel.type];
    const title = esc(panel && panel.title !== undefined ? panel.title : (panel && panel.id) || '');
    const body = draw ? draw(panel) : `<em class="ds-empty">No renderer for “${esc(panel && panel.type)}”.</em>`;
    return `<section class="ds-panel ds-panel-${esc(String(panel && panel.type).toLowerCase())}"><header class="ds-panel-title"><b>${title}</b>${String(title).toLowerCase() === String(TITLES[panel && panel.type] || '').toLowerCase().replace(' ', '_') || String(title).toLowerCase() === String(panel && panel.type).toLowerCase() ? '' : `<span>${esc(TITLES[panel && panel.type] || '')}</span>`}</header>${body}</section>`;
  }
  function render(state) {
    const panels = (state && state.panels) || [];
    return `<div class="ds-composite ds-layout-${state && state.layout === 'row' ? 'row' : 'column'}">${panels.map(panelMarkup).join('')}</div>`;
  }
  function marksOf(panel) {
    const found = [];
    const add = (m) => { if (m && HIGHLIGHTS[m]) found.push(m); };
    Object.values(panel.marks || {}).forEach(add);
    [panel.items, panel.nodes, panel.entries, panel.edges].forEach((list) => (list || []).forEach((item) => item && add(item.mark)));
    return found;
  }
  function legend(state) {
    const used = new Set(); ((state && state.panels) || []).forEach((p) => marksOf(p).forEach((m) => used.add(m)));
    return Object.keys(HIGHLIGHTS).filter((m) => used.has(m)).map((m) => `<span class="legend-item"><i class="ds-swatch ds-hl-${m}"></i>${HIGHLIGHTS[m]}</span>`).join('');
  }

  const api = { render, legend, panelMarkup, HIGHLIGHTS, types: Object.keys(RENDERERS) };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.DSViz = api;
})(typeof window !== 'undefined' ? window : this);
