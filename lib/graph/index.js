const {
  getExperiences,
  getPapers
} = require("../model");
const {
  normalizeText,
  unique
} = require("../core/utils");

const RELATION_TYPE_REGISTRY = {
  related: {
    aliases: ["relates-to", "related-to", "linked-to"],
    label: "related",
    weight: 3
  },
  causes: {
    aliases: ["cause", "caused-by"],
    label: "causes",
    weight: 9
  },
  fixes: {
    aliases: ["fix", "fixed-by", "resolved-by"],
    label: "fixes",
    weight: 10
  },
  "depends-on": {
    aliases: ["depends", "requires", "requires-decision"],
    label: "depends-on",
    weight: 8
  },
  "blocked-by": {
    aliases: ["blocks", "waiting-on"],
    label: "blocked-by",
    weight: 7
  },
  supersedes: {
    aliases: ["replaces", "replace", "superseded-by"],
    label: "supersedes",
    weight: 8
  },
  "deprecated-by": {
    aliases: ["deprecates", "deprecated", "retires"],
    label: "deprecated-by",
    weight: 8
  }
};

function virtualNodeId(type, value) {
  return `${type}:${normalizeText(value)}`;
}

function createGraph() {
  return {
    nodes: new Map(),
    adjacency: new Map(),
    edgeMeta: new Map()
  };
}

function addGraphNode(graph, id, label, aliases = []) {
  if (!graph.nodes.has(id)) {
    graph.nodes.set(id, {
      id,
      label,
      aliases: unique([id, label, ...aliases].map(normalizeText))
    });
  }

  if (!graph.adjacency.has(id)) {
    graph.adjacency.set(id, new Set());
  }
}

function edgeKey(from, to) {
  return [from, to].sort().join("::");
}

function addEdgeMeta(graph, from, to, metadata = {}) {
  const key = edgeKey(from, to);
  const current = graph.edgeMeta.get(key) || [];
  graph.edgeMeta.set(key, [...current, metadata]);
}

function addGraphEdge(graph, from, to, metadata = {}) {
  if (!from || !to || from === to) {
    return;
  }

  if (!graph.adjacency.has(from)) {
    graph.adjacency.set(from, new Set());
  }

  if (!graph.adjacency.has(to)) {
    graph.adjacency.set(to, new Set());
  }

  graph.adjacency.get(from).add(to);
  graph.adjacency.get(to).add(from);
  addEdgeMeta(graph, from, to, metadata);
}

function addVirtualExperienceEdge(graph, experienceId, type, rawValue) {
  if (!rawValue) {
    return;
  }

  const nodeId = virtualNodeId(type, rawValue);
  addGraphNode(graph, nodeId, `${type}: ${rawValue}`, [rawValue]);
  addGraphEdge(graph, experienceId, nodeId, {
    type: "anchor",
    anchor_type: type,
    value: rawValue
  });
}

function addVirtualNodeEdge(graph, nodeId, type, rawValue) {
  if (!rawValue) {
    return;
  }

  const virtualId = virtualNodeId(type, rawValue);
  addGraphNode(graph, virtualId, `${type}: ${rawValue}`, [rawValue]);
  addGraphEdge(graph, nodeId, virtualId, {
    type: "anchor",
    anchor_type: type,
    value: rawValue
  });
}

function parseRelationEntry(rawRelation) {
  if (!rawRelation) {
    return null;
  }

  if (typeof rawRelation === "object") {
    const target = String(rawRelation.target || rawRelation.to || "").trim();
    if (!target) {
      return null;
    }

    const relationType = normalizeRelationType(rawRelation.type || "related");
    if (!relationType) {
      return null;
    }

    return {
      target,
      type: relationType,
      reason: String(rawRelation.reason || "").trim(),
      at: String(rawRelation.at || rawRelation.timestamp || "").trim()
    };
  }

  const text = String(rawRelation).trim();
  if (!text) {
    return null;
  }

  const match = text.match(/^([a-z0-9_-]+)\s*:\s*((?:E|P)\d+)\s*$/iu);
  if (match) {
    const relationType = normalizeRelationType(match[1]);
    if (!relationType) {
      return null;
    }

    return {
      type: relationType,
      target: match[2],
      reason: ""
    };
  }

  if (/^(?:E|P)\d+$/iu.test(text)) {
    return {
      type: "related",
      target: text,
      reason: ""
    };
  }

  return null;
}

function getEdgeMetadata(graph, from, to) {
  return graph.edgeMeta.get(edgeKey(from, to)) || [];
}

function normalizeRelationType(value) {
  const normalized = normalizeText(value);
  if (!normalized) {
    return "related";
  }

  const direct = RELATION_TYPE_REGISTRY[normalized];
  if (direct) {
    return direct.label;
  }

  const entry = Object.entries(RELATION_TYPE_REGISTRY).find(([, config]) => {
    return (config.aliases || []).map(normalizeText).includes(normalized);
  });

  return entry ? entry[1].label : "";
}

function getRelationTypeConfig(type) {
  const normalized = normalizeRelationType(type);
  return RELATION_TYPE_REGISTRY[normalized || "related"] || RELATION_TYPE_REGISTRY.related;
}

function serializeRelationEntry(value) {
  const parsed = parseRelationEntry(value);
  if (!parsed) {
    return "";
  }

  return `${parsed.type}:${parsed.target}`;
}

function validateRelationEntries(values = []) {
  const valid = [];
  const invalid = [];

  (values || []).forEach((value) => {
    const parsed = parseRelationEntry(value);
    if (!parsed) {
      invalid.push(String(value || ""));
      return;
    }
    valid.push(parsed);
  });

  return {
    valid,
    invalid
  };
}

function buildKnowledgeGraph(index) {
  const graph = createGraph();
  const experiences = getExperiences(index);
  const papers = getPapers(index);
  const experienceIds = new Set(experiences.map((experience) => experience.id));
  const paperIds = new Set(papers.map((paper) => paper.id));
  const knownIds = new Set([...experienceIds, ...paperIds]);

  experiences.forEach((experience) => {
    addGraphNode(graph, experience.id, `${experience.id}: ${experience.title}`, [
      experience.id,
      experience.title
    ]);

    (experience.tags || []).forEach((tag) => {
      addVirtualExperienceEdge(graph, experience.id, "tag", tag);
    });

    (experience.techs || []).forEach((tech) => {
      addVirtualExperienceEdge(graph, experience.id, "tech", tech);
    });

    (((experience.anchors || {}).concepts) || []).forEach((concept) => {
      addVirtualExperienceEdge(graph, experience.id, "concept", concept);
    });

    (((experience.anchors || {}).files) || []).forEach((file) => {
      addVirtualExperienceEdge(graph, experience.id, "file", file);
    });

    (experience.canonical_terms || []).forEach((canonical) => {
      addVirtualNodeEdge(graph, experience.id, "canonical", canonical);
    });

    (experience.relations || []).forEach((relation) => {
      const parsed = parseRelationEntry(relation);
      if (!parsed || !experienceIds.has(parsed.target)) {
        return;
      }

      addGraphEdge(graph, experience.id, parsed.target, {
        type: "relation",
        relation_type: parsed.type,
        reason: parsed.reason,
        relation_weight: getRelationTypeConfig(parsed.type).weight,
        relation_at: parsed.at || ""
      });
    });
  });

  papers.forEach((paper) => {
    addGraphNode(graph, paper.id, `${paper.id}: ${paper.title}`, [
      paper.id,
      paper.title,
      paper.venue || "",
      ...(paper.authors || [])
    ]);

    (paper.topics || []).forEach((topic) => {
      addVirtualNodeEdge(graph, paper.id, "topic", topic);
    });

    (paper.keywords || []).forEach((keyword) => {
      addVirtualNodeEdge(graph, paper.id, "keyword", keyword);
    });

    (paper.canonical_terms || []).forEach((canonical) => {
      addVirtualNodeEdge(graph, paper.id, "canonical", canonical);
    });

    (paper.authors || []).forEach((author) => {
      addVirtualNodeEdge(graph, paper.id, "author", author);
    });

    if (paper.venue) {
      addVirtualNodeEdge(graph, paper.id, "venue", paper.venue);
    }

    (paper.relations || []).forEach((relation) => {
      const parsed = parseRelationEntry(relation);
      if (!parsed || !knownIds.has(parsed.target)) {
        return;
      }

      addGraphEdge(graph, paper.id, parsed.target, {
        type: "relation",
        relation_type: parsed.type,
        reason: parsed.reason,
        relation_weight: getRelationTypeConfig(parsed.type).weight,
        relation_at: parsed.at || ""
      });
    });
  });

  (index.edges || []).forEach((edge) => {
    if (graph.nodes.has(edge.from) && graph.nodes.has(edge.to)) {
      addGraphEdge(graph, edge.from, edge.to, {
        type: edge.type || "related",
        reason: edge.reason || "",
        confidence: edge.confidence || ""
      });
    }
  });

  return graph;
}

function resolveGraphNode(graph, input) {
  const normalized = normalizeText(input);
  if (!normalized) {
    return null;
  }

  if (graph.nodes.has(input)) {
    return input;
  }

  const candidates = [...graph.nodes.values()];
  const exact = candidates.filter((node) => node.aliases.includes(normalized));
  if (exact.length) {
    return exact.sort((left, right) => left.label.length - right.label.length)[0].id;
  }

  const partial = candidates
    .map((node) => {
      const matchedAlias = node.aliases.find((alias) => alias.includes(normalized) || normalized.includes(alias));
      if (!matchedAlias) {
        return null;
      }

      return {
        id: node.id,
        label: node.label,
        score: matchedAlias === normalized ? 100 : Math.min(matchedAlias.length, normalized.length)
      };
    })
    .filter(Boolean)
    .sort((left, right) => right.score - left.score || left.label.length - right.label.length);

  return partial.length ? partial[0].id : null;
}

function findShortestPath(graph, startId, endId) {
  const queue = [[startId]];
  const visited = new Set([startId]);

  while (queue.length) {
    const pathSoFar = queue.shift();
    const current = pathSoFar[pathSoFar.length - 1];

    if (current === endId) {
      return pathSoFar;
    }

    [...(graph.adjacency.get(current) || [])].forEach((next) => {
      if (visited.has(next)) {
        return;
      }

      visited.add(next);
      queue.push([...pathSoFar, next]);
    });
  }

  return null;
}

function describeGraphNode(graph, nodeId) {
  const node = graph.nodes.get(nodeId);
  return node ? node.label : nodeId;
}

module.exports = {
  RELATION_TYPE_REGISTRY,
  buildKnowledgeGraph,
  resolveGraphNode,
  findShortestPath,
  describeGraphNode,
  getEdgeMetadata,
  parseRelationEntry,
  normalizeRelationType,
  getRelationTypeConfig,
  serializeRelationEntry,
  validateRelationEntries
};
