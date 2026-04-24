const CURRENT_STAGE = "phase-2-plus";
const CURRENT_STAGE_LABEL = "Phase 2+";
const CURRENT_STAGE_SUMMARY = "Phase 1 complete; Phase 2 mostly implemented; Phase 3 preview is available.";

function normalizeStage(stage) {
  const normalized = String(stage || "").trim().toLowerCase();
  if (!normalized || normalized === "phase-1") {
    return CURRENT_STAGE;
  }

  return normalized;
}

function buildStageMetadata(stage) {
  const normalizedStage = normalizeStage(stage);
  if (normalizedStage === CURRENT_STAGE) {
    return {
      stage: CURRENT_STAGE,
      label: CURRENT_STAGE_LABEL,
      summary: CURRENT_STAGE_SUMMARY
    };
  }

  return {
    stage: normalizedStage,
    label: normalizedStage,
    summary: ""
  };
}

module.exports = {
  CURRENT_STAGE,
  CURRENT_STAGE_LABEL,
  CURRENT_STAGE_SUMMARY,
  normalizeStage,
  buildStageMetadata
};
