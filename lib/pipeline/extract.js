function runExtractPass(runtime, ingestResult = {}) {
  return {
    name: "extract",
    status: "skipped",
    source_item_count: ingestResult.item_count || 0,
    extracted_count: 0,
    message: "Full auto-ingest/LLM extraction is not enabled yet; current Phase 2+ relies on capture candidates and human review."
  };
}

module.exports = {
  runExtractPass
};
