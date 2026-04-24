const childProcess = require("node:child_process");
const {
  collectList,
  createCaptureCandidate,
  firstNonEmpty,
  truncate
} = require("../capture");
const {
  getWriterIdentity,
  unique
} = require("../core/utils");

const COMMIT_TRIGGER_PATTERN = /(^|\b)(fix|bug|hotfix|security|perf|refactor|feat)(\([^)]+\))?:|\b(bug|fix|fixed|fixes|hotfix|regression|crash|loop|issue)\b/iu;

function normalizeCommitSubject(subject) {
  return String(subject || "")
    .replace(/^(fix|bug|hotfix|security|perf|refactor|feat)(\([^)]+\))?:\s*/iu, "")
    .trim();
}

function inferExperienceType(text) {
  const normalized = String(text || "").toLowerCase();
  if (/\b(fix|bug|hotfix|regression|crash|loop|issue)\b/u.test(normalized)) {
    return "bug-fix";
  }

  if (/\b(feat|feature|decision|design)\b/u.test(normalized)) {
    return "decision";
  }

  if (/\b(refactor|cleanup|perf)\b/u.test(normalized)) {
    return "workflow";
  }

  return "workflow";
}

function shouldIngestCommit(commit) {
  const text = [commit.subject, commit.body].filter(Boolean).join("\n");
  return COMMIT_TRIGGER_PATTERN.test(text);
}

function parseGitLogOutput(output) {
  return String(output || "")
    .split("\x1e")
    .map((chunk) => chunk.trim())
    .filter(Boolean)
    .map((chunk) => {
      const [hash = "", subject = "", body = ""] = chunk.split("\x1f");
      return {
        hash: hash.trim(),
        subject: subject.trim(),
        body: body.trim()
      };
    })
    .filter((commit) => commit.hash && commit.subject);
}

function readGitCommits(options = {}) {
  const cwd = options.cwd || process.cwd();
  const limit = Number.parseInt(options.limit || 20, 10);
  const args = ["log", `--format=%H%x1f%s%x1f%b%x1e`, `-${Number.isFinite(limit) ? limit : 20}`];

  if (options.since) {
    args.splice(1, 0, `${String(options.since)}..HEAD`);
  }

  if (options.commit) {
    args.splice(1, args.length - 1, "--format=%H%x1f%s%x1f%b%x1e", "-1", String(options.commit));
  }

  try {
    const output = childProcess.execFileSync("git", args, {
      cwd,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"]
    });
    return parseGitLogOutput(output);
  } catch {
    return [];
  }
}

function buildCandidateFromCommit(commit, input = {}) {
  const text = [commit.subject, commit.body].filter(Boolean).join("\n");
  const title = normalizeCommitSubject(commit.subject) || commit.subject;
  const summary = truncate(firstNonEmpty(commit.body, commit.subject), 240);

  return {
    title,
    problem: firstNonEmpty(input.problem, title),
    solution: firstNonEmpty(
      input.solution,
      input.summary,
      summary,
      "Review this commit and confirm the reusable fix before accepting."
    ),
    root_cause: input["root-cause"] || input.root_cause || "",
    tags: unique(["ingest", ...collectList(input.tags)]),
    techs: collectList(input.techs),
    files: collectList(input.file || input.files),
    commits: [commit.hash],
    type: input.type || inferExperienceType(text),
    level: input.level || "L1",
    confidence: "UNCERTAIN",
    status: "NEEDS_REVIEW",
    source: "ingest/git",
    event: "git-commit",
    task: commit.subject,
    summary,
    writer: getWriterIdentity({
      ...input,
      host: input.host || "ingest-cli"
    })
  };
}

function buildCandidateFromStructuredInput(input = {}) {
  const source = input.source || "task";
  const title = firstNonEmpty(input.title, input.problem, input.task, input.summary, input.message);
  const body = firstNonEmpty(input.summary, input.message, input.task, input.problem, title);

  if (!title && !body) {
    throw new Error("ingest requires --title/--task/--summary/--message, or git options such as --commit/--since");
  }

  return {
    title: title || body,
    problem: firstNonEmpty(input.problem, input.task, title, body),
    solution: firstNonEmpty(
      input.solution,
      input.summary,
      input.message,
      "Review this candidate and fill in the confirmed reusable solution before accepting."
    ),
    root_cause: input["root-cause"] || input.root_cause || "",
    tags: unique(["ingest", ...collectList(input.tags)]),
    techs: collectList(input.techs),
    files: collectList(input.file || input.files),
    commits: collectList(input.commit || input.commits),
    type: input.type || inferExperienceType(`${title}\n${body}`),
    level: input.level || "L1",
    confidence: "UNCERTAIN",
    status: "NEEDS_REVIEW",
    source: `ingest/${source}`,
    event: `ingest-${source}`,
    task: firstNonEmpty(input.task, title),
    summary: truncate(body, 240),
    writer: getWriterIdentity({
      ...input,
      host: input.host || "ingest-cli"
    })
  };
}

function collectIngestCandidates(input = {}, options = {}) {
  const source = input.source || "task";
  const wantsGit = source === "commit" || source === "git" || input.commit || input.since;

  if (wantsGit && !firstNonEmpty(input.message, input.summary, input.task, input.title, input.problem)) {
    return readGitCommits({
      cwd: options.cwd,
      since: input.since,
      commit: input.commit,
      limit: input.limit
    })
      .filter(shouldIngestCommit)
      .map((commit) => buildCandidateFromCommit(commit, input));
  }

  return [buildCandidateFromStructuredInput(input)];
}

function createIngestCaptureCandidates(state, input = {}, options = {}) {
  const candidates = collectIngestCandidates(input, options);
  return candidates.map((candidateInput) => createCaptureCandidate(state, candidateInput, {
    defaultType: candidateInput.type || "workflow",
    defaultLevel: candidateInput.level || "L1",
    defaultConfidence: "UNCERTAIN",
    defaultStatus: "NEEDS_REVIEW",
    pendingLimit: options.pendingLimit || 50,
    dedupeWindowMinutes: options.dedupeWindowMinutes || 180
  }));
}

module.exports = {
  COMMIT_TRIGGER_PATTERN,
  normalizeCommitSubject,
  inferExperienceType,
  shouldIngestCommit,
  parseGitLogOutput,
  readGitCommits,
  buildCandidateFromCommit,
  buildCandidateFromStructuredInput,
  collectIngestCandidates,
  createIngestCaptureCandidates
};
