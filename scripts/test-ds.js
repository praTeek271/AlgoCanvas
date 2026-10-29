'use strict';
/*
 * Checks the data-structure framework. Run:  node scripts/test-ds.js
 *  - every adapter in adapters/ runs (canonical + flawed) and yields valid frames
 *  - every structure example validates and renders
 *  - the example adapters (files starting with "_") also pass
 */
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const ds = require('../lib/ds');
const viz = require('../public/ds-components.js');

const dir = path.join(__dirname, '..', 'adapters');
const { adapters, diagnostics } = ds.loadDsAdapters(dir);
assert.strictEqual(diagnostics.length, 0, `adapter problems: ${JSON.stringify(diagnostics)}`);

const all = [...adapters.values()];
for (const file of fs.readdirSync(dir).filter((n) => n.startsWith('_') && n.endsWith('.js'))) all.push(require(path.join(dir, file)));
for (const adapter of all) {
  assert.ok(adapter.sampleInput, `${adapter.name}: add a "sampleInput" so it can be tested`);
  const input = adapter.parse(adapter.sampleInput);
  for (const flawed of [false, true]) {
    const trace = ds.runAdapter(adapter, input, { flawed });
    ds.validateTrace(trace).forEach((p) => assert.fail(`${adapter.name}: ${p.message}`));
    trace.frames.forEach((frame) => assert.ok(viz.render(frame.structureState).includes('ds-composite')));
  }
  console.log(`✓ adapter ${adapter.name}`);
}
for (const [type, spec] of Object.entries(ds.STRUCTURES)) {
  const panel = { id: type.toLowerCase(), type, ...spec.example };
  assert.deepStrictEqual(ds.validatePanel(panel, type), [], `${type} example invalid`);
  const html = viz.render({ type: 'COMPOSITE', panels: [panel] });
  assert.ok(html.includes(`ds-panel-${type.toLowerCase()}`), `${type} did not render`);
  console.log(`✓ structure ${type}`);
}
assert.ok(ds.validatePanel({ id: 'x', type: 'STACK', items: [{ value: 1, mark: 'nope' }] }, 'p').length, 'bad highlight should be rejected');
assert.ok(ds.validatePanel({ id: 'x', type: 'GRAPH', nodes: [{ id: 'A' }], edges: [{ from: 'A', to: 'Z' }] }, 'p').length, 'dangling edge should be rejected');
console.log('All data-structure checks passed.');
