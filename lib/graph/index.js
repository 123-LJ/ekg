const {
  getExperiences
} = require("../model");
const {
  normalizeText,
  unique
} = require("../core/utils");

function virtualNodeId(type, value) {
  return `${type}:${normalizeText(value)}`;
}

function createGraph() {
  return {
    nodes: new Map(),
    adjacency: new Map()
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

function addGraphEdge(graph, from, to) {
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
}

function addVirtualExperienceEdge(graph, experienceId, type, rawValue) {
  if (!rawValue) {
    return;
  }

  const nodeId = virtualNodeId(type, rawValue);
  addGraphNode(graph, nodeId, `${type}: ${rawValue}`, [rawValue]);
  addGraphEdge(graph, experienceId, nodeId);
}

function buildKnowledgeGraph(index) {
  const graph = createGraph();

  getExperiences(index).forEach((experience) => {
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
  });

  (index.edges || []).forEach((edge) => {
    if (graph.nodes.has(edge.from) && graph.nodes.has(edge.to)) {
      addGraphEdge(graph, edge.from, edge.to);
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
  buildKnowledgeGraph,
  resolveGraphNode,
  findShortestPath,
  describeGraphNode
};
