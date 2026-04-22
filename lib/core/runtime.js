const {
  CONFIG_FILE
} = require("./paths");
const {
  readJson,
  writeJson
} = require("./json-store");
const {
  withWriteLock
} = require("./concurrency");
const {
  runBuildPipeline
} = require("../pipeline");
const {
  getStorageBackend
} = require("../storage");

function loadConfig() {
  return readJson(CONFIG_FILE, {});
}

function writeConfig(config) {
  writeJson(CONFIG_FILE, config);
}

function ensureStorageLayout(config = {}) {
  return getStorageBackend(config).ensureLayout(config);
}

function buildRuntime(config = loadConfig()) {
  const storageBackend = getStorageBackend(config);
  const loaded = storageBackend.loadData(config);

  return {
    config,
    storageBackend,
    ...loaded
  };
}

function loadRuntime() {
  return buildRuntime(loadConfig());
}

function saveRuntimeUnlocked(runtime) {
  const pipelineResult = runBuildPipeline(runtime);
  const storageBackend = runtime.storageBackend || getStorageBackend(runtime.config);
  runtime.storagePaths = storageBackend.saveData(runtime, {
    reportContent: `${pipelineResult.report.content}\n`
  });
  runtime.storageBackend = storageBackend;
}

function saveRuntime(runtime, options = {}) {
  if (options.skipLock) {
    saveRuntimeUnlocked(runtime);
    return;
  }

  withWriteLock(runtime.config, "save-runtime", () => {
    const freshRuntime = buildRuntime(runtime.config);
    freshRuntime.index = runtime.index;
    freshRuntime.state = runtime.state;
    saveRuntimeUnlocked(freshRuntime);
  });
}

function saveStateUnlocked(runtime, nextState) {
  const storageBackend = runtime.storageBackend || getStorageBackend(runtime.config);
  if (typeof storageBackend.saveState !== "function") {
    throw new Error(`storage backend ${storageBackend.name || "unknown"} does not support state-only saves`);
  }

  runtime.storagePaths = storageBackend.saveState(runtime, nextState);
  runtime.storageBackend = storageBackend;
}

function saveState(runtime, nextState, options = {}) {
  if (options.skipLock) {
    saveStateUnlocked(runtime, nextState);
    return;
  }

  withWriteLock(runtime.config, "save-state", () => {
    saveStateUnlocked(runtime, nextState);
  });
}

function mutateRuntime(reason, mutator) {
  const config = loadConfig();
  return withWriteLock(config, reason, () => {
    const runtime = buildRuntime(config);
    const result = mutator(runtime);
    saveRuntime(runtime, { skipLock: true });
    return result;
  });
}

module.exports = {
  loadConfig,
  writeConfig,
  ensureStorageLayout,
  buildRuntime,
  loadRuntime,
  saveRuntimeUnlocked,
  saveRuntime,
  saveStateUnlocked,
  saveState,
  mutateRuntime
};
