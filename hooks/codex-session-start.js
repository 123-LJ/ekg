#!/usr/bin/env node

const fs = require("node:fs");
const path = require("node:path");
const {
  loadRuntime
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

function slashPath(filePath) {
  return String(filePath || "").replace(/\\/g, "/");
}

function getPendingCandidates(runtime) {
  return ((((runtime || {}).state || {}).capture || {}).pending_candidates || []);
}

function buildSessionStartContext(runtime) {
  const ekgRoot = slashPath(path.resolve(__dirname, ".."));
  const pending = getPendingCandidates(runtime);
  const lines = [
    "[EKG] Global workflow is active for this Codex session.",
    `[EKG] Query prior experience before editing known files/features: cd ${ekgRoot} && node scripts/ekg.js query "<keyword-or-file>"`,
    "[EKG] After a verified fix, create a capture candidate before promoting formal knowledge.",
    "[EKG] Never edit ekg-out/ekg.sqlite, ekg.json, or state.json directly."
  ];

  if (pending.length) {
    lines.push(`[EKG] Pending capture candidates: ${pending.length}`);
    pending.slice(0, 3).forEach((candidate) => {
      lines.push(`- ${candidate.id}: ${candidate.title}`);
    });
  }

  return lines.join("\n");
}

function buildSessionStartOutput(runtime) {
  return {
    continue: true,
    suppressOutput: true,
    hookSpecificOutput: {
      hookEventName: "SessionStart",
      additionalContext: buildSessionStartContext(runtime)
    }
  };
}

function main() {
  readHookInput();
  const runtime = loadRuntime();
  process.stdout.write(`${JSON.stringify(buildSessionStartOutput(runtime), null, 2)}\n`);
}

if (require.main === module) {
  main();
}

module.exports = {
  readHookInput,
  slashPath,
  getPendingCandidates,
  buildSessionStartContext,
  buildSessionStartOutput,
  main
};
