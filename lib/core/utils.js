const GENERIC_FILE_TOKENS = new Set([
  "src",
  "app",
  "views",
  "pages",
  "components",
  "component",
  "index",
  "main",
  "vue",
  "js",
  "jsx",
  "ts",
  "tsx",
  "css",
  "scss"
]);

function sleepMs(delayMs) {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, delayMs);
}

function normalizeText(value) {
  return String(value || "")
    .replace(/\\/g, "/")
    .trim()
    .toLowerCase();
}

function tokenize(value) {
  return normalizeText(value)
    .split(/[^a-z0-9\u4e00-\u9fa5/_-]+/u)
    .filter(Boolean);
}

function unique(values) {
  return [...new Set((values || []).filter(Boolean))];
}

function tokenizeTargetFile(value) {
  const normalized = normalizeText(value);
  if (!normalized) {
    return [];
  }

  const segments = normalized.split("/").filter(Boolean);
  const basename = segments[segments.length - 1] || "";
  const basenameWithoutExt = basename.replace(/\.[^.]+$/, "");
  const tokens = [...segments, basenameWithoutExt]
    .flatMap((segment) => tokenize(segment.replace(/\.[^.]+$/, "")))
    .filter((token) => token.length >= 3 && !GENERIC_FILE_TOKENS.has(token));

  return unique(tokens);
}

function parseList(value) {
  if (!value) {
    return [];
  }

  return unique(
    String(value)
      .split(",")
      .map((item) => item.trim())
      .filter(Boolean)
  );
}

function parseArgs(argv) {
  const positional = [];
  const options = {};

  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (!token.startsWith("--")) {
      positional.push(token);
      continue;
    }

    const key = token.slice(2);
    const next = argv[index + 1];
    if (!next || next.startsWith("--")) {
      options[key] = true;
      continue;
    }

    if (Object.prototype.hasOwnProperty.call(options, key)) {
      const current = Array.isArray(options[key]) ? options[key] : [options[key]];
      options[key] = [...current, next];
    } else {
      options[key] = next;
    }
    index += 1;
  }

  return { positional, options };
}

function getWriterIdentity(overrides = {}) {
  const identity = {
    agent_id: overrides["agent-id"] || overrides.agentId || process.env.EKG_AGENT_ID || "",
    session_id: overrides["session-id"] || overrides.sessionId || process.env.EKG_SESSION_ID || "",
    host: overrides.host || process.env.EKG_HOST || "",
    user: process.env.EKG_USER || process.env.USERNAME || process.env.USER || ""
  };

  return Object.fromEntries(
    Object.entries(identity).filter(([, value]) => value !== "")
  );
}

module.exports = {
  sleepMs,
  normalizeText,
  tokenize,
  tokenizeTargetFile,
  unique,
  parseList,
  parseArgs,
  getWriterIdentity
};
