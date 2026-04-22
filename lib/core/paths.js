const path = require("node:path");

const ROOT_DIR = path.resolve(__dirname, "..", "..");
const CONFIG_FILE = path.join(ROOT_DIR, "config.json");
const LEGACY_INDEX_FILE = path.join(ROOT_DIR, "ekg.json");
const LEGACY_STATE_FILE = path.join(ROOT_DIR, "state.json");
const LEGACY_REPORT_FILE = path.join(ROOT_DIR, "reports", "EKG_REPORT.md");
const LEGACY_EXPERIENCES_DIR = path.join(ROOT_DIR, "experiences");

const DEFAULT_STORAGE = {
  backend: "json",
  outputDir: "ekg-out",
  legacyMirror: true,
  indexFile: "ekg.json",
  stateFile: "state.json",
  experienceDir: "experiences",
  reportFile: path.join("reports", "EKG_REPORT.md"),
  sqliteFile: path.join("ekg-out", "ekg.sqlite")
};

const DEFAULT_CONCURRENCY = {
  enabled: true,
  lockFile: ".ekg.lock",
  staleLockMs: 30000,
  retryIntervalMs: 100,
  maxWaitMs: 5000,
  readRetryCount: 5,
  readRetryIntervalMs: 30
};

function getStorageConfig(config = {}) {
  return {
    ...DEFAULT_STORAGE,
    ...(config.storage || {})
  };
}

function resolveStoragePaths(config = {}) {
  const storage = getStorageConfig(config);
  const outputRoot = storage.outputDir
    ? path.join(ROOT_DIR, storage.outputDir)
    : ROOT_DIR;

  return {
    ROOT_DIR,
    CONFIG_FILE,
    OUTPUT_DIR: outputRoot,
    INDEX_FILE: path.join(outputRoot, storage.indexFile),
    STATE_FILE: path.join(outputRoot, storage.stateFile),
    REPORT_FILE: path.join(outputRoot, storage.reportFile),
    SQLITE_FILE: path.isAbsolute(storage.sqliteFile)
      ? storage.sqliteFile
      : path.join(ROOT_DIR, storage.sqliteFile),
    EXPERIENCES_DIR: path.join(ROOT_DIR, storage.experienceDir),
    LEGACY_INDEX_FILE,
    LEGACY_STATE_FILE,
    LEGACY_REPORT_FILE,
    LEGACY_EXPERIENCES_DIR,
    storage
  };
}

module.exports = {
  ROOT_DIR,
  CONFIG_FILE,
  LEGACY_INDEX_FILE,
  LEGACY_STATE_FILE,
  LEGACY_REPORT_FILE,
  LEGACY_EXPERIENCES_DIR,
  DEFAULT_STORAGE,
  getStorageConfig,
  resolveStoragePaths,
  DEFAULT_CONCURRENCY
};
