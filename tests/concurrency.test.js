const assert = require("node:assert/strict");
const fs = require("node:fs");
const { acquireWriteLock, getLockFilePath, readLockMetadata } = require("../lib/core/concurrency");

module.exports = function runConcurrencyTest() {
  const config = {
    concurrency: {
      enabled: true,
      lockFile: ".ekg.test.lock",
      staleLockMs: 5,
      retryIntervalMs: 5,
      maxWaitMs: 100
    }
  };
  const lockFilePath = getLockFilePath(config);

  fs.rmSync(lockFilePath, { force: true });
  fs.writeFileSync(lockFilePath, JSON.stringify({
    ownerToken: "stale-lock",
    pid: 999999,
    reason: "test",
    acquiredAt: "2000-01-01T00:00:00.000Z"
  }, null, 2));

  const release = acquireWriteLock(config, "test-lock");
  const metadata = readLockMetadata(lockFilePath);

  assert.equal(Boolean(metadata), true);
  assert.equal(metadata.reason, "test-lock");
  assert.equal(typeof metadata.ownerToken, "string");

  release();

  assert.equal(fs.existsSync(lockFilePath), false);
};
