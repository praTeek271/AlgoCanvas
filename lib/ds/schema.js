'use strict';
/*
 * Shared vocabulary + shape rules for every data-structure panel.
 * The browser renderer (public/ds-components.js) draws exactly these shapes.
 */
const HIGHLIGHTS = {
  current: 'Current item',
  active: 'Active / in use',
  visited: 'Visited',
  done: 'Finished / settled',
  found: 'Match / success',
  mismatch: 'Mismatch / error',
  inserted: 'Newly added',
  muted: 'Ignored'
};
const HL = new Set(Object.keys(HIGHLIGHTS));
const isObj = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
const isIdx = (v) => Number.isInteger(v) && v >= 0;

function mark(value, where, errors) {
  if (value !== undefined && value !== null && !HL.has(value)) errors.push(`${where}: unknown highlight “${value}” (use one of ${[...HL].join(', ')})`);
}
function indexMap(map, where, errors, isMark) {
  if (map === undefined) return;
  if (!isObj(map)) return errors.push(`${where} must be an object`);
  for (const [key, value] of Object.entries(map)) {
    if (isMark) { mark(value, `${where}.${key}`, errors); continue; }
    if (value !== null && !isIdx(value)) errors.push(`${where}.${key} must be an index or null`);
  }
}
function idSet(nodes, where, errors) {
  const ids = new Set();
  if (!Array.isArray(nodes)) { errors.push(`${where} must be an array`); return ids; }
  nodes.forEach((node, i) => {
    if (!isObj(node) || node.id === undefined || node.id === null) return errors.push(`${where}[${i}] needs an id`);
    if (ids.has(node.id)) errors.push(`${where}[${i}] repeats id “${node.id}”`);
    ids.add(node.id); mark(node.mark, `${where}[${i}].mark`, errors);
  });
  return ids;
}
function ref(value, ids, where, errors) {
  if (value !== undefined && value !== null && !ids.has(value)) errors.push(`${where} points to unknown id “${value}”`);
}

function cellsValidator(panel, w, errors) {
  const list = panel.values !== undefined ? panel.values : (typeof panel.text === 'string' ? Array.from(panel.text) : undefined);
  if (!Array.isArray(list)) errors.push(`${w}: give "values" (array)${panel.type === 'STRING' ? ' or "text" (string)' : ''}`);
  indexMap(panel.pointers, `${w}.pointers`, errors, false);
  indexMap(panel.marks, `${w}.marks`, errors, true);
  if (panel.range !== undefined && !(Array.isArray(panel.range) && panel.range.length === 2)) errors.push(`${w}.range must be [left, right]`);
}
function itemsValidator(panel, w, errors) {
  if (!Array.isArray(panel.items)) return errors.push(`${w}: "items" must be an array`);
  panel.items.forEach((item, i) => { if (isObj(item)) mark(item.mark, `${w}.items[${i}].mark`, errors); });
}

const STRUCTURES = {
  ARRAY: {
    description: 'A row of indexed cells. Pointers sit above a cell; marks colour cells.',
    fields: { values: 'array of numbers/strings', pointers: '{ name: index | null }', marks: '{ index: highlight }', range: '[left, right] optional window' },
    validate: cellsValidator,
    example: { values: [4, 1, 3, 7], pointers: { i: 1, j: 2 }, marks: { 1: 'current', 2: 'active' }, range: [1, 2] }
  },
  STRING: {
    description: 'Same as ARRAY but each cell is one character. Give "text" or "values".',
    fields: { text: 'string (or values: array of characters)', pointers: '{ name: index | null }', marks: '{ index: highlight }' },
    validate: cellsValidator,
    example: { text: 'abca', pointers: { L: 0, R: 3 }, marks: { 0: 'current', 3: 'active' } }
  },
  STACK: {
    description: 'Vertical box. The LAST item is the top.',
    fields: { items: 'array of value or { value, mark }' },
    validate: itemsValidator,
    example: { items: ['(', '[', { value: '{', mark: 'active' }] }
  },
  QUEUE: {
    description: 'Horizontal line. FIRST item is the front, LAST is the back.',
    fields: { items: 'array of value or { value, mark }' },
    validate: itemsValidator,
    example: { items: [3, { value: 5, mark: 'current' }, 8] }
  },
  LINKED_LIST: {
    description: 'Nodes drawn in the order given, joined by their "next" id.',
    fields: { nodes: '[{ id, value, next: id | null, mark? }]', head: 'id | null', pointers: '{ name: nodeId | null }', doubly: 'boolean' },
    validate(panel, w, errors) {
      const ids = idSet(panel.nodes, `${w}.nodes`, errors);
      (panel.nodes || []).forEach((n, i) => ref(n?.next, ids, `${w}.nodes[${i}].next`, errors));
      ref(panel.head, ids, `${w}.head`, errors);
      Object.entries(panel.pointers || {}).forEach(([k, v]) => ref(v, ids, `${w}.pointers.${k}`, errors));
    },
    example: { nodes: [{ id: 'a', value: 1, next: 'b' }, { id: 'b', value: 2, next: 'c', mark: 'current' }, { id: 'c', value: 3, next: null }], head: 'a', pointers: { prev: 'a', curr: 'b' } }
  },
  TREE: {
    description: 'Binary tree (use left/right) or general tree (use children). First node is the root unless "root" is set.',
    fields: { nodes: '[{ id, value, left?, right?, children?, mark? }]', root: 'id (optional)', pointers: '{ name: nodeId | null }' },
    validate(panel, w, errors) {
      const ids = idSet(panel.nodes, `${w}.nodes`, errors);
      (panel.nodes || []).forEach((n, i) => {
        ref(n?.left, ids, `${w}.nodes[${i}].left`, errors); ref(n?.right, ids, `${w}.nodes[${i}].right`, errors);
        if (n?.children !== undefined) { if (!Array.isArray(n.children)) errors.push(`${w}.nodes[${i}].children must be an array`); else n.children.forEach((c) => ref(c, ids, `${w}.nodes[${i}].children`, errors)); }
      });
      ref(panel.root, ids, `${w}.root`, errors);
      Object.entries(panel.pointers || {}).forEach(([k, v]) => ref(v, ids, `${w}.pointers.${k}`, errors));
    },
    example: { nodes: [{ id: 1, value: 8, left: 2, right: 3 }, { id: 2, value: 3, mark: 'visited' }, { id: 3, value: 10, mark: 'current' }], pointers: { node: 3 } }
  },
  GRAPH: {
    description: 'Nodes and edges. Auto-laid out in a circle unless nodes carry x/y (0–100).',
    fields: { nodes: '[{ id, label?, mark?, x?, y? }]', edges: '[{ from, to, weight?, mark? }]', directed: 'boolean' },
    validate(panel, w, errors) {
      const ids = idSet(panel.nodes, `${w}.nodes`, errors);
      if (!Array.isArray(panel.edges)) return errors.push(`${w}.edges must be an array`);
      panel.edges.forEach((e, i) => {
        if (!ids.has(e?.from) || !ids.has(e?.to)) errors.push(`${w}.edges[${i}] needs "from" and "to" that match node ids`);
        mark(e?.mark, `${w}.edges[${i}].mark`, errors);
      });
    },
    example: { directed: false, nodes: [{ id: 'A', mark: 'visited' }, { id: 'B', mark: 'current' }, { id: 'C' }, { id: 'D' }], edges: [{ from: 'A', to: 'B', mark: 'done' }, { from: 'A', to: 'C' }, { from: 'B', to: 'D', weight: 4 }] }
  },
  HASHMAP: {
    description: 'A table of key/value rows.',
    fields: { entries: '[{ key, value, mark? }]' },
    validate(panel, w, errors) {
      if (!Array.isArray(panel.entries)) return errors.push(`${w}.entries must be an array`);
      panel.entries.forEach((e, i) => { if (!isObj(e) || !('key' in e)) errors.push(`${w}.entries[${i}] needs a key`); else mark(e.mark, `${w}.entries[${i}].mark`, errors); });
    },
    example: { entries: [{ key: 2, value: 0 }, { key: 7, value: 1, mark: 'found' }] }
  },
  HEAP: {
    description: 'Array stored as a heap: drawn as a tree and as the backing array.',
    fields: { values: 'array (index 0 is the root)', kind: '"min" | "max"', marks: '{ index: highlight }' },
    validate(panel, w, errors) {
      if (!Array.isArray(panel.values)) errors.push(`${w}.values must be an array`);
      if (panel.kind !== undefined && !['min', 'max'].includes(panel.kind)) errors.push(`${w}.kind must be "min" or "max"`);
      indexMap(panel.marks, `${w}.marks`, errors, true);
    },
    example: { kind: 'min', values: [1, 3, 2, 7, 4], marks: { 0: 'current', 1: 'active' } }
  }
};

function validatePanel(panel, where) {
  const errors = [];
  if (!isObj(panel)) return [`${where} must be an object`];
  if (typeof panel.id !== 'string' || !panel.id) errors.push(`${where}: "id" is required`);
  const spec = STRUCTURES[panel.type];
  if (!spec) { errors.push(`${where}: unknown type “${panel.type}” (use ${Object.keys(STRUCTURES).join(', ')})`); return errors; }
  spec.validate(panel, where, errors);
  return errors;
}

function validateTrace(trace) {
  const problems = [];
  const add = (frame, message) => problems.push({ frame, message });
  if (!isObj(trace) || !Array.isArray(trace.frames) || !trace.frames.length) { add(null, 'trace.frames must be a non-empty array'); return problems; }
  if (trace.totalSteps !== trace.frames.length) add(null, 'trace.totalSteps must equal frames.length');
  trace.frames.forEach((frame, index) => {
    if (!isObj(frame)) return add(index, 'frame must be an object');
    if (frame.step !== index) add(index, `frame.step must be ${index}`);
    if (typeof frame.action !== 'string' || !frame.action) add(index, 'frame.action is required');
    if (typeof frame.actionDescription !== 'string' || !frame.actionDescription) add(index, 'frame.actionDescription is required');
    const state = frame.structureState;
    if (!isObj(state) || state.type !== 'COMPOSITE' || !Array.isArray(state.panels) || !state.panels.length) return add(index, 'structureState must be { type: "COMPOSITE", panels: [...] }');
    const seen = new Set();
    state.panels.forEach((panel, p) => {
      if (panel?.id && seen.has(panel.id)) add(index, `panel id “${panel.id}” is used twice`);
      seen.add(panel?.id);
      validatePanel(panel, `panels[${p}]`).forEach((m) => add(index, m));
    });
  });
  return problems;
}

module.exports = { HIGHLIGHTS, STRUCTURES, validatePanel, validateTrace };
