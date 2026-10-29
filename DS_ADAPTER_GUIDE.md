# Adding a question with the data-structure framework

A new question needs **two files** and no edits to `server.js`, `app.js` or the CSS:

1. `questions/ds-XX.question.json` (the lesson text, Java starter/reference, complexity)
2. `adapters/<name>.js` (produces the step-by-step frames)

## 1. Question file
Same as before, but `status` is `READY` and the adapter is the file name:
```json
"visual": { "adapter": "valid-parentheses" },
"input":  { "kind": "text-object", "default": "{\"text\":\"([)]\"}", "hint": "..." }
```
`input.kind` must equal the adapter's `inputKind`.

## 2. Adapter file
Copy `adapters/valid-parentheses.js` (two panels) or `adapters/_example-two-sum.js` (array + hash map).

```js
const { TraceBuilder, DsError, parseJson } = require('../lib/ds');
module.exports = {
  name: 'my-adapter',              // = file name, kebab-case
  inputKind: 'integer-array',      // = question input.kind
  structures: ['ARRAY', 'STACK'],  // which panel types you use
  sampleInput: '[3,1,2]',          // used by the self-test and the playground
  parse(raw) { /* return the input or throw new DsError('friendly message') */ },
  isFlawed(code) { return false; },            // optional: does the learner's Java look wrong?
  run(input, { flawed }) {
    const tb = new TraceBuilder({ space: 'O(n)', algorithm: 'my idea' });
    tb.panel('nums', 'ARRAY', { values: input, pointers: {}, marks: {} });
    tb.step(3, 'START', 'Begin.');                       // line in reference code, action, text
    tb.update('nums', { pointers: { i: 0 }, marks: { 0: 'current' } });
    tb.step(5, 'LOOK', 'Look at index 0.', { i: 0 });    // each step() snapshots every panel
    return tb.trace();
  }
};
```
Highlight words (same colours everywhere): `current active visited done found mismatch inserted muted`.
Optional per-step counter shown in the stats bar: `tb.step(..., vars, { stat: { label: 'STACK SIZE', value: 2 } })`.

## Panel types
`ARRAY STRING STACK QUEUE LINKED_LIST TREE GRAPH HASHMAP HEAP`. Exact fields for each are listed by
`GET /api/ds/catalog` and drawn live on `/ds-playground.html`.

## Endpoints
| Call | Use |
|---|---|
| `GET /api/ds/catalog` | panel types, fields, examples, highlight words, loaded adapters |
| `GET /api/ds/adapters` | adapters currently loaded |
| `POST /api/ds/preview` `{adapter, input, flawed?}` | run an adapter without a question |
| `POST /api/ds/validate` `{frames}` | check hand-made frames and get readable errors |

## Check your work
```
node scripts/test-ds.js        # every adapter + every panel type
npm run questions:check
```
Open `/ds-playground.html`, pick your adapter, press Run, and step through it.

## Restyling everything
Edit the variables at the top of `public/ds-components.css` (`--ds-current`, `--ds-surface`, ...).

## Deploying on Vercel
Adapters are discovered by reading the `adapters/` folder at run time. If an adapter is missing after
deploy, add `"functions": { "server.js": { "includeFiles": "adapters/**" } }` to `vercel.json`.
