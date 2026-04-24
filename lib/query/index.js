const {
  getExperiences,
  getPapers
} = require("../model");
const {
  buildKnowledgeGraph,
  describeGraphNode,
  getEdgeMetadata,
  getRelationTypeConfig,
  parseRelationEntry
} = require("../graph");
const {
  normalizeText,
  tokenize,
  tokenizeTargetFile,
  unique,
  expandTokensWithAliases,
  findCanonicalConcepts
} = require("../core/utils");

const DEFAULT_SEMANTIC_CONFIG = {
  enabled: true,
  minimumScore: 0.18,
  scoreWeight: 8,
  tokenWeight: 0.35,
  trigramWeight: 0.25,
  fieldWeight: 0.15,
  canonicalWeight: 0.4,
  aliases: {
    login: ["signin", "sign-in", "log-in", "authentication", "auth"],
    redirect: ["reroute", "jump", "callback", "returnurl", "return-url"],
    refresh: ["renew", "reload", "reauth", "re-auth"],
    footer: ["tabbar", "bottomnav", "bottom-nav"],
    bug: ["issue", "failure", "problem"],
    fix: ["repair", "resolve", "patch"]
  },
  multilingual: {
    enabled: true,
    concepts: {}
  }
};

function getSemanticConfig(query = {}) {
  const queryConfig = query.semanticConfig || {};
  return {
    ...DEFAULT_SEMANTIC_CONFIG,
    ...queryConfig,
    aliases: {
      ...DEFAULT_SEMANTIC_CONFIG.aliases,
      ...(queryConfig.aliases || {})
    },
    multilingual: {
      ...DEFAULT_SEMANTIC_CONFIG.multilingual,
      ...(queryConfig.multilingual || {})
    }
  };
}

function buildTrigrams(value) {
  const text = normalizeText(value).replace(/\s+/g, " ");
  if (text.length < 3) {
    return text ? [text] : [];
  }

  const trigrams = [];
  for (let index = 0; index <= text.length - 3; index += 1) {
    trigrams.push(text.slice(index, index + 3));
  }
  return unique(trigrams);
}

function overlapScore(leftValues, rightValues) {
  const left = new Set((leftValues || []).filter(Boolean));
  const right = new Set((rightValues || []).filter(Boolean));
  if (!left.size || !right.size) {
    return 0;
  }

  let intersection = 0;
  left.forEach((value) => {
    if (right.has(value)) {
      intersection += 1;
    }
  });

  return intersection / Math.max(left.size, right.size);
}

function buildSemanticQueryProfile(query = {}) {
  const semanticConfig = getSemanticConfig(query);
  const baseTokens = unique([
    ...tokenize(query.text || ""),
    ...tokenize(query.targetFile || ""),
    ...((query.tokens || []).map(normalizeText))
  ]);
  const expandedTokens = expandTokensWithAliases(
    baseTokens,
    semanticConfig.aliases,
    semanticConfig.multilingual
  );
  const normalizedText = normalizeText([
    query.text || "",
    query.targetFile || ""
  ].join(" "));
  const canonicalTerms = findCanonicalConcepts([
    query.text || "",
    query.targetFile || "",
    ...expandedTokens
  ], semanticConfig.multilingual);

  return {
    semanticConfig,
    tokens: expandedTokens,
    trigrams: buildTrigrams(normalizedText),
    rawText: normalizedText,
    canonicalTerms
  };
}

function buildExperienceSemanticDocument(experience, semanticConfig) {
  const files = (((experience.anchors || {}).files) || []).map(normalizeText);
  const concepts = (((experience.anchors || {}).concepts) || []).map(normalizeText);
  const relationTokens = (experience.relations || [])
    .flatMap((relation) => tokenize(typeof relation === "string" ? relation : JSON.stringify(relation || {})));
  const fields = [
    experience.title,
    experience.symptom,
    experience.problem,
    experience.cause,
    experience.solution,
    experience.fix,
    experience.scope,
    experience.root_cause,
    ...(experience.tags || []),
    ...(experience.techs || []),
    ...files,
    ...concepts,
    ...relationTokens
  ].filter(Boolean);
  const baseTokens = unique(fields.flatMap((field) => tokenize(field)));
  const canonicalTerms = unique([
    ...(experience.canonical_terms || []),
    ...findCanonicalConcepts(fields, semanticConfig.multilingual)
  ]);

  return {
    tokens: unique([
      ...expandTokensWithAliases(baseTokens, semanticConfig.aliases, semanticConfig.multilingual),
      ...canonicalTerms
    ]),
    trigrams: buildTrigrams(fields.join(" ")),
    fields,
    canonicalTerms
  };
}

function scoreSemanticExperience(experience, query = {}) {
  const semanticConfig = getSemanticConfig(query);
  if (semanticConfig.enabled === false) {
    return {
      experience,
      semanticScore: 0,
      semanticReasons: []
    };
  }

  const profile = buildSemanticQueryProfile(query);
  const document = buildExperienceSemanticDocument(experience, semanticConfig);
  const tokenSimilarity = overlapScore(profile.tokens, document.tokens);
  const trigramSimilarity = overlapScore(profile.trigrams, document.trigrams);
  const canonicalSimilarity = overlapScore(profile.canonicalTerms, document.canonicalTerms);
  const fieldHits = document.fields.reduce((count, field) => {
    const normalizedField = normalizeText(field);
    return count + (profile.tokens.some((token) => normalizedField.includes(token)) ? 1 : 0);
  }, 0);
  const fieldCoverage = document.fields.length
    ? Math.min(1, fieldHits / Math.max(1, Math.min(document.fields.length, 6)))
    : 0;
  const semanticScore = (
    tokenSimilarity * semanticConfig.tokenWeight
    + trigramSimilarity * semanticConfig.trigramWeight
    + fieldCoverage * semanticConfig.fieldWeight
    + canonicalSimilarity * (semanticConfig.canonicalWeight || 0)
  );
  const semanticReasons = [];

  if (tokenSimilarity >= 0.2) {
    semanticReasons.push(`semantic token overlap=${tokenSimilarity.toFixed(2)}`);
  }
  if (trigramSimilarity >= 0.2) {
    semanticReasons.push(`semantic phrase overlap=${trigramSimilarity.toFixed(2)}`);
  }
  if (fieldCoverage >= 0.2) {
    semanticReasons.push(`semantic field coverage=${fieldCoverage.toFixed(2)}`);
  }
  if (canonicalSimilarity > 0) {
    semanticReasons.push(`semantic canonical overlap=${canonicalSimilarity.toFixed(2)}`);
  }

  return {
    experience,
    semanticScore,
    semanticReasons
  };
}

function scoreExperience(experience, query) {
  const reasons = [];
  let score = 0;
  let direct = false;

  const mode = query.mode || "text";
  const targetFileTokens = mode === "hook"
    ? tokenizeTargetFile(query.targetFile || "")
    : tokenize(query.targetFile || "");
  const queryTokens = mode === "hook"
    ? unique([...(query.tokens || []), ...targetFileTokens])
    : unique([...(query.tokens || []), ...tokenize(query.text || ""), ...targetFileTokens]);
  const targetFile = normalizeText(query.targetFile || "");
  const anchorFiles = (((experience.anchors || {}).files) || []).map(normalizeText);
  const concepts = (((experience.anchors || {}).concepts) || []).map(normalizeText);

  if (targetFile) {
    anchorFiles.forEach((file) => {
      if (!file) {
        return;
      }

      if (targetFile.endsWith(file) || file.endsWith(targetFile)) {
        score += 12;
        direct = true;
        reasons.push(`direct file anchor: ${file}`);
      } else {
        const targetSegments = targetFile.split("/");
        const fileSegments = file.split("/");
        const sharedSegments = targetSegments.filter((segment) => fileSegments.includes(segment));
        if (sharedSegments.length >= 2) {
          score += 6;
          reasons.push(`shared path segments: ${sharedSegments.join(", ")}`);
        }
      }
    });
  }

  const searchableParts = mode === "hook"
    ? [
        experience.title,
        ...anchorFiles,
        ...concepts
      ]
    : [
        experience.title,
        experience.symptom,
        experience.problem,
        experience.cause,
        experience.solution,
        experience.fix,
        experience.scope,
        experience.root_cause,
        ...(experience.aliases || []),
        ...(experience.canonical_terms || []),
        ...(experience.tags || []),
        ...(experience.techs || []),
        ...anchorFiles,
        ...concepts
      ];
  const searchableText = normalizeText(searchableParts.join(" "));

  queryTokens.forEach((token) => {
    if (!token || token.length < 2) {
      return;
    }

    if (searchableText.includes(token)) {
      score += mode === "hook" ? 1 : 2;
      reasons.push(`text token: ${token}`);
    }

    if ((experience.tags || []).some((tag) => normalizeText(tag) === token)) {
      score += 3;
      reasons.push(`tag match: ${token}`);
    }

    if (mode !== "hook" && (experience.techs || []).some((tech) => normalizeText(tech) === token)) {
      score += 3;
      reasons.push(`tech match: ${token}`);
    }

    if (concepts.some((concept) => concept.includes(token))) {
      score += mode === "hook" ? 4 : 2;
      reasons.push(`concept match: ${token}`);
    }
  });

  return {
    experience,
    score,
    lexicalScore: score,
    direct,
    reasons: unique(reasons)
  };
}

function queryExperiences(index, query, limit = 5) {
  const minScore = query.minScore || 1;
  const semanticConfig = getSemanticConfig(query);
  const semanticEnabled = query.useSemantic !== false && semanticConfig.enabled !== false;
  return getExperiences(index)
    .filter((experience) => experience.status !== "ARCHIVED")
    .map((experience) => {
      const lexical = scoreExperience(experience, query);
      const semantic = semanticEnabled
        ? scoreSemanticExperience(experience, {
            ...query,
            semanticConfig
          })
        : { semanticScore: 0, semanticReasons: [] };
      const semanticBoost = semanticEnabled
        && semantic.semanticScore >= (semanticConfig.minimumScore || 0)
        ? semantic.semanticScore * (semanticConfig.scoreWeight || 8)
        : 0;
      return {
        ...lexical,
        semanticScore: semantic.semanticScore,
        score: lexical.score + semanticBoost,
        reasons: unique([
          ...lexical.reasons,
          ...(semanticBoost > 0 ? semantic.semanticReasons : [])
        ])
      };
    })
    .filter((match) => match.score >= minScore)
    .sort((left, right) => right.score - left.score || right.lexicalScore - left.lexicalScore)
    .slice(0, limit);
}

function scorePaper(paper, query) {
  const reasons = [];
  let score = 0;
  const queryTokens = unique([...(query.tokens || []), ...tokenize(query.text || "")]);
  const searchableParts = [
    paper.title,
    paper.abstract,
    paper.summary,
    paper.findings,
    paper.limitations,
    paper.notes,
    ...(paper.authors || []),
    paper.venue,
    String(paper.year || ""),
    ...(paper.aliases || []),
    ...(paper.canonical_terms || []),
    ...(paper.topics || []),
    ...(paper.keywords || []),
    paper.doi,
    paper.arxiv_id
  ].filter(Boolean);
  const searchableText = normalizeText(searchableParts.join(" "));

  queryTokens.forEach((token) => {
    if (!token || token.length < 2) {
      return;
    }

    if (searchableText.includes(token)) {
      score += 2;
      reasons.push(`text token: ${token}`);
    }

    if ((paper.topics || []).some((topic) => normalizeText(topic) === token)) {
      score += 4;
      reasons.push(`topic match: ${token}`);
    }

    if ((paper.keywords || []).some((keyword) => normalizeText(keyword) === token)) {
      score += 3;
      reasons.push(`keyword match: ${token}`);
    }

    if ((paper.authors || []).some((author) => normalizeText(author).includes(token))) {
      score += 2;
      reasons.push(`author match: ${token}`);
    }
  });

  return {
    paper,
    score,
    lexicalScore: score,
    reasons: unique(reasons)
  };
}

function buildPaperSemanticDocument(paper, semanticConfig) {
  const fields = [
    paper.title,
    paper.abstract,
    paper.summary,
    paper.findings,
    paper.limitations,
    paper.notes,
    ...(paper.authors || []),
    paper.venue,
    String(paper.year || ""),
    ...(paper.aliases || []),
    ...(paper.canonical_terms || []),
    ...(paper.topics || []),
    ...(paper.keywords || [])
  ].filter(Boolean);

  const baseTokens = unique(fields.flatMap((field) => tokenize(field)));
  const canonicalTerms = unique([
    ...(paper.canonical_terms || []),
    ...findCanonicalConcepts(fields, semanticConfig.multilingual)
  ]);
  return {
    tokens: unique([
      ...expandTokensWithAliases(baseTokens, semanticConfig.aliases, semanticConfig.multilingual),
      ...canonicalTerms
    ]),
    trigrams: buildTrigrams(fields.join(" ")),
    fields,
    canonicalTerms
  };
}

function scoreSemanticPaper(paper, query = {}) {
  const semanticConfig = getSemanticConfig(query);
  if (semanticConfig.enabled === false) {
    return {
      paper,
      semanticScore: 0,
      semanticReasons: []
    };
  }

  const profile = buildSemanticQueryProfile(query);
  const document = buildPaperSemanticDocument(paper, semanticConfig);
  const tokenSimilarity = overlapScore(profile.tokens, document.tokens);
  const trigramSimilarity = overlapScore(profile.trigrams, document.trigrams);
  const canonicalSimilarity = overlapScore(profile.canonicalTerms, document.canonicalTerms);
  const fieldHits = document.fields.reduce((count, field) => {
    const normalizedField = normalizeText(field);
    return count + (profile.tokens.some((token) => normalizedField.includes(token)) ? 1 : 0);
  }, 0);
  const fieldCoverage = document.fields.length
    ? Math.min(1, fieldHits / Math.max(1, Math.min(document.fields.length, 6)))
    : 0;
  const semanticScore = (
    tokenSimilarity * semanticConfig.tokenWeight
    + trigramSimilarity * semanticConfig.trigramWeight
    + fieldCoverage * semanticConfig.fieldWeight
    + canonicalSimilarity * (semanticConfig.canonicalWeight || 0)
  );
  const semanticReasons = [];

  if (tokenSimilarity >= 0.2) {
    semanticReasons.push(`semantic token overlap=${tokenSimilarity.toFixed(2)}`);
  }
  if (trigramSimilarity >= 0.2) {
    semanticReasons.push(`semantic phrase overlap=${trigramSimilarity.toFixed(2)}`);
  }
  if (fieldCoverage >= 0.2) {
    semanticReasons.push(`semantic field coverage=${fieldCoverage.toFixed(2)}`);
  }
  if (canonicalSimilarity > 0) {
    semanticReasons.push(`semantic canonical overlap=${canonicalSimilarity.toFixed(2)}`);
  }

  return {
    paper,
    semanticScore,
    semanticReasons
  };
}

function queryPapers(index, query, limit = 5) {
  const minScore = query.minScore || 1;
  const semanticConfig = getSemanticConfig(query);
  const semanticEnabled = query.useSemantic !== false && semanticConfig.enabled !== false;
  return getPapers(index)
    .filter((paper) => (paper.status || "ACTIVE") !== "ARCHIVED")
    .map((paper) => {
      const lexical = scorePaper(paper, query);
      const semantic = semanticEnabled
        ? scoreSemanticPaper(paper, { ...query, semanticConfig })
        : { semanticScore: 0, semanticReasons: [] };
      const semanticBoost = semanticEnabled
        && semantic.semanticScore >= (semanticConfig.minimumScore || 0)
        ? semantic.semanticScore * (semanticConfig.scoreWeight || 8)
        : 0;
      return {
        ...lexical,
        semanticScore: semantic.semanticScore,
        score: lexical.score + semanticBoost,
        reasons: unique([
          ...lexical.reasons,
          ...(semanticBoost > 0 ? semantic.semanticReasons : [])
        ])
      };
    })
    .filter((match) => match.score >= minScore)
    .sort((left, right) => right.score - left.score || right.lexicalScore - left.lexicalScore)
    .slice(0, limit);
}

function isExperienceNode(nodeId) {
  return String(nodeId || "").startsWith("E");
}

function getNodeType(nodeId) {
  if (isExperienceNode(nodeId)) {
    return "experience";
  }

  return String(nodeId || "").split(":")[0] || "node";
}

function collectGraphPaths(graph, startId, options = {}) {
  const maxDepth = Math.max(1, Number.parseInt(options.maxDepth || 4, 10));
  const queue = [[startId]];
  const paths = [];

  while (queue.length) {
    const path = queue.shift();
    const current = path[path.length - 1];
    const depth = path.length - 1;

    if (depth >= maxDepth) {
      continue;
    }

    [...(graph.adjacency.get(current) || [])].forEach((next) => {
      if (path.includes(next)) {
        return;
      }

      const nextPath = [...path, next];
      if (isExperienceNode(next) && next !== startId) {
        paths.push(nextPath);
      }

      if ((nextPath.length - 1) < maxDepth) {
        queue.push(nextPath);
      }
    });
  }

  return paths;
}

function scoreTracePath(graph, pathIds, seedMatch, endpointMatch) {
  const connectorTypes = pathIds
    .slice(1, -1)
    .map(getNodeType)
    .filter((type) => type !== "experience");
  const connectorBonus = connectorTypes.reduce((total, type) => {
    if (type === "file") {
      return total + 8;
    }

    if (type === "concept") {
      return total + 6;
    }

    if (type === "tech") {
      return total + 5;
    }

    if (type === "tag") {
      return total + 4;
    }

    return total + 2;
  }, 0);
  const depthPenalty = Math.max(0, pathIds.length - 2);
  const endpointScore = endpointMatch ? endpointMatch.score * 4 : 0;
  let relationBonus = 0;
  for (let index = 0; index < pathIds.length - 1; index += 1) {
    const metadata = getEdgeMetadata(graph, pathIds[index], pathIds[index + 1]);
    metadata
      .filter((entry) => entry.type === "relation")
      .forEach((entry) => {
        relationBonus += getRelationTypeConfig(entry.relation_type).weight || 0;
      });
  }

  return (seedMatch.score * 10) + endpointScore + connectorBonus + relationBonus - depthPenalty;
}

function buildTraceReasons(graph, pathIds, seedMatch, endpointMatch) {
  const reasons = [
    ...((seedMatch || {}).reasons || []).map((reason) => `seed ${reason}`)
  ];

  if (endpointMatch) {
    reasons.push(...(endpointMatch.reasons || []).map((reason) => `endpoint ${reason}`));
  }

  pathIds.slice(1, -1).forEach((nodeId) => {
    const type = getNodeType(nodeId);
    if (type === "experience") {
      return;
    }

    reasons.push(`shared ${type}: ${describeGraphNode(graph, nodeId).replace(/^[^:]+:\s*/u, "")}`);
  });

  for (let index = 0; index < pathIds.length - 1; index += 1) {
    const from = pathIds[index];
    const to = pathIds[index + 1];
    const relationMeta = getEdgeMetadata(graph, from, to)
      .filter((entry) => entry.type === "relation");

    relationMeta.forEach((entry) => {
      reasons.push(`relation ${getRelationTypeConfig(entry.relation_type || "related").label}: ${from} <-> ${to}`);
    });
  }

  return unique(reasons);
}

function buildTraceSummary(seedExperience, endExperience, pathExperiences) {
  const symptom = seedExperience.symptom || seedExperience.problem || seedExperience.title;
  const cause = endExperience.cause || endExperience.root_cause || endExperience.problem || endExperience.title;
  const fix = endExperience.fix || endExperience.solution || "";
  const scopeParts = unique(pathExperiences.flatMap((experience) => (experience.anchors || {}).files || [])).slice(0, 3);
  const lines = [
    `symptom: ${symptom}`,
    `likely cause: ${cause}`
  ];

  if (fix) {
    lines.push(`likely fix: ${fix}`);
  }

  if (scopeParts.length) {
    lines.push(`scope: ${scopeParts.join(", ")}`);
  }

  return lines.join(" | ");
}

function buildCheckOrder(pathExperiences) {
  return unique(pathExperiences.map((experience) => experience.title)).slice(0, 5);
}

function buildSuggestedFiles(pathExperiences) {
  return unique(
    pathExperiences.flatMap((experience) => ((experience.anchors || {}).files) || [])
  ).slice(0, 6);
}

function buildTraceEntry(graph, pathIds, seedMatch, endpointMatch, experienceById = new Map()) {
  const score = scoreTracePath(graph, pathIds, seedMatch, endpointMatch);
  const pathExperiences = unique(pathIds.filter(isExperienceNode))
    .map((nodeId) => {
      if (nodeId === seedMatch.experience.id) {
        return seedMatch.experience;
      }

      if (endpointMatch && nodeId === endpointMatch.experience.id) {
        return endpointMatch.experience;
      }

      return experienceById.get(nodeId) || null;
    })
    .filter(Boolean);

  return {
    score,
    seed_experience: seedMatch.experience,
    end_experience: endpointMatch ? endpointMatch.experience : seedMatch.experience,
    path_ids: pathIds,
    path_labels: pathIds.map((nodeId) => describeGraphNode(graph, nodeId)),
    summary: buildTraceSummary(
      seedMatch.experience,
      endpointMatch ? endpointMatch.experience : seedMatch.experience,
      pathExperiences
    ),
    suggested_files: buildSuggestedFiles(pathExperiences),
    check_order: buildCheckOrder(pathExperiences),
    relation_chain: pathExperiences.flatMap((experience) => {
      return (experience.relations || [])
        .map(parseRelationEntry)
        .filter(Boolean)
        .map((relation) => `${experience.id} ${relation.type} ${relation.target}`);
    }).slice(0, 6),
    reasons: buildTraceReasons(graph, pathIds, seedMatch, endpointMatch)
  };
}

function traceExperiences(index, query, options = {}) {
  const seedLimit = Math.max(1, Number.parseInt(options.seedLimit || 3, 10));
  const pathLimit = Math.max(1, Number.parseInt(options.pathLimit || 5, 10));
  const experiences = getExperiences(index);
  const experienceById = experiences.reduce((bucket, experience) => {
    bucket.set(experience.id, experience);
    return bucket;
  }, new Map());
  const matches = queryExperiences(index, query, seedLimit);
  const graph = buildKnowledgeGraph(index);

  if (!matches.length) {
    return {
      matches: [],
      traces: []
    };
  }

  const traceBySignature = new Map();
  const endpointLimit = Math.max(pathLimit * 3, 6);

  matches.forEach((seedMatch) => {
    const seedId = seedMatch.experience.id;
    const seedOnlyPath = [seedId];
    const seedOnlyTrace = buildTraceEntry(graph, seedOnlyPath, seedMatch, null, experienceById);
    traceBySignature.set(seedOnlyPath.join(" -> "), seedOnlyTrace);

    const endpointMatches = queryExperiences(index, query, Math.max(seedLimit * 6, 12))
      .filter((match) => match.experience.id !== seedId)
      .reduce((bucket, match) => {
        bucket.set(match.experience.id, match);
        return bucket;
      }, new Map());
    const rawPaths = collectGraphPaths(graph, seedId, {
      maxDepth: options.maxDepth || 4
    });
    const bestPathByEndpoint = new Map();

    rawPaths.forEach((pathIds) => {
      const endpointId = pathIds[pathIds.length - 1];
      const currentBest = bestPathByEndpoint.get(endpointId);
      if (!currentBest || pathIds.length < currentBest.length) {
        bestPathByEndpoint.set(endpointId, pathIds);
      }
    });

    [...bestPathByEndpoint.values()]
      .slice(0, endpointLimit)
      .forEach((pathIds) => {
        const endpointId = pathIds[pathIds.length - 1];
        const endpointExperience = endpointId === seedMatch.experience.id
          ? seedMatch.experience
          : experienceById.get(endpointId);

        if (!endpointExperience) {
          return;
        }

        const endpointMatch = endpointMatches.get(endpointId)
          || scoreExperience(endpointExperience, query);
        const trace = buildTraceEntry(graph, pathIds, seedMatch, endpointMatch, experienceById);
        const signature = trace.path_ids.join(" -> ");
        const existing = traceBySignature.get(signature);

        if (!existing || trace.score > existing.score) {
          traceBySignature.set(signature, trace);
        }
      });
  });

  const traces = [...traceBySignature.values()]
    .sort((left, right) => right.score - left.score || left.path_ids.length - right.path_ids.length)
    .slice(0, pathLimit);

  return {
    matches,
    traces
  };
}

module.exports = {
  scoreSemanticExperience,
  scoreSemanticPaper,
  scoreExperience,
  scorePaper,
  queryExperiences,
  queryPapers,
  traceExperiences
};
