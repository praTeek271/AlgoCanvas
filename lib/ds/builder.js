'use strict';
/*
 * TraceBuilder: the one tool an adapter needs to produce frames.
 *   tb.panel('input', 'STRING', { text })      -> add a data-structure panel
 *   tb.update('stack', { items: [...] })       -> change a panel
 *   tb.step(line, 'PUSH', 'Push “(”', vars)    -> snapshot ALL panels as one frame
 */
class DsError extends Error {
  constructor(message) { super(message); this.name = 'DsError'; this.userError = true; }
}
const clone = (value) => JSON.parse(JSON.stringify(value));

class TraceBuilder {
  constructor(options = {}) {
    this.maxFrames = options.maxFrames || 1000;
    this.space = options.space || 'O(1)';
    this.algorithm = options.algorithm || '';
    this.layout = options.layout || 'column'; // 'column' | 'row'
    this.panels = new Map(); this.frames = [];
  }
  panel(id, type, data = {}) { this.panels.set(id, { id, type, ...clone(data) }); return this; }
  update(id, patch = {}) {
    const panel = this.panels.get(id);
    if (!panel) throw new Error(`TraceBuilder: no panel with id “${id}”.`);
    Object.assign(panel, clone(patch)); return this;
  }
  step(line, action, description, variables = {}, options = {}) {
    if (this.frames.length >= this.maxFrames) throw new DsError(`Trace cap of ${this.maxFrames} frames reached. Use a smaller input.`);
    this.frames.push({
      step: this.frames.length, kind: 'COMPOSITE', lineHighlighted: line, action, actionDescription: description,
      variables: clone(variables),
      structureState: { type: 'COMPOSITE', layout: this.layout, panels: [...this.panels.values()].map(clone), ...(options.stat ? { stat: options.stat } : {}) },
      changed: options.changed || []
    });
    return this;
  }
  trace(extras = {}) {
    return { totalSteps: this.frames.length, metrics: { totalOperations: this.frames.length, space: this.space, maxFrames: this.maxFrames, algorithm: this.algorithm, ...extras }, frames: this.frames };
  }
}

function parseJson(raw, label = 'Input') {
  try { return JSON.parse(raw); } catch { throw new DsError(`${label} must be valid JSON.`); }
}
module.exports = { TraceBuilder, DsError, parseJson };
