function runExtractPass(runtime, ingestResult = {}) {
  return {
    name: "extract",
    status: "skipped",
    source_item_count: ingestResult.item_count || 0,
    extracted_count: 0,
    message: "Phase 1 uses already structured experiences; LLM extraction is reserved for Phase 2."
  };
}

module.exports = {
  runExtractPass
};
