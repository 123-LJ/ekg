const {
  computeStats,
  getExperiences,
  getPapers
} = require("../model");

function generateReport(index, state) {
  const stats = index.stats || computeStats(getExperiences(index), getPapers(index));
  const topTags = Object.entries(index.indexes.by_tag || {})
    .sort((left, right) => right[1].length - left[1].length)
    .slice(0, 5)
    .map(([tag, ids]) => `- ${tag}: ${ids.length}`);
  const topTopics = Object.entries(index.indexes.by_topic || {})
    .filter(([topic]) => topic)
    .sort((left, right) => right[1].length - left[1].length)
    .slice(0, 5)
    .map(([topic, ids]) => `- ${topic}: ${ids.length}`);
  const topVenues = Object.entries(index.indexes.by_venue || {})
    .filter(([venue]) => venue)
    .sort((left, right) => right[1].length - left[1].length)
    .slice(0, 5)
    .map(([venue, ids]) => `- ${venue}: ${ids.length}`);

  return [
    "# EKG Report",
    "",
    "## Snapshot",
    "",
    `- Generated at: ${index.generated_at}`,
    `- Stage: ${index.stage_label || index.stage}`,
    ...(index.stage_summary ? [`- Stage summary: ${index.stage_summary}`] : []),
    `- Experience count: ${stats.experience_count}`,
    `- Paper count: ${stats.paper_count || 0}`,
    `- Active: ${stats.active_count}`,
    `- Needs review: ${stats.needs_review_count}`,
    `- Stale: ${stats.stale_count}`,
    `- Superseded: ${stats.superseded_count || 0}`,
    `- Distinct topics: ${stats.topic_count || 0}`,
    `- Distinct authors: ${stats.author_count || 0}`,
    `- Last build: ${state.last_build_at || "n/a"}`,
    "",
    "## Top Tags",
    "",
    ...(topTags.length ? topTags : ["- No tags yet"]),
    "",
    "## Top Paper Topics",
    "",
    ...(topTopics.length ? topTopics : ["- No paper topics yet"]),
    "",
    "## Top Venues",
    "",
    ...(topVenues.length ? topVenues : ["- No paper venues yet"]),
    "",
    "## Next Focus",
    "",
    "1. Connect paper and survey recall more deeply into edit-time workflows where it helps.",
    "2. Keep candidate-review gating tight as more automatic capture sources are added.",
    "3. Expand graph exports/analysis without sacrificing explainability."
  ].join("\n");
}

module.exports = {
  generateReport
};
