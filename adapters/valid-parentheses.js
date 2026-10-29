'use strict';
/*
 * Valid Parentheses — a STRING panel (the characters) next to a STACK panel.
 * Copy this file to start a new adapter. Rules:
 *   - file name === "name" (kebab-case)
 *   - parse(raw)  : turn the input box text into a value, or throw DsError("friendly message")
 *   - run(input)  : build frames with TraceBuilder and return tb.trace()
 *   - isFlawed(code) (optional): true when the learner's Java looks wrong -> their trace goes "wrong"
 */
const { TraceBuilder, DsError, parseJson } = require('../lib/ds');

const PAIR = { ')': '(', ']': '[', '}': '{' };
const OPEN = new Set(['(', '[', '{']);

module.exports = {
  name: 'valid-parentheses',
  inputKind: 'text-object',
  structures: ['STRING', 'STACK'],
  description: 'Push open brackets; each closing bracket must match the top of the stack.',
  sampleInput: '{"text":"([)]"}',

  parse(raw) {
    const text = parseJson(raw, 'Input')?.text;
    if (typeof text !== 'string') throw new DsError('Use { "text": string }.');
    const chars = Array.from(text);
    if (chars.length < 1 || chars.length > 64) throw new DsError('Use 1–64 characters in the guided demo.');
    if (chars.some((c) => !OPEN.has(c) && !PAIR[c])) throw new DsError('Use only the characters ( ) [ ] { }.');
    return chars;
  },

  // The learner's code is "flawed" if it never mentions all three bracket types.
  isFlawed(code) {
    const compact = String(code || '').replace(/\s+/g, ' ');
    return ["'('", "'{'", "'['"].some((bracket) => !compact.includes(bracket));
  },

  run(chars, { flawed = false } = {}) {
    const tb = new TraceBuilder({ space: 'O(n)', algorithm: flawed ? 'type-blind variant' : 'stack of open brackets', layout: 'column' });
    const stack = []; // { char, index }
    const view = (current, extra = {}) => {
      const marks = {};
      for (let i = 0; i < chars.length; i += 1) if (current >= 0 && i < current) marks[i] = 'done';
      stack.forEach((item) => { marks[item.index] = 'active'; });
      if (current >= 0) marks[current] = 'current';
      Object.entries(extra).forEach(([i, m]) => { marks[i] = m; });
      tb.update('chars', { pointers: { i: current >= 0 ? current : null }, marks });
      tb.update('stack', { items: stack.map((item, k) => ({ value: item.char, mark: k === stack.length - 1 ? 'active' : undefined })) });
    };
    const stat = () => ({ label: 'STACK SIZE', value: stack.length });
    const vars = (i, extra = {}) => ({ i, c: i >= 0 ? chars[i] : null, stackSize: stack.length, ...extra });

    tb.panel('chars', 'STRING', { title: 's', values: chars, pointers: {}, marks: {} });
    tb.panel('stack', 'STACK', { title: 'stack', items: [] });
    tb.step(6, 'START', 'Start with an empty stack of open brackets.', vars(-1), { stat: stat() });

    for (let i = 0; i < chars.length; i += 1) {
      const c = chars[i];
      view(i); tb.step(9, 'READ', `Read “${c}” at index ${i}.`, vars(i), { stat: stat() });
      if (OPEN.has(c)) {
        stack.push({ char: c, index: i }); view(i);
        tb.step(12, 'PUSH', `“${c}” opens a bracket, so push it onto the stack.`, vars(i), { stat: stat(), changed: ['stack'] }); continue;
      }
      if (!stack.length) {
        view(i, { [i]: 'mismatch' });
        tb.step(15, 'EMPTY_STACK', `“${c}” closes a bracket, but the stack is empty — nothing was opened.`, vars(i, { result: false }), { stat: stat() });
        return tb.trace();
      }
      const top = stack[stack.length - 1];
      if (!flawed && top.char !== PAIR[c]) {
        view(i, { [i]: 'mismatch', [top.index]: 'mismatch' });
        tb.step(18, 'MISMATCH', `“${c}” needs “${PAIR[c]}” on top, but the top is “${top.char}”.`, vars(i, { top: top.char, result: false }), { stat: stat() });
        return tb.trace();
      }
      stack.pop(); view(i, { [i]: 'found', [top.index]: 'found' });
      tb.step(17, 'POP_MATCH', `“${c}” matches the top “${top.char}”, so pop it.`, vars(i, { top: top.char }), { stat: stat(), changed: ['stack'] });
    }
    const ok = stack.length === 0;
    const left = {}; stack.forEach((item) => { left[item.index] = 'mismatch'; });
    view(-1, ok ? {} : left);
    tb.update('chars', { marks: Object.fromEntries(chars.map((_, i) => [i, ok ? 'done' : (left[i] || 'done')])) });
    tb.step(24, ok ? 'COMPLETE_VALID' : 'COMPLETE_INVALID', ok ? 'The stack is empty, so every bracket was closed in order.' : `${stack.length} open bracket(s) were never closed.`, { stackSize: stack.length, result: ok }, { stat: stat() });
    return tb.trace();
  }
};
