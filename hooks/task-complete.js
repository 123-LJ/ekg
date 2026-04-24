#!/usr/bin/env node

const fs = require("node:fs");
const process = require("node:process");
const {
  parseArgs,
  loadRuntime,
  saveRuntime,
  saveState,
  withWriteLock,
  getWriterIdentity
} = require("../lib");
const {
  collectList,
  normalizeFileList,
  firstNonEmpty,
  createCaptureCandidate,
  evaluateCandidateRisk
} = require("../lib/capture");
const {
  commandCaptureAccept
} = require("../lib/commands");

function readHookInput() {
  try {
    const raw = fs.readFileSync(0, "utf8").trim();
    if (!raw) {
      return null;
    }
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function pickText(source, keys) {
  if (!source || typeof source !== "object") {
    return "";
  }

  for (const key of keys) {
    const value = source[key];
    const text = firstNonEmpty(value);
    if (text) {
      return text;
    }
  }

  return "";
}

function flattenPossibleList(value) {
  if (!value) {
    return [];
  }

  if (Array.isArray(value)) {
    return value.flatMap((item) => flattenPossibleList(item));
  }

  if (typeof value === "object") {
    return flattenPossibleList(
      value.path
      || value.file
      || value.file_path
      || value.changed_files
      || value.files
      || ""
    );
  }

  return collectList(String(value).replace(/\r?\n/g, ","));
}

function extractFilesFromHookInput(input) {
  if (!input || typeof input !== "object") {
    return [];
  }

  const rawFiles = [
    input.file_path,
    input.path,
    input.file,
    input.files,
    input.changed_files,
    input.touched_files,
    input.target_file,
    input.tool_input,
    input.tool_output,
    input.metadata,
    input.context
  ].flatMap((item) => flattenPossibleList(item));

  return normalizeFileList(
    rawFiles.filter((item) => /[\\/]/.test(item) || /\.[a-z0-9]+$/i.test(item))
  );
}

function buildCandidateInput(parsed, hookInput) {
  const files = normalizeFileList([
    ...collectList(parsed.options.file),
    ...collectList(parsed.options.files),
    ...extractFilesFromHookInput(hookInput)
  ]);
  const concepts = collectList(parsed.options.concept);
  const task = firstNonEmpty(
    parsed.options.task,
    pickText(hookInput, ["task", "prompt", "user_prompt", "goal", "title", "instruction"])
  );
  const summary = firstNonEmpty(
    parsed.options.summary,
    pickText(hookInput, ["summary", "result", "output", "output_text", "response", "message"])
  );

  return {
    title: firstNonEmpty(parsed.options.title),
    symptom: firstNonEmpty(parsed.options.symptom),
    problem: firstNonEmpty(parsed.options.problem, task),
    cause: firstNonEmpty(parsed.options.cause),
    solution: firstNonEmpty(parsed.options.solution, summary),
    fix: firstNonEmpty(parsed.options.fix),
    root_cause: firstNonEmpty(parsed.options["root-cause"], parsed.options.rootCause),
    scope: firstNonEmpty(parsed.options.scope),
    task,
    summary,
    files,
    concepts,
    tags: collectList(parsed.options.tags),
    techs: collectList(parsed.options.techs),
    relations: collectList(parsed.options.relations),
    type: parsed.options.type,
    level: parsed.options.level,
    confidence: parsed.options.confidence,
    status: parsed.options.status,
    source: parsed.options.source || "host/auto-stop",
    project_scope: parsed.options.scope || "current-project",
    event: firstNonEmpty(
      parsed.options.event,
      pickText(hookInput, ["hook_event_name", "event_name", "tool_name", "event"])
    ),
    writer: getWriterIdentity({
      ...parsed.options,
      host: parsed.options.host || process.env.EKG_HOST || "host-hook"
    })
  };
}

const GENERIC_CAPTURE_PATTERNS = [
  /^(done|finished|completed|updated|fixed|implemented)\.?$/iu,
  /\b(worked|done|ok|fine|success)\b/iu,
  /\bvarious changes\b/iu,
  /\bmisc(?:ellaneous)?\b/iu,
  /\brefined the code\b/iu,
  /\bmade changes\b/iu,
  /\bupdated files\b/iu,
  /\bclean(ed)? up\b/iu
];

const ACTION_SIGNAL_PATTERN = /\b(fix|fixed|resolve|resolved|exclude|restore|preserve|add|added|remove|removed|guard|fallback|redirect|validate|restrict|block|allow|persist|upsert|repair|patch|prevent)\b/iu;

function countMeaningfulFields(candidateInput) {
  return [
    candidateInput.symptom,
    candidateInput.cause,
    candidateInput.fix,
    candidateInput.scope,
    candidateInput.root_cause
  ].filter((value) => String(value || "").trim()).length;
}

function looksGenericText(value = "") {
  const text = String(value || "").replace(/\s+/g, " ").trim();
  if (!text) {
    return true;
  }

  return GENERIC_CAPTURE_PATTERNS.some((pattern) => pattern.test(text));
}

function hasActionSignal(candidateInput) {
  const haystack = [
    candidateInput.problem,
    candidateInput.solution,
    candidateInput.fix,
    candidateInput.summary
  ].join(" ");
  return ACTION_SIGNAL_PATTERN.test(haystack);
}

function shouldCaptureCandidate(candidateInput, captureConfig = {}) {
  if (captureConfig.enabled === false) {
    return false;
  }

  const minimumSummaryLength = captureConfig.minimumSummaryLength || 24;
  const requireFileAnchor = captureConfig.requireFileAnchor !== false;
  const maxAutoFiles = Number.parseInt(captureConfig.maxHookFiles || 6, 10);
  const minStructuredFields = Number.parseInt(captureConfig.minimumStructuredFields || 1, 10);
  const hasEnoughText = candidateInput.solution.length >= minimumSummaryLength
    || (candidateInput.problem.length >= minimumSummaryLength && candidateInput.solution.length >= 8);
  const structuredFieldCount = countMeaningfulFields(candidateInput);

  if (!hasEnoughText) {
    return false;
  }

  if (requireFileAnchor && (!candidateInput.files || candidateInput.files.length === 0)) {
    return false;
  }

  if ((candidateInput.files || []).length > maxAutoFiles && structuredFieldCount < minStructuredFields + 1) {
    return false;
  }

  if (looksGenericText(candidateInput.solution) && looksGenericText(candidateInput.problem)) {
    return false;
  }

  if (!hasActionSignal(candidateInput) && structuredFieldCount < minStructuredFields) {
    return false;
  }

  return true;
}

function formatAdditionalContext(candidate, created) {
  const actionText = created ? "captured" : "refreshed";
  const reviewGate = candidate.review_gate || null;
  const riskText = reviewGate ? `[EKG] review gate: ${reviewGate.riskLevel}` : "";
  const reasonText = reviewGate && reviewGate.reasons && reviewGate.reasons.length
    ? `[EKG] human review required: ${reviewGate.reasons.join("; ")}`
    : "";
  return [
    `[EKG] ${actionText} candidate ${candidate.id} for later review`,
    `[EKG] title: ${candidate.title}`,
    `[EKG] files: ${((candidate.anchors || {}).files || []).join(", ") || "n/a"}`,
    riskText,
    reasonText,
    `[EKG] Review with \`node scripts/ekg.js capture-status ${candidate.id}\``,
    `[EKG] Accept with \`node scripts/ekg.js capture-accept ${candidate.id} --confirm\` when the solution is verified.`
  ].filter(Boolean).join("\n");
}

function formatConsoleOutput(candidate, created) {
  return JSON.stringify({
    candidate_id: candidate.id,
    created,
    title: candidate.title,
    files: ((candidate.anchors || {}).files || []),
    review_gate: candidate.review_gate || null
  }, null, 2);
}

function shouldBlockOnCandidate(result, hookInput, captureConfig = {}) {
  if (!hookInput || !result || !result.created) {
    return false;
  }

  if (hookInput.stop_hook_active) {
    return false;
  }

  const gate = captureConfig.gate || {};
  if (gate.enabled === false) {
    return false;
  }

  const eventName = String(hookInput.hook_event_name || "").trim();
  const blockOnEvents = Array.isArray(gate.blockOnEvents) && gate.blockOnEvents.length
    ? gate.blockOnEvents
    : ["Stop"];

  return blockOnEvents.includes(eventName);
}

function formatBlockReason(candidate) {
  const reviewGate = candidate.review_gate || null;
  const riskSuffix = reviewGate && reviewGate.reasons && reviewGate.reasons.length
    ? ` Human review is required because: ${reviewGate.reasons.join("; ")}.`
    : "";
  return [
    `EKG captured a new review candidate ${candidate.id}.`,
    `Review it with node scripts/ekg.js capture-status ${candidate.id}.`,
    `Accept it with node scripts/ekg.js capture-accept ${candidate.id} --confirm when the fix is verified.`,
    `Dismiss it with node scripts/ekg.js capture-dismiss ${candidate.id} if it is noise.${riskSuffix}`
  ].join(" ");
}

function tryAutoAcceptCandidate(runtime, candidate, captureConfig = {}) {
  const reviewGate = evaluateCandidateRisk(candidate, captureConfig.autoAccept || {}, {
    eventName: ((candidate.origin || {}).event) || candidate.event || ""
  });
  candidate.review_gate = reviewGate;

  if (!reviewGate.autoAcceptEligible) {
    return {
      candidate,
      autoAccepted: false,
      reviewGate
    };
  }

  const parsed = {
    positional: ["capture-accept", candidate.id],
    options: {
      id: candidate.id,
      confirm: true
    }
  };
  commandCaptureAccept(runtime, parsed, {
    skipSave: true
  });
  const acceptedExperience = ((runtime.index || {}).nodes || []).slice(-1)[0] || null;
  return {
    candidate,
    autoAccepted: true,
    reviewGate,
    acceptedExperience
  };
}

function buildHookOutput(result, hookInput, captureConfig = {}) {
  if (result.autoAccepted) {
    const experienceId = ((result.acceptedExperience || {}).id) || "unknown";
    return {
      additionalContext: [
        `[EKG] auto-accepted low-risk candidate ${result.candidate.id} into ${experienceId}.`,
        `[EKG] auto-accept policy classified this candidate as low risk.`
      ].join("\n"),
      suppressOutput: true
    };
  }

  const payload = {
    additionalContext: formatAdditionalContext(result.candidate, result.created),
    suppressOutput: true
  };

  if (shouldBlockOnCandidate(result, hookInput, captureConfig)) {
    const reason = formatBlockReason(result.candidate);
    payload.decision = "block";
    payload.reason = reason;
    payload.systemMessage = reason;
  }

  return payload;
}

function main(argv = process.argv.slice(2)) {
  const hookInput = readHookInput();
  const parsed = parseArgs(argv);
  const runtime = loadRuntime();
  const candidateInput = buildCandidateInput(parsed, hookInput);
  const captureConfig = runtime.config.capture || {};

  if (!shouldCaptureCandidate(candidateInput, captureConfig)) {
    process.exit(0);
  }

  let result = null;

  withWriteLock(runtime.config, "hook-task-complete", () => {
    const lockedRuntime = loadRuntime();
    result = createCaptureCandidate(lockedRuntime.state, candidateInput, {
      pendingLimit: captureConfig.pendingLimit || 20,
      dedupeWindowMinutes: captureConfig.dedupeWindowMinutes || 180,
      defaultType: captureConfig.defaultType || "workflow",
      defaultLevel: captureConfig.defaultLevel || "L1",
      defaultConfidence: captureConfig.defaultConfidence || "UNCERTAIN",
      defaultStatus: captureConfig.defaultStatus || "NEEDS_REVIEW"
    });
    result = {
      ...result,
      ...tryAutoAcceptCandidate(lockedRuntime, result.candidate, captureConfig)
    };
    saveState(lockedRuntime, lockedRuntime.state, { skipLock: true });
    if (result.autoAccepted) {
      saveState(lockedRuntime, lockedRuntime.state, { skipLock: true });
      saveRuntime(lockedRuntime, { skipLock: true });
    }
  });

  if (!result) {
    process.exit(0);
  }

  if (hookInput) {
    process.stdout.write(
      `${JSON.stringify(buildHookOutput(result, hookInput, captureConfig), null, 2)}\n`
    );
    return;
  }

  console.log(formatConsoleOutput(result.candidate, result.created));
}

if (require.main === module) {
  main(process.argv.slice(2));
}

module.exports = {
  readHookInput,
  pickText,
  flattenPossibleList,
  extractFilesFromHookInput,
  buildCandidateInput,
  shouldCaptureCandidate,
  formatAdditionalContext,
  shouldBlockOnCandidate,
  formatBlockReason,
  tryAutoAcceptCandidate,
  buildHookOutput,
  formatConsoleOutput,
  main
};
