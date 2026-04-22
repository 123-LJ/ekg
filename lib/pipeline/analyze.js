function topEntries(indexBucket, limit = 5) {
  return Object.entries(indexBucket || {})
    .map(([name, ids]) => ({
      name,
      count: Array.isArray(ids) ? ids.length : 0
    }))
    .sort((left, right) => right.count - left.count || left.name.localeCompare(right.name))
    .slice(0, limit);
}

function runAnalyzePass(runtime) {
  const indexes = runtime.index.indexes || {};
  const analysis = {
    hotspots: topEntries(indexes.by_tag, 5),
    core_techs: topEntries(indexes.by_tech, 5),
    active_count: ((indexes.by_status || {}).ACTIVE || []).length,
    needs_review_count: ((indexes.by_status || {}).NEEDS_REVIEW || []).length,
    stale_count: ((indexes.by_status || {}).STALE || []).length
  };

  runtime.state.analysis = {
    ...analysis,
    generated_at: new Date().toISOString()
  };

  return {
    name: "analyze",
    status: "ok",
    ...analysis,
    message: "Computed lightweight hotspot and review summaries from indexes."
  };
}

module.exports = {
  runAnalyzePass
};
