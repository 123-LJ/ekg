const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const {
  updateAnchorBaselines,
  detectStaleExperiences,
  markStaleFindings
} = require("../lib/stale");

module.exports = function runStaleTest() {
  const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), "ekg-stale-"));
  const filePath = path.join(tmpRoot, "src", "views", "loginRedirect.vue");
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, "<template>v1</template>\n", "utf8");

  const index = {
    nodes: [
      {
        id: "E001",
        kind: "Experience",
        title: "Login redirect loop",
        problem: "loop",
        solution: "exclude callback",
        status: "ACTIVE",
        confidence: "CONFIRMED",
        level: "L1",
        tags: ["auth"],
        techs: ["vue"],
        source: "test",
        project_scope: "current-project",
        anchors: {
          files: ["src/views/loginRedirect.vue"],
          concepts: ["loginRedirect"],
          commits: []
        },
        created_at: "2026-04-22T00:00:00.000Z",
        updated_at: "2026-04-22T00:00:00.000Z",
        experience_file: ""
      }
    ],
    edges: []
  };

  const baseline = updateAnchorBaselines(index, {
    projectRoot: tmpRoot,
    skipExperienceFile: true
  });
  assert.equal(baseline.length, 1);
  assert.equal(Boolean(index.nodes[0].anchors.file_snapshots["src/views/loginRedirect.vue"].sha256), true);

  fs.writeFileSync(filePath, "<template>v2</template>\n", "utf8");
  const findings = detectStaleExperiences(index, { projectRoot: tmpRoot });
  assert.equal(findings.length, 1);
  assert.equal(findings[0].reason, "content-changed");

  const affected = markStaleFindings(index, findings, {
    status: "NEEDS_REVIEW",
    skipExperienceFile: true
  });
  assert.deepEqual(affected, ["E001"]);
  assert.equal(index.nodes[0].status, "NEEDS_REVIEW");

  fs.rmSync(tmpRoot, { recursive: true, force: true });
};
