'use strict';
/*
 * EXAMPLE (ignored by the loader because the name starts with "_").
 * To use it: copy to adapters/two-sum.js, set name: 'two-sum', add questions/ds-XX.question.json
 * with  "visual": { "adapter": "two-sum" }  and  "input": { "kind": "array-target", ... }.
 * Shows two panels at once: ARRAY (nums) + HASHMAP (value -> index seen so far).
 */
const { TraceBuilder, DsError, parseJson } = require('../lib/ds');

module.exports = {
  name: 'two-sum',
  inputKind: 'array-target',
  structures: ['ARRAY', 'HASHMAP'],
  description: 'One pass: look up target - nums[i] in a map of values already seen.',
  sampleInput: '{"nums":[2,7,11,15],"target":9}',
  parse(raw) {
    const input = parseJson(raw);
    if (!Array.isArray(input?.nums) || input.nums.some((n) => !Number.isInteger(n)) || !Number.isInteger(input.target)) throw new DsError('Use { "nums": [integers], "target": integer }.');
    if (input.nums.length < 2 || input.nums.length > 20) throw new DsError('Use 2–20 numbers in the guided demo.');
    return input;
  },
  run({ nums, target }) {
    const tb = new TraceBuilder({ space: 'O(n)', algorithm: 'hash map one-pass' });
    const seen = []; // { key, value }
    const rows = (hit) => seen.map((e) => ({ key: e.key, value: e.value, mark: e.key === hit ? 'found' : undefined }));
    tb.panel('nums', 'ARRAY', { title: 'nums', values: nums, pointers: {}, marks: {} });
    tb.panel('seen', 'HASHMAP', { title: 'seen (value → index)', entries: [] });
    tb.layout = 'row';
    tb.step(2, 'START', `Look for two numbers that add up to ${target}.`, { target });
    for (let i = 0; i < nums.length; i += 1) {
      const need = target - nums[i]; const hit = seen.find((e) => e.key === need);
      tb.update('nums', { pointers: { i }, marks: { [i]: 'current' } });
      tb.update('seen', { entries: rows(null) });
      tb.step(4, 'CHECK', `Need ${need} (= ${target} − ${nums[i]}). Is it in the map?`, { i, need });
      if (hit) {
        tb.update('nums', { pointers: { i, j: hit.value }, marks: { [i]: 'found', [hit.value]: 'found' } });
        tb.update('seen', { entries: rows(need) });
        tb.step(5, 'FOUND', `Yes — ${need} was at index ${hit.value}. Answer: [${hit.value}, ${i}].`, { i, j: hit.value, answer: [hit.value, i] });
        return tb.trace();
      }
      seen.push({ key: nums[i], value: i });
      tb.update('seen', { entries: rows(null).map((e, k, all) => (k === all.length - 1 ? { ...e, mark: 'inserted' } : e)) });
      tb.step(7, 'STORE', `Not found. Remember ${nums[i]} → index ${i}.`, { i }, { changed: ['seen'] });
    }
    tb.step(9, 'NONE', 'No pair adds up to the target.', {});
    return tb.trace();
  }
};
