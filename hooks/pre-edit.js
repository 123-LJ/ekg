#!/usr/bin/env node

const fs = require("node:fs");
const process = require("node:process");
const {
  readJson,
  writeJson,
  parseArgs,
  loadRuntime,
  saveState,
  queryExperiences,
  withWriteLock
} = require("../lib");

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

function normalizePath(value) {
  return String(value || "").replace(/\\/g, "/").toLowerCase();
}

function pickTarget(parsed) {
  return (
    parsed.options.file ||
    parsed.positional[0] ||
    process.env.EKG_TARGET_FILE ||
    ""
  );
}

function pickTargetFromHookInput(input) {
  if (!input || typeof input !== "object") {
    return "";
  }

  return (
    input.file_path ||
    (input.tool_input && (input.tool_input.file_path || input.tool_input.path)) ||
    ""
  );
}

function wasRecentlyInjected(state, targetFile, experienceIds, windowMinutes) {
  const recent = state.hook && Array.isArray(state.hook.recent_injections)
    ? state.hook.recent_injections
    : [];
  const threshold = Date.now() - windowMinutes * 60 * 1000;
  const target = normalizePath(targetFile);

  return recent.some((entry) => {
    if (normalizePath(entry.target_file) !== target) {
      return false;
    }

    if (!entry.injected_at || Date.parse(entry.injected_at) < threshold) {
      return false;
    }

    return experienceIds.every((id) => entry.experience_ids.includes(id));
  });
}

function rememberInjection(state, targetFile, matches) {
  const hookState = state.hook || { recent_injections: [] };
  const nextEntry = {
    target_file: targetFile,
    experience_ids: matches.map((match) => match.experience.id),
    injected_at: new Date().toISOString()
  };

  hookState.recent_injections = [nextEntry, ...(hookState.recent_injections || [])].slice(0, 20);
  state.hook = hookState;
}

function shouldUseDetail(matches, parsed, threshold) {
  if (parsed.options.detail) {
    return true;
  }

  return matches.some(
    (match) => match.direct && match.experience.confidence === "CONFIRMED" && match.score >= threshold
  );
}

function formatAdditionalContext(level, targetFile, matches) {
  const lines = [
    `[EKG] ${level} match for ${targetFile}`,
    `[EKG] Found ${matches.length} relevant experience(s)`
  ];

  if (level === "Level 1") {
    matches.forEach((match) => {
      lines.push(`- ${match.experience.id}: ${match.experience.title}`);
    });
    lines.push('[EKG] Use /ekg query <keyword> (or `node scripts/ekg.js query "<keyword>"`) for details.');
    return lines.join("\n");
  }

  matches.forEach((match) => {
    lines.push(`- ${match.experience.id}: ${match.experience.title}`);
    lines.push(`  problem: ${match.experience.problem}`);
    lines.push(`  solution: ${match.experience.solution}`);
  });

  return lines.join("\n");
}

function formatOutput(level, targetFile, matches) {
  const lines = [
    `[EKG] ${level} match for ${targetFile}`,
    `[EKG] Found ${matches.length} relevant experience(s)`
  ];

  if (level === "Level 1") {
    matches.forEach((match) => {
      lines.push(`- ${match.experience.id}: ${match.experience.title}`);
      lines.push(`  reason: ${match.reasons.join("; ")}`);
    });
    lines.push('[EKG] Run `node scripts/ekg.js query "<keyword>"` for full details.');
    return lines.join("\n");
  }

  matches.forEach((match) => {
    lines.push(`- ${match.experience.id}: ${match.experience.title}`);
    lines.push(`  problem: ${match.experience.problem}`);
    lines.push(`  solution: ${match.experience.solution}`);
    lines.push(`  reason: ${match.reasons.join("; ")}`);
  });

  return lines.join("\n");
}

function main() {
  const hookInput = readHookInput();

  const parsed = parseArgs(process.argv.slice(2));
  const targetFile = hookInput ? pickTargetFromHookInput(hookInput) : pickTarget(parsed);
  if (!targetFile) {
    process.exit(0);
  }

  if (hookInput && hookInput.tool_name && !["Edit", "Write"].includes(String(hookInput.tool_name))) {
    process.exit(0);
  }

  const runtime = loadRuntime();
  const storagePaths = runtime.storagePaths;
  const stateFile = runtime.storagePaths.STATE_FILE;
  const config = runtime.config;
  const state = readJson(stateFile, runtime.state);
  const matches = queryExperiences(
    runtime.index,
    {
      text: targetFile,
      targetFile,
      mode: "hook",
      minScore: config.hook.minimumScore || 5
    },
    config.hook.maxInjectedExperiences || 3
  );

  if (!matches.length) {
    process.exit(0);
  }

  const matchIds = matches.map((match) => match.experience.id);
  if (
    !parsed.options.force &&
    wasRecentlyInjected(
      state,
      targetFile,
      matchIds,
      config.hook.dedupeWindowMinutes || 120
    )
  ) {
    process.exit(0);
  }

  const level = shouldUseDetail(
    matches,
    parsed,
    config.query.detailScoreThreshold || 8
  )
    ? "Level 2"
    : "Level 1";

  if (hookInput) {
    withWriteLock(runtime.config, "hook-pre-edit", () => {
      const latestState = readJson(stateFile, state);
      rememberInjection(latestState, targetFile, matches);
      saveState(runtime, latestState, { skipLock: true });
    });
    process.stdout.write(
      `${JSON.stringify(
        {
          additionalContext: formatAdditionalContext(level, targetFile, matches),
          suppressOutput: true
        },
        null,
        2
      )}\n`
    );
  } else {
    console.log(formatOutput(level, targetFile, matches));
    withWriteLock(runtime.config, "hook-pre-edit-cli", () => {
      const latestState = readJson(stateFile, state);
      rememberInjection(latestState, targetFile, matches);
      saveState(runtime, latestState, { skipLock: true });
    });
  }
}

main();
