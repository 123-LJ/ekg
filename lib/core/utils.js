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

const GENERIC_CONCEPT_TOKENS = new Set([
  "paper",
  "study",
  "article",
  "work",
  "research",
  "system",
  "method",
  "methods",
  "based",
  "using",
  "approach",
  "approaches",
  "analysis",
  "model",
  "models",
  "data",
  "task"
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
    .split(/[^\p{L}\p{N}/_-]+/u)
    .filter(Boolean);
}

function normalizeConceptKey(value) {
  return normalizeText(value)
    .replace(/[^\p{L}\p{N}]+/gu, "-")
    .replace(/^-+|-+$/g, "");
}

function buildAliasRegistry(multilingualConfig = {}) {
  const registry = {};
  Object.entries((multilingualConfig || {}).concepts || {}).forEach(([canonical, aliases]) => {
    const canonicalKey = normalizeConceptKey(canonical);
    if (!canonicalKey) {
      return;
    }

    const values = unique([
      canonicalKey,
      ...(aliases || []).map((item) => normalizeText(item)),
      normalizeText(canonical)
    ]);
    registry[canonicalKey] = values.filter(Boolean);
  });
  return registry;
}

function findCanonicalConcepts(values = [], multilingualConfig = {}) {
  const registry = buildAliasRegistry(multilingualConfig);
  const haystack = normalizeText((values || []).filter(Boolean).join(" "));
  const tokens = new Set((values || []).flatMap((value) => tokenize(value)));
  return Object.entries(registry)
    .filter(([, aliases]) => aliases.some((alias) => haystack.includes(alias) || tokens.has(alias)))
    .map(([canonical]) => canonical);
}

function scoreAliasOverlap(leftTokens = [], rightTokens = []) {
  const left = new Set((leftTokens || []).filter(Boolean));
  const right = new Set((rightTokens || []).filter(Boolean));
  if (!left.size || !right.size) {
    return 0;
  }

  let intersection = 0;
  left.forEach((token) => {
    if (right.has(token)) {
      intersection += 1;
    }
  });

  return intersection / Math.max(left.size, right.size);
}

function inferCanonicalKeyFromText(value) {
  const tokens = tokenize(value)
    .filter((token) => token.length >= 3)
    .filter((token) => !GENERIC_CONCEPT_TOKENS.has(token));
  if (!tokens.length) {
    return "";
  }

  return normalizeConceptKey(tokens.slice(0, 4).join("-"));
}

function suggestCanonicalConcepts(values = [], multilingualConfig = {}, options = {}) {
  const maxSuggestions = Math.max(1, Number(options.maxSuggestions || 6));
  const exactMatches = findCanonicalConcepts(values, multilingualConfig);
  const registry = buildAliasRegistry(multilingualConfig);
  const phraseValues = unique((values || []).filter(Boolean).map((value) => String(value).trim()).filter(Boolean));
  const scoredMatches = [];

  phraseValues.forEach((phrase) => {
    const phraseTokens = tokenize(phrase);
    Object.entries(registry).forEach(([canonical, aliases]) => {
      const aliasScore = Math.max(...aliases.map((alias) => {
        return scoreAliasOverlap(phraseTokens, tokenize(alias));
      }), 0);

      if (aliasScore >= 0.5 && !exactMatches.includes(canonical)) {
        scoredMatches.push({
          canonical,
          score: aliasScore,
          source: phrase
        });
      }
    });
  });

  const inferred = phraseValues
    .map((phrase) => ({
      canonical: inferCanonicalKeyFromText(phrase),
      score: 0.35,
      source: phrase
    }))
    .filter((item) => item.canonical)
    .filter((item) => !exactMatches.includes(item.canonical))
    .filter((item) => !Object.prototype.hasOwnProperty.call(registry, item.canonical));

  return unique([
    ...exactMatches,
    ...scoredMatches
      .sort((left, right) => right.score - left.score || left.canonical.localeCompare(right.canonical))
      .map((item) => item.canonical),
    ...inferred.map((item) => item.canonical)
  ]).slice(0, maxSuggestions);
}

function expandTokensWithAliases(tokens = [], semanticAliases = {}, multilingualConfig = {}) {
  const expanded = new Set((tokens || []).filter(Boolean).map(normalizeText));
  const semanticEntries = Object.entries(semanticAliases || {});

  [...expanded].forEach((token) => {
    semanticEntries.forEach(([canonical, variants]) => {
      const normalizedCanonical = normalizeText(canonical);
      const normalizedVariants = [normalizedCanonical, ...(variants || []).map(normalizeText)];
      if (!normalizedVariants.includes(token)) {
        return;
      }
      normalizedVariants.forEach((value) => expanded.add(value));
    });
  });

  Object.entries(buildAliasRegistry(multilingualConfig)).forEach(([canonical, aliases]) => {
    if (![canonical, ...aliases].some((alias) => expanded.has(alias))) {
      return;
    }

    expanded.add(canonical);
    aliases.forEach((alias) => expanded.add(alias));
  });

  return [...expanded];
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
  normalizeConceptKey,
  buildAliasRegistry,
  findCanonicalConcepts,
  suggestCanonicalConcepts,
  expandTokensWithAliases,
  tokenizeTargetFile,
  unique,
  parseList,
  parseArgs,
  getWriterIdentity
};
