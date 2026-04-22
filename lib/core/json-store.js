const fs = require("node:fs");
const { DEFAULT_CONCURRENCY } = require("./paths");
const { sleepMs } = require("./utils");

function readJson(filePath, fallback = {}, options = {}) {
  if (!fs.existsSync(filePath)) {
    return structuredClone(fallback);
  }

  const attempts = options.attempts || DEFAULT_CONCURRENCY.readRetryCount;
  const retryIntervalMs = options.retryIntervalMs || DEFAULT_CONCURRENCY.readRetryIntervalMs;

  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      return JSON.parse(fs.readFileSync(filePath, "utf8"));
    } catch (error) {
      if (error instanceof SyntaxError && attempt < attempts) {
        sleepMs(retryIntervalMs);
        continue;
      }

      throw error;
    }
  }

  return structuredClone(fallback);
}

function writeJson(filePath, data) {
  fs.writeFileSync(filePath, `${JSON.stringify(data, null, 2)}\n`, "utf8");
}

module.exports = {
  readJson,
  writeJson
};
