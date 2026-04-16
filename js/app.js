/**
 * Random Team Grouper - app.js
 * 首页 / 设置 / 动画 / 结果 四视图流程
 */

const STORAGE_KEYS = {
  names: 'random-pick:names',
  extraNames: 'random-pick:extra-names',
  history: 'random-pick:history',
  groupCount: 'random-pick:group-count',
};

const DEFAULT_GROUP_COUNT = 2;
const MAX_HISTORY_ITEMS = 12;
const ANIMATION_INTERVAL_MS = 320;
const ANIMATION_VISIBLE_LIMIT = 14;

const state = {
  activeView: 'home',
  names: [],
  extraNames: [],
  groupCount: DEFAULT_GROUP_COUNT,
  history: [],
  currentRecord: null,
  currentRecordIsHistory: false,
  animation: {
    active: false,
    timerId: null,
    chips: [],
    cursor: 0,
    pendingRecord: null,
  },
};

let audioCtx = null;

function $(id) {
  if (typeof document === 'undefined') return null;
  return document.getElementById(id);
}

function getAudioCtx() {
  if (typeof window === 'undefined') return null;
  if (!audioCtx) {
    const AudioContextRef = window.AudioContext || window.webkitAudioContext;
    if (!AudioContextRef) return null;
    audioCtx = new AudioContextRef();
  }
  return audioCtx;
}

function playBeep(freq = 440, duration = 0.08, type = 'sine', volume = 0.1) {
  try {
    const ctx = getAudioCtx();
    if (!ctx) return;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, ctx.currentTime);
    gain.gain.setValueAtTime(volume, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + duration);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(ctx.currentTime);
    osc.stop(ctx.currentTime + duration);
  } catch (error) {
    // 忽略不支持音频的环境
  }
}

function playShuffleClick() {
  playBeep(620 + Math.random() * 260, 0.05, 'square', 0.06);
}

function playRevealTone() {
  playBeep(820, 0.1, 'sine', 0.14);
  setTimeout(() => playBeep(1040, 0.11, 'sine', 0.12), 110);
  setTimeout(() => playBeep(1240, 0.14, 'sine', 0.1), 220);
}

function parseNames(raw) {
  if (!raw) return [];
  return [...new Set(
    raw
      .split(/[\n,，]+/)
      .map((item) => item.trim())
      .filter(Boolean)
  )];
}

function shuffle(array) {
  const result = [...array];
  for (let index = result.length - 1; index > 0; index -= 1) {
    const randomIndex = Math.floor(Math.random() * (index + 1));
    [result[index], result[randomIndex]] = [result[randomIndex], result[index]];
  }
  return result;
}

function assignGroups(baseNames, extraNames, requestedGroupCount) {
  if (!Array.isArray(baseNames) || baseNames.length === 0) return [];
  const shuffled = shuffle(baseNames);
  const groupCount = Math.max(1, Math.min(Number(requestedGroupCount) || 1, shuffled.length));
  const groups = Array.from({ length: groupCount }, (_, index) => ({
    name: `第${index + 1}组`,
    members: [],
  }));

  shuffled.forEach((name, index) => {
    groups[index % groupCount].members.push(name);
  });

  if (Array.isArray(extraNames) && extraNames.length > 0) {
    extraNames.forEach((name, index) => {
      groups[index % groupCount].members.push(name);
    });
  }

  return groups;
}

function createHistoryRecord({ names, groups, createdAt = Date.now() }) {
  const normalizedGroups = groups.map((group) => ({
    name: group.name,
    members: [...group.members],
  }));

  return {
    id: `history-${createdAt}-${Math.random().toString(36).slice(2, 8)}`,
    createdAt,
    totalPeople: names.length,
    groupCount: normalizedGroups.length,
    names: [...names],
    groups: normalizedGroups,
  };
}

function normalizeHistoryRecord(record) {
  if (!record || !Array.isArray(record.groups) || !Array.isArray(record.names)) {
    return null;
  }

  const groups = record.groups
    .filter((group) => group && typeof group.name === 'string' && Array.isArray(group.members))
    .map((group) => ({
      name: group.name,
      members: group.members.filter(Boolean),
    }));

  if (groups.length === 0) return null;

  const createdAt = Number(record.createdAt) || Date.now();
  const names = record.names.filter(Boolean);

  return {
    id: typeof record.id === 'string' ? record.id : `history-${createdAt}`,
    createdAt,
    totalPeople: Number(record.totalPeople) || names.length,
    groupCount: Number(record.groupCount) || groups.length,
    names,
    groups,
  };
}

function readStorage(key, fallback) {
  try {
    if (typeof window === 'undefined' || !window.localStorage) return fallback;
    const raw = window.localStorage.getItem(key);
    if (!raw) return fallback;
    return JSON.parse(raw);
  } catch (error) {
    return fallback;
  }
}

function writeStorage(key, value) {
  try {
    if (typeof window === 'undefined' || !window.localStorage) return;
    if (value === null || value === undefined || (Array.isArray(value) && value.length === 0)) {
      window.localStorage.removeItem(key);
      return;
    }
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch (error) {
    // 忽略存储异常
  }
}

function persistNames() {
  writeStorage(STORAGE_KEYS.names, state.names);
}

function persistExtraNames() {
  writeStorage(STORAGE_KEYS.extraNames, state.extraNames);
}

function persistHistory() {
  writeStorage(STORAGE_KEYS.history, state.history);
}

function persistGroupCount() {
  writeStorage(STORAGE_KEYS.groupCount, state.groupCount);
}

function loadState() {
  const storedNames = readStorage(STORAGE_KEYS.names, []);
  const storedExtraNames = readStorage(STORAGE_KEYS.extraNames, []);
  const storedHistory = readStorage(STORAGE_KEYS.history, []);
  const storedGroupCount = readStorage(STORAGE_KEYS.groupCount, DEFAULT_GROUP_COUNT);

  state.names = Array.isArray(storedNames) ? storedNames.filter(Boolean) : [];
  state.extraNames = Array.isArray(storedExtraNames) ? storedExtraNames.filter(Boolean) : [];
  state.history = Array.isArray(storedHistory)
    ? storedHistory.map(normalizeHistoryRecord).filter(Boolean).slice(0, MAX_HISTORY_ITEMS)
    : [];
  state.groupCount = sanitizeGroupCount(storedGroupCount, (state.names.length + state.extraNames.length) || null);
}

function sanitizeGroupCount(value, max) {
  const numericValue = Math.max(1, Number.parseInt(value, 10) || 1);
  if (!max || max < 1) return numericValue;
  return Math.min(numericValue, max);
}

function getGroupValidation() {
  const totalPeople = state.names.length + state.extraNames.length;
  if (totalPeople === 0) {
    return { valid: false, message: '当前没有名单，请先去名单管理页保存名单。' };
  }

  const input = $('group-count');
  const groupCount = sanitizeGroupCount(input ? input.value : state.groupCount, totalPeople);
  if (groupCount > totalPeople) {
    return { valid: false, message: `组数不能超过当前名单人数（${totalPeople} 人）。` };
  }

  return { valid: true, value: groupCount, message: `将 ${totalPeople} 人分成 ${groupCount} 组。` };
}

function formatDateTime(timestamp) {
  return new Date(timestamp).toLocaleString('zh-CN', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function setAppStatus(view) {
  const map = {
    home: 'HOME',
    manage: 'MANAGE',
    group: 'GROUP',
    animation: 'LIVE',
    result: 'RESULT',
  };
  const statusText = $('app-status-text');
  if (statusText) statusText.textContent = map[view] || 'READY';
}

function setActiveView(view) {
  state.activeView = view;

  if (typeof document === 'undefined') return;
  document.body.dataset.view = view;
  document.querySelectorAll('.view').forEach((section) => {
    section.hidden = section.dataset.view !== view;
  });

  setAppStatus(view);
  animateVisibleView();
}

function animateVisibleView() {
  if (typeof window === 'undefined' || !window.gsap) return;
  const activeView = document.querySelector(`.view[data-view="${state.activeView}"]`);
  if (!activeView) return;
  const targets = activeView.querySelectorAll('.panel, .view-toolbar');
  window.gsap.killTweensOf(targets);
  window.gsap.fromTo(
    targets,
    { opacity: 0, y: 18 },
    { opacity: 1, y: 0, duration: 0.45, stagger: 0.06, ease: 'power2.out', clearProps: 'transform' }
  );
}

function updateHomeSummary() {
  const latestRecord = state.history[0];
  const totalPeople = state.names.length + state.extraNames.length;
  $('home-summary-names').textContent = `${totalPeople} 人`;
  $('home-summary-history').textContent = `${state.history.length} 次`;
  $('home-summary-latest').textContent = latestRecord ? formatDateTime(latestRecord.createdAt) : '暂无';
  $('home-history-meta').textContent = state.history.length > 0 ? `最近 ${Math.min(4, state.history.length)} 条` : '本地保存';
}

function renderChipList(containerId, emptyId, items) {
  const container = $(containerId);
  const emptyState = $(emptyId);
  if (!container || !emptyState) return;

  container.innerHTML = '';
  emptyState.hidden = items.length > 0;
  if (items.length === 0) return;

  const fragment = document.createDocumentFragment();
  items.forEach((name) => {
    const chip = document.createElement('span');
    chip.className = 'name-chip';
    chip.textContent = name;
    fragment.appendChild(chip);
  });
  container.appendChild(fragment);
}

function buildHistoryCard(record) {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'history-card';
  button.dataset.recordId = record.id;

  const previewGroups = record.groups
    .slice(0, 3)
    .map((group) => `${group.name} ${group.members.length}人`)
    .join(' · ');

  const meta = document.createElement('span');
  meta.className = 'history-card__meta';
  meta.textContent = formatDateTime(record.createdAt);

  const title = document.createElement('strong');
  title.className = 'history-card__title';
  title.textContent = `${record.totalPeople} 人 / ${record.groupCount} 组`;

  const details = document.createElement('div');
  details.className = 'history-card__details';
  details.innerHTML = `
    <span class="history-card__tag">回顾结果</span>
    <span>${previewGroups}</span>
  `;

  button.append(meta, title, details);
  return button;
}

function renderHistoryList(listId, emptyId, limit) {
  const list = $(listId);
  const emptyState = $(emptyId);
  if (!list || !emptyState) return;

  list.innerHTML = '';
  const records = typeof limit === 'number' ? state.history.slice(0, limit) : state.history;
  emptyState.hidden = records.length > 0;

  if (records.length === 0) return;

  const fragment = document.createDocumentFragment();
  records.forEach((record) => {
    fragment.appendChild(buildHistoryCard(record));
  });
  list.appendChild(fragment);
}

function renderManage() {
  const textarea = $('names-input');
  const extraTextarea = $('extra-names-input');
  if (textarea && document.activeElement !== textarea) {
    textarea.value = state.names.join('\n');
  }
  if (extraTextarea && document.activeElement !== extraTextarea) {
    extraTextarea.value = state.extraNames.join('\n');
  }

  $('manage-name-count').textContent = `${state.names.length} 人`;
  $('manage-extra-count').textContent = `${state.extraNames.length} 人`;
  $('manage-stat-names').textContent = String(state.names.length);
  $('manage-stat-extra').textContent = String(state.extraNames.length);
  $('manage-stat-history').textContent = String(state.history.length);
  const saveHint = $('manage-save-hint');
  if (saveHint) {
    saveHint.textContent = state.names.length > 0 || state.extraNames.length > 0
      ? `当前已加载常规名单 ${state.names.length} 人，额外名单 ${state.extraNames.length} 人。`
      : '名单会保存在本地，刷新后仍可继续使用。';
  }
  renderChipList('manage-name-chips', 'manage-name-empty', state.names);
  renderChipList('manage-extra-chips', 'manage-extra-empty', state.extraNames);

  const goGroupButton = $('btn-manage-to-group');
  if (goGroupButton) {
    goGroupButton.disabled = (state.names.length + state.extraNames.length) === 0;
  }
}

function renderGroup() {
  const totalPeople = state.names.length + state.extraNames.length;
  const effectiveGroupCount = sanitizeGroupCount(state.groupCount, totalPeople || null);
  state.groupCount = effectiveGroupCount;

  const groupInput = $('group-count');
  if (groupInput && document.activeElement !== groupInput) {
    groupInput.value = String(effectiveGroupCount);
  }

  $('group-stat-names').textContent = String(state.names.length + state.extraNames.length);
  $('group-stat-history').textContent = String(state.history.length);
  $('group-group-preview').textContent = `${effectiveGroupCount} 组`;
  renderHistoryList('group-history-list', 'group-history-empty', 6);
  updateGroupActionState();
}

function updateGroupActionState() {
  const validation = getGroupValidation();
  const startButton = $('btn-start-grouping');
  const hint = $('group-action-hint');

  if (startButton) startButton.disabled = !validation.valid;
  if (hint) hint.textContent = validation.message;

  const groupInput = $('group-count');
  if (groupInput && (state.names.length + state.extraNames.length) > 0) {
    groupInput.max = String(state.names.length + state.extraNames.length);
  }
}

function renderResults(record, isHistoryRecord) {
  const resultTitle = $('result-title');
  const resultMeta = $('result-meta');
  const resultTime = $('result-summary-time');
  const resultType = $('result-summary-type');
  const resultsGrid = $('results-grid');
  const emptyState = $('results-empty');

  if (!record || !resultsGrid || !emptyState) {
    if (resultsGrid) resultsGrid.innerHTML = '';
    if (emptyState) emptyState.hidden = false;
    return;
  }

  state.currentRecord = record;
  state.currentRecordIsHistory = Boolean(isHistoryRecord);

  emptyState.hidden = true;
  resultsGrid.innerHTML = '';

  if (resultTitle) resultTitle.textContent = isHistoryRecord ? '历史分组回顾' : '本次分组结果';
  if (resultMeta) resultMeta.textContent = `${record.totalPeople} 人 / ${record.groupCount} 组`;
  if (resultTime) resultTime.textContent = formatDateTime(record.createdAt);
  if (resultType) resultType.textContent = isHistoryRecord ? '历史回顾' : '当前结果';

  const fragment = document.createDocumentFragment();
  record.groups.forEach((group) => {
    const card = document.createElement('article');
    card.className = 'group-card';

    const head = document.createElement('div');
    head.className = 'group-card__head';

    const title = document.createElement('strong');
    title.className = 'group-card__title';
    title.textContent = group.name;

    const meta = document.createElement('span');
    meta.className = 'group-card__meta';
    meta.textContent = `${group.members.length} 人`;

    head.append(title, meta);

    const members = document.createElement('div');
    members.className = 'group-members';
    const shuffledMembers = isHistoryRecord ? group.members : shuffle(group.members);
    shuffledMembers.forEach((member) => {
      const item = document.createElement('div');
      item.className = 'group-member';
      item.textContent = member;
      members.appendChild(item);
    });

    card.append(head, members);
    fragment.appendChild(card);
  });

  resultsGrid.appendChild(fragment);

  if (typeof window !== 'undefined' && window.gsap) {
    const cards = resultsGrid.querySelectorAll('.group-card');
    window.gsap.fromTo(
      cards,
      { opacity: 0, y: 24, scale: 0.96 },
      { opacity: 1, y: 0, scale: 1, duration: 0.42, stagger: 0.08, ease: 'power2.out', clearProps: 'transform' }
    );
  }
}

function refreshUi() {
  updateHomeSummary();
  renderHistoryList('home-history-list', 'home-history-empty', 4);
  renderManage();
  renderGroup();
  if (state.currentRecord) {
    renderResults(state.currentRecord, state.currentRecordIsHistory);
  }
}

function focusViewTarget(target) {
  const targetElement = $(target);
  if (!targetElement) return;
  window.setTimeout(() => {
    targetElement.focus();
    if (typeof targetElement.select === 'function' && target === 'names-input') {
      targetElement.select();
    }
  }, 80);
}

function openManage(target) {
  renderManage();
  setActiveView('manage');
  focusViewTarget(target);
}

function openGroup(target) {
  renderGroup();
  setActiveView('group');
  focusViewTarget(target);
}

function handleSaveNames() {
  const textarea = $('names-input');
  const extraTextarea = $('extra-names-input');
  if (!textarea || !extraTextarea) return;

  state.names = parseNames(textarea.value);
  state.extraNames = parseNames(extraTextarea.value);
  state.groupCount = sanitizeGroupCount(state.groupCount, (state.names.length + state.extraNames.length) || null);
  persistNames();
  persistExtraNames();
  persistGroupCount();
  refreshUi();

  const saveHint = $('manage-save-hint');
  if (state.names.length === 0 && state.extraNames.length === 0) {
    if (saveHint) saveHint.textContent = '两份名单都已清空，请重新录入。';
    return;
  }

  if (saveHint) {
    saveHint.textContent = `名单已保存：常规名单 ${state.names.length} 人，额外名单 ${state.extraNames.length} 人。`;
  }
  if (typeof window !== 'undefined' && window.gsap) {
    window.gsap.fromTo(
      '.name-chip',
      { opacity: 0, y: 12 },
      { opacity: 1, y: 0, duration: 0.24, stagger: 0.03, ease: 'power2.out' }
    );
  }
}

function handleGroupCountChange(nextValue) {
  const totalPeople = state.names.length + state.extraNames.length;
  state.groupCount = sanitizeGroupCount(nextValue, totalPeople || null);
  persistGroupCount();
  renderGroup();
}

function resetAnimationStage() {
  const stage = $('animation-stage');
  if (!stage) return;
  stage.querySelectorAll('.animation-chip').forEach((chip) => chip.remove());
  const label = stage.querySelector('.animation-core__label');
  if (label) label.textContent = 'GROUPING';
  state.animation.chips = [];
  state.animation.cursor = 0;
}

function buildAnimationChips(names) {
  const stage = $('animation-stage');
  if (!stage) return [];
  resetAnimationStage();

  const chipCount = Math.min(names.length, ANIMATION_VISIBLE_LIMIT);
  const fragment = document.createDocumentFragment();

  for (let index = 0; index < chipCount; index += 1) {
    const chip = document.createElement('div');
    chip.className = 'animation-chip';
    chip.textContent = names[index];
    fragment.appendChild(chip);
  }

  stage.appendChild(fragment);
  return Array.from(stage.querySelectorAll('.animation-chip'));
}

function positionAnimationChips() {
  if (!state.animation.active || !state.animation.pendingRecord) return;
  const stage = $('animation-stage');
  if (!stage) return;

  const names = state.animation.pendingRecord.names;
  const shuffledNames = shuffle(names);
  const { width, height } = stage.getBoundingClientRect();
  const centerX = width / 2;
  const centerY = height / 2;
  const baseRadius = Math.min(width, height) * 0.24;
  const label = stage.querySelector('.animation-core__label');

  state.animation.chips.forEach((chip, index) => {
    const name = shuffledNames[(state.animation.cursor + index) % shuffledNames.length];
    chip.textContent = name;

    const angle = ((Math.PI * 2) / Math.max(1, state.animation.chips.length)) * index + state.animation.cursor * 0.14;
    const radiusX = baseRadius + Math.random() * width * 0.12;
    const radiusY = baseRadius * 0.72 + Math.random() * height * 0.1;
    const chipWidth = chip.offsetWidth || 110;
    const chipHeight = chip.offsetHeight || 40;
    const x = centerX + Math.cos(angle) * radiusX - chipWidth / 2;
    const y = centerY + Math.sin(angle) * radiusY - chipHeight / 2;

    if (typeof window !== 'undefined' && window.gsap) {
      window.gsap.to(chip, {
        x,
        y,
        opacity: 0.76 + Math.random() * 0.24,
        scale: 0.9 + Math.random() * 0.2,
        duration: 0.26,
        ease: 'power2.out',
      });
    } else {
      chip.style.transform = `translate(${x}px, ${y}px)`;
    }
  });

  state.animation.cursor += 1;
  if (label) {
    const displayIndex = (state.animation.cursor % state.animation.pendingRecord.groupCount) + 1;
    label.textContent = `G-${displayIndex}`;
  }
  playShuffleClick();
}

function startAnimation(record) {
  state.animation.pendingRecord = record;
  state.animation.active = true;

  $('animation-meta-names').textContent = `${record.totalPeople} 人`;
  $('animation-meta-groups').textContent = `${record.groupCount} 组`;
  setActiveView('animation');

  state.animation.chips = buildAnimationChips(record.names);

  const run = () => {
    positionAnimationChips();
    if (state.animation.timerId) window.clearInterval(state.animation.timerId);
    state.animation.timerId = window.setInterval(positionAnimationChips, ANIMATION_INTERVAL_MS);
  };

  window.setTimeout(run, 60);
}

function saveRecordToHistory(record) {
  state.history = [record, ...state.history.filter((item) => item.id !== record.id)].slice(0, MAX_HISTORY_ITEMS);
  persistHistory();
}

function finalizeGrouping(record) {
  if (!record) return;

  saveRecordToHistory(record);
  playRevealTone();
  refreshUi();
  renderResults(record, false);
  setActiveView('result');
}

function stopAnimation() {
  if (!state.animation.active || !state.animation.pendingRecord) return;

  const record = state.animation.pendingRecord;
  state.animation.active = false;

  if (state.animation.timerId) {
    window.clearInterval(state.animation.timerId);
    state.animation.timerId = null;
  }

  const stage = $('animation-stage');
  const chips = stage ? stage.querySelectorAll('.animation-chip') : [];

  let finished = false;
  const finish = () => {
    if (finished) return;
    finished = true;
    resetAnimationStage();
    state.animation.pendingRecord = null;
    finalizeGrouping(record);
  };

  if (typeof window !== 'undefined' && window.gsap && chips.length > 0) {
    window.gsap.to(chips, {
      opacity: 0,
      scale: 0.6,
      duration: 0.2,
      stagger: 0.02,
      ease: 'power2.in',
      onComplete: finish,
    });
    window.setTimeout(finish, 320);
  } else {
    finish();
  }
}

function handleStartGrouping() {
  const validation = getGroupValidation();
  if (!validation.valid) {
    const input = $('group-count');
    if (input && typeof window !== 'undefined' && window.gsap) {
      window.gsap.fromTo(
        input,
        { x: -6 },
        { x: 0, duration: 0.34, ease: 'elastic.out(1, 0.4)' }
      );
    }
    return;
  }

  state.groupCount = validation.value;
  persistGroupCount();

  const groups = assignGroups(state.names, state.extraNames, validation.value);
  const record = createHistoryRecord({
    names: [...state.names, ...state.extraNames],
    groups,
  });

  startAnimation(record);
}

function openHistoryRecord(recordId) {
  const record = state.history.find((item) => item.id === recordId);
  if (!record) return;
  renderResults(record, true);
  setActiveView('result');
}

function bindHistoryClicks(containerId) {
  const container = $(containerId);
  if (!container) return;
  container.addEventListener('click', (event) => {
    const button = event.target.closest('.history-card');
    if (!button) return;
    openHistoryRecord(button.dataset.recordId);
  });
}

function bindEvents() {
  $('btn-home-start').addEventListener('click', () => openGroup('group-count'));
  $('btn-home-manage').addEventListener('click', () => openManage('names-input'));
  $('btn-manage-back').addEventListener('click', () => setActiveView('home'));
  $('btn-group-back').addEventListener('click', () => setActiveView('home'));
  $('btn-manage-to-group').addEventListener('click', () => openGroup('group-count'));
  $('btn-group-to-manage').addEventListener('click', () => openManage('names-input'));

  $('btn-save-names').addEventListener('click', handleSaveNames);
  $('names-input').addEventListener('keydown', (event) => {
    if (event.key === 'Enter' && (event.ctrlKey || event.metaKey)) {
      event.preventDefault();
      handleSaveNames();
    }
  });

  $('btn-group-dec').addEventListener('click', () => handleGroupCountChange(state.groupCount - 1));
  $('btn-group-inc').addEventListener('click', () => handleGroupCountChange(state.groupCount + 1));
  $('group-count').addEventListener('input', (event) => {
    const totalPeople = state.names.length + state.extraNames.length;
    state.groupCount = sanitizeGroupCount(event.target.value, totalPeople || null);
    persistGroupCount();
    updateGroupActionState();
    $('group-group-preview').textContent = `${state.groupCount} 组`;
  });

  $('btn-start-grouping').addEventListener('click', handleStartGrouping);
  $('btn-stop-animation').addEventListener('click', stopAnimation);

  $('btn-result-home').addEventListener('click', () => setActiveView('home'));
  $('btn-result-group').addEventListener('click', () => openGroup('group-count'));

  bindHistoryClicks('home-history-list');
  bindHistoryClicks('group-history-list');
}

function initApp() {
  loadState();
  bindEvents();
  refreshUi();
  setActiveView('home');
}

const exportedHelpers = {
  parseNames,
  shuffle,
  assignGroups,
  createHistoryRecord,
  normalizeHistoryRecord,
  sanitizeGroupCount,
};

if (typeof module !== 'undefined' && module.exports) {
  module.exports = exportedHelpers;
}

if (typeof window !== 'undefined') {
  window.randomPickHelpers = exportedHelpers;
}

if (typeof document !== 'undefined') {
  document.addEventListener('DOMContentLoaded', initApp);
}
