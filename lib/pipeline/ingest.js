function runIngestPass(runtime) {
  const experiences = (runtime.index.nodes || []).filter((node) => node.kind === "Experience");

  return {
    name: "ingest",
    status: "ok",
    source: "manual-json",
    item_count: experiences.length,
    message: "Phase 1 reads manually maintained experiences from ekg.json."
  };
}

module.exports = {
  runIngestPass
};
