/*
 * AlgoCanvas local development gateway.
 *
 * Safety note: this process deliberately DOES NOT compile or execute user Java.
 * It exposes deterministic guided traces to exercise the full client trace contract.
 */
const http = require('http');
const fs = require('fs');
const path = require('path');
const { compileQuestionTemplates } = require('./lib/question-registry');
const ds = require('./lib/ds');

const PORT = Number(process.env.PORT || 4173);
const PUBLIC_DIR = path.join(__dirname, 'public');
const MAX_BODY_BYTES = 100_000;
const MAX_STEPS = 1000;

const QUESTION_DIR = path.join(__dirname, 'questions');
const COMPILED_QUESTIONS = path.join(__dirname, 'generated', 'questions.compiled.json');
let questionRegistry; let compiledProblems = []; let problems = []; let questionsById = new Map();
function refreshQuestionRegistry() {
  questionRegistry = compileQuestionTemplates({ sourceDir: QUESTION_DIR, outFile: COMPILED_QUESTIONS });
  compiledProblems = questionRegistry.questions;
  problems = [...compiledProblems, ...(questionRegistry.unavailableQuestions || [])].sort((left, right) => left.order - right.order || left.title.localeCompare(right.title));
  questionsById = new Map(compiledProblems.map((question) => [question.id, question]));
  return questionRegistry;
}
refreshQuestionRegistry();

function clone(value) { return JSON.parse(JSON.stringify(value)); }
function boundedPush(frames, frame) {
  if (frames.length >= MAX_STEPS) throw new InputError(`Trace cap of ${MAX_STEPS} frames reached. Use a smaller input.`);
  frames.push({ step: frames.length, ...frame });
}
function frame(kind, lineHighlighted, action, actionDescription, variables, structureState, changed = []) {
  return { kind, lineHighlighted, action, actionDescription, variables, structureState, changed };
}
function makeTrace(frames, space, extras = {}) {
  return {
    totalSteps: frames.length,
    metrics: { totalOperations: frames.length, space, maxFrames: MAX_STEPS, ...extras },
    frames
  };
}
class InputError extends Error {}

function parseIntegerArray(raw, label = 'Input') {
  let parsed;
  try { parsed = JSON.parse(raw); } catch { throw new InputError(`${label} must be valid JSON.`); }
  if (!Array.isArray(parsed) || parsed.some(v => !Number.isInteger(v))) {
    throw new InputError(`${label} must be a JSON array of integers.`);
  }
  if (parsed.length < 1 || parsed.length > 32) throw new InputError(`${label} must contain 1–32 values in the guided demo.`);
  return parsed;
}

function parseTextPayload(raw, label) {
  let parsed;
  try { parsed = JSON.parse(raw); } catch { throw new InputError(`${label} input must be valid JSON.`); }
  const text = parsed?.text;
  if (typeof text !== 'string') throw new InputError(`Use { "text": string } for ${label}.`);
  const chars = Array.from(text);
  if (chars.length < 1 || chars.length > 64) throw new InputError(`${label} accepts 1–64 characters in the guided demo.`);
  return text;
}
function isAlphaNumeric(char) { return /^[a-z0-9]$/i.test(char); }

function palindromeFrames(text, deliberatelyWrong = false) {
  const chars = Array.from(text); const frames = []; let left = 0; let right = chars.length - 1; let result = true; let mismatch = null; const skipped = [];
  const snapshot = () => ({ type: 'TWO_POINTER_STRING', chars: clone(chars), left, right, skipped: clone(skipped), mismatch, result: null });
  boundedPush(frames, frame('TWO_POINTER_STRING', 3, 'START', 'Place one pointer at each end of the string.', { left, right, comparison: null }, snapshot()));
  while (left < right) {
    while (left < right && !isAlphaNumeric(chars[left])) {
      skipped.push(left); left += 1;
      boundedPush(frames, frame('TWO_POINTER_STRING', 5, 'SKIP_LEFT', 'Ignore a non-alphanumeric character on the left.', { left, right, comparison: null }, snapshot(), ['left']));
    }
    while (left < right && !isAlphaNumeric(chars[right])) {
      skipped.push(right); right -= 1;
      boundedPush(frames, frame('TWO_POINTER_STRING', 6, 'SKIP_RIGHT', 'Ignore a non-alphanumeric character on the right.', { left, right, comparison: null }, snapshot(), ['right']));
    }
    if (left >= right) break;
    const same = deliberatelyWrong ? chars[left] === chars[right] : chars[left].toLowerCase() === chars[right].toLowerCase();
    boundedPush(frames, frame('TWO_POINTER_STRING', 8, 'COMPARE', `Compare “${chars[left]}” and “${chars[right]}” without case sensitivity.`, { left, right, comparison: `${chars[left]} ↔ ${chars[right]}` }, snapshot(), ['comparison']));
    if (!same) {
      result = false; mismatch = [left, right];
      boundedPush(frames, frame('TWO_POINTER_STRING', 9, 'MISMATCH', 'The normalized characters differ, so the string is not a palindrome.', { left, right, comparison: `${chars[left]} ≠ ${chars[right]}` }, snapshot(), ['result']));
      break;
    }
    left += 1; right -= 1;
    boundedPush(frames, frame('TWO_POINTER_STRING', 11, 'MOVE_INWARD', 'The pair matches; move both pointers inward.', { left, right, comparison: null }, snapshot(), ['left', 'right']));
  }
  const final = snapshot(); final.result = result;
  boundedPush(frames, frame('TWO_POINTER_STRING', result ? 13 : 9, result ? 'PALINDROME' : 'NOT_PALINDROME', result ? 'All comparable character pairs match.' : 'Comparison stopped at the first mismatch.', { left, right, result }, final, ['complete']));
  return makeTrace(frames, 'O(1)', { algorithm: deliberatelyWrong ? 'case-sensitive variant' : 'two-pointer palindrome check' });
}

function longestSubstringFrames(text, deliberatelyWrong = false) {
  const chars = Array.from(text); const frames = []; const lastSeen = {}; let left = 0; let bestStart = 0; let bestEnd = -1; let bestLength = 0;
  const snapshot = (right, duplicate = null, complete = false) => ({ type: 'SLIDING_WINDOW_STRING', chars: clone(chars), left, right, bestStart, bestEnd, bestLength, duplicate, lastSeen: clone(lastSeen), complete });
  boundedPush(frames, frame('SLIDING_WINDOW_STRING', 4, 'START', 'Start with an empty window and no recorded characters.', { left, right: -1, bestLength: 0, window: '—' }, snapshot(-1)));
  for (let right = 0; right < chars.length; right += 1) {
    const char = chars[right];
    boundedPush(frames, frame('SLIDING_WINDOW_STRING', 6, 'EXPAND', `Include “${char}” at the right edge of the window.`, { left, right, char, bestLength, window: chars.slice(left, right + 1).join('') }, snapshot(right), ['right']));
    if (Object.prototype.hasOwnProperty.call(lastSeen, char) && lastSeen[char] >= left) {
      const previous = lastSeen[char];
      left = deliberatelyWrong ? previous : previous + 1;
      boundedPush(frames, frame('SLIDING_WINDOW_STRING', 8, 'CONTRACT', `“${char}” was already inside the window; move left past its previous index ${previous}.`, { left, right, char, previous, bestLength, window: chars.slice(left, right + 1).join('') }, snapshot(right, previous), ['left']));
    }
    lastSeen[char] = right;
    const length = right - left + 1;
    if (length > bestLength) {
      bestLength = length; bestStart = left; bestEnd = right;
      boundedPush(frames, frame('SLIDING_WINDOW_STRING', 11, 'NEW_BEST', `New longest unique window: “${chars.slice(bestStart, bestEnd + 1).join('')}”.`, { left, right, bestLength, window: chars.slice(left, right + 1).join('') }, snapshot(right), ['bestLength']));
    }
  }
  boundedPush(frames, frame('SLIDING_WINDOW_STRING', 14, 'COMPLETE', `The longest unique substring is “${chars.slice(bestStart, bestEnd + 1).join('')}” with length ${bestLength}.`, { left, right: chars.length - 1, bestLength, window: chars.slice(bestStart, bestEnd + 1).join('') }, snapshot(chars.length - 1, null, true), ['complete']));
  return makeTrace(frames, 'O(min(n, alphabet))', { algorithm: deliberatelyWrong ? 'duplicate-boundary variant' : 'sliding window with last-seen map', bestSubstring: chars.slice(bestStart, bestEnd + 1).join('') });
}

function bubbleFrames(input, variant = 'canonical') {
  const arr = [...input]; const frames = []; const n = arr.length;
  const reverseComparison = variant === 'learner-reversed';
  boundedPush(frames, frame('ARRAY', 2, 'START', 'Capture the original array before the first pass.', { i: 0, j: 0, n }, { type: 'ARRAY', values: clone(arr), active: [], sorted: [] }));
  for (let i = 0; i < n - 1; i += 1) {
    for (let j = 0; j < n - i - 1; j += 1) {
      const shouldSwap = reverseComparison ? arr[j] < arr[j + 1] : arr[j] > arr[j + 1];
      boundedPush(frames, frame('ARRAY', 4, 'COMPARE', `Compare index ${j} (${arr[j]}) with index ${j + 1} (${arr[j + 1]}).`, { i, j, left: j, right: j + 1 }, { type: 'ARRAY', values: clone(arr), active: [j, j + 1], sorted: Array.from({ length: i }, (_, k) => n - 1 - k) }, ['comparison']));
      if (shouldSwap) {
        [arr[j], arr[j + 1]] = [arr[j + 1], arr[j]];
        boundedPush(frames, frame('ARRAY', 7, 'SWAP', `Swap ${j} and ${j + 1}; the larger value moves right.`, { i, j, left: j, right: j + 1 }, { type: 'ARRAY', values: clone(arr), active: [j, j + 1], swap: [j, j + 1], sorted: Array.from({ length: i }, (_, k) => n - 1 - k) }, ['array']));
      }
    }
    boundedPush(frames, frame('ARRAY', 3, 'PASS_COMPLETE', `Pass ${i + 1} is complete; index ${n - 1 - i} is fixed.`, { i, j: n - i - 1 }, { type: 'ARRAY', values: clone(arr), active: [], sorted: Array.from({ length: i + 1 }, (_, k) => n - 1 - k) }, ['sorted']));
  }
  boundedPush(frames, frame('ARRAY', 11, 'COMPLETE', 'All adjacent comparisons are complete.', { i: n - 1, j: 0 }, { type: 'ARRAY', values: clone(arr), active: [], sorted: arr.map((_, index) => index) }, ['complete']));
  return makeTrace(frames, 'O(1)', { algorithm: reverseComparison ? 'descending bubble variant' : 'bubble sort' });
}

function binaryFrames(payload, deliberatelyWrong = false, insertionMode = false) {
  let parsed;
  try { parsed = JSON.parse(payload); } catch { throw new InputError('Binary Search input must be valid JSON.'); }
  const { array, target } = parsed || {};
  if (!Array.isArray(array) || array.some(v => !Number.isInteger(v)) || !Number.isInteger(target)) throw new InputError('Use { "array": number[], "target": number }.');
  if (array.length < 1 || array.length > 32) throw new InputError('The guided demo accepts 1–32 sorted values.');
  if (array.some((v, i) => i && array[i - 1] > v)) throw new InputError('Binary Search needs an ascending sorted array.');
  const frames = []; let left = 0; let right = array.length - 1; let found = -1;
  const snapshot = (mid, resultIndex = null, resultLabel = null) => ({
    type: 'BINARY_SEARCH', values: clone(array), left, right, mid, target, found,
    ...(insertionMode && Number.isInteger(resultIndex) ? { insertAt: resultIndex, resultLabel } : {})
  });
  boundedPush(frames, frame('BINARY_SEARCH', 2, 'START', insertionMode ? `Find ${target}, or the sorted position where it belongs.` : `Search for ${target} in the sorted array.`, { left, right, mid: null, target }, snapshot(null)));
  while (left <= right) {
    const mid = Math.floor((left + right) / 2);
    boundedPush(frames, frame('BINARY_SEARCH', 5, 'PROBE', `Probe midpoint ${mid}; its value is ${array[mid]}.`, { left, right, mid, target }, snapshot(mid), ['mid']));
    if (array[mid] === target) { found = mid; break; }
    const moveRight = deliberatelyWrong ? array[mid] > target : array[mid] < target;
    if (moveRight) {
      left = mid + 1;
      boundedPush(frames, frame('BINARY_SEARCH', 10, 'MOVE_LEFT', `Target is ${deliberatelyWrong ? 'treated as' : ''} beyond midpoint; shift left bound to ${left}.`, { left, right, mid, target }, snapshot(mid), ['left']));
    } else {
      right = mid - 1;
      boundedPush(frames, frame('BINARY_SEARCH', 12, 'MOVE_RIGHT', `Target is ${deliberatelyWrong ? 'treated as' : ''} before midpoint; shift right bound to ${right}.`, { left, right, mid, target }, snapshot(mid), ['right']));
    }
  }
  const resultIndex = found >= 0 ? found : left;
  const resultLabel = insertionMode
    ? (found >= 0 ? `Target found; return index ${resultIndex}.` : `Target absent; insert at index ${resultIndex}.`)
    : null;
  const finalDescription = insertionMode
    ? resultLabel
    : found >= 0 ? `Target ${target} found at index ${found}.` : `Target ${target} is not present.`;
  const finalAction = found >= 0 ? 'FOUND' : insertionMode ? 'INSERT_POSITION' : 'NOT_FOUND';
  boundedPush(frames, frame('BINARY_SEARCH', found >= 0 ? 7 : insertionMode ? 13 : 15, finalAction, finalDescription, { left, right, mid: found >= 0 ? found : null, target, ...(insertionMode ? { resultIndex } : {}) }, snapshot(found >= 0 ? found : null, insertionMode ? resultIndex : null, resultLabel), ['result']));
  return makeTrace(frames, 'O(1)', { algorithm: deliberatelyWrong ? 'reversed bounds variant' : insertionMode ? 'binary search insertion point' : 'binary search' });
}

function parseTreeTraversalInput(payload) {
  let parsed;
  try { parsed = JSON.parse(payload); } catch { throw new InputError('Tree traversal input must be valid JSON.'); }
  const values = parsed?.tree; const strategy = String(parsed?.strategy || '').toUpperCase();
  if (!Array.isArray(values) || values.length > 31) throw new InputError('Use { "tree": levelOrderValues, "strategy": "BFS" | "DFS" }; trees are limited to 31 slots.');
  if (!['BFS', 'DFS'].includes(strategy)) throw new InputError('Tree traversal strategy must be "BFS" or "DFS".');
  if (values.some(value => value !== null && !Number.isInteger(value))) throw new InputError('Tree values must be integers or null.');
  const nodes = [];
  if (!values.length || values[0] === null) {
    if (values.slice(1).some(value => value !== null)) throw new InputError('A level-order tree cannot contain nodes without a root.');
    return { nodes, strategy };
  }
  const root = { id: 'node_0', val: values[0], left: null, right: null, depth: 0 };
  nodes.push(root); const parents = [root]; let cursor = 1; let nextId = 1;
  while (parents.length && cursor < values.length) {
    const parent = parents.shift();
    for (const side of ['left', 'right']) {
      if (cursor >= values.length) break;
      const value = values[cursor++];
      if (value === null) continue;
      const child = { id: `node_${nextId++}`, val: value, left: null, right: null, depth: parent.depth + 1 };
      parent[side] = child.id; nodes.push(child); parents.push(child);
    }
  }
  if (values.slice(cursor).some(value => value !== null)) throw new InputError('The level-order tree contains values with no parent.');
  return { nodes, strategy };
}

function treeTraversalFrames(payload) {
  const { nodes, strategy } = parseTreeTraversalInput(payload); const frames = [];
  const byId = new Map(nodes.map(node => [node.id, node])); const order = []; const visited = [];
  const frontier = nodes.length ? [nodes[0].id] : [];
  const snapshot = (active = null) => ({
    type: 'TREE', nodes: clone(nodes), active, visited: clone(visited), frontier: clone(frontier),
    order: clone(order), strategy
  });
  boundedPush(frames, frame('TREE_TRAVERSAL', 3, 'START', `Start ${strategy === 'BFS' ? 'breadth-first search with a queue' : 'depth-first search with a stack'}.`, { strategy, root: nodes[0]?.val ?? null }, snapshot()));
  while (frontier.length) {
    const id = strategy === 'BFS' ? frontier.shift() : frontier.pop();
    const node = byId.get(id); if (!node) continue;
    visited.push(id); order.push(node.val);
    boundedPush(frames, frame('TREE_TRAVERSAL', strategy === 'BFS' ? 20 : 10, strategy === 'BFS' ? 'DEQUEUE' : 'POP', `${strategy === 'BFS' ? 'Remove the next queued node' : 'Pop the top stack node'}: ${node.val}.`, { strategy, current: node.val, order: clone(order) }, snapshot(id), ['active', 'visited']));
    boundedPush(frames, frame('TREE_TRAVERSAL', strategy === 'BFS' ? 21 : 11, 'VISIT', `Visit node ${node.val}; append it to the traversal order.`, { strategy, current: node.val, order: clone(order) }, snapshot(id), ['order']));
    const children = strategy === 'BFS' ? [node.left, node.right] : [node.right, node.left];
    for (const childId of children) {
      if (!childId) continue;
      frontier.push(childId); const child = byId.get(childId);
      const addingLeft = childId === node.left;
      const line = strategy === 'BFS' ? (addingLeft ? 22 : 23) : (addingLeft ? 13 : 12);
      const action = strategy === 'BFS' ? 'ENQUEUE' : 'PUSH';
      boundedPush(frames, frame('TREE_TRAVERSAL', line, action, `${strategy === 'BFS' ? 'Enqueue' : 'Push'} ${child.val} (${addingLeft ? 'left' : 'right'} child) into the ${strategy === 'BFS' ? 'queue' : 'stack'}.`, { strategy, current: node.val, added: child.val, frontier: frontier.map(id => byId.get(id)?.val) }, snapshot(id), ['frontier']));
    }
  }
  boundedPush(frames, frame('TREE_TRAVERSAL', 24, 'COMPLETE', `Traversal complete: ${order.join(' → ') || 'empty tree'}.`, { strategy, order: clone(order) }, snapshot(), ['complete']));
  return makeTrace(frames, 'O(n)', { algorithm: strategy === 'BFS' ? 'breadth-first traversal' : 'depth-first preorder traversal', result: order });
}


function parseBstInsertInput(payload) {
  let input;
  try { input = JSON.parse(payload); } catch { throw new InputError('BST insertion input must be valid JSON.'); }
  if (!Number.isInteger(input?.e)) throw new InputError('Use { "tree": levelOrderValues, "e": integer }.');
  const parsed = parseTreeTraversalInput(JSON.stringify({ tree: input.tree, strategy: 'BFS' }));
  const nodes = parsed.nodes.map(node => ({ ...node })); const byId = new Map(nodes.map(node => [node.id, node]));
  for (const node of nodes) { node.left = byId.get(node.left) || null; node.right = byId.get(node.right) || null; }
  const root = nodes[0] || null;
  function validateBst(node, min = -Infinity, max = Infinity) {
    if (!node) return;
    if (node.val <= min || node.val >= max) throw new InputError('The starting tree must be a valid BST with distinct values.');
    validateBst(node.left, min, node.val); validateBst(node.right, node.val, max);
  }
  validateBst(root);
  return { root, value: input.e, byId };
}

function bstInsertFrames(payload) {
  const parsed = parseBstInsertInput(payload); let { root, value } = parsed; const byId = parsed.byId;
  const frames = []; const path = []; let insertedId = null; let duplicate = false; let nextId = byId.size;
  const heightOf = (node) => node ? 1 + Math.max(heightOf(node.left), heightOf(node.right)) : 0;
  const snapshot = (active = null) => {
    const heights = new Map();
    const calc = (node) => { if (!node) return 0; const h = 1 + Math.max(calc(node.left), calc(node.right)); heights.set(node.id, h); return h; };
    const height = calc(root); const nodes = [];
    const collect = (node, depth) => {
      if (!node) return;
      nodes.push({ id: node.id, val: node.val, left: node.left?.id || null, right: node.right?.id || null, depth, height: heights.get(node.id) });
      collect(node.left, depth + 1); collect(node.right, depth + 1);
    };
    collect(root, 0);
    return { type: 'TREE', nodes, active, visited: [...path], frontier: [...path], order: path.map(id => byId.get(id)?.val).filter(v => v !== undefined), strategy: 'BST_INSERT', height, inserted: insertedId, duplicate };
  };
  boundedPush(frames, frame('TREE_BST_INSERT', 5, 'START', `Insert ${value} into the BST by following comparisons from the root.`, { e: value, height: heightOf(root) }, snapshot()));
  if (!root) {
    root = { id: `node_${nextId++}`, val: value, left: null, right: null };
    byId.set(root.id, root); insertedId = root.id;
    boundedPush(frames, frame('TREE_BST_INSERT', 3, 'INSERT_ROOT', `The tree is empty, so create ${value} as its root.`, { e: value, height: 1 }, snapshot(root.id), ['root', 'height']));
  } else {
    let current = root;
    while (current) {
      path.push(current.id);
      const direction = value < current.val ? 'left' : value > current.val ? 'right' : 'duplicate';
      boundedPush(frames, frame('TREE_BST_INSERT', direction === 'left' ? 6 : direction === 'right' ? 11 : 17, 'COMPARE', `${value} ${direction === 'left' ? '<' : direction === 'right' ? '>' : '='} ${current.val}; ${direction === 'left' ? 'follow the left child' : direction === 'right' ? 'follow the right child' : 'this value already exists'}.`, { e: value, current: current.val, direction, height: heightOf(root) }, snapshot(current.id), ['path']));
      if (direction === 'duplicate') { duplicate = true; break; }
      if (!current[direction]) {
        const node = { id: `node_${nextId++}`, val: value, left: null, right: null };
        current[direction] = node; byId.set(node.id, node); insertedId = node.id;
        boundedPush(frames, frame('TREE_BST_INSERT', direction === 'left' ? 8 : 13, 'INSERT', `Create node ${value} as the ${direction} child of ${current.val}.`, { e: value, parent: current.val, direction }, snapshot(node.id), ['tree', 'inserted']));
        break;
      }
      boundedPush(frames, frame('TREE_BST_INSERT', direction === 'left' ? 10 : 15, 'DESCEND', `Continue at the existing ${direction} child, ${current[direction].val}.`, { e: value, current: current.val, next: current[direction].val, direction }, snapshot(current.id), ['path']));
      current = current[direction];
    }
  }
  const height = heightOf(root);
  boundedPush(frames, frame('TREE_BST_INSERT', 19, 'COMPLETE', duplicate ? `${value} already exists; the BST is unchanged. Height h = ${height}.` : `Insertion complete. The BST height is h = ${height}.`, { e: value, inserted: !duplicate, height }, snapshot(), ['complete', 'height']));
  return makeTrace(frames, 'O(1)', { algorithm: 'iterative binary search tree insertion', result: { inserted: !duplicate, value, height } });
}

function linkedListFrames(input, deliberatelyWrong = false) {
  const ids = input.map((_, i) => `node_${i + 1}`);
  const originalNext = Object.fromEntries(ids.map((id, i) => [id, ids[i + 1] || null]));
  const next = { ...originalNext }; const frames = [];
  const snapshot = (current, prev, temp) => ids.map((id, i) => ({ id, val: input[i], next: next[id] }));
  boundedPush(frames, frame('LINKED_LIST', 3, 'START', 'Initialize prev to null and curr to the head node.', { head: ids[0], prev: null, curr: ids[0], nextTemp: null }, { type: 'LINKED_LIST', nodes: snapshot(ids[0], null, null), pointers: { head: ids[0], prev: null, curr: ids[0], nextTemp: null } }));
  let prev = null; let curr = ids[0];
  while (curr) {
    const temp = next[curr];
    boundedPush(frames, frame('LINKED_LIST', 6, 'SAVE_NEXT', `Save ${temp ? 'the next node before reconnecting' : 'the end of the chain'}.`, { head: ids[0], prev, curr, nextTemp: temp }, { type: 'LINKED_LIST', nodes: snapshot(curr, prev, temp), pointers: { head: ids[0], prev, curr, nextTemp: temp } }, ['nextTemp']));
    if (!deliberatelyWrong) next[curr] = prev;
    boundedPush(frames, frame('LINKED_LIST', 7, deliberatelyWrong ? 'SKIPPED_REWIRE' : 'REWIRE', deliberatelyWrong ? 'The link is left unchanged; this will preserve the original direction.' : 'Point curr.next backward to prev.', { head: ids[0], prev, curr, nextTemp: temp }, { type: 'LINKED_LIST', nodes: snapshot(curr, prev, temp), pointers: { head: ids[0], prev, curr, nextTemp: temp } }, ['next']));
    prev = curr; curr = temp;
    boundedPush(frames, frame('LINKED_LIST', 9, 'ADVANCE', 'Advance prev and curr one node.', { head: ids[0], prev, curr, nextTemp: null }, { type: 'LINKED_LIST', nodes: snapshot(curr, prev, null), pointers: { head: ids[0], prev, curr, nextTemp: null } }, ['prev', 'curr']));
  }
  boundedPush(frames, frame('LINKED_LIST', 11, 'COMPLETE', 'prev is the new head of the reversed list.', { head: prev, prev, curr: null, nextTemp: null }, { type: 'LINKED_LIST', nodes: snapshot(null, prev, null), pointers: { head: prev, prev, curr: null, nextTemp: null } }, ['head']));
  return makeTrace(frames, 'O(1)', { algorithm: deliberatelyWrong ? 'missing rewire variant' : 'iterative reverse' });
}

function sourceLooksIncorrect(adapter, code) {
  const compact = String(code || '').replace(/\s+/g, ' ');
  if (adapter === 'bubble-sort') return /arr\s*\[\s*j\s*\]\s*<\s*arr\s*\[\s*j\s*\+\s*1\s*\]/.test(compact);
  if (adapter === 'binary-search') return /arr\s*\[\s*mid\s*\]\s*>\s*target[\s\S]{0,100}left\s*=\s*mid\s*\+\s*1/.test(compact);
  if (adapter === 'search-insert-position') return /return\s+right\s*;/.test(compact) || /return\s+left\s*-\s*1\s*;/.test(compact) || !/return\s+left\s*;/.test(compact);
  if (adapter === 'valid-palindrome') return /charAt\s*\(\s*left\s*\)\s*!=\s*.*charAt\s*\(\s*right\s*\)/.test(compact) && !/toLowerCase/.test(compact);
  if (adapter === 'longest-substring') return /left\s*=\s*lastSeen\.get\s*\(\s*ch\s*\)/.test(compact) && !/\+\s*1/.test(compact);
  if (adapter === 'reverse-linked-list') return !/curr\.next\s*=\s*prev/.test(compact);
  return false;
}

function compareTraces(userTrace, optimalTrace) {
  const limit = Math.min(userTrace.frames.length, optimalTrace.frames.length);
  let firstDivergence = null;
  for (let index = 0; index < limit; index += 1) {
    const user = userTrace.frames[index]; const optimal = optimalTrace.frames[index];
    if (JSON.stringify(user.structureState) !== JSON.stringify(optimal.structureState)) {
      firstDivergence = { step: index, userAction: user.action, optimalAction: optimal.action, description: `Structural state diverges at synchronized step ${index + 1}.` };
      break;
    }
  }
  if (!firstDivergence && userTrace.frames.length !== optimalTrace.frames.length) {
    firstDivergence = { step: limit, userAction: 'TRACE_LENGTH', optimalAction: 'TRACE_LENGTH', description: 'One execution produced a different number of observable states.' };
  }
  return {
    firstDivergence,
    operationRatio: Number((userTrace.totalSteps / Math.max(optimalTrace.totalSteps, 1)).toFixed(2)),
    summary: firstDivergence ? firstDivergence.description : 'No structural divergence detected in this guided trace.'
  };
}

function execute({ problemId, userCode, input }) {
  refreshQuestionRegistry();
  if (typeof userCode !== 'string' || userCode.length > 50_000) throw new InputError('Java source is required and must be under 50 KB.');
  if (typeof input !== 'string' || input.length > 10_000) throw new InputError('Input is required and must be under 10 KB.');
  const known = questionsById.get(problemId);
  if (!known) throw new InputError('Unknown problem ID.');
  if (known.status !== 'READY') throw new InputError(`${known.title} is planned but its renderer is not in this build yet.`);
  const flawed = sourceLooksIncorrect(known.adapter, userCode);
  let userTrace; let optimalTrace;
  if (known.adapter === 'bubble-sort') {
    const values = parseIntegerArray(input); userTrace = bubbleFrames(values, flawed ? 'learner-reversed' : 'canonical'); optimalTrace = bubbleFrames(values);
  } else if (known.adapter === 'binary-search') {
    userTrace = binaryFrames(input, flawed); optimalTrace = binaryFrames(input);
  } else if (known.adapter === 'search-insert-position') {
    userTrace = binaryFrames(input, flawed, true); optimalTrace = binaryFrames(input, false, true);
  } else if (known.adapter === 'tree-traversal') {
    userTrace = treeTraversalFrames(input); optimalTrace = treeTraversalFrames(input);
  } else if (known.adapter === 'bst-insert') {
    userTrace = bstInsertFrames(input); optimalTrace = bstInsertFrames(input);
  } else if (known.adapter === 'valid-palindrome') {
    const text = parseTextPayload(input, known.title); userTrace = palindromeFrames(text, flawed); optimalTrace = palindromeFrames(text);
  } else if (known.adapter === 'longest-substring') {
    const text = parseTextPayload(input, known.title); userTrace = longestSubstringFrames(text, flawed); optimalTrace = longestSubstringFrames(text);
  } else if (known.adapter === 'reverse-linked-list') {
    const values = parseIntegerArray(input, 'Linked list input'); userTrace = linkedListFrames(values, flawed); optimalTrace = linkedListFrames(values);
  } else if (ds.getAdapter(known.adapter)) {
    const adapter = ds.getAdapter(known.adapter); const parsed = adapter.parse(input);
    const dsFlawed = typeof adapter.isFlawed === 'function' ? Boolean(adapter.isFlawed(userCode)) : false;
    userTrace = ds.runAdapter(adapter, parsed, { flawed: dsFlawed }); optimalTrace = ds.runAdapter(adapter, parsed, { flawed: false });
  } else {
    throw new InputError(`No trace adapter is registered for ${known.id}.`);
  }
  const diff = compareTraces(userTrace, optimalTrace);
  return { problemId, executionStatus: 'SUCCESS', engineMode: 'GUIDED_TRACE_ADAPTER', userTrace, optimalTrace, diff, warning: 'Development adapter: Java is not executed in this process. Connect an isolated instrumented worker before accepting arbitrary code.' };
}

function sendJson(res, status, payload) {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' });
  res.end(JSON.stringify(payload));
}
function contentType(filePath) {
  const extension = path.extname(filePath);
  return { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.svg': 'image/svg+xml' }[extension] || 'application/octet-stream';
}
function serveStatic(req, res) {
  const urlPath = decodeURIComponent(new URL(req.url, `http://${req.headers.host || 'localhost'}`).pathname);
  const requested = urlPath === '/' ? '/index.html' : urlPath;
  const safePath = path.normalize(requested).replace(/^([.][.][/\\])+/, '');
  const filePath = path.join(PUBLIC_DIR, safePath);
  if (!filePath.startsWith(PUBLIC_DIR)) return sendJson(res, 403, { error: 'Forbidden' });
  fs.readFile(filePath, (error, data) => {
    if (error) return sendJson(res, error.code === 'ENOENT' ? 404 : 500, { error: error.code === 'ENOENT' ? 'Not found' : 'Unable to read asset' });
    // Development UI assets must not remain cached across a design iteration; a stale stylesheet with a new DOM can look badly distorted.
    res.writeHead(200, { 'Content-Type': contentType(filePath), 'Cache-Control': 'no-store, max-age=0', 'X-Content-Type-Options': 'nosniff' }); res.end(data);
  });
}

function handleRequest(req, res) {
  if (ds.handleApi(req, res, { refresh: refreshQuestionRegistry })) return;
  if (req.method === 'GET' && req.url.split('?')[0] === '/api/problems') {
    refreshQuestionRegistry();
    return sendJson(res, 200, { problems, registry: { summary: questionRegistry.summary, diagnostics: questionRegistry.diagnostics } });
  }
  if (req.method === 'GET' && req.url.split('?')[0] === '/api/question-diagnostics') {
    refreshQuestionRegistry();
    return sendJson(res, 200, { summary: questionRegistry.summary, unavailableQuestions: questionRegistry.unavailableQuestions || [], diagnostics: questionRegistry.diagnostics });
  }
  if (req.method === 'POST' && req.url.split('?')[0] === '/api/execute') {
    let total = 0; const chunks = [];
    req.on('data', chunk => {
      total += chunk.length;
      if (total > MAX_BODY_BYTES) { req.destroy(); return; }
      chunks.push(chunk);
    });
    req.on('end', () => {
      try { const body = JSON.parse(Buffer.concat(chunks).toString('utf8')); sendJson(res, 200, execute(body)); }
      catch (error) { sendJson(res, error instanceof InputError || error instanceof SyntaxError || error.userError ? 400 : 500, { executionStatus: 'ERROR', error: error.message || 'Unexpected error' }); }
    });
    req.on('error', () => sendJson(res, 400, { executionStatus: 'ERROR', error: 'Invalid request body.' }));
    return;
  }
  if (req.method !== 'GET' && req.method !== 'HEAD') return sendJson(res, 405, { error: 'Method not allowed' });
  serveStatic(req, res);
}

const server = http.createServer(handleRequest);

// Export for serverless environments (Vercel, AWS Lambda)
module.exports = handleRequest;

// Run standalone server when invoked directly via CLI
if (require.main === module || !process.env.VERCEL) {
  server.listen(PORT, '0.0.0.0', () => {
    console.log(`Question registry: ${questionRegistry.summary.loaded}/${questionRegistry.summary.discovered} modules loaded${questionRegistry.summary.usingLastKnownGood ? ' (last-known-good retained)' : ''}.`);
    for (const item of questionRegistry.diagnostics.filter((entry) => entry.level === 'error')) console.warn(`Question module skipped [${item.code}] ${item.file}: ${item.message}`);
    console.log(`AlgoCanvas running at http://localhost:${PORT}`);
  });
}
