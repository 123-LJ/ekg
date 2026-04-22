const fs = require("node:fs");
const path = require("node:path");
const {
  ROOT_DIR,
  DEFAULT_CONCURRENCY
} = require("./paths");
const {
  getWriterIdentity,
  sleepMs
} = require("./utils");

function getConcurrencyConfig(config = {}) {
  return {
    ...DEFAULT_CONCURRENCY,
    ...(config.concurrency || {})
  };
}

function getLockFilePath(config = {}) {
  return path.join(ROOT_DIR, getConcurrencyConfig(config).lockFile);
}

function readLockMetadata(lockFilePath) {
  if (!fs.existsSync(lockFilePath)) {
    return null;
  }

  try {
    return JSON.parse(fs.readFileSync(lockFilePath, "utf8"));
  } catch {
    return null;
  }
}

function isProcessAlive(processId) {
  if (!Number.isInteger(processId) || processId <= 0) {
    return false;
  }

  try {
    process.kill(processId, 0);
    return true;
  } catch {
    return false;
  }
}

function acquireWriteLock(config = {}, reason = "ekg-write") {
  const concurrency = getConcurrencyConfig(config);
  if (!concurrency.enabled) {
    return () => {};
  }

  const lockFilePath = getLockFilePath(config);
  const startedAt = Date.now();
  const ownerToken = `${process.pid}-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;

  while (true) {
    try {
      const handle = fs.openSync(lockFilePath, "wx");
      const payload = {
        ownerToken,
        pid: process.pid,
        reason,
        writer: getWriterIdentity(),
        acquiredAt: new Date().toISOString()
      };
      fs.writeFileSync(handle, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
      fs.closeSync(handle);

      return () => {
        const metadata = readLockMetadata(lockFilePath);
        if (!metadata || metadata.ownerToken !== ownerToken) {
          return;
        }
        fs.rmSync(lockFilePath, { force: true });
      };
    } catch (error) {
      if (error.code !== "EEXIST") {
        throw error;
      }

      const metadata = readLockMetadata(lockFilePath);
      const acquiredAtMs = metadata && metadata.acquiredAt ? Date.parse(metadata.acquiredAt) : 0;
      const isStaleByTime = !acquiredAtMs || (Date.now() - acquiredAtMs) > concurrency.staleLockMs;
      const isStaleByProcess = metadata && metadata.pid ? !isProcessAlive(metadata.pid) : false;

      if (isStaleByTime || isStaleByProcess) {
        fs.rmSync(lockFilePath, { force: true });
        continue;
      }

      if ((Date.now() - startedAt) > concurrency.maxWaitMs) {
        throw new Error(`timed out waiting for EKG write lock (${reason})`);
      }

      sleepMs(concurrency.retryIntervalMs);
    }
  }
}

function withWriteLock(config = {}, reason = "ekg-write", callback) {
  const release = acquireWriteLock(config, reason);
  try {
    return callback();
  } finally {
    release();
  }
}

module.exports = {
  getConcurrencyConfig,
  getLockFilePath,
  readLockMetadata,
  acquireWriteLock,
  withWriteLock
};
