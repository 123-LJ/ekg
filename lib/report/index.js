const {
  computeStats,
  getExperiences
} = require("../model");

function generateReport(index, state) {
  const stats = index.stats || computeStats(getExperiences(index));
  const topTags = Object.entries(index.indexes.by_tag || {})
    .sort((left, right) => right[1].length - left[1].length)
    .slice(0, 5)
    .map(([tag, ids]) => `- ${tag}: ${ids.length}`);

  return [
    "# EKG Report",
    "",
    "## Snapshot",
    "",
    `- Generated at: ${index.generated_at}`,
    `- Stage: ${index.stage_label || index.stage}`,
    ...(index.stage_summary ? [`- Stage summary: ${index.stage_summary}`] : []),
    `- Experience count: ${stats.experience_count}`,
    `- Active: ${stats.active_count}`,
    `- Needs review: ${stats.needs_review_count}`,
    `- Stale: ${stats.stale_count}`,
    `- Last build: ${state.last_build_at || "n/a"}`,
    "",
    "## Top Tags",
    "",
    ...(topTags.length ? topTags : ["- No tags yet"]),
    "",
    "## Next Focus",
    "",
    "1. Add automatic ingest sources for commits/tasks while keeping the candidate-review gate.",
    "2. Introduce stale detection so file drift can move experiences into `NEEDS_REVIEW`.",
    "3. Expand graph exports/analysis without sacrificing explainability."
  ].join("\n");
}

module.exports = {
  generateReport
};
