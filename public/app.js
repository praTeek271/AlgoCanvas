const $ = (selector) => document.querySelector(selector);

const state = {
  problems: [], registrySummary: null, registrySignature: '', registryPollTimer: null, selectedId: 'DS-01', trace: null, step: 0, playing: false, timer: null,
  userDraft: '', focus: 'user', visualMode: 'array', toastTimer: null
};

function escapeHtml(value) { return String(value).replace(/[&<>'"]/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#039;', '"': '&quot;' }[character])); }
function formatValue(value) { return value === null || value === undefined ? 'null' : String(value).replace('node_', '#'); }
function countLines(source) { return source.split('\n').map((_, index) => String(index + 1)).join('\n'); }
function activeProblem() { return state.problems.find((problem) => problem.id === state.selectedId); }
function displayMode(problem) {
  if (problem?.mode === 'TREE_BST_INSERT') return 'BST insertion';
  if (problem?.mode === 'TREE_TRAVERSAL') return 'tree traversal';
  if (problem?.mode === 'LINKED_LIST') return 'linked list';
  if (problem?.mode === 'BINARY_SEARCH') return 'binary search';
  if (problem?.mode === 'TWO_POINTER_STRING') return 'two pointers';
  if (problem?.mode === 'COMPOSITE') return 'data structures';
  if (problem?.mode === 'SLIDING_WINDOW_STRING') return 'sliding window';
  return 'array';
}
function isSortable() { return activeProblem()?.mode === 'ARRAY'; }
function isTreeTraversal() { return activeProblem()?.mode === 'TREE_TRAVERSAL'; }
function initialVisualMode(problem) {
  if (problem?.mode === 'ARRAY') return 'array';
  if (problem?.mode === 'TREE_TRAVERSAL') { try { return JSON.parse(problem.defaultInput).strategy.toLowerCase(); } catch { return 'bfs'; } }
  return 'native';
}
function syncTreeStrategyFromInput() {
  if (!isTreeTraversal()) return;
  try { const strategy = String(JSON.parse($('#input-editor').value).strategy || '').toLowerCase(); if (strategy === 'bfs' || strategy === 'dfs') state.visualMode = strategy; renderViewTabs(); } catch { /* Keep current tab while the JSON is incomplete. */ }
}
function showToast(message, kind = '') { const toast = $('#toast'); clearTimeout(state.toastTimer); toast.textContent = message; toast.className = `toast ${kind}`; state.toastTimer = setTimeout(() => toast.classList.add('hidden'), 3000); }
function setRequestStatus(message, kind = '') { const node = $('#request-status'); node.textContent = message; node.className = `request-status ${kind}`; }
function updateGutter() { $('#code-gutter').textContent = countLines($('#shared-code').value); }
function emptyState(title, copy) { return `<div class="empty-visual"><div class="empty-orb">⌁</div><strong>${title}</strong><br>${copy}</div>`; }

async function loadProblems() {
  const response = await fetch('/api/problems');
  const payload = await response.json();
  state.problems = payload.problems;
  state.registrySummary = payload.registry?.summary || null;
  state.registrySignature = JSON.stringify({ problems: payload.problems, summary: state.registrySummary });
  const firstReady = state.problems.find((problem) => problem.status === 'READY');
  if (firstReady && !state.problems.some((problem) => problem.id === state.selectedId && problem.status === 'READY')) state.selectedId = firstReady.id;
  renderProblemList();
  if (firstReady) {
    selectProblem(state.selectedId, true);
  } else {
    $('#header-title').textContent = 'Question registry'; $('#header-id').textContent = 'EMPTY'; $('#lesson-title').textContent = 'No valid question modules'; $('#lesson-summary').textContent = 'Fix the template diagnostics, then compile again. The workspace itself is still available.';
    $('#primary-visual').innerHTML = emptyState('Registry waiting', 'No runnable template was emitted.'); $('#run-button').disabled = true; $('#run-button-top').disabled = true; setRequestStatus('No valid READY question modules', 'error');
  }
  if (payload.registry?.summary?.skipped) {
    const skipped = payload.registry.summary.skipped;
    setTimeout(() => showToast(`${skipped} question template${skipped === 1 ? '' : 's'} skipped safely — see server diagnostics.`, 'error'), 450);
  }
}
async function refreshProblemRegistry() {
  try {
    const response = await fetch('/api/problems'); if (!response.ok) return;
    const payload = await response.json(); const summary = payload.registry?.summary || null;
    const signature = JSON.stringify({ problems: payload.problems, summary });
    if (signature === state.registrySignature) return;
    state.registrySignature = signature; state.problems = payload.problems; state.registrySummary = summary;
    renderProblemList();
    const selected = state.problems.find((problem) => problem.id === state.selectedId);
    const firstReady = state.problems.find((problem) => problem.status === 'READY');
    if (firstReady && (!selected || selected.status !== 'READY')) selectProblem(firstReady.id, true);
    else if (!firstReady) {
      $('#header-title').textContent = 'Question registry'; $('#header-id').textContent = 'EMPTY'; $('#lesson-title').textContent = 'No runnable question modules';
      $('#lesson-summary').textContent = 'Valid templates appear automatically after they compile; see diagnostics for skipped modules.';
      $('#primary-visual').innerHTML = emptyState('Registry waiting', 'No runnable template was emitted.'); $('#run-button').disabled = true; $('#run-button-top').disabled = true;
    }
  } catch { /* Keep the last known list if the registry endpoint is briefly offline. */ }
}
function renderProblemList() {
  $('#problem-list').innerHTML = state.problems.map((problem) => {
    const unavailable = problem.status === 'UNAVAILABLE';
    const disabled = problem.status !== 'READY';
    const disabledTitle = unavailable ? `Template disabled: ${problem.disabledReason || 'validation failed.'}` : disabled ? 'This visual mode is planned but its renderer is not available yet.' : '';
    const label = unavailable ? `${problem.title} · disabled` : problem.title;
    const sublabel = unavailable ? `${problem.category} · template error` : problem.status === 'PLANNED' ? `${problem.category} · planned` : problem.category;
    return `<button class="problem-button ${problem.id === state.selectedId ? 'selected' : ''} ${unavailable ? 'unavailable' : ''}" data-problem="${problem.id}" ${disabled ? `disabled title="${escapeHtml(disabledTitle)}"` : ''}><span class="problem-number">${escapeHtml(problem.id.replace('DS-', ''))}</span><span class="problem-info"><strong>${escapeHtml(label)}</strong><small>${escapeHtml(sublabel)}</small></span><i class="problem-ready ${problem.status === 'READY' ? 'yes' : ''} ${unavailable ? 'error' : ''}"></i></button>`;
  }).join('');
  const summary = state.registrySummary;
  $('#problem-count').textContent = summary ? `${summary.loaded}/${summary.discovered}` : state.problems.length;
  $('#problem-count').title = summary ? `${summary.loaded} question templates compiled from ${summary.discovered} files discovered${summary.unavailableVisible ? `; ${summary.unavailableVisible} shown disabled` : ''}${summary.usingLastKnownGood ? '; using last-known-good registry' : ''}` : 'Questions loaded';
  $('#problem-list').querySelectorAll('[data-problem]').forEach((button) => button.addEventListener('click', () => selectProblem(button.dataset.problem)));
}
function selectProblem(id, initial = false) {
  const problem = state.problems.find((item) => item.id === id); if (!problem || problem.status !== 'READY') return;
  stopPlayback(); closeApproach(); state.selectedId = id; state.trace = null; state.step = 0; state.focus = 'user'; state.visualMode = initialVisualMode(problem); state.userDraft = problem.starterCode; $('#run-button').disabled = false; $('#run-button-top').disabled = false;
  $('#header-title').textContent = problem.title; $('#header-id').textContent = problem.id; $('#lesson-title').textContent = problem.title; $('#lesson-summary').textContent = problem.summary;
  $('#lesson-pattern').textContent = problem.category.replace('LINKED LISTS', 'Linked lists').replace('ARRAYS', 'Arrays'); $('#lesson-difficulty').textContent = problem.difficulty.slice(0, 1) + problem.difficulty.slice(1).toLowerCase();
  $('#input-editor').value = problem.defaultInput;
  $('#input-prompt').textContent = problem.mode === 'COMPOSITE' ? 'Edit the JSON input' : problem.mode === 'ARRAY' ? 'Use a JSON array' : problem.mode === 'BINARY_SEARCH' ? 'Set array + target' : problem.mode === 'TREE_TRAVERSAL' ? 'Set tree + BFS/DFS' : problem.mode === 'TREE_BST_INSERT' ? 'Set BST + element e' : problem.mode?.includes('STRING') ? 'Set your text' : 'List node values';
  $('#input-hint').textContent = problem.inputHint;
  $('#drawer-problem-id').textContent = problem.id; $('#drawer-title').textContent = problem.title; $('#drawer-summary').textContent = problem.summary;
  const details = problem.approach; $('#approach-explanation').textContent = details.explanation; $('#approach-time').textContent = details.time; $('#approach-space').textContent = details.space; $('#drawer-reference-code').textContent = problem.referenceCode;
  syncCodeSurface(); renderProblemList(); renderViewTabs(); updateArrayToolbelt(); resetTraceUI();
  if (!initial) showToast(`${problem.title} loaded`, 'success');
}
function syncCodeSurface() {
  $('#shared-code').value = state.userDraft; $('#shared-code').readOnly = false; $('#shared-code').setAttribute('aria-label', 'Your editable Java source');
  $('#code-card').classList.remove('reference'); $('#code-section-title').textContent = 'Your solution'; $('#code-file-name').textContent = 'Solution.java'; $('#code-read-mode').textContent = 'EDIT MODE'; $('#code-context-note').textContent = 'Editable Java source'; updateGutter();
}
function resetTraceUI() {
  $('#visual-state-label').textContent = 'Ready to visualize'; $('#visual-action').textContent = 'Run your code against an input to begin.'; $('#primary-visual').innerHTML = emptyState('Visual output', 'Your algorithm state will appear here.'); $('#visual-legend').innerHTML = '<span class="legend-item"><i></i>Active state</span><span class="legend-item"><i class="active"></i>Comparison</span><span class="legend-item"><i class="swap"></i>Change</span>';
  $('#timeline').max = 0; $('#timeline').value = 0; $('#timeline-percent').textContent = '0%'; $('#timeline-caption').textContent = 'The visual output will appear here.'; $('#timeline-step').textContent = 'Step — / —'; $('#stat-states').textContent = '—'; $('#secondary-stat').innerHTML = 'SWAPS <b id="stat-swaps">—</b>';
  $('#metric-ratio').textContent = '—'; $('#metric-ratio-copy').textContent = 'Learner / reference'; $('#metric-space').textContent = '—'; $('#metric-space-copy').textContent = 'Awaiting trace'; $('#diff-card').className = 'diff-card neutral'; $('#diff-icon').textContent = '◎'; $('#diff-title').textContent = 'Run both traces from one workspace'; $('#diff-copy').textContent = 'The first semantic difference will be called out here.'; $('#jump-divergence').disabled = true; $('#play-toggle').innerHTML = '▶ <span>Play</span>'; updateFocusControls();
}
function renderViewTabs() {
  const tabs = $('#view-tabs');
  if (isTreeTraversal()) {
    tabs.innerHTML = `<button data-tree-strategy="bfs" class="${state.visualMode === 'bfs' ? 'active' : ''}" type="button">BFS · Queue</button><button data-tree-strategy="dfs" class="${state.visualMode === 'dfs' ? 'active' : ''}" type="button">DFS · Stack</button>`;
    tabs.querySelectorAll('[data-tree-strategy]').forEach((button) => button.addEventListener('click', () => {
      const strategy = button.dataset.treeStrategy.toUpperCase();
      try { const input = JSON.parse($('#input-editor').value); input.strategy = strategy; $('#input-editor').value = JSON.stringify(input); state.visualMode = strategy.toLowerCase(); renderViewTabs(); markInputChanged(`${strategy} selected — run visualization`); }
      catch { showToast('Fix the tree input JSON before changing traversal.', 'error'); }
    }));
    return;
  }
  if (!isSortable()) { tabs.innerHTML = `<button class="active" type="button">${displayMode(activeProblem())}</button>`; return; }
  tabs.innerHTML = `<button data-view="array" class="${state.visualMode === 'array' ? 'active' : ''}" type="button">Array</button><button data-view="bars" class="${state.visualMode === 'bars' ? 'active' : ''}" type="button">Bars</button>`;
  tabs.querySelectorAll('[data-view]').forEach((button) => button.addEventListener('click', () => { state.visualMode = button.dataset.view; renderViewTabs(); renderStep(); }));
}
function updateFocusControls() { $('#focus-toggle').querySelectorAll('button').forEach((button) => button.classList.toggle('selected', button.dataset.focus === state.focus)); }
function setFocus(focus) { state.focus = focus; updateFocusControls(); renderStep(); }
function isArrayBuilderLesson() { return activeProblem()?.adapter === 'bubble-sort'; }
function parseSortingValues() {
  try {
    const values = JSON.parse($('#input-editor').value);
    return Array.isArray(values) && values.length >= 1 && values.every(Number.isInteger) ? values : null;
  } catch { return null; }
}
function randomValues(size) {
  const pool = Array.from({ length: 99 }, (_, index) => index + 1);
  for (let index = pool.length - 1; index > 0; index -= 1) { const swapIndex = Math.floor(Math.random() * (index + 1)); [pool[index], pool[swapIndex]] = [pool[swapIndex], pool[index]]; }
  return pool.slice(0, size);
}
function updateArrayToolbelt() {
  const toolbelt = $('#array-toolbelt');
  if (!isArrayBuilderLesson()) { toolbelt.classList.add('hidden'); return; }
  toolbelt.classList.remove('hidden');
  const values = parseSortingValues(); const size = Math.max(3, Math.min(14, values?.length || Number($('#array-size').value) || 5));
  $('#array-size').value = size; $('#array-size-value').textContent = `${size} ${size === 1 ? 'item' : 'items'}`;
}
function markInputChanged(message = 'Input changed — run visualization') {
  stopPlayback(); state.trace = null; state.step = 0; resetTraceUI(); setRequestStatus(message);
}
function applySortingValues(values, message) {
  $('#input-editor').value = JSON.stringify(values); updateArrayToolbelt(); markInputChanged(message);
}
function applyArrayAction(action) {
  if (!isArrayBuilderLesson()) return;
  const requestedSize = Number($('#array-size').value) || 5; let values = parseSortingValues();
  if (!values || values.length < 3 || values.length > 14) values = randomValues(requestedSize);
  if (action === 'shuffle') {
    for (let index = values.length - 1; index > 0; index -= 1) { const swapIndex = Math.floor(Math.random() * (index + 1)); [values[index], values[swapIndex]] = [values[swapIndex], values[index]]; }
    applySortingValues(values, 'Shuffled input — run visualization');
  } else if (action === 'sorted') {
    applySortingValues([...values].sort((left, right) => left - right), 'Best-case input ready — run visualization');
  } else if (action === 'reversed') {
    applySortingValues([...values].sort((left, right) => right - left), 'Worst-case input ready — run visualization');
  } else if (action === 'reset') {
    applySortingValues(JSON.parse(activeProblem().defaultInput), 'Default input restored');
  }
}
function resizeArrayInput(size) { applySortingValues(randomValues(size), `${size}-item array generated — run visualization`); }

async function runTrace() {
  state.userDraft = $('#shared-code').value;
  const buttons = [$('#run-button'), $('#run-button-top')]; stopPlayback(); buttons.forEach((button) => button.disabled = true); setRequestStatus('Preparing trace…', 'working');
  try {
    const response = await fetch('/api/execute', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ problemId: state.selectedId, userCode: state.userDraft, input: $('#input-editor').value }) });
    const payload = await response.json(); if (!response.ok) throw new Error(payload.error || 'The trace could not be created.');
    state.trace = payload; state.step = 0; const total = totalFrames(); $('#timeline').max = Math.max(total - 1, 0); $('#timeline').value = 0; setRequestStatus('Trace generated safely', ''); updateMetrics(); renderStep(); showToast(payload.diff.firstDivergence ? 'Divergence found — inspect the highlighted step.' : 'Trace ready — states align.', payload.diff.firstDivergence ? 'error' : 'success');
  } catch (error) { setRequestStatus(error.message, 'error'); showToast(error.message, 'error'); }
  finally { buttons.forEach((button) => button.disabled = false); }
}
function totalFrames() { return state.trace ? Math.max(state.trace.userTrace.totalSteps, state.trace.optimalTrace.totalSteps) : 0; }
function activeTrace() { if (!state.trace) return null; return state.focus === 'reference' ? state.trace.optimalTrace : state.trace.userTrace; }
function currentFrame() { const trace = activeTrace(); return trace?.frames[Math.min(state.step, trace.frames.length - 1)] || null; }
function updateMetrics() {
  const { userTrace, optimalTrace, diff } = state.trace; $('#metric-ratio').textContent = `${diff.operationRatio}×`; $('#metric-ratio-copy').textContent = diff.operationRatio === 1 ? 'Same observed work' : 'Learner / reference frames'; $('#metric-space').textContent = userTrace.metrics.space; $('#metric-space-copy').textContent = userTrace.metrics.algorithm;
  const hasDiff = Boolean(diff.firstDivergence); $('#diff-card').className = `diff-card ${hasDiff ? 'warning' : 'good'}`; $('#diff-icon').textContent = hasDiff ? '!' : '✓'; $('#diff-title').textContent = hasDiff ? `Divergence at state ${diff.firstDivergence.step + 1}` : 'Trace states align'; $('#diff-copy').textContent = hasDiff ? diff.firstDivergence.description : 'The learner state matches the canonical state at every observable frame.'; $('#jump-divergence').disabled = !hasDiff;
}
function renderStep() {
  if (!state.trace) return; const frame = currentFrame(); if (!frame) return; const trace = activeTrace(); const total = totalFrames(); const swapCount = trace.frames.slice(0, Math.min(state.step + 1, trace.frames.length)).filter((item) => item.action === 'SWAP').length;
  $('#visual-heading').textContent = state.focus === 'reference' ? 'Reference execution trace' : 'Your execution trace'; $('#visual-state-label').textContent = `${state.focus === 'reference' ? 'Reference' : 'Learner'} · ${frame.kind.replaceAll('_', ' ').toLowerCase()}`; $('#visual-action').textContent = frame.actionDescription; $('#primary-visual').innerHTML = visualMarkup(frame); $('#visual-legend').innerHTML = legendMarkup(frame); $('#stat-states').textContent = `${Math.min(state.step + 1, trace.totalSteps)} / ${trace.totalSteps}`;
  const compareCount = trace.frames.slice(0, Math.min(state.step + 1, trace.frames.length)).filter((item) => item.action === 'COMPARE').length;
  const secondary = frame.kind === 'ARRAY' ? ['SWAPS', swapCount] : frame.kind === 'BINARY_SEARCH' ? ['PROBES', trace.frames.slice(0, Math.min(state.step + 1, trace.frames.length)).filter((item) => item.action === 'PROBE').length] : frame.kind === 'TREE_TRAVERSAL' ? ['VISITED', frame.structureState.order.length] : frame.kind === 'TREE_BST_INSERT' ? ['HEIGHT', frame.structureState.height] : frame.kind === 'TWO_POINTER_STRING' ? ['CHECKS', compareCount] : frame.kind === 'SLIDING_WINDOW_STRING' ? ['BEST', frame.structureState.bestLength] : frame.kind === 'COMPOSITE' ? [(frame.structureState.stat && frame.structureState.stat.label) || 'STEP', frame.structureState.stat ? frame.structureState.stat.value : state.step + 1] : ['REWIRES', trace.frames.slice(0, Math.min(state.step + 1, trace.frames.length)).filter((item) => item.action === 'REWIRE').length];
  $('#secondary-stat').innerHTML = `${secondary[0]} <b>${secondary[1]}</b>`;
  $('#timeline').value = Math.min(state.step, total - 1); $('#timeline-percent').textContent = `${total > 1 ? Math.round((state.step / (total - 1)) * 100) : 100}%`; $('#timeline-caption').textContent = variableSummary(frame.variables); $('#timeline-step').textContent = `Step ${state.step + 1} / ${total}`; $('#code-line-status').textContent = frame.lineHighlighted ? `${state.focus === 'reference' ? 'Reference' : 'Learner'} state · line ${frame.lineHighlighted}` : 'State captured';
  const isDiffStep = state.trace.diff.firstDivergence && state.step === state.trace.diff.firstDivergence.step; $('#diff-card').style.boxShadow = isDiffStep ? '0 0 0 2px #f0a7b2,0 5px 14px #e9677921' : '';
}
function variableSummary(variables = {}) { const parts = Object.entries(variables).slice(0, 4).map(([key, value]) => `${key} = ${formatValue(value)}`); return parts.length ? parts.join('  ·  ') : 'State captured'; }
function legendMarkup(frame) {
  if (frame.kind === 'ARRAY') return '<span class="legend-item"><i class="active"></i>Comparing</span><span class="legend-item"><i class="swap"></i>Swapping</span><span class="legend-item"><i class="sorted"></i>Sorted</span><span class="legend-item"><i></i>Unsorted</span>';
  if (frame.kind === 'BINARY_SEARCH') return '<span class="legend-item"><i class="active"></i>Search window</span><span class="legend-item"><i class="swap"></i>Midpoint</span><span class="legend-item"><i class="sorted"></i>Target found</span>';
  if (frame.kind === 'TREE_TRAVERSAL') return '<span class="legend-item"><i class="tree-active"></i>Current node</span><span class="legend-item"><i class="sorted"></i>Visited</span><span class="legend-item"><i class="active"></i>Queue / stack</span>';
  if (frame.kind === 'TREE_BST_INSERT') return '<span class="legend-item"><i class="tree-active"></i>Search node</span><span class="legend-item"><i class="sorted"></i>Search path</span><span class="legend-item"><i class="tree-inserted"></i>Inserted node</span>';
  if (frame.kind === 'TWO_POINTER_STRING') return '<span class="legend-item"><i class="active"></i>Left pointer</span><span class="legend-item"><i class="swap"></i>Right pointer</span><span class="legend-item"><i class="mismatch"></i>Mismatch</span><span class="legend-item"><i></i>Ignored</span>';
  if (frame.kind === 'SLIDING_WINDOW_STRING') return '<span class="legend-item"><i class="active"></i>Active window</span><span class="legend-item"><i class="swap"></i>Right edge</span><span class="legend-item"><i class="sorted"></i>Best window</span><span class="legend-item"><i></i>Outside window</span>';
  if (frame.kind === 'COMPOSITE') return window.DSViz ? window.DSViz.legend(frame.structureState) : '';
  return '<span class="legend-item"><i class="active"></i>Active pointer</span><span class="legend-item"><i class="swap"></i>Rewired node</span><span class="legend-item"><i class="sorted"></i>New head</span>';
}
// Shared data-structure components (public/ds-components.js + .css) load themselves here.
(function loadDsComponents() {
  if (window.DSViz) return;
  const css = document.createElement('link'); css.rel = 'stylesheet'; css.href = '/ds-components.css'; document.head.appendChild(css);
  const js = document.createElement('script'); js.src = '/ds-components.js'; document.head.appendChild(js);
})();
function visualMarkup(frame) {
  const structure = frame.structureState;
  if (structure.type === 'ARRAY') return state.visualMode === 'bars' ? barsMarkup(structure) : arrayMarkup(structure);
  if (structure.type === 'BINARY_SEARCH') return binaryMarkup(structure);
  if (structure.type === 'TREE' || structure.type === 'TREE_TRAVERSAL' || frame.kind === 'TREE_TRAVERSAL' || frame.kind === 'TREE_BST_INSERT') return treeMarkup({ ...structure, type: 'TREE' });
  if (structure.type === 'LINKED_LIST') return linkedListMarkup(structure);
  if (structure.type === 'TWO_POINTER_STRING') return twoPointerStringMarkup(structure);
  if (structure.type === 'SLIDING_WINDOW_STRING') return slidingWindowMarkup(structure);
  if (structure.type === 'COMPOSITE') return window.DSViz ? window.DSViz.render(structure) : emptyState('Loading renderer', 'Data-structure components are still loading.');
  return emptyState('Unsupported visual', 'A renderer has not been assigned.');
}
function arrayMarkup(data) { const active = new Set(data.active || []); const sorted = new Set(data.sorted || []); const swap = new Set(data.swap || []); return `<div class="array-tile-visual">${data.values.map((value, index) => `<div class="array-tile-wrap"><div class="array-tile ${active.has(index) ? 'active' : ''} ${sorted.has(index) ? 'sorted' : ''} ${swap.has(index) ? 'swap' : ''}">${value}${active.has(index) ? '<span class="tile-pin">●</span>' : ''}</div><span>${index}</span></div>`).join('')}</div>`; }
function barsMarkup(data) { const max = Math.max(...data.values, 1); const active = new Set(data.active || []); const sorted = new Set(data.sorted || []); const swap = new Set(data.swap || []); return `<div class="bars-visual">${data.values.map((value, index) => `<div class="bar-wrap"><b>${value}</b><div class="bar ${active.has(index) ? 'active' : ''} ${sorted.has(index) ? 'sorted' : ''} ${swap.has(index) ? 'swap' : ''}" style="height:${Math.max(14, Math.round((value / max) * 178))}px"></div><span>${index}</span></div>`).join('')}</div>`; }
function binaryMarkup(data) {
  const position = (index) => `${((index + .5) / data.values.length) * 100}%`;
  const boundaryPosition = (index) => `${(Math.max(0, Math.min(data.values.length, index)) / data.values.length) * 100}%`;
  const pointer = (label, index, style = '') => index === null || index === undefined || index < 0 || index >= data.values.length ? '' : `<i class="search-pointer ${style}" style="left:${position(index)}">${label}</i>`;
  const insertionPointer = Number.isInteger(data.insertAt) ? `<i class="search-pointer insert" style="left:${data.found >= 0 ? position(data.insertAt) : boundaryPosition(data.insertAt)}">${data.found >= 0 ? 'RETURN' : 'INSERT'}</i>` : '';
  const result = Number.isInteger(data.insertAt) ? `<div class="binary-result ${data.found >= 0 ? 'found' : 'insert'}"><span>${data.found >= 0 ? 'Target found' : 'Target not found'}</span><strong>${data.found >= 0 ? 'Return index' : 'Insert at index'} ${data.insertAt}</strong></div>` : '';
  return `<div class="binary-visual"><div class="search-pointers">${pointer('L', data.left)}${pointer('M', data.mid, 'mid')}${pointer('R', data.right)}${insertionPointer}<i class="target-chip">target ${data.target}</i></div><div class="binary-cells">${data.values.map((value, index) => `<div class="binary-cell ${index >= data.left && index <= data.right ? 'in-range' : ''} ${index === data.mid ? 'mid' : ''} ${index === data.found ? 'found' : ''} ${data.found < 0 && index === data.insertAt ? 'insert-target' : ''}">${value}<span>${index}</span></div>`).join('')}</div>${result}</div>`;
}

function treeMarkup(data) {
  const nodes = data.nodes || []; const byId = new Map(nodes.map(node => [node.id, node])); const coords = new Map(); let slot = 0; let maxDepth = 0;
  function assign(id, depth) { if (!id || !byId.has(id)) return; const node = byId.get(id); maxDepth = Math.max(maxDepth, depth); assign(node.left, depth + 1); coords.set(id, { x: 52 + slot++ * 96, y: 38 + depth * 92 }); assign(node.right, depth + 1); }
  if (nodes.length) assign(nodes[0].id, 0);
  const width = Math.max(360, 52 + Math.max(slot - 1, 0) * 96 + 52); const height = Math.max(100, 96 + maxDepth * 92);
  const visited = new Set(data.visited || []); const frontier = new Set(data.frontier || []);
  const edges = nodes.flatMap(node => ['left', 'right'].filter(side => node[side] && coords.has(node[side])).map(side => { const from = coords.get(node.id), to = coords.get(node[side]); return `<line class="tree-edge" x1="${from.x}" y1="${from.y + 22}" x2="${to.x}" y2="${to.y - 22}" />`; })).join('');
  const circles = nodes.map(node => { const point = coords.get(node.id); const stateClass = node.id === data.inserted ? 'inserted' : data.active === node.id ? 'current' : visited.has(node.id) ? 'visited' : frontier.has(node.id) ? 'frontier' : ''; const heightLabel = Number.isInteger(node.height) ? `<text class="tree-meta" text-anchor="middle" y="47">h:${node.height}</text>` : ''; return `<g class="tree-node ${stateClass}" transform="translate(${point.x} ${point.y})"><circle r="21"></circle><text class="tree-value" text-anchor="middle" dy="4">${escapeHtml(node.val)}</text><text class="tree-id" text-anchor="middle" y="33">${escapeHtml(node.id.replace('node_', 'n'))}</text>${heightLabel}</g>`; }).join('');
  const values = (ids) => (ids || []).map(id => byId.get(id)?.val).filter(value => value !== undefined).join('  ·  ') || '—';
  const isBst = data.strategy === 'BST_INSERT'; const frontierLabel = isBst ? 'SEARCH PATH' : data.strategy === 'BFS' ? 'QUEUE' : 'STACK'; const visitedLabel = isBst ? 'INSERTED' : 'VISITED'; const visitedText = isBst ? (data.inserted ? String(byId.get(data.inserted)?.val) : data.duplicate ? 'already exists' : '—') : values(data.visited); const orderLabel = isBst ? 'TREE HEIGHT' : 'ORDER'; const orderText = isBst ? `h = ${data.height ?? 0}` : (data.order || []).join(' → ') || '—';
  return `<div class="tree-visual"><div class="tree-canvas"><svg class="tree-svg" width="100%" height="100%" viewBox="0 0 ${width} ${height}" preserveAspectRatio="xMidYMid meet" role="img" aria-label="${data.strategy} tree visualization">${edges}${circles}</svg></div><div class="tree-state-strip"><span><b>${frontierLabel}</b><i>${escapeHtml(values(data.frontier))}</i></span><span><b>${visitedLabel}</b><i>${escapeHtml(visitedText)}</i></span><span><b>${orderLabel}</b><i>${escapeHtml(orderText)}</i></span></div></div>`;
}

function linkedListMarkup(data) { const pointers = data.pointers || {}; const namesFor = (id) => Object.entries(pointers).filter(([, value]) => value === id).map(([key]) => key.replace('nextTemp', 'next')).join(' · '); return `<div class="linked-visual">${data.nodes.map((node, index) => { const names = namesFor(node.id); const head = pointers.head === node.id; return `<div class="node-group"><div class="node ${names ? 'pointed' : ''} ${head ? 'head' : ''}">${names ? `<i>${escapeHtml(names)}</i>` : ''}${node.val}</div>${index < data.nodes.length - 1 ? `<div class="node-arrow ${node.next ? '' : 'broken'}"></div>` : ''}</div>`; }).join('')}</div>`; }
function twoPointerStringMarkup(data) {
  const skipped = new Set(data.skipped || []); const mismatch = new Set(data.mismatch || []);
  const pointer = (label, index, type) => index === null || index === undefined ? '' : `<span class="string-pointer ${type}" style="left:${((index + .5) / data.chars.length) * 100}%">${label}</span>`;
  return `<div class="string-visual two-pointer-string"><div class="string-pointer-lane">${pointer('L', data.left, 'left')}${pointer('R', data.right, 'right')}</div><div class="string-cells">${data.chars.map((char, index) => `<div class="string-cell ${index === data.left ? 'left-active' : ''} ${index === data.right ? 'right-active' : ''} ${skipped.has(index) ? 'skipped' : ''} ${mismatch.has(index) ? 'mismatch' : ''}"><b>${escapeHtml(char === ' ' ? '·' : char)}</b><span>${index}</span></div>`).join('')}</div>${data.result !== null ? `<div class="string-result ${data.result ? 'success' : 'failure'}">${data.result ? '✓ Palindrome' : '× Not a palindrome'}</div>` : ''}</div>`;
}
function slidingWindowMarkup(data) {
  const inWindow = (index) => data.right >= data.left && index >= data.left && index <= data.right; const inBest = (index) => data.bestEnd >= data.bestStart && index >= data.bestStart && index <= data.bestEnd;
  const pointer = (label, index, type) => index === null || index === undefined || index < 0 ? '' : `<span class="string-pointer ${type}" style="left:${((index + .5) / data.chars.length) * 100}%">${label}</span>`;
  const best = data.bestEnd >= data.bestStart ? escapeHtml(data.chars.slice(data.bestStart, data.bestEnd + 1).join('')) : '—';
  return `<div class="string-visual sliding-window-string"><div class="string-pointer-lane">${pointer('L', data.left, 'left')}${pointer('R', data.right, 'right')}</div><div class="string-cells">${data.chars.map((char, index) => `<div class="string-cell ${inWindow(index) ? 'window' : ''} ${inBest(index) ? 'best' : ''} ${index === data.right ? 'right-active' : ''} ${data.duplicate === index ? 'duplicate' : ''}"><b>${escapeHtml(char === ' ' ? '·' : char)}</b><span>${index}</span></div>`).join('')}</div><div class="window-summary"><span>Active <b>${escapeHtml(data.right >= data.left ? data.chars.slice(data.left, data.right + 1).join('') : '—')}</b></span><span>Best <b>${best}</b> · ${data.bestLength}</span></div></div>`;
}
function moveStep(direction) { if (!state.trace) return showToast('Run a visualization first.'); const max = totalFrames() - 1; state.step = Math.max(0, Math.min(max, state.step + direction)); renderStep(); if (state.step === max) stopPlayback(); }
function seek(step) { if (!state.trace) return; state.step = Number(step); renderStep(); }
function stopPlayback() { state.playing = false; clearInterval(state.timer); state.timer = null; $('#play-toggle').innerHTML = '▶ <span>Play</span>'; }
function togglePlayback() { if (!state.trace) return showToast('Run a visualization first.'); const max = totalFrames() - 1; if (state.playing) return stopPlayback(); if (state.step >= max) state.step = 0; state.playing = true; $('#play-toggle').innerHTML = 'Ⅱ <span>Pause</span>'; state.timer = setInterval(() => { if (state.step >= max) return stopPlayback(); moveStep(1); }, Number($('#speed-select').value)); }
function formatInput() { const field = $('#input-editor'); try { field.value = JSON.stringify(JSON.parse(field.value)); updateArrayToolbelt(); syncTreeStrategyFromInput(); setRequestStatus('Input formatted'); } catch { setRequestStatus('Input is not valid JSON', 'error'); } }
function openApproach() {
  const problem = activeProblem(); if (!problem) return;
  state.userDraft = $('#shared-code').value; $('#drawer-reference-code').textContent = problem.referenceCode;
  $('#approach-drawer').classList.add('open'); $('#approach-drawer').setAttribute('aria-hidden', 'false');
  $('#code-section').scrollIntoView({ behavior: 'smooth', block: 'start' });
}
function closeApproach() { $('#approach-drawer').classList.remove('open'); $('#approach-drawer').setAttribute('aria-hidden', 'true'); }
function replaceWithOptimal() {
  const problem = activeProblem(); if (!problem) return;
  stopPlayback(); state.userDraft = problem.referenceCode; state.trace = null; state.step = 0; syncCodeSurface(); resetTraceUI(); closeApproach(); setRequestStatus('Optimal reference copied — run visualization'); showToast('Your solution was replaced with the optimal reference.', 'success');
}
function toggleSidebar() { const sidebar = $('#left-sidebar'); const collapsed = sidebar.classList.toggle('collapsed'); $('#main-content').classList.toggle('sidebar-collapsed', collapsed); $('#sidebar-toggle').setAttribute('aria-label', collapsed ? 'Expand navigation' : 'Collapse navigation'); }
function toggleVisualFullscreen() {
  const card = $('#visual-card'); const button = $('#visual-fullscreen'); const expanded = card.classList.toggle('visual-expanded');
  document.body.classList.toggle('visual-expanded-open', expanded);
  button.innerHTML = expanded ? '⤢ <span>Exit</span>' : '⛶ <span>Expand</span>';
  button.setAttribute('aria-label', expanded ? 'Exit expanded visualization' : 'Expand visualization');
  button.title = expanded ? 'Exit expanded visualization (Esc)' : 'Expand visualization';
  requestAnimationFrame(() => { if (state.trace) renderStep(); });
}
function handleKeyboard(event) { if (event.key === 'Escape' && $('#visual-card').classList.contains('visual-expanded')) { toggleVisualFullscreen(); return; } const typing = ['TEXTAREA', 'INPUT', 'SELECT'].includes(document.activeElement.tagName); if ((event.metaKey || event.ctrlKey) && event.key === 'Enter') { event.preventDefault(); runTrace(); return; } if (typing || !$('#shortcuts-modal').classList.contains('hidden')) return; if (event.key === ' ') { event.preventDefault(); togglePlayback(); } if (event.key === 'ArrowRight') { event.preventDefault(); moveStep(1); } if (event.key === 'ArrowLeft') { event.preventDefault(); moveStep(-1); } if (event.key === 'Home' && state.trace) { event.preventDefault(); state.step = 0; renderStep(); } if (event.key === 'End' && state.trace) { event.preventDefault(); state.step = totalFrames() - 1; renderStep(); } }
function setupListeners() {
  $('#shared-code').addEventListener('input', () => { state.userDraft = $('#shared-code').value; updateGutter(); });
  $('#input-editor').addEventListener('input', () => { updateArrayToolbelt(); syncTreeStrategyFromInput(); if (state.trace) markInputChanged(); });
  $('#array-toolbelt').querySelectorAll('[data-array-action]').forEach((button) => button.addEventListener('click', () => applyArrayAction(button.dataset.arrayAction)));
  $('#array-size').addEventListener('input', (event) => resizeArrayInput(Number(event.target.value)));
  $('#run-button').addEventListener('click', runTrace); $('#run-button-top').addEventListener('click', runTrace); $('#format-input').addEventListener('click', formatInput); $('#sidebar-toggle').addEventListener('click', toggleSidebar); $('#visual-fullscreen').addEventListener('click', toggleVisualFullscreen);
  $('#focus-toggle').querySelectorAll('button').forEach((button) => button.addEventListener('click', () => setFocus(button.dataset.focus))); $('#approach-toggle').addEventListener('click', openApproach); $('#drawer-close').addEventListener('click', closeApproach); $('#return-to-code').addEventListener('click', closeApproach); $('#replace-with-optimal').addEventListener('click', replaceWithOptimal);
  $('#go-start').addEventListener('click', () => { if (state.trace) { state.step = 0; renderStep(); } }); $('#step-back').addEventListener('click', () => moveStep(-1)); $('#play-toggle').addEventListener('click', togglePlayback); $('#step-forward').addEventListener('click', () => moveStep(1)); $('#go-end').addEventListener('click', () => { if (state.trace) { state.step = totalFrames() - 1; renderStep(); } }); $('#timeline').addEventListener('input', (event) => { stopPlayback(); seek(event.target.value); }); $('#speed-select').addEventListener('change', () => { if (state.playing) { stopPlayback(); togglePlayback(); } });
  $('#jump-divergence').addEventListener('click', () => { if (state.trace?.diff.firstDivergence) { state.step = state.trace.diff.firstDivergence.step; setFocus('user'); renderStep(); } }); $('#shortcuts-button').addEventListener('click', () => $('#shortcuts-modal').classList.remove('hidden')); $('#modal-close').addEventListener('click', () => $('#shortcuts-modal').classList.add('hidden')); $('#shortcuts-modal').addEventListener('click', (event) => { if (event.target.id === 'shortcuts-modal') $('#shortcuts-modal').classList.add('hidden'); }); document.addEventListener('keydown', handleKeyboard);
}

setupListeners();
loadProblems().then(() => { state.registryPollTimer = setInterval(refreshProblemRegistry, 5000); }).catch((error) => { setRequestStatus('Could not reach the local gateway', 'error'); $('#primary-visual').innerHTML = emptyState('Gateway offline', error.message); });
