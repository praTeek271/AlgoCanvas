/*
 * Question Template Registry
 *
 * This compiler turns developer-authored *.question.json files into one safe
 * runtime registry. Each source file is isolated: a syntax or schema error in
 * one template becomes a diagnostic and never prevents healthy questions from
 * being emitted.
 */
const fs = require('fs');
const path = require('path');
const { loadDsAdapters } = require('./ds/loader');

const TEMPLATE_VERSION = 1;
const STATUSES = new Set(['READY', 'PLANNED']);
const DIFFICULTIES = new Set(['EASY', 'MEDIUM', 'HARD']);
const ADAPTERS = new Map([
  ['bubble-sort', { mode: 'ARRAY', inputKind: 'integer-array' }],
  ['binary-search', { mode: 'BINARY_SEARCH', inputKind: 'array-target' }],
  ['search-insert-position', { mode: 'BINARY_SEARCH', inputKind: 'array-target' }],
  ['tree-traversal', { mode: 'TREE_TRAVERSAL', inputKind: 'tree-traversal' }],
  ['bst-insert', { mode: 'TREE_BST_INSERT', inputKind: 'bst-insert' }],
  ['valid-palindrome', { mode: 'TWO_POINTER_STRING', inputKind: 'text-object' }],
  ['longest-substring', { mode: 'SLIDING_WINDOW_STRING', inputKind: 'text-object' }],
  ['reverse-linked-list', { mode: 'LINKED_LIST', inputKind: 'integer-array' }]
]);

const STATIC_ADAPTER_NAMES = new Set(ADAPTERS.keys());
const DS_ADAPTER_DIR = path.join(__dirname, '..', 'adapters');
const dynamicAdapterNames = new Set();
// Adapters written with the data-structure framework (adapters/*.js) join the same registry.
function syncDsAdapters() {
  for (const name of dynamicAdapterNames) ADAPTERS.delete(name);
  dynamicAdapterNames.clear();
  const { adapters, diagnostics } = loadDsAdapters(DS_ADAPTER_DIR, STATIC_ADAPTER_NAMES);
  for (const [name, adapter] of adapters) { ADAPTERS.set(name, { mode: 'COMPOSITE', inputKind: adapter.inputKind }); dynamicAdapterNames.add(name); }
  return diagnostics;
}

function text(value) { return typeof value === 'string' ? value.trim() : ''; }
function diagnostic(level, file, code, message) { return { level, file: path.basename(file), code, message }; }
function unique(value) { return [...new Set(value)]; }

function normalizeReadyQuestion(template, file) {
  const issues = [];
  const requiredText = [
    ['id', template.id], ['title', template.title], ['category', template.category], ['summary', template.summary],
    ['input.default', template.input?.default], ['input.hint', template.input?.hint],
    ['visual.adapter', template.visual?.adapter], ['code.starter', template.code?.starter], ['code.reference', template.code?.reference],
    ['approach.explanation', template.approach?.explanation], ['approach.time', template.approach?.time], ['approach.space', template.approach?.space]
  ];
  for (const [field, value] of requiredText) {
    if (!text(value)) issues.push(diagnostic('error', file, 'MISSING_FIELD', `${field} is required for a READY question.`));
  }
  if (!/^DS-\d{2}$/.test(String(template.id || ''))) issues.push(diagnostic('error', file, 'INVALID_ID', 'id must follow the DS-01 format.'));
  if (!DIFFICULTIES.has(template.difficulty)) issues.push(diagnostic('error', file, 'INVALID_DIFFICULTY', 'difficulty must be EASY, MEDIUM, or HARD.'));
  const adapter = ADAPTERS.get(template.visual?.adapter);
  if (!adapter) issues.push(diagnostic('error', file, 'UNKNOWN_ADAPTER', `visual.adapter “${template.visual?.adapter || ''}” is not registered.`));
  if (adapter && template.input?.kind !== adapter.inputKind) {
    issues.push(diagnostic('error', file, 'INPUT_ADAPTER_MISMATCH', `input.kind must be “${adapter.inputKind}” for adapter “${template.visual.adapter}”.`));
  }
  try { JSON.parse(template.input?.default || ''); } catch { issues.push(diagnostic('error', file, 'INVALID_DEFAULT_INPUT', 'input.default must be valid JSON text.')); }
  if (issues.length) return { issues };
  return {
    issues,
    question: {
      templateVersion: TEMPLATE_VERSION,
      id: template.id,
      order: Number.isInteger(template.order) ? template.order : Number(template.id.slice(3)),
      title: template.title,
      category: template.category,
      difficulty: template.difficulty,
      status: 'READY',
      summary: template.summary,
      defaultInput: template.input.default,
      inputHint: template.input.hint,
      inputKind: template.input.kind,
      mode: adapter.mode,
      adapter: template.visual.adapter,
      starterCode: template.code.starter,
      referenceCode: template.code.reference,
      approach: { explanation: template.approach.explanation, time: template.approach.time, space: template.approach.space }
    }
  };
}

function normalizePlannedQuestion(template, file) {
  const issues = [];
  const requiredText = [
    ['id', template.id], ['title', template.title], ['category', template.category], ['summary', template.summary],
    ['input.kind', template.input?.kind], ['input.default', template.input?.default], ['input.hint', template.input?.hint],
    ['visual.family', template.visual?.family], ['visual.renderer', template.visual?.renderer], ['visual.representation', template.visual?.representation],
    ['code.starter', template.code?.starter], ['code.reference', template.code?.reference],
    ['approach.explanation', template.approach?.explanation], ['approach.time', template.approach?.time], ['approach.space', template.approach?.space]
  ];
  for (const [field, value] of requiredText) {
    if (!text(value)) issues.push(diagnostic('error', file, 'MISSING_FIELD', `${field} is required for a PLANNED question.`));
  }
  if (!/^DS-\d{2}$/.test(String(template.id || ''))) issues.push(diagnostic('error', file, 'INVALID_ID', 'id must follow the DS-01 format.'));
  if (!DIFFICULTIES.has(template.difficulty)) issues.push(diagnostic('error', file, 'INVALID_DIFFICULTY', 'difficulty must be EASY, MEDIUM, or HARD.'));
  if (template.input && (typeof template.input !== 'object' || Array.isArray(template.input))) issues.push(diagnostic('error', file, 'INVALID_INPUT_BLUEPRINT', 'input must be an object.'));
  if (template.visual && (typeof template.visual !== 'object' || Array.isArray(template.visual))) issues.push(diagnostic('error', file, 'INVALID_VISUAL_BLUEPRINT', 'visual must be an object.'));
  if (template.code && (typeof template.code !== 'object' || Array.isArray(template.code))) issues.push(diagnostic('error', file, 'INVALID_CODE_BLUEPRINT', 'code must be an object.'));
  if (template.approach && (typeof template.approach !== 'object' || Array.isArray(template.approach))) issues.push(diagnostic('error', file, 'INVALID_APPROACH_BLUEPRINT', 'approach must be an object.'));
  try { JSON.parse(template.input?.default || ''); } catch { issues.push(diagnostic('error', file, 'INVALID_DEFAULT_INPUT', 'input.default must be valid JSON text.')); }
  if (issues.length) return { issues };
  const input = template.input; const code = template.code; const approach = template.approach; const visual = template.visual;
  return {
    issues,
    question: {
      templateVersion: TEMPLATE_VERSION,
      id: template.id,
      order: Number.isInteger(template.order) ? template.order : Number(template.id.slice(3)),
      title: template.title,
      category: template.category,
      difficulty: template.difficulty,
      status: 'PLANNED',
      summary: template.summary,
      defaultInput: text(input.default), inputHint: text(input.hint), inputKind: text(input.kind), mode: 'PLANNED', adapter: null,
      starterCode: text(code.starter), referenceCode: text(code.reference), approach: { explanation: text(approach.explanation), time: text(approach.time), space: text(approach.space) },
      visualBlueprint: { family: text(visual.family), renderer: text(visual.renderer), representation: text(visual.representation), readiness: text(visual.readiness) || 'PLANNED' }
    }
  };
}

function normalizeTemplate(template, file) {
  if (!template || typeof template !== 'object' || Array.isArray(template)) return { issues: [diagnostic('error', file, 'INVALID_TEMPLATE', 'The root must be a JSON object.')] };
  if (template.templateVersion !== TEMPLATE_VERSION) return { issues: [diagnostic('error', file, 'UNSUPPORTED_VERSION', `templateVersion must be ${TEMPLATE_VERSION}.`)] };
  if (!STATUSES.has(template.status)) return { issues: [diagnostic('error', file, 'INVALID_STATUS', 'status must be READY or PLANNED.')] };
  return template.status === 'READY' ? normalizeReadyQuestion(template, file) : normalizePlannedQuestion(template, file);
}

function unavailableQuestion(template, file, issues, unavailableIds, acceptedIds = new Set()) {
  // A source must at least be parseable and identify itself before it can be
  // shown in the library. Broken JSON cannot safely provide a title, so it is
  // only reported in diagnostics. Authors can choose SKIP for silent omission.
  if (template?.onCompileError === 'SKIP') return null;
  const rawId = text(template?.id); const rawTitle = text(template?.title);
  if (!rawId && !rawTitle) return null;
  const filenameId = `INVALID-${path.basename(file, '.question.json').toUpperCase().replace(/[^A-Z0-9_-]/g, '-')}`;
  let id = /^DS-\d{2}$/.test(rawId) && !unavailableIds.has(rawId) && !acceptedIds.has(rawId) ? rawId : filenameId;
  let suffix = 2; while (unavailableIds.has(id) || acceptedIds.has(id)) id = `${filenameId}-${suffix++}`;
  unavailableIds.add(id);
  const firstError = issues.find((item) => item.level === 'error');
  return {
    templateVersion: TEMPLATE_VERSION,
    id,
    order: Number.isInteger(template?.order) ? template.order : 9999,
    title: rawTitle || rawId || 'Untitled question template',
    category: text(template?.category) || 'TEMPLATE ERROR',
    difficulty: DIFFICULTIES.has(template?.difficulty) ? template.difficulty : 'EASY',
    status: 'UNAVAILABLE',
    summary: 'This question template did not compile and is disabled.',
    defaultInput: '', inputHint: '', inputKind: 'unavailable', mode: 'UNAVAILABLE', adapter: null,
    starterCode: '', referenceCode: '', approach: { explanation: '', time: '—', space: '—' },
    disabledReason: firstError?.message || 'Template validation failed.',
    sourceFile: path.basename(file)
  };
}

function readLastKnownGood(outFile) {
  try {
    const parsed = JSON.parse(fs.readFileSync(outFile, 'utf8'));
    if (Array.isArray(parsed.questions) && parsed.questions.length) return parsed.questions;
  } catch { /* No previous registry is not an error. */ }
  return [];
}

function writeAtomic(file, contents) {
  try {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    const temporary = `${file}.${process.pid}.tmp`;
    fs.writeFileSync(temporary, contents, 'utf8');
    fs.renameSync(temporary, file);
  } catch (err) {
    // Read-only filesystem in serverless environments (e.g. Vercel)
  }
}

function compileQuestionTemplates({ sourceDir, outFile }) {
  const diagnostics = []; const questions = []; const unavailableQuestions = []; const seenIds = new Set(); const unavailableIds = new Set();
  diagnostics.push(...syncDsAdapters());
  let files = [];
  try { files = fs.readdirSync(sourceDir).filter((name) => name.endsWith('.question.json')).sort(); }
  catch (error) { diagnostics.push(diagnostic('error', sourceDir, 'SOURCE_DIRECTORY_UNAVAILABLE', error.message)); }
  if (!files.length) diagnostics.push(diagnostic('warning', sourceDir, 'NO_TEMPLATES', 'No *.question.json templates were found.'));

  for (const name of files) {
    const file = path.join(sourceDir, name); let source;
    try { source = JSON.parse(fs.readFileSync(file, 'utf8')); }
    catch (error) { diagnostics.push(diagnostic('error', file, 'JSON_PARSE_FAILED', error.message)); continue; }
    const compiled = normalizeTemplate(source, file);
    diagnostics.push(...compiled.issues);
    if (!compiled.question) {
      const unavailable = unavailableQuestion(source, file, compiled.issues, unavailableIds, seenIds);
      if (unavailable) unavailableQuestions.push(unavailable);
      continue;
    }
    if (seenIds.has(compiled.question.id)) {
      diagnostics.push(diagnostic('error', file, 'DUPLICATE_ID', `A question with id ${compiled.question.id} was already accepted; this file was skipped.`));
      // A duplicate ID cannot appear in the library without ambiguous routing,
      // therefore it is diagnostic-only even when the default policy is SHOW_DISABLED.
      continue;
    }
    seenIds.add(compiled.question.id); questions.push(compiled.question);
  }

  questions.sort((left, right) => left.order - right.order || left.id.localeCompare(right.id));
  unavailableQuestions.sort((left, right) => left.order - right.order || left.title.localeCompare(right.title));
  const previous = readLastKnownGood(outFile);
  const usePrevious = questions.length === 0 && previous.length > 0;
  if (usePrevious) diagnostics.push(diagnostic('warning', outFile, 'LAST_KNOWN_GOOD', 'No valid template compiled, so the previous compiled registry remains active.'));
  const activeQuestions = usePrevious ? previous : questions;
  const report = {
    templateVersion: TEMPLATE_VERSION,
    compiledAt: new Date().toISOString(),
    sourceDirectory: path.basename(sourceDir),
    questions: activeQuestions,
    unavailableQuestions,
    diagnostics,
    summary: { discovered: files.length, loaded: questions.length, skipped: files.length - questions.length, unavailableVisible: unavailableQuestions.length, usingLastKnownGood: usePrevious }
  };
  // Always emit a usable registry when at least one source module is valid. One
  // bad question must never stop project startup or hide the other questions.
  if (activeQuestions.length) writeAtomic(outFile, `${JSON.stringify(report, null, 2)}\n`);
  return report;
}

module.exports = { ADAPTERS, TEMPLATE_VERSION, compileQuestionTemplates };
