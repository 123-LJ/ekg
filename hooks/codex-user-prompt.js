#!/usr/bin/env node

const fs = require("node:fs");
const path = require("node:path");
const {
  loadRuntime,
  queryExperiences,
  getActiveProject,
  resolveProjectForPath
} = require("../lib");

const PROMPT_HINT_PATTERN = /(fix|bug|implement|add|edit|modify|refactor|debug|test|route|router|api|component|page|sql|database|hook|script|config|修复|实现|新增|修改|重构|排查|调试|测试|接口|页面|组件|路由|功能|需求)/iu;
const MANAGED_STORE_PATTERN = /(ekg-out[\\/](?:ekg\.sqlite|ekg\.json|state\.json)|\bekg\.json\b|\bstate\.json\b)/iu;

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

function firstNonEmpty(...values) {
  return values.find((value) => String(value || "").trim()) || "";
}

function slashPath(filePath) {
  return String(filePath || "").replace(/\\/g, "/");
}

function extractPrompt(input) {
  return firstNonEmpty(
    input && input.user_prompt,
    input && input.prompt,
    input && input.message,
    input && input.text
  );
}

function extractPromptTargetFile(prompt) {
  const matches = String(prompt || "").match(
    /[A-Za-z]:[\\/][^\s"'`]+|(?:\.{0,2}[\\/])?[A-Za-z0-9_\-\u4e00-\u9fa5./\\]+?\.[A-Za-z0-9]{1,10}/gu
  ) || [];
  return slashPath(matches[0] || "");
}

function isCodingPrompt(prompt) {
  return PROMPT_HINT_PATTERN.test(String(prompt || ""))
    || Boolean(extractPromptTargetFile(prompt));
}

function touchesManagedStore(prompt) {
  return MANAGED_STORE_PATTERN.test(slashPath(prompt));
}

function getPendingCandidates(runtime) {
  return ((((runtime || {}).state || {}).capture || {}).pending_candidates || []);
}

function buildProjectContextLines(runtime, targetFile) {
  const lines = [];
  const state = ((runtime || {}).state || {});
  const activeProject = getActiveProject(state);
  const resolved = targetFile
    ? resolveProjectForPath(state, targetFile)
    : {
        project: activeProject,
        matched_by: activeProject ? "active-project" : "none",
        resolved_file: ""
      };

  if (activeProject) {
    lines.push(`[EKG] Active project: ${activeProject.name} (${activeProject.id})`);
    lines.push(`[EKG] Active project root: ${activeProject.root}`);
  }

  if (resolved.project) {
    lines.push(
      `[EKG] Resolved project: ${resolved.project.name} (${resolved.project.id}) via ${resolved.matched_by}`
    );
    lines.push(`[EKG] Resolved project root: ${resolved.project.root}`);
    if (resolved.resolved_file) {
      lines.push(`[EKG] Resolved file path: ${resolved.resolved_file}`);
    }
    lines.push("[EKG] Avoid broad recursive scans outside the resolved project root unless that search fails.");
  } else if (targetFile && activeProject) {
    lines.push("[EKG] Search inside the active project root first before scanning outside the workspace.");
  }

  return {
    activeProject,
    resolved,
    lines
  };
}

function buildPromptMatchLines(runtime, prompt, targetFile) {
  const matches = queryExperiences(
    runtime.index,
    {
      text: prompt,
      targetFile,
      mode: "text",
      minScore: ((runtime.config || {}).hook || {}).minimumScore || 5
    },
    (((runtime.config || {}).hook || {}).maxInjectedExperiences || 3)
  );
  const detailThreshold = (((runtime.config || {}).query || {}).detailScoreThreshold || 8);
  const lines = [];

  if (!matches.length) {
    return { matches, lines };
  }

  lines.push(`[EKG] Found ${matches.length} prompt-aligned experience(s):`);
  matches.forEach((match) => {
    lines.push(`- ${match.experience.id}: ${match.experience.title}`);
    if (match.direct || match.score >= detailThreshold || match.experience.confidence === "CONFIRMED") {
      lines.push(`  solution: ${match.experience.solution}`);
    }
  });

  return { matches, lines };
}

function buildPromptContext(runtime, prompt) {
  const ekgRoot = slashPath(path.resolve(__dirname, ".."));
  const targetFile = extractPromptTargetFile(prompt);
  const { matches, lines: matchLines } = buildPromptMatchLines(runtime, prompt, targetFile);
  const projectContext = buildProjectContextLines(runtime, targetFile);
  const pending = getPendingCandidates(runtime);
  const lines = [
    "[EKG] Reminder: query prior experience before editing known files, features, or bug areas.",
    `[EKG] Query command: cd ${ekgRoot} && node scripts/ekg.js query "<keyword-or-file>"`
  ];

  if (targetFile) {
    lines.push(`[EKG] Prompt target hint: ${targetFile}`);
  }

  if (projectContext.lines.length) {
    lines.push(...projectContext.lines);
  }

  if (matchLines.length) {
    lines.push(...matchLines);
  } else if (isCodingPrompt(prompt)) {
    lines.push("[EKG] No direct experience match yet. Keep the EKG query step before editing.");
  }

  if (pending.length) {
    lines.push(`[EKG] Pending capture candidates: ${pending.length}`);
  }

  return {
    targetFile,
    matches,
    context: lines.join("\n")
  };
}

function buildBlockedPromptOutput() {
  const reason = "EKG managed store files must not be edited directly. Use the CLI/runtime commands instead.";
  return {
    continue: false,
    suppressOutput: true,
    stopReason: reason,
    systemMessage: reason,
    hookSpecificOutput: {
      hookEventName: "UserPromptSubmit",
      additionalContext: `[EKG] ${reason}`
    }
  };
}

function buildUserPromptOutput(runtime, prompt) {
  const built = buildPromptContext(runtime, prompt);
  return {
    continue: true,
    suppressOutput: true,
    hookSpecificOutput: {
      hookEventName: "UserPromptSubmit",
      additionalContext: built.context
    }
  };
}

function main() {
  const hookInput = readHookInput();
  const prompt = extractPrompt(hookInput);
  if (!prompt) {
    process.exit(0);
  }

  if (touchesManagedStore(prompt)) {
    process.stdout.write(`${JSON.stringify(buildBlockedPromptOutput(), null, 2)}\n`);
    return;
  }

  if (!isCodingPrompt(prompt)) {
    process.exit(0);
  }

  const runtime = loadRuntime();
  process.stdout.write(`${JSON.stringify(buildUserPromptOutput(runtime, prompt), null, 2)}\n`);
}

if (require.main === module) {
  main();
}

module.exports = {
  PROMPT_HINT_PATTERN,
  MANAGED_STORE_PATTERN,
  readHookInput,
  firstNonEmpty,
  slashPath,
  extractPrompt,
  extractPromptTargetFile,
  isCodingPrompt,
  touchesManagedStore,
  getPendingCandidates,
  buildProjectContextLines,
  buildPromptMatchLines,
  buildPromptContext,
  buildBlockedPromptOutput,
  buildUserPromptOutput,
  main
};
