'use strict';
/*
 * Finds adapters/*.js (files starting with "_" are examples and are skipped).
 * Reloads a file only when it changed, so saving an adapter works without restarting.
 */
const fs = require('fs');
const path = require('path');
const { STRUCTURES } = require('./schema');

const NAME = /^[a-z0-9]+(-[a-z0-9]+)*$/;
const cache = new Map(); // file -> { mtimeMs, adapter?, problem? }
let current = new Map();

function problem(file, code, message) { return { level: 'error', file: path.basename(file), code, message }; }

function check(adapter, file) {
  const base = path.basename(file, '.js');
  if (!adapter || typeof adapter !== 'object') return problem(file, 'ADAPTER_SHAPE', 'module.exports must be an object.');
  if (adapter.name !== base || !NAME.test(adapter.name)) return problem(file, 'ADAPTER_NAME', `"name" must be kebab-case and equal the file name “${base}”.`);
  if (typeof adapter.inputKind !== 'string' || !adapter.inputKind) return problem(file, 'ADAPTER_INPUT_KIND', '"inputKind" (string) is required.');
  if (typeof adapter.parse !== 'function' || typeof adapter.run !== 'function') return problem(file, 'ADAPTER_FUNCTIONS', '"parse(rawInput)" and "run(input, { flawed })" must be functions.');
  if (!Array.isArray(adapter.structures) || !adapter.structures.length || adapter.structures.some((t) => !STRUCTURES[t])) return problem(file, 'ADAPTER_STRUCTURES', `"structures" must list known types: ${Object.keys(STRUCTURES).join(', ')}.`);
  return null;
}

function loadDsAdapters(dir, reservedNames = new Set()) {
  const diagnostics = []; const next = new Map();
  let files = [];
  try { files = fs.readdirSync(dir).filter((name) => name.endsWith('.js') && !name.startsWith('_')).sort(); } catch { /* no adapters folder yet */ }
  for (const name of files) {
    const file = path.join(dir, name);
    let entry = cache.get(file); let mtimeMs = 0;
    try { mtimeMs = fs.statSync(file).mtimeMs; } catch { continue; }
    if (!entry || entry.mtimeMs !== mtimeMs) {
      entry = { mtimeMs };
      try { delete require.cache[require.resolve(file)]; const adapter = require(file); entry.problem = check(adapter, file); if (!entry.problem) entry.adapter = adapter; }
      catch (error) { entry.problem = problem(file, 'ADAPTER_LOAD_FAILED', error.message); }
      cache.set(file, entry);
    }
    if (entry.problem) { diagnostics.push(entry.problem); continue; }
    if (reservedNames.has(entry.adapter.name)) { diagnostics.push(problem(file, 'ADAPTER_NAME_TAKEN', `“${entry.adapter.name}” is a built-in adapter name.`)); continue; }
    next.set(entry.adapter.name, entry.adapter);
  }
  current = next;
  return { adapters: next, diagnostics };
}
const getAdapter = (name) => current.get(name) || null;
const listAdapters = () => [...current.values()];

module.exports = { loadDsAdapters, getAdapter, listAdapters };
