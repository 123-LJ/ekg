const {
  refreshIndex,
  refreshState
} = require("../model");
const {
  buildKnowledgeGraph
} = require("../graph");

function runBuildPass(runtime) {
  refreshIndex(runtime.index);
  refreshState(runtime.state, runtime.index);

  const graph = buildKnowledgeGraph(runtime.index);

  return {
    name: "build",
    status: "ok",
    node_count: graph.nodes.size,
    edge_count: [...graph.adjacency.values()].reduce((count, neighbors) => count + neighbors.size, 0) / 2,
    experience_count: (runtime.index.stats || {}).experience_count || 0,
    message: "Built in-memory graph and refreshed JSON indexes."
  };
}

module.exports = {
  runBuildPass
};
