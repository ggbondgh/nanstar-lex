const STORAGE_KEY = "super-english-state-v1";
const SYNC_SETTINGS_KEY = "super-english-sync-settings-v1";
const SYNC_META_KEY = "super-english-sync-meta-v1";

const defaultState = {
  version: 1,
  folders: [{ id: "default", name: "默认" }],
  items: [],
  activity: {},
  activityUpdatedAt: {}
};

let state = loadState();
let syncSettings = loadSyncSettings();
let syncMeta = loadSyncMeta();
let supabaseClient = null;
let currentUser = null;
let syncInProgress = false;
let syncTimer = null;
let syncPollTimer = null;
let suppressAutoSync = false;
let hasPendingSync = Boolean(syncMeta.hasPendingSync);
let syncDirtyRevision = hasPendingSync ? 1 : 0;
let lastSyncedAt = syncMeta.lastSyncedAt ? new Date(syncMeta.lastSyncedAt) : null;
let lastSyncError = syncMeta.lastError || "";
let importPreview = [];
let currentPracticeItemId = null;
let wordTrainingMode = "input";
let currentSentenceSolved = false;
let currentWordResolved = false;
let wordAnswerVisible = false;
let wordReviewAnswerVisible = false;
let sentenceHintVisible = false;
let bulkMode = false;
let selectedIds = new Set();
let practiceAutoFocusBlockedUntil = 0;
let autoSyncDeferred = false;

const $ = (selector) => document.querySelector(selector);
const $$ = (selector) => Array.from(document.querySelectorAll(selector));

const els = {
  navItems: $$(".nav-item"),
  views: $$(".view"),
  todayPracticeCount: $("#todayPracticeCount"),
  quickImportButton: $("#quickImportButton"),
  quickPracticeButton: $("#quickPracticeButton"),
  exportDataButton: $("#exportDataButton"),
  restoreFile: $("#restoreFile"),
  toast: $("#toast"),
  syncStatus: $("#syncStatus"),
  syncUrlInput: $("#syncUrlInput"),
  syncAnonKeyInput: $("#syncAnonKeyInput"),
  syncEmailInput: $("#syncEmailInput"),
  syncPasswordInput: $("#syncPasswordInput"),
  saveSyncConfigButton: $("#saveSyncConfigButton"),
  syncSignUpButton: $("#syncSignUpButton"),
  syncSignInButton: $("#syncSignInButton"),
  syncNowButton: $("#syncNowButton"),
  syncSignOutButton: $("#syncSignOutButton"),

  practiceType: $("#practiceType"),
  practiceTypeButtons: $("#practiceTypeButtons"),
  practiceScope: $("#practiceScope"),
  practiceOrderMode: $("#practiceOrderMode"),
  practiceEmpty: $("#practiceEmpty"),
  wordTrainer: $("#wordTrainer"),
  sentenceTrainer: $("#sentenceTrainer"),
  availableCount: $("#availableCount"),
  favoriteCount: $("#favoriteCount"),
  pausedCount: $("#pausedCount"),

  wordFolderLabel: $("#wordFolderLabel"),
  wordFavoriteButton: $("#wordFavoriteButton"),
  wordPromptLabel: $("#wordPromptLabel"),
  wordPrompt: $("#wordPrompt"),
  wordInputMode: $("#wordInputMode"),
  wordReviewMode: $("#wordReviewMode"),
  wordBuilder: $("#wordBuilder"),
  wordAnswerInput: $("#wordAnswerInput"),
  wordAnswerReveal: $("#wordAnswerReveal"),
  wordFeedback: $("#wordFeedback"),
  wordReviewFeedback: $("#wordReviewFeedback"),
  wordSubmitButton: $("#wordSubmitButton"),
  wordShowAnswerButton: $("#wordShowAnswerButton"),
  wordNextButton: $("#wordNextButton"),
  wordMaskedMeaning: $("#wordMaskedMeaning"),
  wordPauseButton: $("#wordPauseButton"),
  wordSwitchModeButton: $("#wordSwitchModeButton"),

  sentenceFolderLabel: $("#sentenceFolderLabel"),
  sentenceFavoriteButton: $("#sentenceFavoriteButton"),
  sentenceChinese: $("#sentenceChinese"),
  sentenceBuilder: $("#sentenceBuilder"),
  sentenceFeedback: $("#sentenceFeedback"),
  sentenceSubmitButton: $("#sentenceSubmitButton"),
  sentenceHintButton: $("#sentenceHintButton"),
  sentenceNextButton: $("#sentenceNextButton"),
  sentenceHintReveal: $("#sentenceHintReveal"),
  sentencePauseButton: $("#sentencePauseButton"),

  importType: $("#importType"),
  importFolder: $("#importFolder"),
  importTags: $("#importTags"),
  importText: $("#importText"),
  parseImportButton: $("#parseImportButton"),
  confirmImportButton: $("#confirmImportButton"),
  clearImportButton: $("#clearImportButton"),
  newFolderButton: $("#newFolderButton"),
  importPreview: $("#importPreview"),
  previewCount: $("#previewCount"),
  tagSuggestions: $("#tagSuggestions"),

  libraryType: $("#libraryType"),
  libraryFolder: $("#libraryFolder"),
  libraryStatus: $("#libraryStatus"),
  libraryTag: $("#libraryTag"),
  libraryFavoritesOnly: $("#libraryFavoritesOnly"),
  librarySearch: $("#librarySearch"),
  libraryList: $("#libraryList"),
  libraryNewFolderButton: $("#libraryNewFolderButton"),
  bulkModeToggle: $("#bulkModeToggle"),
  selectVisibleButton: $("#selectVisibleButton"),
  clearSelectionButton: $("#clearSelectionButton"),
  bulkDeleteButton: $("#bulkDeleteButton"),
  selectedCountLabel: $("#selectedCountLabel"),

  totalItemsStat: $("#totalItemsStat"),
  todayItemsStat: $("#todayItemsStat"),
  todayCorrectStat: $("#todayCorrectStat"),
  favoriteItemsStat: $("#favoriteItemsStat"),
  weekTotalLabel: $("#weekTotalLabel"),
  weekChart: $("#weekChart")
};

init();

function init() {
  repairLegacyState();
  renderAll();
  bindEvents();
  hydrateSyncForm();
  updateCredentialScope("practice");
  initializeSync();
  loadPracticeCard();

  if ("serviceWorker" in navigator) {
    navigator.serviceWorker.register("./sw.js").catch(() => {});
  }
}

function bindEvents() {
  els.navItems.forEach((button) => {
    button.addEventListener("click", () => switchView(button.dataset.view));
  });

  $$("[data-view-jump]").forEach((button) => {
    button.addEventListener("click", () => switchView(button.dataset.viewJump));
  });

  els.quickImportButton.addEventListener("click", () => switchView("import"));
  els.quickPracticeButton.addEventListener("click", () => switchView("practice"));

  els.practiceTypeButtons.addEventListener("click", (event) => {
    const button = event.target.closest("[data-practice-target]");
    if (!button) return;
    els.practiceType.value = button.dataset.practiceTarget;
    syncPracticeModeButtons();
    currentPracticeItemId = null;
    loadPracticeCard();
    renderPracticeMetrics();
  });

  [els.practiceScope, els.practiceOrderMode].forEach((control) => {
    control.addEventListener("change", () => {
      currentPracticeItemId = null;
      loadPracticeCard();
      renderPracticeMetrics();
    });
  });

  els.wordAnswerInput.addEventListener("keydown", (event) => {
    if (event.key === "Enter") {
      event.preventDefault();
      submitWordAnswer();
    }
  });
  els.wordBuilder.addEventListener("keydown", handleWordBuilderKeydown);
  els.wordBuilder.addEventListener("input", handleWordBuilderInput);
  document.addEventListener("keydown", handleGlobalShortcuts);
  els.wordSubmitButton.addEventListener("click", submitWordAnswer);
  els.wordShowAnswerButton.addEventListener("click", toggleWordAnswer);
  els.wordNextButton.addEventListener("click", nextWordCard);
  els.wordMaskedMeaning.addEventListener("click", nextWordReviewCard);
  els.wordPauseButton.addEventListener("click", pauseCurrentPracticeItem);
  els.wordSwitchModeButton.addEventListener("click", switchWordTrainingMode);
  els.wordFavoriteButton.addEventListener("click", toggleCurrentFavorite);

  els.sentenceBuilder.addEventListener("keydown", handleSentenceKeydown);
  els.sentenceBuilder.addEventListener("input", handleSentenceInput);
  els.sentenceSubmitButton.addEventListener("click", submitSentenceAnswer);
  els.sentenceHintButton.addEventListener("click", toggleSentenceHint);
  els.sentenceNextButton.addEventListener("click", nextSentenceCard);
  els.sentencePauseButton.addEventListener("click", pauseCurrentPracticeItem);
  els.sentenceFavoriteButton.addEventListener("click", toggleCurrentFavorite);

  els.parseImportButton.addEventListener("click", parseImport);
  els.confirmImportButton.addEventListener("click", confirmImport);
  els.clearImportButton.addEventListener("click", clearImport);
  els.newFolderButton.addEventListener("click", createFolder);
  els.libraryNewFolderButton.addEventListener("click", createFolder);

  [els.importType, els.importFolder].forEach((control) => {
    control.addEventListener("change", () => {
      if (importPreview.length) parseImport();
    });
  });

  [els.libraryType, els.libraryFolder, els.libraryStatus, els.libraryTag, els.libraryFavoritesOnly].forEach((control) => {
    control.addEventListener("change", () => {
      selectedIds.clear();
      renderLibrary();
    });
  });
  els.librarySearch.addEventListener("input", () => {
    selectedIds.clear();
    renderLibrary();
  });

  els.bulkModeToggle.addEventListener("change", () => {
    bulkMode = els.bulkModeToggle.checked;
    selectedIds.clear();
    renderLibrary();
  });
  els.selectVisibleButton.addEventListener("click", selectVisibleItems);
  els.clearSelectionButton.addEventListener("click", () => {
    selectedIds.clear();
    renderLibrary();
  });
  els.bulkDeleteButton.addEventListener("click", bulkDeleteSelected);

  els.exportDataButton.addEventListener("click", exportData);
  els.restoreFile.addEventListener("change", restoreData);
  els.saveSyncConfigButton.addEventListener("click", saveSyncConfig);
  els.syncSignUpButton.addEventListener("click", signUpForSync);
  els.syncSignInButton.addEventListener("click", signInForSync);
  els.syncSignOutButton.addEventListener("click", signOutFromSync);
  els.syncNowButton.addEventListener("click", () => syncNow({ manual: true }));
  document.addEventListener("focusout", handleAutoSyncResumeCheck);
  document.addEventListener("visibilitychange", handleAutoSyncVisibilityChange);
}

function loadState() {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (!stored) return structuredClone(defaultState);
    const parsed = JSON.parse(stored);
    return {
      ...structuredClone(defaultState),
      ...parsed,
      folders: parsed.folders?.length ? parsed.folders : structuredClone(defaultState.folders),
      items: Array.isArray(parsed.items) ? parsed.items : [],
      activity: parsed.activity || {},
      activityUpdatedAt: parsed.activityUpdatedAt || {}
    };
  } catch {
    return structuredClone(defaultState);
  }
}

function loadSyncSettings() {
  try {
    const stored = localStorage.getItem(SYNC_SETTINGS_KEY);
    if (!stored) return { url: "", anonKey: "", email: "" };
    return { url: "", anonKey: "", email: "", ...JSON.parse(stored) };
  } catch {
    return { url: "", anonKey: "", email: "" };
  }
}

function loadSyncMeta() {
  try {
    const stored = localStorage.getItem(SYNC_META_KEY);
    if (!stored) return {};
    return JSON.parse(stored) || {};
  } catch {
    return {};
  }
}

function repairLegacyState() {
  let changed = false;

  if (!state.folders?.length) {
    state.folders = structuredClone(defaultState.folders);
    changed = true;
  }

  state.folders.forEach((folder) => {
    if (folder.id === "default" && folder.name !== "默认") {
      folder.name = "默认";
      changed = true;
    }
    if (!folder.createdAt) {
      folder.createdAt = Date.now();
      changed = true;
    }
    if (!folder.updatedAt) {
      folder.updatedAt = folder.createdAt;
      changed = true;
    }
  });

  state.items.forEach((item) => {
    if (!item.stats) {
      item.stats = newItemStats();
      changed = true;
    }
    if (!Array.isArray(item.tags)) {
      item.tags = [];
      changed = true;
    }
    if (!item.folderId) {
      item.folderId = "default";
      changed = true;
    }
    if (!item.createdAt) {
      item.createdAt = Date.now();
      changed = true;
    }
    if (!item.updatedAt) {
      item.updatedAt = item.createdAt;
      changed = true;
    }
  });

  if (!state.activityUpdatedAt) {
    state.activityUpdatedAt = {};
    changed = true;
  }

  Object.keys(state.activity || {}).forEach((day) => {
    if (!state.activityUpdatedAt[day]) {
      state.activityUpdatedAt[day] = Date.now();
      changed = true;
    }
  });

  if (changed) saveState();
}

function saveState() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  markSyncPending();
  scheduleAutoSync();
}

function saveStateLocalOnly() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

function markSyncPending() {
  if (suppressAutoSync) return;
  hasPendingSync = true;
  syncDirtyRevision += 1;
  lastSyncError = "";
  persistSyncMeta();
  updateSyncStatus();
}

function persistSyncMeta() {
  syncMeta = {
    hasPendingSync,
    lastSyncedAt: lastSyncedAt ? lastSyncedAt.toISOString() : "",
    lastError: lastSyncError
  };
  localStorage.setItem(SYNC_META_KEY, JSON.stringify(syncMeta));
}

function nowMs() {
  return Date.now();
}

function touchFolder(folder) {
  folder.updatedAt = nowMs();
}

function touchItem(item) {
  item.updatedAt = nowMs();
}

function touchActivity(day) {
  state.activityUpdatedAt = state.activityUpdatedAt || {};
  state.activityUpdatedAt[day] = nowMs();
}

function uid(prefix) {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

function switchView(viewName) {
  els.navItems.forEach((button) => button.classList.toggle("active", button.dataset.view === viewName));
  els.views.forEach((view) => view.classList.toggle("active", view.id === `${viewName}View`));
  updateCredentialScope(viewName);

  if (viewName === "practice") loadPracticeCard(false);
  if (viewName === "library") renderLibrary();
  if (viewName === "stats") renderStats();
}

function updateCredentialScope(viewName = getActiveView()) {
  const settingsActive = viewName === "settings";
  [els.syncUrlInput, els.syncAnonKeyInput, els.syncEmailInput, els.syncPasswordInput].forEach((input) => {
    input.disabled = !settingsActive || syncInProgress;
  });
  els.syncEmailInput.autocomplete = settingsActive ? "email" : "off";
  els.syncPasswordInput.type = settingsActive ? "password" : "text";
  els.syncPasswordInput.autocomplete = settingsActive ? "current-password" : "off";
}

function renderAll() {
  renderFolderOptions();
  renderTagControls();
  syncPracticeModeButtons();
  renderPracticeMetrics();
  renderLibrary();
  renderStats();
  renderTodayCount();
}

function syncPracticeModeButtons() {
  $$("[data-practice-target]").forEach((button) => {
    button.classList.toggle("active", button.dataset.practiceTarget === els.practiceType.value);
  });
}

function renderFolderOptions() {
  const allFolderOptions = [{ id: "all", name: "全部文件夹" }, ...state.folders];
  setSelectOptions(els.importFolder, state.folders, false);
  renderPracticeScopeOptions();
  setSelectOptions(els.libraryFolder, allFolderOptions, true);
}

function setSelectOptions(select, options, allowAll) {
  const previous = select.value || (allowAll ? "all" : "default");
  select.textContent = "";

  options.forEach((folder) => {
    const option = document.createElement("option");
    option.value = folder.id;
    option.textContent = folder.name;
    select.append(option);
  });

  if (options.some((folder) => folder.id === previous)) {
    select.value = previous;
  } else {
    select.value = allowAll ? "all" : "default";
  }
}

function renderPracticeScopeOptions() {
  const previous = els.practiceScope.value || "all";
  const folders = state.folders.filter((folder) => !folder.deletedAt);
  els.practiceScope.textContent = "";

  const allGroup = document.createElement("optgroup");
  allGroup.label = "全部";
  allGroup.append(
    makeOption("all", "全部内容"),
    makeOption("favorites:all", "全部收藏")
  );
  els.practiceScope.append(allGroup);

  if (folders.length) {
    const folderGroup = document.createElement("optgroup");
    folderGroup.label = "文件夹";
    folders.forEach((folder) => {
      folderGroup.append(makeOption(`folder:${folder.id}`, folder.name));
    });
    els.practiceScope.append(folderGroup);
  }

  const values = Array.from(els.practiceScope.querySelectorAll("option")).map((option) => option.value);
  els.practiceScope.value = values.includes(previous) ? previous : previous.startsWith("favorites:") ? "favorites:all" : "all";
}

function makeOption(value, text) {
  const option = document.createElement("option");
  option.value = value;
  option.textContent = text;
  return option;
}

function renderTagControls() {
  const previous = els.libraryTag.value || "all";
  const tags = getAllTags();
  els.libraryTag.textContent = "";
  const all = document.createElement("option");
  all.value = "all";
  all.textContent = "全部标签";
  els.libraryTag.append(all);
  tags.forEach((tag) => {
    const option = document.createElement("option");
    option.value = tag;
    option.textContent = tag;
    els.libraryTag.append(option);
  });
  els.libraryTag.value = tags.includes(previous) ? previous : "all";

  els.tagSuggestions.textContent = "";
  tags.forEach((tag) => {
    const option = document.createElement("option");
    option.value = tag;
    els.tagSuggestions.append(option);
  });
}

function getAllTags() {
  return Array.from(new Set(state.items.filter((item) => !item.deletedAt).flatMap((item) => item.tags || []))).sort((a, b) => a.localeCompare(b, "zh-CN"));
}

function createFolder() {
  const name = prompt("文件夹名称");
  if (!name) return;
  const trimmed = name.trim();
  if (!trimmed) return;

  const existing = state.folders.find((folder) => folder.name === trimmed);
  if (existing) {
    els.importFolder.value = existing.id;
    els.practiceScope.value = `folder:${existing.id}`;
    els.libraryFolder.value = existing.id;
    showToast("文件夹已存在，已切换过去");
    return;
  }

  const timestamp = nowMs();
  const folder = { id: uid("folder"), name: trimmed, createdAt: timestamp, updatedAt: timestamp };
  state.folders.push(folder);
  saveState();
  renderFolderOptions();
  els.importFolder.value = folder.id;
  els.practiceScope.value = `folder:${folder.id}`;
  els.libraryFolder.value = folder.id;
  showToast("文件夹已创建");
}

function parseImport() {
  const type = els.importType.value;
  const lines = els.importText.value.split(/\r?\n/);
  importPreview = lines.flatMap((line, index) => parseImportLine(line, index + 1, type));
  renderImportPreview();
  els.confirmImportButton.disabled = importPreview.length === 0;
}

function parseImportLine(line, lineNumber, type) {
  const trimmed = line.trim();
  if (!trimmed) return [];

  const entries = [];
  const pairRegex = /([A-Za-z0-9][^\u3400-\u9fff]*?)\s*([\u3400-\u9fff][\s\S]*?)(?=\s+[A-Za-z0-9][^\u3400-\u9fff]*?\s*[\u3400-\u9fff]|$)/gu;
  const matches = Array.from(trimmed.matchAll(pairRegex));

  if (matches.length) {
    matches.forEach((match) => {
      const english = cleanupEnglish(match[1]);
      const chinese = cleanupChinese(match[2]);
      if (english && chinese) entries.push({ type, english, chinese, lineNumber });
    });
    return entries;
  }

  const firstChineseIndex = trimmed.search(/[\u3400-\u9fff]/u);
  if (firstChineseIndex > 0) {
    const english = cleanupEnglish(trimmed.slice(0, firstChineseIndex));
    const chinese = cleanupChinese(trimmed.slice(firstChineseIndex));
    if (english && chinese) entries.push({ type, english, chinese, lineNumber });
  }

  return entries;
}

function cleanupEnglish(value) {
  return value.replace(/\s+/g, " ").trim();
}

function cleanupChinese(value) {
  return value.replace(/\s+/g, " ").trim();
}

function renderImportPreview() {
  els.previewCount.textContent = `${importPreview.length} 条`;
  els.importPreview.textContent = "";

  if (!importPreview.length) {
    const empty = document.createElement("p");
    empty.className = "panel-note";
    empty.textContent = "没有解析到内容。确认每条包含英文和中文释义。";
    els.importPreview.append(empty);
    return;
  }

  importPreview.forEach((item) => {
    const card = document.createElement("article");
    card.className = "preview-card";

    const title = document.createElement("strong");
    title.textContent = item.english;
    const meaning = document.createElement("p");
    meaning.textContent = item.chinese;
    const line = document.createElement("small");
    line.className = "pill";
    line.textContent = `第 ${item.lineNumber} 行`;

    card.append(title, meaning, line);
    els.importPreview.append(card);
  });
}

function confirmImport() {
  if (!importPreview.length) return;

  const folderId = els.importFolder.value || "default";
  const tags = parseTags(els.importTags.value);
  let added = 0;
  let skipped = 0;

  importPreview.forEach((entry) => {
    const duplicate = state.items.some((item) => {
      return !item.deletedAt
        && item.type === entry.type
        && item.folderId === folderId
        && normalizeAnswer(item.english) === normalizeAnswer(entry.english)
        && item.chinese.trim() === entry.chinese.trim();
    });

    if (duplicate) {
      skipped += 1;
      return;
    }

    state.items.push({
      id: uid("item"),
      type: entry.type,
      english: entry.english,
      chinese: entry.chinese,
      folderId,
      tags,
      favorite: false,
      paused: false,
      createdAt: nowMs(),
      updatedAt: nowMs(),
      stats: newItemStats()
    });
    added += 1;
  });

  saveState();
  importPreview = [];
  els.importText.value = "";
  renderImportPreview();
  els.confirmImportButton.disabled = true;
  renderAll();
  loadPracticeCard();
  showToast(skipped ? `已导入 ${added} 条，跳过 ${skipped} 条重复内容` : `已导入 ${added} 条`);
}

function clearImport() {
  importPreview = [];
  els.importText.value = "";
  els.importTags.value = "";
  renderImportPreview();
  els.confirmImportButton.disabled = true;
}

function parseTags(value) {
  return Array.from(new Set(
    value
      .split(/[，,]/)
      .map((tag) => tag.trim())
      .filter(Boolean)
  ));
}

function newItemStats() {
  return {
    attempts: 0,
    correct: 0,
    wrong: 0,
    streak: 0,
    weight: 4,
    lastSeen: null,
    nextDue: 0,
    lastOutcome: null
  };
}

function loadPracticeCard(forceNew = true) {
  const type = els.practiceType.value;
  const candidates = getPracticeCandidates(type);

  els.practiceEmpty.classList.toggle("hidden", candidates.length > 0);
  els.wordTrainer.classList.toggle("hidden", type !== "word" || candidates.length === 0);
  els.sentenceTrainer.classList.toggle("hidden", type !== "sentence" || candidates.length === 0);

  if (!candidates.length) {
    currentPracticeItemId = null;
    renderPracticeMetrics();
    return;
  }

  const currentStillValid = candidates.some((item) => item.id === currentPracticeItemId);
  if (forceNew || !currentStillValid) {
    currentPracticeItemId = pickPracticeItem(candidates, currentPracticeItemId, forceNew)?.id || candidates[0].id;
  }

  const item = getCurrentPracticeItem();
  if (type === "word") renderWordTrainer(item);
  if (type === "sentence") renderSentenceTrainer(item);
  renderPracticeMetrics();
}

function getPracticeCandidates(type) {
  const { folderId, favoritesOnly } = getPracticeScope();

  return state.items.filter((item) => {
    if (item.deletedAt) return false;
    if (item.type !== type) return false;
    if (item.paused) return false;
    if (folderId && folderId !== "all" && item.folderId !== folderId) return false;
    if (favoritesOnly && !item.favorite) return false;
    return true;
  });
}

function getPracticeScope() {
  const value = els.practiceScope.value || "all";
  if (value === "favorites:all") return { folderId: "all", favoritesOnly: true };
  if (value.startsWith("folder:")) return { folderId: value.slice("folder:".length), favoritesOnly: false };
  if (value.startsWith("favorites:")) return { folderId: "all", favoritesOnly: true };
  return { folderId: "all", favoritesOnly: false };
}

function pickPracticeItem(candidates, previousId, forceNew) {
  if (els.practiceOrderMode.value === "sequential") {
    return pickSequentialItem(candidates, previousId, forceNew);
  }
  return pickWeightedItem(candidates, previousId);
}

function pickSequentialItem(candidates, previousId, forceNew) {
  if (!candidates.length) return null;
  const currentIndex = candidates.findIndex((item) => item.id === previousId);
  if (currentIndex === -1) return candidates[0];
  if (!forceNew) return candidates[currentIndex];
  return candidates[(currentIndex + 1) % candidates.length];
}

function pickWeightedItem(candidates, previousId) {
  const available = candidates.length > 1
    ? candidates.filter((item) => item.id !== previousId)
    : candidates;

  const weighted = available.map((item) => ({
    item,
    weight: getPracticeWeight(item)
  }));
  const total = weighted.reduce((sum, entry) => sum + entry.weight, 0);
  let cursor = Math.random() * total;

  for (const entry of weighted) {
    cursor -= entry.weight;
    if (cursor <= 0) return entry.item;
  }

  return weighted[0]?.item || null;
}

function getPracticeWeight(item) {
  const stats = item.stats || newItemStats();
  const now = Date.now();
  let weight = Math.max(0.3, stats.weight || 1);

  if (!stats.attempts) weight += 3;
  if (["wrong", "hint", "skip"].includes(stats.lastOutcome)) weight += 3;
  if (stats.nextDue && stats.nextDue <= now) weight += 1.5;
  if (stats.nextDue && stats.nextDue > now) weight *= 0.45;
  if (stats.wrong) weight += Math.min(3, stats.wrong * 0.35);
  if (stats.correct) weight -= Math.min(1.8, stats.correct * 0.08);

  return Math.max(0.2, weight);
}

function getCurrentPracticeItem() {
  return state.items.find((item) => item.id === currentPracticeItemId) || null;
}

function canAutoFocusPractice() {
  return getActiveView() === "practice" && Date.now() >= practiceAutoFocusBlockedUntil;
}

function getInputSelection(input) {
  if (!(input instanceof HTMLInputElement)) return null;
  return {
    start: input.selectionStart ?? input.value.length,
    end: input.selectionEnd ?? input.value.length
  };
}

function restoreDraftFocus(input, selection) {
  if (!(input instanceof HTMLInputElement)) return;
  input.focus({ preventScroll: true });
  if (!selection) return;

  try {
    const start = Math.min(selection.start, input.value.length);
    const end = Math.min(selection.end, input.value.length);
    input.setSelectionRange(start, end);
  } catch {
    // Some mobile keyboards do not allow programmatic selection changes.
  }
}

function capturePracticeDraft() {
  if (getActiveView() !== "practice") return null;
  const item = getCurrentPracticeItem();
  if (!item) return null;

  const snapshot = {
    type: els.practiceType.value,
    itemId: item.id,
    mode: wordTrainingMode,
    wordAnswerVisible,
    wordReviewAnswerVisible,
    sentenceHintVisible,
    currentWordResolved,
    currentSentenceSolved
  };

  if (snapshot.type === "word") {
    const splitInputs = wordInputs();
    if (splitInputs.length) {
      const activeIndex = splitInputs.findIndex((input) => input === document.activeElement);
      snapshot.variant = "word-split";
      snapshot.values = splitInputs.map((input) => input.value);
      snapshot.activeIndex = activeIndex;
      snapshot.selection = activeIndex >= 0 ? getInputSelection(splitInputs[activeIndex]) : null;
      return snapshot;
    }

    snapshot.variant = "word-single";
    snapshot.value = els.wordAnswerInput.value;
    snapshot.focused = document.activeElement === els.wordAnswerInput;
    snapshot.selection = snapshot.focused ? getInputSelection(els.wordAnswerInput) : null;
    return snapshot;
  }

  const inputs = sentenceInputs();
  const activeIndex = inputs.findIndex((input) => input === document.activeElement);
  snapshot.variant = "sentence";
  snapshot.values = inputs.map((input) => input.value);
  snapshot.activeIndex = activeIndex;
  snapshot.selection = activeIndex >= 0 ? getInputSelection(inputs[activeIndex]) : null;
  return snapshot;
}

function restorePracticeDraft(snapshot) {
  if (!snapshot || getActiveView() !== "practice") return false;
  if (snapshot.type !== els.practiceType.value) return false;
  const item = getCurrentPracticeItem();
  if (!item || item.id !== snapshot.itemId) return false;

  if (snapshot.type === "word" && snapshot.mode !== wordTrainingMode) return false;

  if (snapshot.type === "word") {
    currentWordResolved = Boolean(snapshot.currentWordResolved);
    wordAnswerVisible = Boolean(snapshot.wordAnswerVisible);
    wordReviewAnswerVisible = Boolean(snapshot.wordReviewAnswerVisible);

    const splitInputs = wordInputs();
    if (snapshot.variant === "word-split") {
      if (!splitInputs.length || splitInputs.length !== snapshot.values.length) return false;
      splitInputs.forEach((input, index) => {
        input.value = snapshot.values[index] || "";
        input.classList.toggle("has-value", input.value.trim().length > 0);
        input.classList.remove("correct", "error");
      });
      if (snapshot.activeIndex >= 0) restoreDraftFocus(splitInputs[snapshot.activeIndex] || splitInputs[0], snapshot.selection);
    } else {
      if (splitInputs.length) return false;
      els.wordAnswerInput.value = snapshot.value || "";
      if (snapshot.focused) restoreDraftFocus(els.wordAnswerInput, snapshot.selection);
    }

    if (wordTrainingMode === "input") {
      if (snapshot.wordAnswerVisible) {
        els.wordAnswerReveal.classList.remove("hidden");
        els.wordShowAnswerButton.textContent = "隐藏答案";
      } else {
        els.wordAnswerReveal.classList.add("hidden");
        els.wordShowAnswerButton.textContent = "显示答案";
      }
    } else {
      const currentItem = getCurrentPracticeItem();
      setWordReviewAnswerVisible(snapshot.wordReviewAnswerVisible, currentItem);
    }
    setFeedback(wordTrainingMode === "input" ? els.wordFeedback : els.wordReviewFeedback, "");
    return true;
  }

  currentSentenceSolved = Boolean(snapshot.currentSentenceSolved);
  sentenceHintVisible = Boolean(snapshot.sentenceHintVisible);

  const inputs = sentenceInputs();
  if (inputs.length !== snapshot.values.length) return false;
  inputs.forEach((input, index) => {
    input.value = snapshot.values[index] || "";
    input.classList.toggle("has-value", input.value.trim().length > 0);
    input.classList.remove("correct", "error");
  });
  if (snapshot.activeIndex >= 0) restoreDraftFocus(inputs[snapshot.activeIndex] || inputs[0], snapshot.selection);

  els.sentenceHintReveal.classList.toggle("hidden", !snapshot.sentenceHintVisible);
  els.sentenceHintButton.textContent = snapshot.sentenceHintVisible ? "隐藏提示" : "提示";
  setFeedback(els.sentenceFeedback, "");
  return true;
}

function renderWordTrainer(item) {
  if (!item) return;
  currentWordResolved = false;
  wordAnswerVisible = false;
  wordReviewAnswerVisible = false;

  els.wordFolderLabel.textContent = `${getFolderName(item.folderId)} · ${item.stats?.attempts || 0} 次`;
  els.wordFavoriteButton.textContent = item.favorite ? "已收藏" : "收藏";
  setFeedback(els.wordFeedback, "");
  setFeedback(els.wordReviewFeedback, "");
  els.wordAnswerInput.value = "";
  els.wordAnswerReveal.textContent = `答案：${item.english}`;
  els.wordAnswerReveal.classList.add("hidden");
  els.wordShowAnswerButton.textContent = "显示答案";
  setWordReviewAnswerVisible(false, item);

  const inputMode = wordTrainingMode === "input";
  els.wordInputMode.classList.toggle("hidden", !inputMode);
  els.wordReviewMode.classList.toggle("hidden", inputMode);
  els.wordPromptLabel.textContent = inputMode ? "中文" : "英文";
  els.wordPrompt.textContent = inputMode ? item.chinese : item.english;
  els.wordSwitchModeButton.textContent = inputMode ? "切到英文自评" : "切到中文填英文";

  if (inputMode) {
    renderWordBuilder(item.english);
  }
}

function renderWordBuilder(answer) {
  const parts = tokenizeWordAnswer(answer);
  const tokens = parts.filter((part) => part.type === "word");
  const useBuilder = tokens.length > 1;
  els.wordInputMode.dataset.split = useBuilder ? "true" : "false";
  els.wordBuilder.classList.toggle("hidden", !useBuilder);
  els.wordAnswerInput.classList.toggle("hidden", useBuilder);
  els.wordBuilder.textContent = "";

  if (!useBuilder) {
    if (canAutoFocusPractice()) {
      setTimeout(() => {
        if (canAutoFocusPractice() && !els.wordAnswerInput.classList.contains("hidden")) {
          els.wordAnswerInput.focus();
        }
      }, 30);
    }
    return;
  }

  let tokenIndex = 0;
  let currentPiece = null;

  parts.forEach((part) => {
    if (part.type === "word") {
      currentPiece = document.createElement("span");
      currentPiece.className = "word-piece";

      const wrapper = document.createElement("label");
      wrapper.className = "word-token";
      wrapper.setAttribute("aria-label", `第 ${tokenIndex + 1} 个单词`);

      const input = document.createElement("input");
      input.type = "text";
      input.name = `nanstar-word-${tokenIndex}`;
      input.autocomplete = "new-password";
      input.autocapitalize = "none";
      input.inputMode = "text";
      input.setAttribute("data-lpignore", "true");
      input.setAttribute("data-1p-ignore", "true");
      input.spellcheck = false;
      input.dataset.answer = part.text;
      input.dataset.index = String(tokenIndex);
      input.style.setProperty("--token-width", `${Math.max(5, Math.min(18, part.text.length + 2))}ch`);
      wrapper.append(input);
      currentPiece.append(wrapper);
      els.wordBuilder.append(currentPiece);
      tokenIndex += 1;
      return;
    }

    const separator = document.createElement("span");
    separator.className = "word-separator";
    separator.textContent = part.text;

    if (currentPiece) {
      currentPiece.append(separator);
    } else {
      const leading = document.createElement("span");
      leading.className = "word-piece";
      leading.append(separator);
      els.wordBuilder.append(leading);
    }
  });

  const firstInput = wordInputs()[0];
  if (firstInput && canAutoFocusPractice()) {
    setTimeout(() => {
      if (canAutoFocusPractice() && wordInputs()[0] === firstInput) {
        firstInput.focus();
      }
    }, 30);
  }
}

function tokenizeAnswerWords(answer) {
  return Array.from(answer.matchAll(/[\p{L}\p{N}]+(?:['’][\p{L}\p{N}]+)*/gu), (match) => match[0]);
}

function tokenizeWordAnswer(answer) {
  const parts = [];
  const wordRegex = /[\p{L}\p{N}]+(?:['’`][\p{L}\p{N}]+)*/gu;
  let lastIndex = 0;

  for (const match of answer.matchAll(wordRegex)) {
    const separator = answer.slice(lastIndex, match.index).replace(/\s+/g, "");
    if (separator) parts.push({ type: "separator", text: separator });
    parts.push({ type: "word", text: match[0] });
    lastIndex = match.index + match[0].length;
  }

  const tail = answer.slice(lastIndex).replace(/\s+/g, "");
  if (tail) parts.push({ type: "separator", text: tail });
  return parts;
}

function wordInputs() {
  return Array.from(els.wordBuilder.querySelectorAll("input"));
}

function submitWordAnswer() {
  const item = getCurrentPracticeItem();
  if (!item) return;

  const splitInputs = wordInputs();
  const correct = splitInputs.length
    ? evaluateWordBuilder(splitInputs)
    : normalizeAnswer(els.wordAnswerInput.value) === normalizeAnswer(item.english);

  if (correct) {
    setFeedback(els.wordFeedback, randomMessage("correct"), "success");
    currentWordResolved = true;
    recordItemResult(item, "correct");
    saveState();
    renderAll();
    setTimeout(() => loadPracticeCard(true), 720);
    return;
  }

  setFeedback(els.wordFeedback, randomMessage("wrong"), "error");
  if (splitInputs.length) {
    const firstWrong = splitInputs.find((input) => input.classList.contains("error"));
    focusTokenInput(firstWrong || splitInputs[0]);
  }
  recordItemResult(item, "wrong");
  saveState();
  renderAll();
}

function evaluateWordBuilder(inputs) {
  if (wordBuilderAllowsFlexibleOrder()) {
    return evaluateFlexibleWordBuilder(inputs);
  }

  let allCorrect = true;

  inputs.forEach((input) => {
    const correct = normalizeAnswer(input.value) === normalizeAnswer(input.dataset.answer || "");
    input.classList.toggle("has-value", input.value.trim().length > 0);
    input.classList.toggle("correct", correct);
    input.classList.toggle("error", !correct);
    if (!correct) allCorrect = false;
  });

  return allCorrect;
}

function wordBuilderAllowsFlexibleOrder() {
  const separators = Array.from(els.wordBuilder.querySelectorAll(".word-separator"));
  return separators.length > 0 && separators.every((separator) => /^[/／]+$/u.test(separator.textContent.trim()));
}

function evaluateFlexibleWordBuilder(inputs) {
  let allCorrect = true;
  const remaining = new Map();

  inputs.forEach((input) => {
    const answer = normalizeAnswer(input.dataset.answer || "");
    remaining.set(answer, (remaining.get(answer) || 0) + 1);
  });

  inputs.forEach((input) => {
    const value = normalizeAnswer(input.value);
    const correct = Boolean(value && remaining.get(value));
    input.classList.toggle("has-value", input.value.trim().length > 0);
    input.classList.toggle("correct", correct);
    input.classList.toggle("error", !correct);

    if (correct) {
      remaining.set(value, remaining.get(value) - 1);
    } else {
      allCorrect = false;
    }
  });

  return allCorrect;
}

function handleWordBuilderKeydown(event) {
  if (!(event.target instanceof HTMLInputElement)) return;
  const inputs = wordInputs();
  const index = inputs.indexOf(event.target);

  if (event.key === " " || event.key === "ArrowRight") {
    event.preventDefault();
    focusTokenInput(inputs[index + 1] || inputs[index]);
  }

  if (event.key === "ArrowLeft") {
    event.preventDefault();
    focusTokenInput(inputs[index - 1] || inputs[index]);
  }

  if (event.key === "Enter") {
    event.preventDefault();
    submitWordAnswer();
  }

  if (event.key === "Backspace" && event.target.value === "" && index > 0) {
    focusTokenInput(inputs[index - 1]);
  }
}

function handleWordBuilderInput(event) {
  if (!(event.target instanceof HTMLInputElement)) return;
  event.target.classList.toggle("has-value", event.target.value.trim().length > 0);
  event.target.classList.remove("correct", "error");
  setFeedback(els.wordFeedback, "");
}

function toggleWordAnswer() {
  const item = getCurrentPracticeItem();
  if (!item) return;

  wordAnswerVisible = !wordAnswerVisible;
  els.wordAnswerReveal.classList.toggle("hidden", !wordAnswerVisible);
  els.wordShowAnswerButton.textContent = wordAnswerVisible ? "隐藏答案" : "显示答案";

  if (wordAnswerVisible) {
    setFeedback(els.wordFeedback, randomMessage("hint"), "hint");
    currentWordResolved = true;
    recordItemResult(item, "hint");
    saveState();
    renderAll();
  } else {
    setFeedback(els.wordFeedback, "");
    setTimeout(() => els.wordAnswerInput.focus(), 30);
  }
}

function nextWordCard() {
  const item = getCurrentPracticeItem();
  if (item && !currentWordResolved) {
    recordItemResult(item, "skip");
    saveState();
  }
  loadPracticeCard(true);
  renderAll();
}

function setWordReviewAnswerVisible(visible, item = getCurrentPracticeItem()) {
  wordReviewAnswerVisible = Boolean(visible);
  els.wordMaskedMeaning.classList.toggle("revealed", wordReviewAnswerVisible);
  els.wordMaskedMeaning.setAttribute("aria-expanded", String(wordReviewAnswerVisible));
  els.wordMaskedMeaning.textContent = wordReviewAnswerVisible && item ? item.chinese : "轻点看释义";
  setFeedback(els.wordReviewFeedback, "");
}

function nextWordReviewCard() {
  const item = getCurrentPracticeItem();
  if (!item) return;

  if (!wordReviewAnswerVisible) {
    setWordReviewAnswerVisible(true, item);
    return;
  }

  wordReviewAnswerVisible = false;
  currentWordResolved = true;
  renderAll();
  loadPracticeCard(true);
}

function switchWordTrainingMode() {
  wordTrainingMode = wordTrainingMode === "input" ? "review" : "input";
  renderWordTrainer(getCurrentPracticeItem());
}

function renderSentenceTrainer(item) {
  if (!item) return;
  currentSentenceSolved = false;
  sentenceHintVisible = false;
  els.sentenceFolderLabel.textContent = `${getFolderName(item.folderId)} · ${item.stats?.attempts || 0} 次`;
  els.sentenceFavoriteButton.textContent = item.favorite ? "已收藏" : "收藏";
  els.sentenceChinese.textContent = item.chinese;
  setFeedback(els.sentenceFeedback, "");
  els.sentenceHintReveal.textContent = item.english;
  els.sentenceHintReveal.classList.add("hidden");
  els.sentenceHintButton.textContent = "提示";
  renderSentenceBuilder(item.english);
}

function renderSentenceBuilder(sentence) {
  els.sentenceBuilder.textContent = "";
  const parts = tokenizeSentence(sentence);
  let wordIndex = 0;
  let currentPiece = null;

  parts.forEach((part) => {
    if (part.type === "word") {
      currentPiece = document.createElement("span");
      currentPiece.className = "sentence-piece";

      const wrapper = document.createElement("label");
      wrapper.className = "sentence-token";
      wrapper.setAttribute("aria-label", `第 ${wordIndex + 1} 个单词`);

      const input = document.createElement("input");
      input.type = "text";
      input.name = `nanstar-sentence-${wordIndex}`;
      input.autocomplete = "new-password";
      input.autocapitalize = "none";
      input.inputMode = "text";
      input.setAttribute("data-lpignore", "true");
      input.setAttribute("data-1p-ignore", "true");
      input.spellcheck = false;
      input.dataset.answer = part.text;
      input.dataset.index = String(wordIndex);
      input.style.setProperty("--token-width", `${Math.max(5, Math.min(18, part.text.length + 2))}ch`);
      wrapper.append(input);
      currentPiece.append(wrapper);
      els.sentenceBuilder.append(currentPiece);
      wordIndex += 1;
      return;
    }

    const punctuation = document.createElement("span");
    punctuation.className = "sentence-punctuation";
    punctuation.textContent = part.text;

    if (currentPiece) {
      currentPiece.append(punctuation);
    } else {
      const leading = document.createElement("span");
      leading.className = "sentence-piece";
      leading.append(punctuation);
      els.sentenceBuilder.append(leading);
    }
  });

  const firstInput = els.sentenceBuilder.querySelector("input");
  if (firstInput && canAutoFocusPractice()) {
    setTimeout(() => {
      if (canAutoFocusPractice() && els.sentenceBuilder.contains(firstInput)) {
        firstInput.focus();
      }
    }, 30);
  }
}

function tokenizeSentence(sentence) {
  const parts = [];
  const wordRegex = /[\p{L}\p{N}]+(?:['’][\p{L}\p{N}]+)*/gu;
  let lastIndex = 0;

  for (const match of sentence.matchAll(wordRegex)) {
    const punctuation = sentence.slice(lastIndex, match.index).replace(/\s+/g, "");
    if (punctuation) parts.push({ type: "punct", text: punctuation });
    parts.push({ type: "word", text: match[0] });
    lastIndex = match.index + match[0].length;
  }

  const tail = sentence.slice(lastIndex).replace(/\s+/g, "");
  if (tail) parts.push({ type: "punct", text: tail });
  return parts;
}

function handleSentenceKeydown(event) {
  if (!(event.target instanceof HTMLInputElement)) return;
  const inputs = sentenceInputs();
  const index = inputs.indexOf(event.target);

  if (event.key === " ") {
    event.preventDefault();
    focusSentenceInput(inputs[index + 1] || inputs[index]);
  }

  if (event.key === "ArrowRight") {
    event.preventDefault();
    focusSentenceInput(inputs[index + 1] || inputs[index]);
  }

  if (event.key === "ArrowLeft") {
    event.preventDefault();
    focusSentenceInput(inputs[index - 1] || inputs[index]);
  }

  if (event.key === "Enter") {
    event.preventDefault();
    submitSentenceAnswer();
  }

  if (event.key === "Backspace" && event.target.value === "" && index > 0) {
    focusSentenceInput(inputs[index - 1]);
  }
}

function handleSentenceInput(event) {
  if (!(event.target instanceof HTMLInputElement)) return;
  event.target.classList.toggle("has-value", event.target.value.trim().length > 0);
  event.target.classList.remove("correct", "error");
  setFeedback(els.sentenceFeedback, "");
}

function sentenceInputs() {
  return Array.from(els.sentenceBuilder.querySelectorAll("input"));
}

function focusSentenceInput(input) {
  focusTokenInput(input);
}

function focusTokenInput(input) {
  if (!input) return;
  input.focus();
  input.select();
}

function handleGlobalShortcuts(event) {
  const view = getActiveView();
  if (view !== "practice") return;
  const type = els.practiceType.value;

  if (!event.ctrlKey && !event.altKey && !event.metaKey && event.key === "Enter" && type === "word" && wordTrainingMode === "review") {
    if (isTextEntryElement(document.activeElement)) return;
    event.preventDefault();
    nextWordReviewCard();
    return;
  }

  if (!event.ctrlKey || event.altKey || event.metaKey) return;

  if (event.key === ";" || event.code === "Semicolon") {
    event.preventDefault();
    if (type === "sentence") toggleSentenceHint();
    else if (wordTrainingMode === "input") toggleWordAnswer();
  }

  if (event.key === "." || event.code === "Period") {
    event.preventDefault();
    if (type === "sentence") nextSentenceCard();
    else if (wordTrainingMode === "input") nextWordCard();
  }
}

function getActiveView() {
  return els.navItems.find((button) => button.classList.contains("active"))?.dataset.view || "practice";
}

function submitSentenceAnswer() {
  const item = getCurrentPracticeItem();
  if (!item) return;

  const inputs = sentenceInputs();
  let allCorrect = true;
  let firstWrong = null;

  inputs.forEach((input) => {
    const correct = normalizeAnswer(input.value) === normalizeAnswer(input.dataset.answer || "");
    input.classList.toggle("has-value", input.value.trim().length > 0);
    input.classList.toggle("correct", correct);
    input.classList.toggle("error", !correct);
    if (!correct) {
      allCorrect = false;
      if (!firstWrong) firstWrong = input;
    }
  });

  if (allCorrect) {
    setFeedback(els.sentenceFeedback, randomMessage("correct"), "success");
    if (!currentSentenceSolved) {
      recordItemResult(item, "correct");
      currentSentenceSolved = true;
    }
    saveState();
    renderAll();
    setTimeout(() => loadPracticeCard(true), 760);
    return;
  }

  setFeedback(els.sentenceFeedback, randomMessage("wrong"), "error");
  recordItemResult(item, "wrong");
  focusSentenceInput(firstWrong);
  saveState();
  renderAll();
}

function toggleSentenceHint() {
  const item = getCurrentPracticeItem();
  if (!item) return;

  sentenceHintVisible = !sentenceHintVisible;
  els.sentenceHintReveal.classList.toggle("hidden", !sentenceHintVisible);
  els.sentenceHintButton.textContent = sentenceHintVisible ? "隐藏提示" : "提示";

  if (sentenceHintVisible) {
    setFeedback(els.sentenceFeedback, randomMessage("hint"), "hint");
    recordItemResult(item, "hint");
    saveState();
    renderAll();
  } else {
    setFeedback(els.sentenceFeedback, "");
  }
}

function nextSentenceCard() {
  const item = getCurrentPracticeItem();
  if (item && !currentSentenceSolved) {
    recordItemResult(item, "skip");
    saveState();
  }
  loadPracticeCard(true);
  renderAll();
}

function pauseCurrentPracticeItem() {
  const item = getCurrentPracticeItem();
  if (!item) return;

  item.paused = true;
  touchItem(item);
  saveState();
  showToast("已暂停练习，可在列表里恢复");
  currentPracticeItemId = null;
  renderAll();
  loadPracticeCard(true);
}

function toggleCurrentFavorite() {
  const item = getCurrentPracticeItem();
  if (!item) return;
  item.favorite = !item.favorite;
  touchItem(item);
  saveState();
  renderAll();
  if (item.type === "word") renderWordTrainer(item);
  if (item.type === "sentence") renderSentenceTrainer(item);
}

function recordItemResult(item, outcome) {
  item.stats = item.stats || newItemStats();
  touchItem(item);
  const stats = item.stats;
  const now = Date.now();
  stats.attempts += 1;
  stats.lastSeen = now;
  stats.lastOutcome = outcome;

  if (outcome === "correct") {
    stats.correct += 1;
    stats.streak += 1;
    stats.weight = Math.max(0.25, (stats.weight || 1) * 0.62);
    const hours = Math.min(168, Math.max(1, 2 ** Math.min(stats.streak, 6)));
    stats.nextDue = now + hours * 60 * 60 * 1000;
    recordActivity("correct");
    return;
  }

  stats.wrong += 1;
  stats.streak = 0;
  stats.weight = Math.min(10, (stats.weight || 1) + (outcome === "hint" ? 2.5 : 2));
  stats.nextDue = now + (outcome === "skip" ? 12 : 6) * 60 * 1000;
  recordActivity(outcome);
}

function recordActivity(outcome) {
  const key = todayKey();
  const day = state.activity[key] || { practice: 0, correct: 0, wrong: 0, hint: 0, skip: 0 };
  day.practice += 1;

  if (outcome === "correct") day.correct += 1;
  if (["wrong", "hint", "skip"].includes(outcome)) day.wrong += 1;
  if (outcome === "hint") day.hint += 1;
  if (outcome === "skip") day.skip += 1;

  state.activity[key] = day;
  touchActivity(key);
}

function normalizeAnswer(value) {
  return value
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[’‘`]/g, "'")
    .replace(/[\p{P}\p{S}]+/gu, "")
    .replace(/\s+/g, " ")
    .trim();
}

function setFeedback(element, message, type = "") {
  element.textContent = message;
  element.className = `answer-feedback ${type}`.trim();
}

function randomMessage(type) {
  const messages = {
    correct: ["稳了，下一题。", "这条拿下了。", "对，节奏不错。", "漂亮，继续。"],
    wrong: ["差一点，再敲一遍。", "这里没对，盯住红色部分。", "先别放过它，再来。", "答案还没合上。"],
    hint: ["答案已亮出，这条会更快回来。", "先看答案，后面再收拾它。", "提示已开，系统会加重复现。"]
  };
  const pool = messages[type] || [""];
  return pool[Math.floor(Math.random() * pool.length)];
}

function renderPracticeMetrics() {
  const type = els.practiceType.value;
  const { folderId, favoritesOnly } = getPracticeScope();
  const inRange = state.items.filter((item) => {
    if (item.deletedAt) return false;
    if (item.type !== type) return false;
    if (folderId && folderId !== "all" && item.folderId !== folderId) return false;
    if (favoritesOnly && !item.favorite) return false;
    return true;
  });

  els.availableCount.textContent = inRange.filter((item) => !item.paused).length;
  els.favoriteCount.textContent = inRange.filter((item) => item.favorite).length;
  els.pausedCount.textContent = inRange.filter((item) => item.paused).length;
}

function getFilteredLibraryItems() {
  const type = els.libraryType.value;
  const folderId = els.libraryFolder.value;
  const status = els.libraryStatus.value;
  const tag = els.libraryTag.value;
  const favoritesOnly = els.libraryFavoritesOnly.checked;
  const query = els.librarySearch.value.trim().toLowerCase();

  return state.items
    .filter((item) => {
      if (item.deletedAt) return false;
      if (type !== "all" && item.type !== type) return false;
      if (folderId !== "all" && item.folderId !== folderId) return false;
      if (status === "active" && item.paused) return false;
      if (status === "paused" && !item.paused) return false;
      if (tag !== "all" && !(item.tags || []).includes(tag)) return false;
      if (favoritesOnly && !item.favorite) return false;
      if (!query) return true;
      const haystack = `${item.english} ${item.chinese} ${(item.tags || []).join(" ")}`.toLowerCase();
      return haystack.includes(query);
    })
    .sort((a, b) => b.createdAt - a.createdAt);
}

function renderLibrary() {
  const items = getFilteredLibraryItems();
  const visibleIds = new Set(items.map((item) => item.id));
  selectedIds = new Set([...selectedIds].filter((id) => visibleIds.has(id)));

  els.libraryList.textContent = "";
  renderBulkToolbar(items);

  if (!items.length) {
    const empty = document.createElement("div");
    empty.className = "empty-state";
    const title = document.createElement("h3");
    title.textContent = "没有匹配内容";
    const text = document.createElement("p");
    text.textContent = "可以调整筛选条件，或先导入新内容。";
    empty.append(title, text);
    els.libraryList.append(empty);
    return;
  }

  items.forEach((item) => els.libraryList.append(createLibraryItem(item)));
}

function renderBulkToolbar(items) {
  const selectedCount = selectedIds.size;
  els.bulkModeToggle.checked = bulkMode;
  els.selectVisibleButton.disabled = !bulkMode || !items.length;
  els.clearSelectionButton.disabled = !bulkMode || !selectedCount;
  els.bulkDeleteButton.disabled = !bulkMode || !selectedCount;
  els.selectedCountLabel.textContent = `已选 ${selectedCount} 条`;
}

function createLibraryItem(item) {
  const article = document.createElement("article");
  article.className = `library-item${item.paused ? " paused" : ""}${selectedIds.has(item.id) ? " selected" : ""}`;

  const main = document.createElement("div");
  main.className = "library-item-main";

  const checkbox = document.createElement("input");
  checkbox.type = "checkbox";
  checkbox.className = "library-select-box";
  checkbox.checked = selectedIds.has(item.id);
  checkbox.classList.toggle("hidden", !bulkMode);
  checkbox.addEventListener("change", () => {
    if (checkbox.checked) selectedIds.add(item.id);
    else selectedIds.delete(item.id);
    renderLibrary();
  });

  const content = document.createElement("div");
  content.className = "library-content";
  const english = document.createElement("strong");
  english.textContent = item.english;
  const chinese = document.createElement("p");
  chinese.textContent = item.chinese;
  content.append(english, chinese);
  main.append(checkbox, content);

  const meta = document.createElement("div");
  meta.className = "library-meta";
  meta.append(
    makePill(item.type === "word" ? "单词 / 短语" : "句子"),
    makePill(getFolderName(item.folderId)),
    makePill(item.paused ? "已暂停" : "练习中", item.paused ? "paused" : "")
  );
  if (item.favorite) meta.append(makeTag("收藏", "favorite"));
  (item.tags || []).forEach((tag) => meta.append(makeTag(tag)));

  const stats = document.createElement("small");
  stats.textContent = `练习 ${item.stats?.attempts || 0} 次，正确 ${item.stats?.correct || 0} 次，错误 ${item.stats?.wrong || 0} 次`;

  const tagEditor = createTagEditor(item);

  const actions = document.createElement("div");
  actions.className = "library-actions";
  actions.append(
    actionButton(item.favorite ? "取消收藏" : "收藏", () => {
      item.favorite = !item.favorite;
      touchItem(item);
      saveState();
      renderAll();
      loadPracticeCard(false);
    }),
    actionButton(item.paused ? "恢复练习" : "暂停练习", () => {
      item.paused = !item.paused;
      touchItem(item);
      saveState();
      renderAll();
      loadPracticeCard(true);
    }),
    actionButton("彻底删除", () => deleteItem(item.id), "danger-ghost-button")
  );

  article.append(main, meta, stats, tagEditor, actions);
  return article;
}

function createTagEditor(item) {
  const wrapper = document.createElement("div");
  wrapper.className = "tag-editor";

  const label = document.createElement("small");
  label.textContent = "标签";

  const row = document.createElement("div");
  row.className = "tag-editor-row";

  const input = document.createElement("input");
  input.className = "tag-edit-input";
  input.type = "text";
  input.setAttribute("list", "tagSuggestions");
  input.value = (item.tags || []).join(", ");
  input.placeholder = "输入标签，用逗号分隔";

  const save = actionButton("保存标签", () => {
    item.tags = parseTags(input.value);
    touchItem(item);
    saveState();
    renderAll();
    showToast("标签已更新");
  }, "secondary-button");

  row.append(input, save);
  wrapper.append(label, row);
  return wrapper;
}

function selectVisibleItems() {
  getFilteredLibraryItems().forEach((item) => selectedIds.add(item.id));
  renderLibrary();
}

function bulkDeleteSelected() {
  if (!selectedIds.size) return;
  const ok = confirm(`彻底删除已选的 ${selectedIds.size} 条内容？这个操作不会进回收站。`);
  if (!ok) return;

  const timestamp = nowMs();
  state.items.forEach((item) => {
    if (selectedIds.has(item.id)) {
      item.deletedAt = timestamp;
      item.updatedAt = timestamp;
    }
  });
  if (currentPracticeItemId && selectedIds.has(currentPracticeItemId)) currentPracticeItemId = null;
  selectedIds.clear();
  saveState();
  renderAll();
  loadPracticeCard(true);
  showToast("已批量删除");
}

function actionButton(label, handler, className = "ghost-button") {
  const button = document.createElement("button");
  button.type = "button";
  button.className = className;
  button.textContent = label;
  button.addEventListener("click", handler);
  return button;
}

function deleteItem(id) {
  const item = state.items.find((entry) => entry.id === id);
  if (!item) return;
  const ok = confirm(`彻底删除「${item.english}」？这个操作不会进回收站。`);
  if (!ok) return;
  item.deletedAt = nowMs();
  touchItem(item);
  selectedIds.delete(id);
  if (currentPracticeItemId === id) currentPracticeItemId = null;
  saveState();
  renderAll();
  loadPracticeCard(true);
  showToast("已彻底删除");
}

function makePill(text, extraClass = "") {
  const pill = document.createElement("span");
  pill.className = `pill ${extraClass}`.trim();
  pill.textContent = text;
  return pill;
}

function makeTag(text, extraClass = "") {
  const tag = document.createElement("span");
  tag.className = `tag ${extraClass}`.trim();
  tag.textContent = text;
  return tag;
}

function renderStats() {
  const today = state.activity[todayKey()] || { practice: 0, correct: 0 };
  const activeItems = state.items.filter((item) => !item.deletedAt);
  els.totalItemsStat.textContent = activeItems.length;
  els.todayItemsStat.textContent = today.practice || 0;
  els.todayCorrectStat.textContent = today.correct || 0;
  els.favoriteItemsStat.textContent = activeItems.filter((item) => item.favorite).length;
  renderTodayCount();
  renderWeekChart();
}

function renderTodayCount() {
  const today = state.activity[todayKey()] || { practice: 0 };
  if (els.todayPracticeCount) {
    els.todayPracticeCount.textContent = `${today.practice || 0} 次练习`;
  }
}

function renderWeekChart() {
  const days = Array.from({ length: 7 }, (_, index) => {
    const date = dateWithOffset(index - 6);
    const key = formatDateKey(date);
    return {
      key,
      label: `${date.getMonth() + 1}/${date.getDate()}`,
      count: state.activity[key]?.practice || 0
    };
  });

  const max = Math.max(1, ...days.map((day) => day.count));
  const total = days.reduce((sum, day) => sum + day.count, 0);
  els.weekTotalLabel.textContent = `${total} 次`;
  els.weekChart.textContent = "";

  days.forEach((day) => {
    const column = document.createElement("div");
    column.className = "bar-column";
    const value = document.createElement("span");
    value.className = "bar-value";
    value.textContent = day.count;
    const bar = document.createElement("div");
    bar.className = "bar";
    bar.style.height = `${Math.max(6, (day.count / max) * 160)}px`;
    const label = document.createElement("span");
    label.className = "bar-label";
    label.textContent = day.label;
    column.append(value, bar, label);
    els.weekChart.append(column);
  });
}

function getFolderName(folderId) {
  return state.folders.find((folder) => folder.id === folderId)?.name || "默认";
}

function todayKey() {
  return formatDateKey(new Date());
}

function dateWithOffset(offset) {
  const date = new Date();
  date.setDate(date.getDate() + offset);
  return date;
}

function formatDateKey(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function exportData() {
  const payload = JSON.stringify(state, null, 2);
  const blob = new Blob([payload], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `nanstar-lex-backup-${todayKey()}.json`;
  document.body.append(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

function restoreData(event) {
  const file = event.target.files?.[0];
  if (!file) return;

  const reader = new FileReader();
  reader.onload = () => {
    try {
      const nextState = JSON.parse(String(reader.result));
      if (!Array.isArray(nextState.items) || !Array.isArray(nextState.folders)) {
        throw new Error("Invalid backup");
      }
      state = {
        ...structuredClone(defaultState),
        ...nextState,
        activity: nextState.activity || {}
      };
      repairLegacyState();
      saveState();
      currentPracticeItemId = null;
      importPreview = [];
      selectedIds.clear();
      renderAll();
      loadPracticeCard();
      showToast("备份已导入");
    } catch {
      showToast("备份文件格式不对");
    } finally {
      event.target.value = "";
    }
  };
  reader.readAsText(file);
}

function hydrateSyncForm() {
  els.syncUrlInput.value = syncSettings.url || "";
  els.syncAnonKeyInput.value = syncSettings.anonKey || "";
  els.syncEmailInput.value = syncSettings.email || "";
  updateSyncStatus();
}

async function initializeSync() {
  if (!syncSettings.url || !syncSettings.anonKey) {
    updateSyncStatus("未配置");
    return;
  }

  if (!createSyncClient()) return;

  try {
    const { data, error } = await supabaseClient.auth.getSession();
    if (error) throw error;
    currentUser = data.session?.user || null;
    updateSyncStatus();
    if (currentUser) {
      scheduleAutoSync(800);
      startSyncPolling();
    }
  } catch (error) {
    updateSyncStatus("配置异常");
    console.warn(error);
  }
}

function createSyncClient() {
  if (!window.supabase?.createClient) {
    updateSyncStatus("同步库未加载");
    return false;
  }

  if (!syncSettings.url || !syncSettings.anonKey) {
    updateSyncStatus("未配置");
    return false;
  }

  supabaseClient = window.supabase.createClient(syncSettings.url, syncSettings.anonKey, {
    auth: {
      persistSession: true,
      autoRefreshToken: true
    }
  });
  return true;
}

function saveSyncConfig() {
  syncSettings = {
    url: els.syncUrlInput.value.trim(),
    anonKey: els.syncAnonKeyInput.value.trim(),
    email: els.syncEmailInput.value.trim()
  };

  localStorage.setItem(SYNC_SETTINGS_KEY, JSON.stringify(syncSettings));
  currentUser = null;
  supabaseClient = null;
  createSyncClient();
  updateSyncStatus(syncSettings.url && syncSettings.anonKey ? "配置已保存" : "未配置");
  showToast("同步配置已保存");
}

async function signUpForSync() {
  if (!ensureSyncClient()) return;
  const email = els.syncEmailInput.value.trim();
  const password = els.syncPasswordInput.value;
  if (!email || !password) {
    showToast("先填写邮箱和密码");
    return;
  }

  setSyncBusy(true, "注册中");
  try {
    const { data, error } = await supabaseClient.auth.signUp({
      email,
      password,
      options: {
        emailRedirectTo: getAuthRedirectUrl()
      }
    });
    if (error) throw error;
    currentUser = data.session?.user || null;
    syncSettings.email = email;
    localStorage.setItem(SYNC_SETTINGS_KEY, JSON.stringify(syncSettings));
    updateSyncStatus(currentUser ? "已注册" : "检查邮箱");
    showToast(currentUser ? "账号已注册" : "已发送确认邮件");
    if (currentUser) {
      setSyncBusy(false);
      await syncNow({ manual: true });
      startSyncPolling();
    }
  } catch (error) {
    showToast(error.message || "注册失败");
    updateSyncStatus("注册失败");
  } finally {
    setSyncBusy(false);
  }
}

async function signInForSync() {
  if (!ensureSyncClient()) return;
  const email = els.syncEmailInput.value.trim();
  const password = els.syncPasswordInput.value;
  if (!email || !password) {
    showToast("先填写邮箱和密码");
    return;
  }

  setSyncBusy(true, "登录中");
  try {
    const { data, error } = await supabaseClient.auth.signInWithPassword({ email, password });
    if (error) throw error;
    currentUser = data.user;
    syncSettings.email = email;
    localStorage.setItem(SYNC_SETTINGS_KEY, JSON.stringify(syncSettings));
    updateSyncStatus("已登录");
    showToast("已登录，开始同步");
    setSyncBusy(false);
    await syncNow({ manual: true });
    startSyncPolling();
  } catch (error) {
    showToast(error.message || "登录失败");
    updateSyncStatus("登录失败");
  } finally {
    setSyncBusy(false);
  }
}

async function signOutFromSync() {
  if (!supabaseClient) return;
  setSyncBusy(true, "退出中");
  try {
    await supabaseClient.auth.signOut();
    currentUser = null;
    stopSyncPolling();
    updateSyncStatus("未登录");
    showToast("已退出同步账号");
  } finally {
    setSyncBusy(false);
  }
}

function ensureSyncClient() {
  if (supabaseClient || createSyncClient()) return true;
  showToast("先填写并保存 Supabase 配置");
  return false;
}

function updateSyncStatus(text) {
  let statusText = text || "";
  let statusState = text ? getSyncStateFromText(text) : "";

  if (!statusText) {
    if (!syncSettings.url || !syncSettings.anonKey) {
      statusText = "未配置";
      statusState = "idle";
    } else if (!currentUser) {
      statusText = hasPendingSync ? "未登录，有本地改动" : "未登录";
      statusState = hasPendingSync ? "pending" : "idle";
    } else if (syncInProgress) {
      statusText = "同步中";
      statusState = "busy";
    } else if (lastSyncError) {
      statusText = "同步失败，点重试";
      statusState = "error";
    } else if (hasPendingSync) {
      statusText = "有本地改动待同步";
      statusState = "pending";
    } else if (lastSyncedAt && !Number.isNaN(lastSyncedAt.getTime())) {
      statusText = `已同步 ${formatClock(lastSyncedAt)}`;
      statusState = "ok";
    } else {
      statusText = "已登录";
      statusState = "ok";
    }
  }

  els.syncStatus.textContent = statusText;
  els.syncStatus.dataset.state = statusState;
  els.syncStatus.closest(".sync-panel")?.setAttribute("data-sync-state", statusState);

  els.syncNowButton.disabled = !currentUser || syncInProgress;
  els.syncSignOutButton.disabled = !currentUser || syncInProgress;
  if (syncInProgress) els.syncNowButton.textContent = "同步中";
  else if (!currentUser) els.syncNowButton.textContent = "立即同步";
  else if (lastSyncError) els.syncNowButton.textContent = "重试同步";
  else if (hasPendingSync) els.syncNowButton.textContent = "同步改动";
  else els.syncNowButton.textContent = "立即同步";
}

function getSyncStateFromText(text) {
  if (text.includes("失败") || text.includes("异常") || text.includes("失效")) return "error";
  if (text.includes("同步中") || text.includes("登录中") || text.includes("注册中") || text.includes("退出中")) return "busy";
  if (text.includes("待") || text.includes("检查邮箱")) return "pending";
  if (text.includes("已同步") || text.includes("已登录") || text.includes("配置已保存") || text.includes("已注册")) return "ok";
  return "idle";
}

function setSyncBusy(busy, label = "") {
  syncInProgress = busy;
  updateCredentialScope();
  [els.saveSyncConfigButton, els.syncSignUpButton, els.syncSignInButton, els.syncNowButton, els.syncSignOutButton].forEach((button) => {
    button.disabled = busy || ((button === els.syncNowButton || button === els.syncSignOutButton) && !currentUser);
  });
  if (busy && label) updateSyncStatus(label);
  if (!busy) updateSyncStatus();
}

function isTextEntryElement(element) {
  if (!element) return false;
  if (element instanceof HTMLTextAreaElement) return !element.disabled && !element.readOnly;
  if (element instanceof HTMLInputElement) {
    if (element.disabled || element.readOnly) return false;
    const blockedTypes = new Set(["button", "checkbox", "color", "file", "hidden", "image", "radio", "range", "reset", "submit"]);
    return !blockedTypes.has((element.type || "text").toLowerCase());
  }
  return Boolean(element.isContentEditable);
}

function shouldDeferAutoSync() {
  return !document.hidden && isTextEntryElement(document.activeElement);
}

function handleAutoSyncResumeCheck() {
  setTimeout(() => {
    if (shouldDeferAutoSync()) return;
    if (!autoSyncDeferred && !hasPendingSync && !lastSyncError) return;
    autoSyncDeferred = false;
    scheduleAutoSync(280);
  }, 0);
}

function handleAutoSyncVisibilityChange() {
  if (document.hidden) return;
  handleAutoSyncResumeCheck();
}

function scheduleAutoSync(delay = 2500) {
  if (suppressAutoSync || !currentUser || !supabaseClient) return;
  clearTimeout(syncTimer);
  syncTimer = setTimeout(() => {
    syncNow({ manual: false }).catch((error) => {
      console.warn(error);
      lastSyncError = formatSyncError(error);
      persistSyncMeta();
      updateSyncStatus();
    });
  }, delay);
}

function startSyncPolling() {
  stopSyncPolling();
  syncPollTimer = setInterval(() => {
    if (!document.hidden) {
      syncNow({ manual: false }).catch((error) => {
        console.warn(error);
        lastSyncError = formatSyncError(error);
        persistSyncMeta();
        updateSyncStatus();
      });
    }
  }, 30000);
}

function stopSyncPolling() {
  if (syncPollTimer) {
    clearInterval(syncPollTimer);
    syncPollTimer = null;
  }
}

async function syncNow({ manual = false } = {}) {
  if (!currentUser || !ensureSyncClient()) {
    if (manual) showToast("先登录同步账号");
    return;
  }
  if (syncInProgress) return;
  if (!manual && shouldDeferAutoSync()) {
    autoSyncDeferred = true;
    scheduleAutoSync(1600);
    return;
  }

  let syncNeedsFollowUp = false;
  autoSyncDeferred = false;
  const practiceDraft = capturePracticeDraft();
  const shouldRefreshPractice = getActiveView() === "practice";
  setSyncBusy(true, "同步中");
  try {
    await pullRemoteData();
    const revisionBeforePush = syncDirtyRevision;
    await pushLocalData();
    saveStateLocalOnly();
    renderAll();
    if (shouldRefreshPractice) {
      practiceAutoFocusBlockedUntil = Date.now() + 160;
      loadPracticeCard(false);
      restorePracticeDraft(practiceDraft);
    }
    lastSyncedAt = new Date();
    lastSyncError = "";
    hasPendingSync = syncDirtyRevision !== revisionBeforePush;
    syncNeedsFollowUp = hasPendingSync;
    persistSyncMeta();
    if (manual) showToast("同步完成");
  } catch (error) {
    console.error(error);
    lastSyncError = formatSyncError(error);
    persistSyncMeta();
    if (manual) showToast(lastSyncError);
  } finally {
    setSyncBusy(false);
    if (syncNeedsFollowUp) scheduleAutoSync(800);
  }
}

function getAuthRedirectUrl() {
  return `${window.location.origin}${window.location.pathname}`;
}

function formatSyncError(error) {
  const message = error?.message || String(error || "");
  if (message.includes("schema cache") && message.includes("se_folders")) {
    return "同步表还没建好：请在 Supabase SQL Editor 运行 supabase-schema.sql";
  }
  if (message.includes("JWT") || message.includes("not authenticated")) {
    return "登录状态失效，请重新登录";
  }
  return message || "同步失败";
}

function formatClock(date) {
  return `${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`;
}

async function pushLocalData() {
  const userId = currentUser.id;
  const folders = state.folders.map((folder) => ({
    user_id: userId,
    id: folder.id,
    name: folder.name,
    created_at: folder.createdAt || folder.updatedAt || nowMs(),
    updated_at: folder.updatedAt || folder.createdAt || nowMs(),
    deleted_at: folder.deletedAt || null
  }));

  const items = state.items.map((item) => ({
    user_id: userId,
    id: item.id,
    type: item.type,
    english: item.english,
    chinese: item.chinese,
    folder_id: item.folderId || "default",
    tags: item.tags || [],
    favorite: Boolean(item.favorite),
    paused: Boolean(item.paused),
    stats: item.stats || newItemStats(),
    created_at: item.createdAt || item.updatedAt || nowMs(),
    updated_at: item.updatedAt || item.createdAt || nowMs(),
    deleted_at: item.deletedAt || null
  }));

  const activity = Object.entries(state.activity || {}).map(([day, data]) => ({
    user_id: userId,
    day,
    data,
    updated_at: state.activityUpdatedAt?.[day] || nowMs()
  }));

  await upsertRows("se_folders", folders, "user_id,id");
  await upsertRows("se_items", items, "user_id,id");
  await upsertRows("se_activity", activity, "user_id,day");
}

async function upsertRows(table, rows, onConflict) {
  if (!rows.length) return;
  const { error } = await supabaseClient.from(table).upsert(rows, { onConflict });
  if (error) throw error;
}

async function pullRemoteData() {
  const [{ data: folders, error: foldersError }, { data: items, error: itemsError }, { data: activity, error: activityError }] = await Promise.all([
    supabaseClient.from("se_folders").select("*"),
    supabaseClient.from("se_items").select("*"),
    supabaseClient.from("se_activity").select("*")
  ]);

  if (foldersError) throw foldersError;
  if (itemsError) throw itemsError;
  if (activityError) throw activityError;

  suppressAutoSync = true;
  try {
    mergeRemoteFolders(folders || []);
    mergeRemoteItems(items || []);
    mergeRemoteActivity(activity || []);
  } finally {
    suppressAutoSync = false;
  }
}

function mergeRemoteFolders(rows) {
  const localById = new Map(state.folders.map((folder) => [folder.id, folder]));

  rows.forEach((row) => {
    const incoming = {
      id: row.id,
      name: row.name,
      createdAt: row.created_at || 0,
      updatedAt: row.updated_at || 0,
      deletedAt: row.deleted_at || null
    };
    const local = localById.get(incoming.id);
    if (!local) {
      state.folders.push(incoming);
      return;
    }
    if ((incoming.updatedAt || 0) >= (local.updatedAt || 0)) {
      Object.assign(local, incoming);
    }
  });

  if (!state.folders.some((folder) => folder.id === "default")) {
    const timestamp = nowMs();
    state.folders.unshift({ id: "default", name: "默认", createdAt: timestamp, updatedAt: timestamp });
  }
}

function mergeRemoteItems(rows) {
  const localById = new Map(state.items.map((item) => [item.id, item]));

  rows.forEach((row) => {
    const incoming = {
      id: row.id,
      type: row.type,
      english: row.english,
      chinese: row.chinese,
      folderId: row.folder_id || "default",
      tags: row.tags || [],
      favorite: Boolean(row.favorite),
      paused: Boolean(row.paused),
      stats: row.stats || newItemStats(),
      createdAt: row.created_at || 0,
      updatedAt: row.updated_at || 0,
      deletedAt: row.deleted_at || null
    };
    const local = localById.get(incoming.id);

    if (!local) {
      state.items.push(incoming);
      return;
    }

    const mergedTags = Array.from(new Set([...(local.tags || []), ...(incoming.tags || [])]));
    const mergedFavorite = Boolean(local.favorite || incoming.favorite);

    if ((incoming.updatedAt || 0) >= (local.updatedAt || 0)) {
      Object.assign(local, incoming);
    }

    local.tags = mergedTags;
    local.favorite = mergedFavorite;
    local.stats = mergeStats(local.stats || newItemStats(), incoming.stats || newItemStats());

    if (incoming.deletedAt && (!local.deletedAt || incoming.deletedAt >= local.deletedAt)) {
      local.deletedAt = incoming.deletedAt;
      local.updatedAt = Math.max(local.updatedAt || 0, incoming.updatedAt || incoming.deletedAt);
    }
  });
}

function mergeStats(a, b) {
  return {
    attempts: Math.max(a.attempts || 0, b.attempts || 0),
    correct: Math.max(a.correct || 0, b.correct || 0),
    wrong: Math.max(a.wrong || 0, b.wrong || 0),
    streak: Math.max(a.streak || 0, b.streak || 0),
    weight: Math.max(a.weight || 0, b.weight || 0, 1),
    lastSeen: Math.max(a.lastSeen || 0, b.lastSeen || 0) || null,
    nextDue: Math.max(a.nextDue || 0, b.nextDue || 0),
    lastOutcome: (a.lastSeen || 0) >= (b.lastSeen || 0) ? a.lastOutcome || null : b.lastOutcome || null
  };
}

function mergeRemoteActivity(rows) {
  state.activity = state.activity || {};
  state.activityUpdatedAt = state.activityUpdatedAt || {};

  rows.forEach((row) => {
    const localData = state.activity[row.day] || {};
    const incoming = row.data || {};
    state.activity[row.day] = {
      practice: Math.max(localData.practice || 0, incoming.practice || 0),
      correct: Math.max(localData.correct || 0, incoming.correct || 0),
      wrong: Math.max(localData.wrong || 0, incoming.wrong || 0),
      hint: Math.max(localData.hint || 0, incoming.hint || 0),
      skip: Math.max(localData.skip || 0, incoming.skip || 0)
    };
    state.activityUpdatedAt[row.day] = Math.max(state.activityUpdatedAt[row.day] || 0, row.updated_at || 0);
  });
}

function showToast(message) {
  els.toast.textContent = message;
  els.toast.classList.add("visible");
  clearTimeout(showToast.timer);
  showToast.timer = setTimeout(() => {
    els.toast.classList.remove("visible");
  }, 2400);
}
