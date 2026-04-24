function runIngestPass(runtime) {
  const experiences = (runtime.index.nodes || []).filter((node) => node.kind === "Experience");

  return {
    name: "ingest",
    status: "ok",
    source: "structured-store",
    item_count: experiences.length,
    message: "Loads structured experiences from the managed store (SQLite primary plus JSON/Markdown mirrors)."
  };
}

module.exports = {
  runIngestPass
};
