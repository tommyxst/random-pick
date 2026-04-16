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
    stopping: false,
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

// --- Three.js Animation logic ---
let threeScene, threeCamera, threeRenderer, threeMixer, threeClock;
let threeObjects = [];
let speedLines;

function createTextTexture(text) {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 128;
  const ctx = canvas.getContext('2d');
  
  // ZZZ Dark background
  ctx.fillStyle = '#101010';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  
  // Neon Yellow Border
  ctx.strokeStyle = '#ffde00';
  ctx.lineWidth = 14;
  ctx.strokeRect(7, 7, canvas.width - 14, canvas.height - 14);

  // ZZZ Slanted Caution Strip (Left side)
  ctx.fillStyle = '#ffde00';
  ctx.beginPath();
  ctx.moveTo(0, 0);
  ctx.lineTo(60, 0);
  ctx.lineTo(30, canvas.height);
  ctx.lineTo(0, canvas.height);
  ctx.fill();

  // Text
  ctx.fillStyle = '#ffffff';
  ctx.font = '900 64px "Orbitron", "Noto Sans SC", sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  
  // Add slight slant to text
  ctx.setTransform(1, 0, -0.15, 1, 0, 0);
  ctx.fillText(text, canvas.width / 2 + 20, canvas.height / 2 + 5);

  const texture = new THREE.CanvasTexture(canvas);
  texture.anisotropy = 16;
  return texture;
}

function initThreeScene() {
  const container = $('threejs-container');
  if (!container) return;
  
  if (threeRenderer) {
    container.innerHTML = '';
  }

  const width = container.clientWidth || 800;
  const height = container.clientHeight || 400;

  threeScene = new THREE.Scene();
  threeScene.fog = new THREE.FogExp2(0x050505, 0.03);

  threeCamera = new THREE.PerspectiveCamera(75, width / height, 0.1, 1000);
  threeCamera.position.z = 18;
  threeCamera.position.y = 0;
  threeCamera.lookAt(0, 0, 0);

  threeRenderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: "high-performance" });
  threeRenderer.setSize(width, height);
  threeRenderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  container.appendChild(threeRenderer.domElement);

  const ambientLight = new THREE.AmbientLight(0xffffff, 0.4);
  threeScene.add(ambientLight);

  const dirLight = new THREE.DirectionalLight(0xffde00, 1.2);
  dirLight.position.set(10, 10, 10);
  threeScene.add(dirLight);

  const pointLight = new THREE.PointLight(0xff4400, 2, 50);
  pointLight.position.set(-5, -2, 5);
  threeScene.add(pointLight);

  // Add Speed Lines Particle System
  const lineGeo = new THREE.BufferGeometry();
  const lineCount = 600;
  const posArray = new Float32Array(lineCount * 3);
  for(let i=0; i < lineCount * 3; i++) {
    posArray[i] = (Math.random() - 0.5) * 80;
  }
  lineGeo.setAttribute('position', new THREE.BufferAttribute(posArray, 3));
  const lineMat = new THREE.PointsMaterial({
    color: 0xffde00,
    size: 0.3,
    transparent: true,
    opacity: 0.9,
    blending: THREE.AdditiveBlending
  });
  speedLines = new THREE.Points(lineGeo, lineMat);
  threeScene.add(speedLines);

  threeClock = new THREE.Clock();
}

function resetAnimationStage() {
  if (threeScene) {
    threeObjects.forEach(obj => {
      threeScene.remove(obj);
      if (obj.material.map) obj.material.map.dispose();
      if (obj.material.emissiveMap) obj.material.emissiveMap.dispose();
      obj.material.dispose();
      obj.geometry.dispose();
    });
    threeObjects = [];
    if (speedLines) {
      speedLines.position.set(0,0,0);
    }
  }
}

function buildAnimationChips(names) {
  resetAnimationStage();
  const shuffledNames = shuffle(names).slice(0, 40);

  const radius = 14;
  
  shuffledNames.forEach((name, i) => {
    const texture = createTextTexture(name);
    const material = new THREE.MeshStandardMaterial({ 
      map: texture,
      emissive: new THREE.Color(0xffde00),
      emissiveMap: texture,
      emissiveIntensity: 0.6, // Make it glow
      roughness: 0.1,
      metalness: 0.9,
      side: THREE.DoubleSide
    });
    // Huge cards
    const geometry = new THREE.PlaneGeometry(7.5, 1.8);
    const mesh = new THREE.Mesh(geometry, material);

    const angle = (i / shuffledNames.length) * Math.PI * 2 * 4; // 4 spirals
    const y = (i - shuffledNames.length / 2) * 0.45;
    
    mesh.position.x = Math.cos(angle) * radius;
    mesh.position.z = Math.sin(angle) * radius;
    mesh.position.y = y;
    
    mesh.lookAt(0, y, 0);
    mesh.rotateY(Math.PI); 

    // Base rotation saved in userData to preserve ring shape
    mesh.userData.baseRotX = mesh.rotation.x;
    mesh.userData.baseRotY = mesh.rotation.y;
    mesh.userData.baseRotZ = (Math.random() - 0.5) * 0.4;

    threeScene.add(mesh);
    threeObjects.push(mesh);
  });
}

function animateThreeJS() {
  if (!state.animation.active) return;
  requestAnimationFrame(animateThreeJS);
  
  const delta = threeClock.getDelta();
  const time = threeClock.getElapsedTime();

  if (!state.animation.stopping) {
    // Extremely fast spin
    threeScene.rotation.y -= delta * 5.0; 
    
    // Speed lines rushing towards camera
    if (speedLines) {
      const positions = speedLines.geometry.attributes.position.array;
      for(let i=2; i<positions.length; i+=3) {
        positions[i] += delta * 60; // Hyper speed
        if (positions[i] > 20) positions[i] = -60;
      }
      speedLines.geometry.attributes.position.needsUpdate = true;
    }

    // Dynamic FOV bumping to the beat
    threeCamera.fov = 75 + Math.sin(time * 20) * 8;
    threeCamera.updateProjectionMatrix();
  }

  // Add individual card chaotic jiggle
  threeObjects.forEach((obj, index) => {
    obj.rotation.x = obj.userData.baseRotX + Math.sin(time * 8 + index) * 0.1;
    obj.rotation.y = obj.userData.baseRotY + Math.cos(time * 6 + index) * 0.1;
    obj.rotation.z = obj.userData.baseRotZ + Math.sin(time * 5 + index) * 0.1;
  });

  // Camera bobbing
  threeCamera.position.y = Math.sin(time * 3) * 2.5;
  threeCamera.lookAt(0, 0, 0);

  if (!state.animation.stopping && Math.random() < 0.2) {
    playShuffleClick();
  }

  threeRenderer.render(threeScene, threeCamera);
}

function startAnimation(record) {
  state.animation.pendingRecord = record;
  state.animation.active = true;
  state.animation.stopping = false;

  $('animation-meta-names').textContent = `${record.totalPeople} 人`;
  $('animation-meta-groups').textContent = `${record.groupCount} 组`;
  setActiveView('animation');

  if (!threeRenderer) {
    initThreeScene();
  } else {
    // Reset camera just in case
    threeCamera.position.z = 18;
    threeCamera.fov = 75;
    threeCamera.updateProjectionMatrix();
    threeScene.rotation.y = 0;
  }

  buildAnimationChips(record.names);
  threeClock.start();
  animateThreeJS();
  
  window.addEventListener('resize', onWindowResize);
}

function onWindowResize() {
  const container = $('threejs-container');
  if (!container || !threeCamera || !threeRenderer) return;
  const width = container.clientWidth;
  const height = container.clientHeight;
  threeCamera.aspect = width / height;
  threeCamera.updateProjectionMatrix();
  threeRenderer.setSize(width, height);
}

function stopAnimation() {
  if (!state.animation.active || !state.animation.pendingRecord || state.animation.stopping) return;

  const record = state.animation.pendingRecord;
  state.animation.stopping = true;
  window.removeEventListener('resize', onWindowResize);

  const finish = () => {
    state.animation.active = false;
    resetAnimationStage();
    state.animation.pendingRecord = null;
    finalizeGrouping(record);
  };

  if (typeof window !== 'undefined' && window.gsap && threeScene) {
    // Epic Stop Animation
    // 1. Scene continues to spin and decelerates
    window.gsap.to(threeScene.rotation, {
      y: threeScene.rotation.y - Math.PI * 4, 
      duration: 1.8,
      ease: 'power3.inOut'
    });

    // 2. Camera zooms in extremely close, like entering a warp tunnel
    window.gsap.to(threeCamera.position, {
      z: 2, 
      y: 0,
      duration: 1.8,
      ease: 'power4.in',
      onComplete: finish
    });

    // 3. FOV stretches violently
    window.gsap.to(threeCamera, {
      fov: 130, 
      duration: 1.8,
      ease: 'power3.in',
      onUpdate: () => threeCamera.updateProjectionMatrix()
    });

    // 4. Speed lines burst forward
    if (speedLines) {
      window.gsap.to(speedLines.position, {
        z: 30,
        duration: 1.8,
        ease: 'power2.in'
      });
    }

  } else {
    finish();
  }
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
// --- End Three.js Animation logic ---

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
