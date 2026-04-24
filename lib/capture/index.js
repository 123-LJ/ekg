const path = require("node:path");
const {
  normalizeText,
  parseList,
  unique
} = require("../core/utils");

const DEFAULT_CAPTURE_STATE = {
  next_candidate_number: 1,
  pending_candidates: [],
  recent_events: []
};

function ensureCaptureState(state) {
  state.capture = state.capture || {};
  state.capture.next_candidate_number = Number.isFinite(state.capture.next_candidate_number)
    ? state.capture.next_candidate_number
    : DEFAULT_CAPTURE_STATE.next_candidate_number;
  state.capture.pending_candidates = Array.isArray(state.capture.pending_candidates)
    ? state.capture.pending_candidates
    : [];
  state.capture.recent_events = Array.isArray(state.capture.recent_events)
    ? state.capture.recent_events
    : [];
  return state.capture;
}

function collectList(value) {
  if (!value) {
    return [];
  }

  if (Array.isArray(value)) {
    return unique(value.flatMap((item) => collectList(item)));
  }

  return parseList(String(value).replace(/\r?\n/g, ","));
}

function normalizeFileList(value) {
  return unique(
    collectList(value).map((item) => String(item).replace(/\\/g, "/").trim()).filter(Boolean)
  );
}

function truncate(value, maxLength = 120) {
  const text = String(value || "").replace(/\s+/g, " ").trim();
  if (!text) {
    return "";
  }

  if (text.length <= maxLength) {
    return text;
  }

  return `${text.slice(0, maxLength - 3).trim()}...`;
}

function firstNonEmpty(...values) {
  for (const value of values) {
    if (Array.isArray(value)) {
      const nested = firstNonEmpty(...value);
      if (nested) {
        return nested;
      }
      continue;
    }

    if (value === undefined || value === null) {
      continue;
    }

    const text = String(value).trim();
    if (text) {
      return text;
    }
  }

  return "";
}

function inferConceptsFromFiles(files) {
  return unique(
    normalizeFileList(files)
      .map((file) => path.basename(file).replace(/\.[^.]+$/, ""))
      .filter((name) => name && name.length >= 3)
  );
}

function buildCandidateTitle(input) {
  return truncate(
    firstNonEmpty(
      input.title,
      input.problem,
      input.task,
      input.summary,
      input.solution
    ),
    80
  );
}

function nextCandidateId(state) {
  const capture = ensureCaptureState(state);
  const id = `C${String(capture.next_candidate_number).padStart(3, "0")}`;
  capture.next_candidate_number += 1;
  return id;
}

function listCaptureCandidates(state) {
  return [...ensureCaptureState(state).pending_candidates];
}

function findCaptureCandidate(state, ref) {
  const normalizedRef = normalizeText(ref);
  if (!normalizedRef) {
    return null;
  }

  return listCaptureCandidates(state).find((candidate) => {
    if (normalizeText(candidate.id) === normalizedRef) {
      return true;
    }

    if (normalizeText(candidate.title) === normalizedRef) {
      return true;
    }

    return normalizeText(candidate.title).includes(normalizedRef);
  }) || null;
}

function recordCaptureEvent(state, event) {
  const capture = ensureCaptureState(state);
  const nextEvent = {
    ...event,
    recorded_at: new Date().toISOString()
  };
  capture.recent_events = [nextEvent, ...capture.recent_events].slice(0, 50);
  return nextEvent;
}

function findRecentDuplicate(state, input, dedupeWindowMinutes = 180) {
  const capture = ensureCaptureState(state);
  const normalizedTitle = normalizeText(buildCandidateTitle(input));
  const normalizedProblem = normalizeText(firstNonEmpty(input.problem, input.task));
  const normalizedFiles = normalizeFileList(input.files || ((input.anchors || {}).files));
  const threshold = Date.now() - dedupeWindowMinutes * 60 * 1000;

  return capture.pending_candidates.find((candidate) => {
    const candidateTime = Date.parse(candidate.updated_at || candidate.created_at || "");
    if (!Number.isFinite(candidateTime) || candidateTime < threshold) {
      return false;
    }

    const sameTitle = normalizedTitle && normalizeText(candidate.title) === normalizedTitle;
    const sameProblem = normalizedProblem && normalizeText(candidate.problem) === normalizedProblem;
    const candidateFiles = normalizeFileList(((candidate.anchors || {}).files));
    const sameFiles = normalizedFiles.length > 0
      && normalizedFiles.every((file) => candidateFiles.includes(file));

    return (sameTitle || sameProblem) && sameFiles;
  }) || null;
}

function createCaptureCandidate(state, input = {}, options = {}) {
  const capture = ensureCaptureState(state);
  const now = new Date().toISOString();
  const fileAnchors = normalizeFileList(input.files || ((input.anchors || {}).files));
  const conceptAnchors = unique([
    ...collectList(input.concepts || ((input.anchors || {}).concepts)),
    ...inferConceptsFromFiles(fileAnchors)
  ]);
  const commitAnchors = collectList(input.commits || ((input.anchors || {}).commits));
  const dedupeWindowMinutes = options.dedupeWindowMinutes || 180;
  const duplicate = findRecentDuplicate(
    state,
    {
      ...input,
      files: fileAnchors,
      anchors: {
        files: fileAnchors,
        concepts: conceptAnchors,
        commits: commitAnchors
      }
    },
    dedupeWindowMinutes
  );

  if (duplicate) {
    duplicate.problem = firstNonEmpty(duplicate.problem, input.problem, input.task);
    duplicate.solution = firstNonEmpty(duplicate.solution, input.solution, input.summary);
    duplicate.root_cause = firstNonEmpty(duplicate.root_cause, input.root_cause);
    duplicate.tags = unique([...(duplicate.tags || []), ...collectList(input.tags)]);
    duplicate.techs = unique([...(duplicate.techs || []), ...collectList(input.techs)]);
    duplicate.relations = unique([...(duplicate.relations || []), ...collectList(input.relations)]);
    duplicate.anchors = {
      files: unique([...normalizeFileList((duplicate.anchors || {}).files), ...fileAnchors]),
      concepts: unique([...(((duplicate.anchors || {}).concepts) || []), ...conceptAnchors]),
      commits: unique([...(((duplicate.anchors || {}).commits) || []), ...commitAnchors])
    };
    duplicate.updated_at = now;
    duplicate.origin = {
      ...(duplicate.origin || {}),
      event: firstNonEmpty(input.event, (duplicate.origin || {}).event),
      task: truncate(firstNonEmpty(input.task, (duplicate.origin || {}).task), 240),
      summary: truncate(firstNonEmpty(input.summary, (duplicate.origin || {}).summary), 240)
    };
    recordCaptureEvent(state, {
      type: "capture_refreshed",
      candidate_id: duplicate.id
    });
    return { candidate: duplicate, created: false };
  }

  const candidate = {
    id: nextCandidateId(state),
    title: buildCandidateTitle(input),
    problem: firstNonEmpty(input.problem, input.task),
    solution: firstNonEmpty(input.solution, input.summary),
    root_cause: firstNonEmpty(input.root_cause),
    tags: collectList(input.tags),
    techs: collectList(input.techs),
    type: input.type || options.defaultType || "workflow",
    level: input.level || options.defaultLevel || "L1",
    confidence: input.confidence || options.defaultConfidence || "UNCERTAIN",
    status: input.status || options.defaultStatus || "NEEDS_REVIEW",
    source: input.source || "host/auto",
    project_scope: input.project_scope || "current-project",
    writer: input.writer || {},
    anchors: {
      files: fileAnchors,
      concepts: conceptAnchors,
      commits: commitAnchors
    },
    relations: collectList(input.relations),
    origin: {
      event: firstNonEmpty(input.event),
      task: truncate(firstNonEmpty(input.task), 240),
      summary: truncate(firstNonEmpty(input.summary), 240)
    },
    created_at: now,
    updated_at: now
  };

  capture.pending_candidates = [candidate, ...capture.pending_candidates].slice(0, options.pendingLimit || 20);
  recordCaptureEvent(state, {
    type: "capture_suggested",
    candidate_id: candidate.id
  });
  return { candidate, created: true };
}

function normalizeAllowedList(values) {
  return unique(collectList(values).map((item) => String(item).trim()).filter(Boolean));
}

function evaluateCandidateRisk(candidate, policy = {}, context = {}) {
  const reasons = [];
  const autoAccept = policy || {};
  const eventName = String(context.eventName || "").trim();
  const summaryLength = String(candidate.solution || "").trim().length;
  const hasFiles = (((candidate.anchors || {}).files) || []).length > 0;
  const hasConcepts = (((candidate.anchors || {}).concepts) || []).length > 0;
  const hasCommits = (((candidate.anchors || {}).commits) || []).length > 0;
  const hasTags = (candidate.tags || []).length > 0;
  const hasTechs = (candidate.techs || []).length > 0;
  const hasRelations = (candidate.relations || []).length > 0;
  const hasRootCause = Boolean(firstNonEmpty(candidate.root_cause));
  const hasProblem = Boolean(firstNonEmpty(candidate.problem));
  const hasSolution = Boolean(firstNonEmpty(candidate.solution));
  const allowedSources = normalizeAllowedList(autoAccept.allowedSources);
  const allowedTypes = normalizeAllowedList(autoAccept.allowedTypes);
  const allowedLevels = normalizeAllowedList(autoAccept.allowedLevels);
  const blockOnEvents = normalizeAllowedList(autoAccept.blockOnEvents);

  if (autoAccept.enabled === false) {
    reasons.push("auto-accept disabled");
  }

  if (blockOnEvents.length && (!eventName || !blockOnEvents.includes(eventName))) {
    reasons.push(`event ${eventName || "unknown"} not eligible for auto-accept`);
  }

  if (autoAccept.requireProblemAndSolution !== false && (!hasProblem || !hasSolution)) {
    reasons.push("candidate is missing problem or solution text");
  }

  if (autoAccept.requireFileAnchor !== false && !hasFiles) {
    reasons.push("candidate has no file anchor");
  }

  if (allowedSources.length && !allowedSources.includes(String(candidate.source || ""))) {
    reasons.push(`source ${candidate.source || "unknown"} not in auto-accept allowlist`);
  }

  if (allowedTypes.length && !allowedTypes.includes(String(candidate.type || ""))) {
    reasons.push(`type ${candidate.type || "unknown"} not in auto-accept allowlist`);
  }

  if (allowedLevels.length && !allowedLevels.includes(String(candidate.level || ""))) {
    reasons.push(`level ${candidate.level || "unknown"} not in auto-accept allowlist`);
  }

  if (Number.isFinite(autoAccept.maxSummaryLength) && summaryLength > autoAccept.maxSummaryLength) {
    reasons.push(`solution summary too long (${summaryLength} > ${autoAccept.maxSummaryLength})`);
  }

  if (autoAccept.blockIfTagsPresent !== false && hasTags) {
    reasons.push("candidate has tags and may be broader than a low-risk auto-accept");
  }

  if (autoAccept.blockIfTechsPresent !== false && hasTechs) {
    reasons.push("candidate has tech anchors and should be reviewed by a human");
  }

  if (autoAccept.blockIfRelationsPresent !== false && hasRelations) {
    reasons.push("candidate has explicit relations and should be reviewed by a human");
  }

  if (autoAccept.blockIfRootCausePresent !== false && hasRootCause) {
    reasons.push("candidate includes root cause analysis and should be reviewed by a human");
  }

  if (autoAccept.blockIfCommitsPresent !== false && hasCommits) {
    reasons.push("candidate includes commit anchors and should be reviewed by a human");
  }

  if (hasConcepts && hasConcepts > 3) {
    reasons.push("candidate has many concept anchors and may be too broad for auto-accept");
  }

  return {
    autoAcceptEligible: reasons.length === 0,
    riskLevel: reasons.length === 0 ? "low" : "high",
    reasons
  };
}

function removeCaptureCandidate(state, ref) {
  const capture = ensureCaptureState(state);
  const candidate = findCaptureCandidate(state, ref);
  if (!candidate) {
    return null;
  }

  capture.pending_candidates = capture.pending_candidates.filter((item) => item.id !== candidate.id);
  return candidate;
}

module.exports = {
  ensureCaptureState,
  collectList,
  normalizeFileList,
  truncate,
  firstNonEmpty,
  buildCandidateTitle,
  nextCandidateId,
  listCaptureCandidates,
  findCaptureCandidate,
  recordCaptureEvent,
  createCaptureCandidate,
  evaluateCandidateRisk,
  removeCaptureCandidate
};
