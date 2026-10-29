'use strict';
/*
 * Contributor-facing endpoints (all under /api/ds/):
 *   GET  /api/ds/catalog   structure types, highlight words, examples, adapters
 *   GET  /api/ds/adapters  adapters currently loaded
 *   POST /api/ds/validate  { frames | trace }            -> { valid, problems }
 *   POST /api/ds/preview   { adapter, input, flawed? }   -> { trace }
 */
const { HIGHLIGHTS, STRUCTURES, validateTrace } = require('./schema');
const { listAdapters, getAdapter } = require('./loader');
const { DsError } = require('./builder');

const MAX_BODY = 100000;
function send(res, status, payload) {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' });
  res.end(JSON.stringify(payload));
}
function readJson(req) {
  return new Promise((resolve, reject) => {
    let size = 0; const chunks = [];
    req.on('data', (chunk) => { size += chunk.length; if (size > MAX_BODY) { req.destroy(); reject(new DsError('Request body is too large.')); } else chunks.push(chunk); });
    req.on('end', () => { try { resolve(JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}')); } catch { reject(new DsError('Body must be valid JSON.')); } });
    req.on('error', () => reject(new DsError('Invalid request body.')));
  });
}
const describe = (a) => ({ name: a.name, inputKind: a.inputKind, structures: a.structures, description: a.description || '', sampleInput: a.sampleInput || null });

function runAdapter(adapter, input, options) {
  const trace = adapter.run(input, options);
  const problems = validateTrace(trace);
  if (problems.length) {
    const first = problems.slice(0, 3).map((p) => `${p.frame === null ? 'trace' : `frame ${p.frame}`}: ${p.message}`).join('; ');
    throw new Error(`Adapter “${adapter.name}” produced invalid frames — ${first}`);
  }
  return trace;
}

/** Returns true when the request was an /api/ds/ call (and has been answered). */
function handleApi(req, res, { refresh } = {}) {
  const route = req.url.split('?')[0];
  if (!route.startsWith('/api/ds/')) return false;
  const fail = (error) => send(res, error.userError || error instanceof SyntaxError ? 400 : 500, { error: error.message || 'Unexpected error' });
  try { if (refresh) refresh(); } catch (error) { fail(error); return true; }

  if (req.method === 'GET' && route === '/api/ds/catalog') {
    const structures = Object.fromEntries(Object.entries(STRUCTURES).map(([type, spec]) => [type, { description: spec.description, fields: spec.fields, example: { id: type.toLowerCase(), type, ...spec.example } }]));
    send(res, 200, { frameKind: 'COMPOSITE', highlights: HIGHLIGHTS, structures, adapters: listAdapters().map(describe) });
    return true;
  }
  if (req.method === 'GET' && route === '/api/ds/adapters') { send(res, 200, { adapters: listAdapters().map(describe) }); return true; }
  if (req.method === 'POST' && route === '/api/ds/validate') {
    readJson(req).then((body) => {
      const trace = body.trace || { totalSteps: body.frames?.length, frames: body.frames };
      const problems = validateTrace(trace);
      send(res, 200, { valid: problems.length === 0, problems });
    }).catch(fail);
    return true;
  }
  if (req.method === 'POST' && route === '/api/ds/preview') {
    readJson(req).then((body) => {
      const adapter = getAdapter(body.adapter);
      if (!adapter) throw new DsError(`No adapter named “${body.adapter}”. See /api/ds/adapters.`);
      if (typeof body.input !== 'string') throw new DsError('"input" must be a string (the same JSON text the question input box holds).');
      send(res, 200, { adapter: adapter.name, trace: runAdapter(adapter, adapter.parse(body.input), { flawed: Boolean(body.flawed) }) });
    }).catch(fail);
    return true;
  }
  send(res, 404, { error: 'Unknown /api/ds/ route.' });
  return true;
}

module.exports = { handleApi, runAdapter };
