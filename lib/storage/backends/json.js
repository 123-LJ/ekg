const fs = require("node:fs");
const path = require("node:path");
const {
  ROOT_DIR,
  resolveStoragePaths
} = require("../../core/paths");
const {
  readJson,
  writeJson
} = require("../../core/json-store");

function ensureParentDir(filePath) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
}

function mirrorJsonIfNeeded(filePath, data, mirrorTarget, shouldMirror) {
  if (!shouldMirror || !mirrorTarget || mirrorTarget === filePath) {
    return;
  }

  ensureParentDir(mirrorTarget);
  writeJson(mirrorTarget, data);
}

function mirrorTextIfNeeded(filePath, content, mirrorTarget, shouldMirror) {
  if (!shouldMirror || !mirrorTarget || mirrorTarget === filePath) {
    return;
  }

  ensureParentDir(mirrorTarget);
  fs.writeFileSync(mirrorTarget, content, "utf8");
}

function migrateLegacyFile(primaryFile, legacyFile) {
  if (!legacyFile || primaryFile === legacyFile) {
    return;
  }

  if (fs.existsSync(primaryFile) || !fs.existsSync(legacyFile)) {
    return;
  }

  ensureParentDir(primaryFile);
  fs.copyFileSync(legacyFile, primaryFile);
}

function ensureLayout(config = {}) {
  const storagePaths = resolveStoragePaths(config);

  if (storagePaths.OUTPUT_DIR !== ROOT_DIR) {
    fs.mkdirSync(storagePaths.OUTPUT_DIR, { recursive: true });
    migrateLegacyFile(storagePaths.INDEX_FILE, storagePaths.LEGACY_INDEX_FILE);
    migrateLegacyFile(storagePaths.STATE_FILE, storagePaths.LEGACY_STATE_FILE);
    migrateLegacyFile(storagePaths.REPORT_FILE, storagePaths.LEGACY_REPORT_FILE);
  }

  return storagePaths;
}

function loadData(config = {}) {
  const storagePaths = ensureLayout(config);
  const emptyIndex = { nodes: [], edges: [], indexes: {} };
  const emptyState = { hook: { recent_injections: [] } };

  return {
    storagePaths,
    index: readJson(
      storagePaths.INDEX_FILE,
      readJson(storagePaths.LEGACY_INDEX_FILE, emptyIndex)
    ),
    state: readJson(
      storagePaths.STATE_FILE,
      readJson(storagePaths.LEGACY_STATE_FILE, emptyState)
    )
  };
}

function saveData(runtime, options = {}) {
  const storagePaths = runtime.storagePaths || ensureLayout(runtime.config);
  const reportContent = options.reportContent || "";
  const shouldWriteReport = options.skipReportWrite !== true;

  ensureParentDir(storagePaths.INDEX_FILE);
  ensureParentDir(storagePaths.STATE_FILE);
  if (shouldWriteReport) {
    ensureParentDir(storagePaths.REPORT_FILE);
  }

  writeJson(storagePaths.INDEX_FILE, runtime.index);
  writeJson(storagePaths.STATE_FILE, runtime.state);
  if (shouldWriteReport) {
    fs.writeFileSync(storagePaths.REPORT_FILE, reportContent, "utf8");
  }

  mirrorJsonIfNeeded(
    storagePaths.INDEX_FILE,
    runtime.index,
    storagePaths.LEGACY_INDEX_FILE,
    storagePaths.storage.legacyMirror
  );
  mirrorJsonIfNeeded(
    storagePaths.STATE_FILE,
    runtime.state,
    storagePaths.LEGACY_STATE_FILE,
    storagePaths.storage.legacyMirror
  );
  if (shouldWriteReport) {
    mirrorTextIfNeeded(
      storagePaths.REPORT_FILE,
      reportContent,
      storagePaths.LEGACY_REPORT_FILE,
      storagePaths.storage.legacyMirror
    );
  }

  return storagePaths;
}

function saveState(runtime, nextState) {
  const storagePaths = runtime.storagePaths || ensureLayout(runtime.config);

  ensureParentDir(storagePaths.STATE_FILE);
  writeJson(storagePaths.STATE_FILE, nextState);
  mirrorJsonIfNeeded(
    storagePaths.STATE_FILE,
    nextState,
    storagePaths.LEGACY_STATE_FILE,
    storagePaths.storage.legacyMirror
  );

  runtime.state = nextState;
  return storagePaths;
}

function saveReport(runtime, reportContent = "") {
  const storagePaths = runtime.storagePaths || ensureLayout(runtime.config);

  ensureParentDir(storagePaths.REPORT_FILE);
  fs.writeFileSync(storagePaths.REPORT_FILE, reportContent, "utf8");
  mirrorTextIfNeeded(
    storagePaths.REPORT_FILE,
    reportContent,
    storagePaths.LEGACY_REPORT_FILE,
    storagePaths.storage.legacyMirror
  );

  return storagePaths;
}

module.exports = {
  name: "json",
  ensureLayout,
  loadData,
  saveData,
  saveState,
  saveReport
};
