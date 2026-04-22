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
    `- Phase: ${index.stage}`,
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
    "1. Continue adding current-project experiences through `add`.",
    "2. Keep `hook` results short by default and only expand direct matches.",
    "3. Introduce `review` once inferred experiences start to accumulate."
  ].join("\n");
}

module.exports = {
  generateReport
};
