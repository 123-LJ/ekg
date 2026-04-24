const path = require("node:path");
const {
  CONFIG_FILE,
  ROOT_DIR
} = require("../core/paths");
const {
  parseArgs,
  parseList,
  unique,
  getWriterIdentity,
  findCanonicalConcepts,
  normalizeConceptKey,
  suggestCanonicalConcepts,
  buildCompactText
} = require("../core/utils");
const {
  loadConfig,
  writeConfig,
  buildRuntime,
  loadRuntime,
  mutateRuntime,
  saveRuntime,
  saveState
} = require("../core/runtime");
const {
  withWriteLock,
  getLockFilePath,
  readLockMetadata
} = require("../core/concurrency");
const {
  getStorageBackend,
  getStorageBackendName
} = require("../storage");
const {
  buildKnowledgeGraph,
  resolveGraphNode,
  findShortestPath,
  describeGraphNode,
  validateRelationEntries,
  serializeRelationEntry
} = require("../graph");
const {
  getExperiences,
  getPapers,
  computeStats,
  getExperienceById,
  getPaperById,
  resolveExperienceRef,
  nextExperienceId,
  resolvePaperRef,
  nextPaperId,
  writeExperienceFile,
  writePaperFile
} = require("../model");
const {
  queryExperiences,
  queryPapers,
  traceExperiences,
  buildExperienceEvolutionMaps
} = require("../query");
const {
  fetchPaperMetadata,
  applyImportedPapers
} = require("../papers");
const {
  createCaptureCandidate,
  collectList,
  listCaptureCandidates,
  findCaptureCandidate,
  evaluateCandidateRisk,
  recordCaptureEvent,
  removeCaptureCandidate
} = require("../capture");
const {
  createIngestCaptureCandidates
} = require("../ingest");
const {
  exportPortableBackup,
  importPortableBackup,
  inspectPortableBackup,
  slashPath
} = require("../backup");
const {
  detectStaleExperiences,
  updateAnchorBaselines,
  markStaleFindings
} = require("../stale");
const {
  writePanel,
  openPanelFile,
  openPanelUrl,
  startPanelServer
} = require("../panel");
const {
  listProjects,
  registerProject,
  setActiveProject,
  getActiveProject,
  findProject,
  resolveProjectForPath
} = require("../project");
const {
  buildStageMetadata
} = require("../core/stage");

function printUsage() {
  const stageMeta = buildStageMetadata();
  console.log(
    [
      `EKG CLI - ${stageMeta.label}`,
      stageMeta.summary,
      "",
      "Usage:",
      "  node scripts/ekg.js stats",
      "  node scripts/ekg.js query <keyword>",
      "  node scripts/ekg.js trace <keyword>",
      "  node scripts/ekg.js explain <node>",
      "  node scripts/ekg.js paper-query <keyword>",
      "  node scripts/ekg.js paper-explain <paper>",
      "  node scripts/ekg.js paper-add --title <title> --abstract <text> [--authors a,b] [--year 2025] [--venue name] [--url link] [--doi value] [--arxiv-id value] [--topics a,b] [--keywords a,b] [--summary <text>] [--findings <text>] [--limitations <text>] [--notes <text>] [--relations fixes:E001]",
      "  node scripts/ekg.js paper-capture --title <title> --abstract <text> [--authors a,b] [--year 2025] [--venue name] [--url link] [--doi value] [--arxiv-id value] [--topics a,b] [--keywords a,b] [--summary <text>] [--findings <text>] [--limitations <text>] [--notes <text>] [--relations fixes:E001]",
      "  node scripts/ekg.js paper-import --source openalex|semanticscholar --query <keyword> [--limit 5] [--relation fixes:E001]",
      "  node scripts/ekg.js concept-suggest <text> [--topic name] [--keyword name]",
      "  node scripts/ekg.js concept-register --canonical <key> --alias <text> [--alias <text>]",
      "  node scripts/ekg.js survey <topic-or-keyword>",
      "  node scripts/ekg.js supersede <new-experience> <old-experience>",
      "  node scripts/ekg.js path <from> <to>",
      "  node scripts/ekg.js review",
      "  node scripts/ekg.js review <id> --confirm|--archive|--needs-review|--uncertain",
      "  node scripts/ekg.js add --title <title> --problem <problem> --solution <solution> [--symptom <text>] [--cause <text>] [--fix <text>] [--scope <text>] [--root-cause <text>] [--tags a,b] [--techs a,b] [--file path] [--concept name] [--agent-id id] [--session-id id]",
      "  node scripts/ekg.js ingest [--source task|conversation|commit] [--task <text>] [--summary <text>] [--message <text>] [--commit <sha>|--since <sha>] [--limit 20]",
      "  node scripts/ekg.js capture-status [id]",
      "  node scripts/ekg.js capture-accept <id> [--confirm]",
      "  node scripts/ekg.js capture-dismiss <id>",
      "  node scripts/ekg.js project-register --name <name> --root <path> [--type vue] [--tags a,b] [--activate]",
      "  node scripts/ekg.js project-list",
      "  node scripts/ekg.js project-use <id|name|root>",
      "  node scripts/ekg.js project-status",
      "  node scripts/ekg.js project-resolve <file-or-path>",
      "  node scripts/ekg.js pipeline-status",
      "  node scripts/ekg.js stale-check [--baseline] [--dry-run]",
      "  node scripts/ekg.js storage-status",
      "  node scripts/ekg.js storage-migrate --to sqlite|json",
      "  node scripts/ekg.js storage-rollback",
      "  node scripts/ekg.js backup-export [--output backups/]",
      "  node scripts/ekg.js backup-inspect <package-file>",
      "  node scripts/ekg.js backup-import <package-file>",
      "  node scripts/ekg.js panel [--output ekg-out/panel/] [--open] [--serve] [--host 127.0.0.1] [--port 4312]",
      "  node scripts/ekg.js report"
    ].join("\n")
  );
}

function collectOptionList(value) {
  return collectList(value);
}

function buildExperienceOptions(runtime, addOptions) {
  const title = addOptions.title || addOptions.problem;
  const problem = addOptions.problem;
  const solution = addOptions.solution;

  if (!title || !problem || !solution) {
    throw new Error("add requires --title or --problem together with --problem and --solution");
  }

  const relationValidation = validateRelationEntries(collectOptionList(addOptions.relations));
  if (relationValidation.invalid.length) {
    throw new Error(`invalid relation format: ${relationValidation.invalid.join(", ")}`);
  }

  return {
    title,
    problem,
    solution,
    symptom: addOptions.symptom || "",
    cause: addOptions.cause || "",
    fix: addOptions.fix || "",
    scope: addOptions.scope || "",
    rootCause: addOptions["root-cause"] || addOptions.rootCause || "",
    anchors: {
      files: unique([
        ...collectOptionList(addOptions.file),
        ...collectOptionList(addOptions.files)
      ]),
      concepts: unique([
        ...collectOptionList(addOptions.concept),
        ...collectOptionList(addOptions.concepts)
      ]),
      commits: unique(collectOptionList(addOptions.commit))
    },
    tags: collectOptionList(addOptions.tags),
    techs: collectOptionList(addOptions.techs),
    aliases: collectOptionList(addOptions.aliases),
    canonical_terms: unique([
      ...collectOptionList(addOptions["canonical-terms"] || addOptions.canonicalTerms),
      ...findCanonicalConcepts([
        title,
        problem,
        solution,
        addOptions.symptom,
        addOptions.cause,
        ...(collectOptionList(addOptions.tags)),
        ...(collectOptionList(addOptions.concept)),
        ...(collectOptionList(addOptions.concepts))
      ], (((runtime || {}).config || {}).query || {}).multilingual || {})
    ]),
    relations: relationValidation.valid.map(serializeRelationEntry),
    type: addOptions.type || "workflow",
    level: addOptions.level || "L1",
    confidence: addOptions.confidence || "CONFIRMED",
    status: addOptions.status || "ACTIVE",
    source: addOptions.source || "manual/cli",
    project_scope: addOptions.scope || "current-project",
    writer: getWriterIdentity(addOptions)
  };
}

function createExperienceRecord(runtime, addOptions) {
  const normalized = buildExperienceOptions(runtime, addOptions);
  const now = new Date().toISOString();

  return {
    id: nextExperienceId(runtime.index),
    kind: "Experience",
    type: normalized.type,
    title: normalized.title,
    problem: normalized.problem,
    solution: normalized.solution,
    symptom: normalized.symptom,
    cause: normalized.cause,
    fix: normalized.fix,
    scope: normalized.scope,
    root_cause: normalized.rootCause,
    tags: normalized.tags,
    techs: normalized.techs,
    aliases: normalized.aliases,
    canonical_terms: normalized.canonical_terms,
    level: normalized.level,
    confidence: normalized.confidence,
    status: normalized.status,
    source: normalized.source,
    project_scope: normalized.project_scope,
    writer: normalized.writer,
    anchors: normalized.anchors,
    relations: normalized.relations,
    created_at: now,
    updated_at: now
  };
}

function buildPaperOptions(addOptions) {
  const title = addOptions.title;
  const abstract = addOptions.abstract;

  if (!title || !abstract) {
    throw new Error("paper-add requires --title and --abstract");
  }

  const relationValidation = validateRelationEntries(collectOptionList(addOptions.relations));
  if (relationValidation.invalid.length) {
    throw new Error(`invalid relation format: ${relationValidation.invalid.join(", ")}`);
  }

  return {
    title,
    abstract,
    summary: buildCompactText(addOptions.summary || abstract, {
      maxLength: 240,
      maxSegments: 3
    }),
    findings: addOptions.findings || addOptions.finding || "",
    limitations: addOptions.limitations || "",
    notes: addOptions.notes || "",
    authors: collectOptionList(addOptions.authors),
    topics: collectOptionList(addOptions.topics),
    keywords: collectOptionList(addOptions.keywords),
    aliases: collectOptionList(addOptions.aliases),
    venue: addOptions.venue || "",
    year: addOptions.year || "",
    url: addOptions.url || "",
    doi: addOptions.doi || "",
    arxiv_id: addOptions["arxiv-id"] || addOptions.arxivId || "",
    source: addOptions.source || "manual/paper-cli",
    status: addOptions.status || "ACTIVE",
    relations: relationValidation.valid.map(serializeRelationEntry)
  };
}

function createPaperRecord(runtime, addOptions) {
  const normalized = buildPaperOptions(addOptions);
  const now = new Date().toISOString();
  return {
    id: nextPaperId(runtime.index),
    kind: "Paper",
    title: normalized.title,
    abstract: normalized.abstract,
    summary: normalized.summary,
    findings: normalized.findings,
    limitations: normalized.limitations,
    notes: normalized.notes,
    authors: normalized.authors,
    topics: normalized.topics,
    keywords: normalized.keywords,
    aliases: unique([
      ...normalized.aliases,
      normalized.title,
      ...normalized.topics
    ]),
    canonical_terms: unique([
      ...collectOptionList(addOptions["canonical-terms"] || addOptions.canonicalTerms),
      ...findCanonicalConcepts([
        normalized.title,
        normalized.abstract,
        normalized.summary,
        ...normalized.topics,
        ...normalized.keywords,
        ...normalized.aliases
      ], (((runtime || {}).config || {}).query || {}).multilingual || {})
    ]),
    venue: normalized.venue,
    year: normalized.year,
    url: normalized.url,
    doi: normalized.doi,
    arxiv_id: normalized.arxiv_id,
    source: normalized.source,
    status: normalized.status,
    relations: normalized.relations,
    created_at: now,
    updated_at: now
  };
}

function buildPaperCaptureInput(runtime, options = {}) {
  const normalized = buildPaperOptions(options);
  const compactSummary = buildCompactText(
    normalized.summary || normalized.abstract || normalized.title,
    {
      maxLength: 220,
      maxSegments: 3
    }
  );

  return {
    title: `Paper review: ${normalized.title}`,
    problem: `Review and confirm web paper analysis for "${normalized.title}".`,
    solution: compactSummary,
    fix: "Accept this candidate to add the reviewed paper into the formal paper graph.",
    scope: "paper-analysis-review",
    tags: ["paper", "research-review"],
    techs: ["ekg"],
    type: "research-paper",
    level: "L1",
    confidence: "UNCERTAIN",
    status: "NEEDS_REVIEW",
    source: options.source || "manual/paper-analysis",
    project_scope: "current-project",
    entry_kind: "Paper",
    entry_payload: {
      ...normalized,
      source: normalized.source || options.source || "manual/paper-analysis"
    },
    writer: getWriterIdentity(options)
  };
}

function commandStats(runtime) {
  const stats = runtime.index.stats || computeStats(getExperiences(runtime.index), getPapers(runtime.index));
  console.log(JSON.stringify(stats, null, 2));
}

function commandQuery(runtime, parsed) {
  const queryText = parsed.positional.slice(1).join(" ").trim();
  if (!queryText) {
    throw new Error("query requires at least one keyword");
  }

  const evolution = buildExperienceEvolutionMaps(runtime.index);
  const matches = queryExperiences(runtime.index, {
    text: queryText,
    semanticConfig: runtime.config.query || {}
  }, runtime.config.query.defaultLimit || 5);
  if (!matches.length) {
    console.log("No experience matched this query.");
    return;
  }

  matches.forEach((match) => {
    console.log(`- ${match.experience.id} | score=${match.score} | ${match.experience.title}`);
    console.log(`  problem: ${match.experience.problem}`);
    console.log(`  solution: ${match.experience.solution}`);
    if ((match.supersedes_ids || []).length && !(match.superseded_by_ids || []).length) {
      console.log(`  recommended current version: ${match.experience.id}: ${match.experience.title}`);
    }
    if ((match.superseded_by_ids || []).length) {
      const recommended = (match.superseded_by_ids || [])
        .map((id) => getExperienceById(runtime.index, id))
        .filter(Boolean)
        .map((experience) => `${experience.id}: ${experience.title}`);
      if (recommended.length) {
        console.log(`  recommended current version: ${recommended.join(" | ")}`);
      }
    }
    if ((match.supersedes_ids || []).length) {
      console.log(`  supersedes: ${match.supersedes_ids.join(", ")}`);
    }
    console.log(`  reason: ${match.reasons.join("; ")}`);
  });
}

function commandTrace(runtime, parsed) {
  const queryText = parsed.positional.slice(1).join(" ").trim();
  if (!queryText) {
    throw new Error("trace requires at least one keyword");
  }

  const result = traceExperiences(runtime.index, {
    text: queryText,
    semanticConfig: runtime.config.query || {}
  }, {
    maxDepth: parsed.options.depth || parsed.options["max-depth"] || 4,
    seedLimit: parsed.options["seed-limit"] || runtime.config.query.defaultLimit || 3,
    pathLimit: parsed.options["path-limit"] || runtime.config.query.defaultLimit || 5
  });

  if (!result.matches.length) {
    console.log("No trace matched this query.");
    return;
  }

  console.log(`[EKG] trace for ${queryText}`);
  console.log(`[EKG] seed experiences: ${result.matches.length}`);
  result.traces.forEach((trace, index) => {
    console.log(`- trace ${index + 1} | score=${trace.score}`);
    if (trace.summary) {
      console.log(`  summary: ${trace.summary}`);
    }
    console.log(`  path: ${trace.path_labels.join(" -> ")}`);
    if ((trace.suggested_files || []).length) {
      console.log(`  suggested files: ${trace.suggested_files.join(", ")}`);
    }
    if ((trace.check_order || []).length) {
      console.log(`  check order: ${trace.check_order.join(" -> ")}`);
    }
    console.log(`  why: ${trace.reasons.join("; ")}`);
  });
}

function commandPaperQuery(runtime, parsed) {
  const queryText = parsed.positional.slice(1).join(" ").trim();
  if (!queryText) {
    throw new Error("paper-query requires at least one keyword");
  }

  const matches = queryPapers(runtime.index, {
    text: queryText,
    semanticConfig: runtime.config.query || {}
  }, runtime.config.query.defaultLimit || 5);
  if (!matches.length) {
    console.log("No paper matched this query.");
    return;
  }

  matches.forEach((match) => {
    console.log(`- ${match.paper.id} | score=${match.score} | ${match.paper.title}`);
    console.log(`  venue/year: ${match.paper.venue || "n/a"} / ${match.paper.year || "n/a"}`);
    console.log(`  topics: ${(match.paper.topics || []).join(", ") || "n/a"}`);
    console.log(`  summary: ${match.paper.summary || match.paper.abstract}`);
    console.log(`  reason: ${match.reasons.join("; ")}`);
  });
}

function commandPaperExplain(runtime, parsed) {
  const input = parsed.positional.slice(1).join(" ").trim();
  if (!input) {
    throw new Error("paper-explain requires a paper id or title");
  }

  const paper = resolvePaperRef(runtime.index, input);
  if (!paper) {
    const fallback = queryPapers(runtime.index, {
      text: input,
      semanticConfig: runtime.config.query || {}
    }, runtime.config.query.defaultLimit || 5);
    if (!fallback.length) {
      console.log("No paper matched this input.");
      return;
    }

    fallback.forEach((match) => {
      console.log(`- ${match.paper.id}: ${match.paper.title}`);
      console.log(`  venue/year: ${match.paper.venue || "n/a"} / ${match.paper.year || "n/a"}`);
      console.log(`  summary: ${match.paper.summary || match.paper.abstract}`);
      console.log(`  reason: ${match.reasons.join("; ")}`);
    });
    return;
  }

  const graph = buildKnowledgeGraph(runtime.index);
  const directNeighbors = [...(graph.adjacency.get(paper.id) || [])];
  const relatedExperiences = unique(directNeighbors.filter((neighbor) => neighbor.startsWith("E")))
    .map((id) => getExperienceById(runtime.index, id))
    .filter(Boolean);

  console.log(`[EKG] paper ${paper.id}: ${paper.title}`);
  console.log(`authors: ${(paper.authors || []).join(", ") || "n/a"}`);
  console.log(`venue/year: ${paper.venue || "n/a"} / ${paper.year || "n/a"}`);
  console.log(`topics: ${(paper.topics || []).join(", ") || "n/a"}`);
  console.log(`summary: ${paper.summary || paper.abstract}`);
  if ((paper.relations || []).length) {
    console.log(`relations: ${paper.relations.join(", ")}`);
  }
  if ((paper.suggested_canonical_terms || []).length) {
    console.log(`suggested canonical terms: ${paper.suggested_canonical_terms.join(", ")}`);
  }
  if (relatedExperiences.length) {
    console.log(`related experiences: ${relatedExperiences.map((item) => item.id).join(", ")}`);
  }
}

function commandConceptSuggest(runtime, parsed) {
  const values = unique([
    ...parsed.positional.slice(1),
    ...collectOptionList(parsed.options.topic),
    ...collectOptionList(parsed.options.keyword),
    ...collectOptionList(parsed.options.text)
  ]);
  if (!values.length) {
    throw new Error("concept-suggest requires input text, --topic, or --keyword");
  }

  const multilingualConfig = ((runtime.config || {}).query || {}).multilingual || {};
  const exactMatches = findCanonicalConcepts(values, multilingualConfig);
  const suggestions = suggestCanonicalConcepts(values, multilingualConfig);
  console.log(JSON.stringify({
    action: "concept-suggest",
    input: values,
    exact_matches: exactMatches,
    suggestions
  }, null, 2));
}

function commandConceptRegister(parsed) {
  const canonical = normalizeConceptKey(parsed.options.canonical || parsed.positional[1]);
  const aliases = unique([
    ...collectOptionList(parsed.options.alias),
    ...collectOptionList(parsed.options.aliases)
  ]);
  if (!canonical) {
    throw new Error("concept-register requires --canonical");
  }
  if (!aliases.length) {
    throw new Error("concept-register requires at least one --alias");
  }

  const config = loadConfig();
  const nextConfig = {
    ...config,
    query: {
      ...(config.query || {}),
      multilingual: {
        ...((config.query || {}).multilingual || {}),
        enabled: true,
        concepts: {
          ...((((config.query || {}).multilingual || {}).concepts) || {}),
          [canonical]: unique([
            ...((((config.query || {}).multilingual || {}).concepts || {})[canonical] || []),
            ...aliases
          ])
        }
      }
    }
  };
  writeConfig(nextConfig);
  console.log(JSON.stringify({
    action: "concept-register",
    canonical,
    aliases: nextConfig.query.multilingual.concepts[canonical]
  }, null, 2));
}

function commandExplain(runtime, parsed) {
  const input = parsed.positional.slice(1).join(" ").trim();
  if (!input) {
    throw new Error("explain requires a concept, tag, tech, file, or experience id");
  }

  const graph = buildKnowledgeGraph(runtime.index);
  const nodeId = resolveGraphNode(graph, input);
  if (!nodeId) {
    const fallback = queryExperiences(runtime.index, {
      text: input,
      semanticConfig: runtime.config.query || {}
    }, runtime.config.query.defaultLimit || 5);
    if (!fallback.length) {
      console.log("No node or experience matched this input.");
      return;
    }

    fallback.forEach((match) => {
      console.log(`- ${match.experience.id}: ${match.experience.title}`);
      console.log(`  problem: ${match.experience.problem}`);
      console.log(`  solution: ${match.experience.solution}`);
      console.log(`  reason: ${match.reasons.join("; ")}`);
    });
    return;
  }

  const label = describeGraphNode(graph, nodeId);
  const directNeighbors = [...(graph.adjacency.get(nodeId) || [])];
  const evolution = buildExperienceEvolutionMaps(runtime.index);
  const experienceIds = nodeId.startsWith("E")
    ? [nodeId, ...directNeighbors.filter((neighbor) => neighbor.startsWith("E"))]
    : directNeighbors.filter((neighbor) => neighbor.startsWith("E"));
  const experiences = unique(experienceIds)
    .map((id) => getExperienceById(runtime.index, id))
    .filter(Boolean);
  const papers = unique([nodeId, ...directNeighbors].filter((neighbor) => neighbor.startsWith("P")))
    .map((id) => getPaperById(runtime.index, id))
    .filter(Boolean);

  console.log(`[EKG] explain ${label}`);
  console.log(`[EKG] related experiences: ${experiences.length}`);

  experiences.forEach((experience) => {
    const supersededBy = evolution.supersededBy.get(experience.id) || [];
    const supersedes = evolution.supersedes.get(experience.id) || [];
    console.log(`- ${experience.id}: ${experience.title}`);
    console.log(`  level/confidence/status: ${experience.level} / ${experience.confidence} / ${experience.status}`);
    console.log(`  problem: ${experience.problem}`);
    console.log(`  solution: ${experience.solution}`);
    if ((experience.relations || []).length) {
      console.log(`  relations: ${experience.relations.join(", ")}`);
    }
    if (supersedes.length) {
      console.log(`  supersedes: ${supersedes.join(", ")}`);
    }
    if (supersededBy.length) {
      console.log(`  superseded by: ${supersededBy.join(", ")}`);
    }
  });
  papers.forEach((paper) => {
    console.log(`- ${paper.id}: ${paper.title}`);
    console.log(`  venue/year: ${paper.venue || "n/a"} / ${paper.year || "n/a"}`);
    console.log(`  topics: ${(paper.topics || []).join(", ") || "n/a"}`);
  });
}

function commandSupersede(runtime, parsed, commandOptions = {}) {
  const newRef = parsed.options.new || parsed.positional[1];
  const oldRef = parsed.options.old || parsed.positional[2];
  if (!newRef || !oldRef) {
    throw new Error("supersede requires <new-experience> <old-experience> or --new/--old");
  }

  const nextExperience = resolveExperienceRef(runtime.index, newRef);
  const oldExperience = resolveExperienceRef(runtime.index, oldRef);
  if (!nextExperience) {
    throw new Error(`supersede could not find new experience: ${newRef}`);
  }
  if (!oldExperience) {
    throw new Error(`supersede could not find old experience: ${oldRef}`);
  }
  if (nextExperience.id === oldExperience.id) {
    throw new Error("supersede requires two different experiences");
  }

  nextExperience.relations = unique([
    ...(nextExperience.relations || []),
    `supersedes:${oldExperience.id}`
  ]);
  nextExperience.updated_at = new Date().toISOString();
  oldExperience.status = "SUPERSEDED";
  oldExperience.updated_at = new Date().toISOString();

  if (commandOptions.skipExperienceFile) {
    nextExperience.experience_file = nextExperience.experience_file || "";
    oldExperience.experience_file = oldExperience.experience_file || "";
  } else {
    nextExperience.experience_file = writeExperienceFile(nextExperience);
    oldExperience.experience_file = writeExperienceFile(oldExperience);
  }

  if (!commandOptions.skipSave) {
    saveRuntime(runtime);
  }

  console.log(JSON.stringify({
    action: "supersede",
    new_experience: {
      id: nextExperience.id,
      relations: nextExperience.relations
    },
    old_experience: {
      id: oldExperience.id,
      status: oldExperience.status
    }
  }, null, 2));
}

function commandPath(runtime, parsed) {
  const from = parsed.options.from || parsed.positional[1];
  const to = parsed.options.to || parsed.positional[2];
  if (!from || !to) {
    throw new Error("path requires <from> and <to> or --from/--to");
  }

  const graph = buildKnowledgeGraph(runtime.index);
  const fromId = resolveGraphNode(graph, from);
  const toId = resolveGraphNode(graph, to);

  if (!fromId) {
    throw new Error(`path could not resolve start node: ${from}`);
  }

  if (!toId) {
    throw new Error(`path could not resolve end node: ${to}`);
  }

  const pathIds = findShortestPath(graph, fromId, toId);
  if (!pathIds) {
    console.log("No path found between the two nodes.");
    return;
  }

  console.log(pathIds.map((nodeId) => describeGraphNode(graph, nodeId)).join(" -> "));
}

function commandReview(runtime, parsed, options = {}) {
  const targetRef = parsed.options.id || parsed.positional[1];
  const pending = getExperiences(runtime.index).filter((experience) => {
    return experience.confidence === "UNCERTAIN" || experience.status === "NEEDS_REVIEW";
  });

  if (!targetRef) {
    if (!pending.length) {
      console.log("No experiences pending review.");
      return;
    }

    pending.forEach((experience) => {
      console.log(`- ${experience.id}: ${experience.title}`);
      console.log(`  confidence/status: ${experience.confidence} / ${experience.status}`);
    });
    return;
  }

  const experience = resolveExperienceRef(runtime.index, targetRef);
  if (!experience) {
    throw new Error(`review could not find experience: ${targetRef}`);
  }

  if (parsed.options.confirm) {
    experience.confidence = "CONFIRMED";
    experience.status = "ACTIVE";
  } else if (parsed.options.archive) {
    experience.status = "ARCHIVED";
  } else if (parsed.options["needs-review"]) {
    experience.status = "NEEDS_REVIEW";
  } else if (parsed.options.uncertain) {
    experience.confidence = "UNCERTAIN";
    if (experience.status === "ACTIVE") {
      experience.status = "NEEDS_REVIEW";
    }
  } else {
    console.log(JSON.stringify({
      id: experience.id,
      title: experience.title,
      confidence: experience.confidence,
      status: experience.status
    }, null, 2));
    return;
  }

  experience.updated_at = new Date().toISOString();
  if (options.skipExperienceFile) {
    experience.experience_file = experience.experience_file || "";
  } else {
    experience.experience_file = writeExperienceFile(experience);
  }
  if (!options.skipSave) {
    saveRuntime(runtime);
  }

  console.log(JSON.stringify({
    id: experience.id,
    confidence: experience.confidence,
    status: experience.status,
    experience_file: experience.experience_file
  }, null, 2));
}

function commandAdd(runtime, parsed, commandOptions = {}) {
  const experience = createExperienceRecord(runtime, parsed.options);

  if (commandOptions.skipExperienceFile) {
    experience.experience_file = experience.experience_file || "";
  } else {
    experience.experience_file = writeExperienceFile(experience);
  }
  runtime.index.nodes = runtime.index.nodes || [];
  runtime.index.nodes.push(experience);
  if (!commandOptions.skipSave) {
    saveRuntime(runtime);
  }

  console.log(
    JSON.stringify(
      {
        id: experience.id,
        title: experience.title,
        experience_file: experience.experience_file
      },
      null,
      2
    )
  );
}

function commandPaperAdd(runtime, parsed, commandOptions = {}) {
  const paper = createPaperRecord(runtime, parsed.options);

  if (commandOptions.skipPaperFile) {
    paper.paper_file = paper.paper_file || "";
  } else {
    paper.paper_file = writePaperFile(paper);
  }
  runtime.index.nodes = runtime.index.nodes || [];
  runtime.index.nodes.push(paper);
  if (!commandOptions.skipSave) {
    saveRuntime(runtime);
  }

  console.log(
    JSON.stringify(
      {
        id: paper.id,
        title: paper.title,
        paper_file: paper.paper_file
      },
      null,
      2
    )
  );
}

function commandPaperImport(runtime, payload, commandOptions = {}) {
  const result = applyImportedPapers(runtime, payload, {
    nextPaperId: () => nextPaperId(runtime.index)
  });

  result.results.forEach((item) => {
    if (commandOptions.skipPaperFile) {
      item.paper.paper_file = item.paper.paper_file || "";
      return;
    }
    item.paper.paper_file = writePaperFile(item.paper);
  });

  if (!commandOptions.skipSave) {
    saveRuntime(runtime);
  }

  console.log(JSON.stringify({
    action: "paper-import",
    source: result.source,
    query: result.query,
    count: result.count,
    imported: result.results.map((item) => ({
      action: item.action,
      id: item.paper.id,
      title: item.paper.title,
      venue: item.paper.venue || "",
      year: item.paper.year || "",
      canonical_terms: item.paper.canonical_terms || [],
      suggested_canonical_terms: item.paper.suggested_canonical_terms || []
    }))
  }, null, 2));
}

function commandPaperCapture(runtime, parsed, commandOptions = {}) {
  const result = createCaptureCandidate(runtime.state, buildPaperCaptureInput(runtime, parsed.options), {
    pendingLimit: (((runtime.config || {}).capture || {}).pendingLimit) || 20,
    dedupeWindowMinutes: (((runtime.config || {}).capture || {}).dedupeWindowMinutes) || 180,
    defaultType: "research-paper",
    defaultLevel: "L1",
    defaultConfidence: "UNCERTAIN",
    defaultStatus: "NEEDS_REVIEW"
  });

  if (!commandOptions.skipSave) {
    saveRuntime(runtime);
  }

  console.log(JSON.stringify({
    action: "paper-capture",
    candidate_id: result.candidate.id,
    created: result.created,
    entry_kind: result.candidate.entry_kind || "Paper",
    title: result.candidate.title
  }, null, 2));
}

function commandSurvey(runtime, parsed) {
  const queryText = parsed.positional.slice(1).join(" ").trim();
  if (!queryText) {
    throw new Error("survey requires at least one keyword");
  }

  const papers = queryPapers(runtime.index, {
    text: queryText,
    semanticConfig: runtime.config.query || {}
  }, Math.max(3, runtime.config.query.defaultLimit || 5));
  const experiences = queryExperiences(runtime.index, {
    text: queryText,
    semanticConfig: runtime.config.query || {}
  }, Math.max(3, runtime.config.query.defaultLimit || 5));

  if (!papers.length && !experiences.length) {
    console.log("No papers or experiences matched this survey query.");
    return;
  }

  console.log(`[EKG] survey for ${queryText}`);
  if (papers.length) {
    console.log("[papers]");
    papers.forEach((match) => {
      console.log(`- ${match.paper.id}: ${match.paper.title}`);
      console.log(`  venue/year: ${match.paper.venue || "n/a"} / ${match.paper.year || "n/a"}`);
      console.log(`  topics: ${(match.paper.topics || []).join(", ") || "n/a"}`);
      console.log(`  summary: ${match.paper.summary || match.paper.abstract}`);
    });
  }
  if (experiences.length) {
    console.log("[implementation knowledge]");
    experiences.forEach((match) => {
      console.log(`- ${match.experience.id}: ${match.experience.title}`);
      console.log(`  problem: ${match.experience.problem}`);
      console.log(`  solution: ${match.experience.solution}`);
    });
  }
}

function commandCaptureStatus(runtime, parsed) {
  const targetRef = parsed.options.id || parsed.positional[1];
  const candidates = listCaptureCandidates(runtime.state);

  if (!candidates.length) {
    console.log("No pending capture candidates.");
    return;
  }

  if (!targetRef) {
    candidates.forEach((candidate) => {
      const risk = evaluateCandidateRisk(candidate, ((runtime.config || {}).capture || {}).autoAccept || {}, {});
      console.log(`- ${candidate.id}: ${candidate.title}`);
      if (candidate.entry_kind) {
        console.log(`  entry kind: ${candidate.entry_kind}`);
      }
      console.log(`  status/confidence: ${candidate.status} / ${candidate.confidence}`);
      console.log(`  risk: ${risk.riskLevel}`);
      console.log(`  files: ${((candidate.anchors || {}).files || []).join(", ") || "n/a"}`);
      console.log(`  source: ${candidate.source}`);
    });
    return;
  }

  const candidate = findCaptureCandidate(runtime.state, targetRef);
  if (!candidate) {
    throw new Error(`capture-status could not find candidate: ${targetRef}`);
  }

  const risk = evaluateCandidateRisk(candidate, ((runtime.config || {}).capture || {}).autoAccept || {}, {});
  console.log(JSON.stringify({
    ...candidate,
    review_gate: risk
  }, null, 2));
}

function buildCaptureAcceptOptions(candidate, overrides = {}) {
  const nextStatus = overrides.confirm
    ? "ACTIVE"
    : (overrides.status || candidate.status || "NEEDS_REVIEW");
  const nextConfidence = overrides.confirm
    ? "CONFIRMED"
    : (overrides.confidence || candidate.confidence || "UNCERTAIN");
  const writer = candidate.writer || {};

  const options = {
    title: overrides.title || candidate.title,
    symptom: overrides.symptom || candidate.symptom || "",
    problem: overrides.problem || candidate.problem,
    cause: overrides.cause || candidate.cause || "",
    solution: overrides.solution || candidate.solution,
    fix: overrides.fix || candidate.fix || "",
    scope: overrides.scope || candidate.scope || "",
    "root-cause": overrides["root-cause"] || candidate.root_cause || "",
    tags: unique([
      ...(candidate.tags || []),
      ...collectOptionList(overrides.tags)
    ]).join(","),
    techs: unique([
      ...(candidate.techs || []),
      ...collectOptionList(overrides.techs)
    ]).join(","),
    file: unique([
      ...(((candidate.anchors || {}).files) || []),
      ...collectOptionList(overrides.file)
    ]).join(","),
    concept: unique([
      ...(((candidate.anchors || {}).concepts) || []),
      ...collectOptionList(overrides.concept)
    ]).join(","),
    commit: unique([
      ...(((candidate.anchors || {}).commits) || []),
      ...collectOptionList(overrides.commit)
    ]).join(","),
    relations: unique([
      ...(candidate.relations || []),
      ...collectOptionList(overrides.relations)
    ]).join(","),
    type: overrides.type || candidate.type || "workflow",
    level: overrides.level || candidate.level || "L1",
    confidence: nextConfidence,
    status: nextStatus,
    source: overrides.source || candidate.source || "host/auto",
    scope: overrides.scope || candidate.project_scope || "current-project"
  };

  if (writer.agent_id) {
    options["agent-id"] = writer.agent_id;
  }

  if (writer.session_id) {
    options["session-id"] = writer.session_id;
  }

  if (writer.host) {
    options.host = writer.host;
  }

  return options;
}

function buildCaptureAcceptPaperOptions(candidate, overrides = {}) {
  const payload = (candidate.entry_payload && typeof candidate.entry_payload === "object")
    ? candidate.entry_payload
    : {};

  return {
    title: overrides.title || payload.title || candidate.title.replace(/^Paper review:\s*/i, ""),
    abstract: overrides.abstract || payload.abstract || payload.summary || candidate.solution || "",
    summary: overrides.summary || payload.summary || candidate.solution || "",
    findings: overrides.findings || payload.findings || "",
    limitations: overrides.limitations || payload.limitations || "",
    notes: overrides.notes || payload.notes || "",
    authors: unique([
      ...(payload.authors || []),
      ...collectOptionList(overrides.authors)
    ]).join(","),
    topics: unique([
      ...(payload.topics || []),
      ...collectOptionList(overrides.topics)
    ]).join(","),
    keywords: unique([
      ...(payload.keywords || []),
      ...collectOptionList(overrides.keywords)
    ]).join(","),
    aliases: unique([
      ...(payload.aliases || []),
      ...collectOptionList(overrides.aliases)
    ]).join(","),
    "canonical-terms": unique([
      ...(payload.canonical_terms || []),
      ...collectOptionList(overrides["canonical-terms"] || overrides.canonicalTerms)
    ]).join(","),
    venue: overrides.venue || payload.venue || "",
    year: overrides.year || payload.year || "",
    url: overrides.url || payload.url || "",
    doi: overrides.doi || payload.doi || "",
    "arxiv-id": overrides["arxiv-id"] || overrides.arxivId || payload.arxiv_id || "",
    relations: unique([
      ...(payload.relations || []),
      ...collectOptionList(overrides.relations)
    ]).join(","),
    status: overrides.status || payload.status || (overrides.confirm ? "ACTIVE" : "NEEDS_REVIEW"),
    source: overrides.source || payload.source || candidate.source || "host/auto"
  };
}

function commandCaptureAccept(runtime, parsed, commandOptions = {}) {
  const targetRef = parsed.options.id || parsed.positional[1];
  if (!targetRef) {
    throw new Error("capture-accept requires a candidate id");
  }

  const candidate = findCaptureCandidate(runtime.state, targetRef);
  if (!candidate) {
    throw new Error(`capture-accept could not find candidate: ${targetRef}`);
  }

  let acceptedRecord = null;
  let acceptedRecordKey = "experience_id";

  if ((candidate.entry_kind || "") === "Paper") {
    const paperParsed = {
      positional: ["paper-add"],
      options: buildCaptureAcceptPaperOptions(candidate, parsed.options)
    };
    commandPaperAdd(runtime, paperParsed, {
      skipSave: true,
      skipPaperFile: commandOptions.skipPaperFile
    });
    acceptedRecord = getPapers(runtime.index).slice(-1)[0];
    acceptedRecordKey = "paper_id";
  } else {
    const addParsed = {
      positional: ["add"],
      options: buildCaptureAcceptOptions(candidate, parsed.options)
    };
    commandAdd(runtime, addParsed, {
      skipSave: true,
      skipExperienceFile: commandOptions.skipExperienceFile
    });
    acceptedRecord = getExperiences(runtime.index).slice(-1)[0];
  }

  removeCaptureCandidate(runtime.state, candidate.id);
  recordCaptureEvent(runtime.state, {
    type: "capture_accepted",
    candidate_id: candidate.id,
    [acceptedRecordKey]: acceptedRecord.id
  });

  if (!commandOptions.skipSave) {
    saveRuntime(runtime);
  }

  const response = {
    candidate_id: candidate.id,
    entry_kind: candidate.entry_kind || "Experience",
    [acceptedRecordKey]: acceptedRecord.id,
    status: acceptedRecord.status
  };
  if (acceptedRecord.kind === "Experience") {
    response.confidence = acceptedRecord.confidence;
  }
  console.log(JSON.stringify(response, null, 2));
}

function commandCaptureDismiss(runtime, parsed, commandOptions = {}) {
  const targetRef = parsed.options.id || parsed.positional[1];
  if (!targetRef) {
    throw new Error("capture-dismiss requires a candidate id");
  }

  const candidate = removeCaptureCandidate(runtime.state, targetRef);
  if (!candidate) {
    throw new Error(`capture-dismiss could not find candidate: ${targetRef}`);
  }

  recordCaptureEvent(runtime.state, {
    type: "capture_dismissed",
    candidate_id: candidate.id
  });

  if (!commandOptions.skipSave) {
    saveRuntime(runtime);
  }

  console.log(JSON.stringify({
    candidate_id: candidate.id,
    dismissed: true
  }, null, 2));
}

function commandIngest(runtime, parsed, commandOptions = {}) {
  const activeProject = getActiveProject(runtime.state);
  const results = createIngestCaptureCandidates(runtime.state, parsed.options, {
    cwd: activeProject ? activeProject.root : ROOT_DIR,
    pendingLimit: parsed.options["pending-limit"] || 50,
    dedupeWindowMinutes: parsed.options["dedupe-window"] || 180
  });

  const payload = {
    action: "ingest",
    source: parsed.options.source || (parsed.options.commit || parsed.options.since ? "commit" : "task"),
    candidate_count: results.length,
    created_count: results.filter((item) => item.created).length,
    refreshed_count: results.filter((item) => !item.created).length,
    candidates: results.map((item) => ({
      id: item.candidate.id,
      title: item.candidate.title,
      created: item.created,
      status: item.candidate.status,
      confidence: item.candidate.confidence,
      source: item.candidate.source,
      files: ((item.candidate.anchors || {}).files) || [],
      commits: ((item.candidate.anchors || {}).commits) || []
    }))
  };

  if (!commandOptions.skipSave && !results.length) {
    payload.message = "No ingest candidate matched the current input.";
  }

  console.log(JSON.stringify(payload, null, 2));
}

function commandStaleCheck(runtime, parsed, commandOptions = {}) {
  const activeProject = getActiveProject(runtime.state);
  const projectRoot = activeProject ? activeProject.root : ROOT_DIR;

  if (parsed.options.baseline || parsed.options["update-baseline"]) {
    const updated = updateAnchorBaselines(runtime.index, {
      projectRoot,
      skipExperienceFile: commandOptions.skipExperienceFile
    });
    console.log(JSON.stringify({
      action: "stale-check",
      mode: "baseline",
      project_root: slashPath(projectRoot),
      updated_count: updated.length,
      experiences: updated
    }, null, 2));
    return;
  }

  const findings = detectStaleExperiences(runtime.index, { projectRoot });
  const dryRun = Boolean(parsed.options["dry-run"]);
  const affected = dryRun
    ? unique(findings.map((finding) => finding.experience_id))
    : markStaleFindings(runtime.index, findings, {
      status: "NEEDS_REVIEW",
      skipExperienceFile: commandOptions.skipExperienceFile
    });

  console.log(JSON.stringify({
    action: "stale-check",
    mode: dryRun ? "dry-run" : "apply",
    project_root: slashPath(projectRoot),
    finding_count: findings.length,
    affected_experience_count: affected.length,
    affected_experience_ids: affected,
    findings
  }, null, 2));
}

function commandProjectList(runtime) {
  const activeProject = getActiveProject(runtime.state);
  const projects = listProjects(runtime.state);

  if (!projects.length) {
    console.log("No projects registered.");
    return;
  }

  projects.forEach((project) => {
    const marker = activeProject && activeProject.id === project.id ? "*" : "-";
    console.log(`${marker} ${project.id}: ${project.name}`);
    console.log(`  root: ${project.root}`);
    console.log(`  type: ${project.type || "n/a"}`);
    console.log(`  tags: ${(project.tags || []).join(", ") || "n/a"}`);
  });
}

function commandProjectRegister(runtime, parsed, options = {}) {
  const project = registerProject(runtime.state, {
    name: parsed.options.name || parsed.positional[1],
    root: parsed.options.root,
    type: parsed.options.type,
    tags: collectOptionList(parsed.options.tags)
  }, {
    activate: parsed.options.activate !== false
  });

  if (!options.skipSave) {
    saveState(runtime, runtime.state);
  }

  console.log(JSON.stringify({
    id: project.id,
    name: project.name,
    root: project.root,
    type: project.type || "",
    tags: project.tags || [],
    active: (getActiveProject(runtime.state) || {}).id === project.id
  }, null, 2));
}

function commandProjectUse(runtime, parsed, options = {}) {
  const ref = parsed.options.id || parsed.positional[1];
  if (!ref) {
    throw new Error("project-use requires a project id, name, or root");
  }

  const project = setActiveProject(runtime.state, ref);
  if (!options.skipSave) {
    saveState(runtime, runtime.state);
  }

  console.log(JSON.stringify({
    id: project.id,
    name: project.name,
    root: project.root,
    active: true
  }, null, 2));
}

function commandProjectStatus(runtime, parsed) {
  const ref = parsed.options.id || parsed.positional[1];
  const project = ref
    ? findProject(runtime.state, ref)
    : getActiveProject(runtime.state);

  if (!project) {
    console.log(ref ? "Project not found." : "No active project.");
    return;
  }

  console.log(JSON.stringify({
    id: project.id,
    name: project.name,
    root: project.root,
    type: project.type || "",
    tags: project.tags || [],
    created_at: project.created_at,
    updated_at: project.updated_at,
    last_used_at: project.last_used_at || "",
    active: (getActiveProject(runtime.state) || {}).id === project.id
  }, null, 2));
}

function commandProjectResolve(runtime, parsed) {
  const targetPath = parsed.options.path || parsed.positional[1];
  if (!targetPath) {
    throw new Error("project-resolve requires a file or path");
  }

  const resolved = resolveProjectForPath(runtime.state, targetPath);
  console.log(JSON.stringify({
    target_path: resolved.target_path,
    matched_by: resolved.matched_by,
    candidate_count: resolved.candidate_count,
    resolved_file: resolved.resolved_file || "",
    project: resolved.project
      ? {
          id: resolved.project.id,
          name: resolved.project.name,
          root: resolved.project.root,
          type: resolved.project.type || "",
          tags: resolved.project.tags || []
        }
      : null,
    candidates: (resolved.candidates || []).map((project) => ({
      id: project.id,
      name: project.name,
      root: project.root
    }))
  }, null, 2));
}

function commandReport(runtime, options = {}) {
  if (!options.skipSave) {
    saveRuntime(runtime);
  }
  const reportFile = (runtime.storagePaths || {}).REPORT_FILE;
  console.log(path.relative(ROOT_DIR, reportFile).replace(/\\/g, "/"));
}

async function commandPanel(runtime, parsed) {
  const shouldServe = Boolean(parsed.options.serve || parsed.options.open);
  if (shouldServe) {
    const serverHandle = await startPanelServer({
      host: parsed.options.host || "127.0.0.1",
      port: parsed.options.port || 0,
      loadRuntime: () => loadRuntime(),
      handleAction: ({ candidateId, action }) => mutateRuntime(`panel-${action}`, (lockedRuntime) => {
        const actionParsed = {
          positional: [action === "accept" ? "capture-accept" : "capture-dismiss", candidateId],
          options: action === "accept" ? { confirm: true } : {}
        };
        if (action === "accept") {
          commandCaptureAccept(lockedRuntime, actionParsed, { skipSave: true });
        } else {
          commandCaptureDismiss(lockedRuntime, actionParsed, { skipSave: true });
        }
        return {
          candidate_id: candidateId,
          action
        };
      })
    });

    if (parsed.options.open) {
      openPanelUrl(serverHandle.url);
    }

    console.log(JSON.stringify({
      action: "panel",
      mode: "serve",
      url: serverHandle.url,
      host: serverHandle.host,
      port: serverHandle.port,
      opened: Boolean(parsed.options.open)
    }, null, 2));
    return serverHandle;
  }

  const result = writePanel(runtime, {
    output: parsed.options.output || parsed.options.out || ""
  });

  if (parsed.options.open) {
    openPanelFile(result.output_file);
  }

  console.log(JSON.stringify({
    action: "panel",
    mode: "export",
    output_file: result.relative_output_file,
    generated_at: result.generated_at,
    opened: Boolean(parsed.options.open)
  }, null, 2));
  return result;
}

function commandStorageStatus(runtime) {
  console.log(JSON.stringify({
    backend: getStorageBackendName(runtime.config),
    sqlite_file: (runtime.storagePaths || {}).SQLITE_FILE || null,
    output_dir: (runtime.storagePaths || {}).OUTPUT_DIR || null,
    index_file: (runtime.storagePaths || {}).INDEX_FILE || null,
    state_file: (runtime.storagePaths || {}).STATE_FILE || null,
    report_file: (runtime.storagePaths || {}).REPORT_FILE || null,
    legacy_mirror: Boolean(((runtime.storagePaths || {}).storage || {}).legacyMirror),
    experience_count: ((runtime.index || {}).stats || {}).experience_count || computeStats(getExperiences(runtime.index), getPapers(runtime.index)).experience_count,
    paper_count: ((runtime.index || {}).stats || {}).paper_count || computeStats(getExperiences(runtime.index), getPapers(runtime.index)).paper_count
  }, null, 2));
}

function createBackendRuntime(sourceRuntime, nextConfig) {
  const storageBackend = getStorageBackend(nextConfig);
  return {
    config: nextConfig,
    storageBackend,
    storagePaths: storageBackend.ensureLayout(nextConfig),
    index: structuredClone(sourceRuntime.index),
    state: structuredClone(sourceRuntime.state)
  };
}

function commandStorageMigrate(parsed, actionName = "storage-migrate") {
  const currentConfig = loadConfig();
  const targetBackendName = String(parsed.options.to || parsed.positional[1] || "sqlite").trim().toLowerCase();
  const currentBackendName = getStorageBackendName(currentConfig);

  withWriteLock(currentConfig, "storage-migrate", () => {
    const sourceRuntime = buildRuntime(currentConfig);
    const nextConfig = {
      ...currentConfig,
      storage: {
        ...(currentConfig.storage || {}),
        backend: targetBackendName
      }
    };

    const targetRuntime = createBackendRuntime(sourceRuntime, nextConfig);
    saveRuntime(targetRuntime, { skipLock: true });
    writeConfig(nextConfig);

    console.log(JSON.stringify({
      action: actionName,
      from: currentBackendName,
      to: targetBackendName,
      config_file: path.relative(ROOT_DIR, CONFIG_FILE).replace(/\\/g, "/"),
      sqlite_file: targetRuntime.storagePaths.SQLITE_FILE || null,
      index_file: path.relative(ROOT_DIR, targetRuntime.storagePaths.INDEX_FILE).replace(/\\/g, "/")
    }, null, 2));
  });
}

function commandStorageRollback(parsed) {
  const nextParsed = {
    ...parsed,
    options: {
      ...parsed.options,
      to: parsed.options.to || "json"
    }
  };
  commandStorageMigrate(nextParsed, "storage-rollback");
}

function toDisplayPath(filePath) {
  const relativePath = path.relative(ROOT_DIR, filePath);
  if (!relativePath || relativePath.startsWith("..") || path.isAbsolute(relativePath)) {
    return slashPath(filePath);
  }

  return slashPath(relativePath);
}

function commandBackupExport(parsed) {
  const currentConfig = loadConfig();

  withWriteLock(currentConfig, "backup-export", () => {
    const runtime = buildRuntime(currentConfig);
    saveRuntime(runtime, { skipLock: true });
    const result = exportPortableBackup(runtime, {
      rootDir: ROOT_DIR,
      outputPath: parsed.options.output
    });

    console.log(JSON.stringify({
      action: "backup-export",
      format: result.format,
      created_at: result.created_at,
      output_file: toDisplayPath(result.output_file),
      file_count: result.file_count,
      package_size_bytes: result.package_size_bytes,
      host_reinstall_hint: [
        "node scripts/install-host.js --host codex --codex-mode strong",
        "node scripts/install-host.js --host claude"
      ]
    }, null, 2));
  });
}

function commandBackupImport(parsed) {
  const inputFile = parsed.options.input || parsed.positional[1];
  if (!inputFile) {
    throw new Error("backup-import requires a package file path");
  }

  const currentConfig = loadConfig();
  withWriteLock(currentConfig, "backup-import", () => {
    const resolvedInputFile = path.resolve(ROOT_DIR, inputFile);
    const result = importPortableBackup(resolvedInputFile, {
      rootDir: ROOT_DIR
    });
    const restoredConfig = loadConfig();
    const runtime = buildRuntime(restoredConfig);
    saveRuntime(runtime, { skipLock: true });

    console.log(JSON.stringify({
      action: "backup-import",
      input_file: toDisplayPath(result.input_file),
      target_root: toDisplayPath(result.target_root),
      created_at: result.created_at,
      file_count: result.file_count,
      host_reinstall_required: result.host_reinstall_required,
      reinstall_commands: result.reinstall_commands
    }, null, 2));
  });
}

function commandBackupInspect(parsed) {
  const inputFile = parsed.options.input || parsed.positional[1];
  if (!inputFile) {
    throw new Error("backup-inspect requires a package file path");
  }

  const resolvedInputFile = path.resolve(ROOT_DIR, inputFile);
  const result = inspectPortableBackup(resolvedInputFile);
  console.log(JSON.stringify({
    action: "backup-inspect",
    input_file: toDisplayPath(resolvedInputFile),
    format: result.format,
    version: result.version,
    backup_type: result.backup_type,
    created_at: result.created_at,
    source: result.source,
    file_count: result.file_count,
    total_file_bytes: result.total_file_bytes,
    restore: result.restore,
    files: result.files
  }, null, 2));
}

function commandPipelineStatus(runtime) {
  const pipeline = runtime.state.pipeline;
  const stageMeta = buildStageMetadata(runtime.state.stage || runtime.index.stage);
  if (!pipeline || !Array.isArray(pipeline.stages) || !pipeline.stages.length) {
    console.log("No pipeline run has been recorded yet.");
    return;
  }

  console.log(`[EKG] stage: ${stageMeta.label} (${stageMeta.stage})`);
  if (stageMeta.summary) {
    console.log(`[EKG] summary: ${stageMeta.summary}`);
  }
  console.log(`[EKG] pipeline ${pipeline.name || "ekg-build"}`);
  console.log(`[EKG] started: ${pipeline.started_at || "n/a"}`);
  console.log(`[EKG] finished: ${pipeline.finished_at || "n/a"}`);
  pipeline.stages.forEach((stage) => {
    console.log(`- ${stage.name}: ${stage.status}`);
    if (stage.message) {
      console.log(`  message: ${stage.message}`);
    }
  });
}

async function main(argv = process.argv.slice(2)) {
  const parsed = parseArgs(argv);
  const command = parsed.positional[0];
  if (!command || command === "help" || command === "--help") {
    printUsage();
    return;
  }

  if (command === "stats") {
    const runtime = loadRuntime();
    commandStats(runtime);
    return;
  }

  if (command === "query") {
    const runtime = loadRuntime();
    commandQuery(runtime, parsed);
    return;
  }

  if (command === "trace") {
    const runtime = loadRuntime();
    commandTrace(runtime, parsed);
    return;
  }

  if (command === "explain") {
    const runtime = loadRuntime();
    commandExplain(runtime, parsed);
    return;
  }

  if (command === "paper-query") {
    const runtime = loadRuntime();
    commandPaperQuery(runtime, parsed);
    return;
  }

  if (command === "paper-explain") {
    const runtime = loadRuntime();
    commandPaperExplain(runtime, parsed);
    return;
  }

  if (command === "concept-suggest") {
    const runtime = loadRuntime();
    commandConceptSuggest(runtime, parsed);
    return;
  }

  if (command === "concept-register") {
    commandConceptRegister(parsed);
    return;
  }

  if (command === "survey") {
    const runtime = loadRuntime();
    commandSurvey(runtime, parsed);
    return;
  }

  if (command === "path") {
    const runtime = loadRuntime();
    commandPath(runtime, parsed);
    return;
  }

  if (command === "supersede") {
    mutateRuntime("supersede-experience", (lockedRuntime) => {
      commandSupersede(lockedRuntime, parsed, { skipSave: true });
    });
    return;
  }

  if (command === "review") {
    if (!parsed.options.id && !parsed.positional[1]) {
      const runtime = loadRuntime();
      commandReview(runtime, parsed);
      return;
    }

    if (
      !parsed.options.confirm &&
      !parsed.options.archive &&
      !parsed.options["needs-review"] &&
      !parsed.options.uncertain
    ) {
      const runtime = loadRuntime();
      commandReview(runtime, parsed);
      return;
    }

    mutateRuntime("review-experience", (lockedRuntime) => {
      commandReview(lockedRuntime, parsed, { skipSave: true });
    });
    return;
  }

  if (command === "add") {
    mutateRuntime("add-experience", (lockedRuntime) => {
      commandAdd(lockedRuntime, parsed, { skipSave: true });
    });
    return;
  }

  if (command === "paper-add") {
    mutateRuntime("add-paper", (lockedRuntime) => {
      commandPaperAdd(lockedRuntime, parsed, { skipSave: true });
    });
    return;
  }

  if (command === "paper-capture") {
    mutateRuntime("paper-capture", (lockedRuntime) => {
      commandPaperCapture(lockedRuntime, parsed, { skipSave: true });
    });
    return;
  }

  if (command === "paper-import") {
    const importPayload = await fetchPaperMetadata({
      source: parsed.options.source || "openalex",
      query: parsed.options.query || parsed.positional.slice(1).join(" "),
      limit: parsed.options.limit || loadConfig().query?.defaultLimit || 5,
      relations: collectOptionList(parsed.options.relations || parsed.options.relation),
      multilingualConfig: loadConfig().query?.multilingual || {}
    });
    mutateRuntime("paper-import", (lockedRuntime) => {
      commandPaperImport(lockedRuntime, importPayload, { skipSave: true });
    });
    return;
  }

  if (command === "ingest") {
    mutateRuntime("ingest-candidates", (lockedRuntime) => {
      commandIngest(lockedRuntime, parsed, { skipSave: true });
    });
    return;
  }

  if (command === "capture-status") {
    const runtime = loadRuntime();
    commandCaptureStatus(runtime, parsed);
    return;
  }

  if (command === "capture-accept") {
    mutateRuntime("capture-accept", (lockedRuntime) => {
      commandCaptureAccept(lockedRuntime, parsed, { skipSave: true });
    });
    return;
  }

  if (command === "capture-dismiss") {
    mutateRuntime("capture-dismiss", (lockedRuntime) => {
      commandCaptureDismiss(lockedRuntime, parsed, { skipSave: true });
    });
    return;
  }

  if (command === "project-list") {
    const runtime = loadRuntime();
    commandProjectList(runtime);
    return;
  }

  if (command === "project-register") {
    const config = loadConfig();
    withWriteLock(config, "project-register", () => {
      const runtime = buildRuntime(config);
      commandProjectRegister(runtime, parsed, { skipSave: true });
      saveState(runtime, runtime.state, { skipLock: true });
    });
    return;
  }

  if (command === "project-use") {
    const config = loadConfig();
    withWriteLock(config, "project-use", () => {
      const runtime = buildRuntime(config);
      commandProjectUse(runtime, parsed, { skipSave: true });
      saveState(runtime, runtime.state, { skipLock: true });
    });
    return;
  }

  if (command === "project-status") {
    const runtime = loadRuntime();
    commandProjectStatus(runtime, parsed);
    return;
  }

  if (command === "project-resolve") {
    const runtime = loadRuntime();
    commandProjectResolve(runtime, parsed);
    return;
  }

  if (command === "report" || command === "build") {
    mutateRuntime("build-report", (lockedRuntime) => {
      commandReport(lockedRuntime, { skipSave: true });
    });
    return;
  }

  if (command === "panel") {
    const runtime = loadRuntime();
    await commandPanel(runtime, parsed);
    return;
  }

  if (command === "pipeline-status") {
    const runtime = loadRuntime();
    commandPipelineStatus(runtime);
    return;
  }

  if (command === "stale-check") {
    mutateRuntime("stale-check", (lockedRuntime) => {
      commandStaleCheck(lockedRuntime, parsed, { skipSave: true });
    });
    return;
  }

  if (command === "storage-status") {
    const runtime = loadRuntime();
    commandStorageStatus(runtime);
    return;
  }

  if (command === "storage-migrate") {
    commandStorageMigrate(parsed);
    return;
  }

  if (command === "storage-rollback") {
    commandStorageRollback(parsed);
    return;
  }

  if (command === "backup-export") {
    commandBackupExport(parsed);
    return;
  }

  if (command === "backup-import") {
    commandBackupImport(parsed);
    return;
  }

  if (command === "backup-inspect") {
    commandBackupInspect(parsed);
    return;
  }

  if (command === "lock-status") {
    const runtime = loadRuntime();
    const lockFilePath = getLockFilePath(runtime.config);
    const metadata = readLockMetadata(lockFilePath);
    console.log(JSON.stringify({
      locked: Boolean(metadata),
      lock_file: lockFilePath,
      metadata
    }, null, 2));
    return;
  }

  throw new Error(`unsupported command: ${command}`);
}

module.exports = {
  printUsage,
  commandStats,
  commandQuery,
  commandTrace,
  commandExplain,
  commandPaperQuery,
  commandPaperExplain,
  commandConceptSuggest,
  commandConceptRegister,
  commandSurvey,
  commandSupersede,
  commandPath,
  commandReview,
  commandAdd,
  commandPaperAdd,
  commandPaperCapture,
  commandPaperImport,
  commandIngest,
  commandCaptureStatus,
  commandCaptureAccept,
  commandCaptureDismiss,
  commandProjectList,
  commandProjectRegister,
  commandProjectUse,
  commandProjectStatus,
  commandProjectResolve,
  commandReport,
  commandPanel,
  commandStorageStatus,
  commandStorageMigrate,
  commandStorageRollback,
  commandBackupExport,
  commandBackupInspect,
  commandBackupImport,
  commandPipelineStatus,
  commandStaleCheck,
  main
};
