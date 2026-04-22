const assert = require("node:assert/strict");
const {
  getStorageBackendName,
  getStorageBackend
} = require("../lib/storage");

module.exports = function runStorageBackendTest() {
  assert.equal(getStorageBackendName({}), "json");
  assert.equal(getStorageBackendName({ storage: { backend: "JSON" } }), "json");
  assert.equal(getStorageBackendName({ storage: { backend: "sqlite" } }), "sqlite");

  const jsonBackend = getStorageBackend({});
  const sqliteBackend = getStorageBackend({ storage: { backend: "sqlite" } });

  assert.equal(jsonBackend.name, "json");
  assert.equal(sqliteBackend.name, "sqlite");
  assert.equal(typeof jsonBackend.loadData, "function");
  assert.equal(typeof sqliteBackend.loadData, "function");
  assert.equal(typeof sqliteBackend.saveData, "function");
};
