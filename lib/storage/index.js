const STORAGE_BACKEND_LOADERS = {
  json: () => require("./backends/json"),
  sqlite: () => require("./backends/sqlite")
};

function getStorageBackendName(config = {}) {
  return String((((config.storage || {}).backend) || "json")).trim().toLowerCase();
}

function getStorageBackend(config = {}) {
  const backendName = getStorageBackendName(config);
  const loadBackend = STORAGE_BACKEND_LOADERS[backendName];

  if (!loadBackend) {
    throw new Error(`unsupported storage backend: ${backendName}`);
  }

  return loadBackend();
}

function listStorageBackendNames() {
  return Object.keys(STORAGE_BACKEND_LOADERS);
}

module.exports = {
  STORAGE_BACKEND_LOADERS,
  listStorageBackendNames,
  getStorageBackendName,
  getStorageBackend
};
