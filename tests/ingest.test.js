const assert = require("node:assert/strict");
const {
  shouldIngestCommit,
  parseGitLogOutput,
  collectIngestCandidates,
  createIngestCaptureCandidates
} = require("../lib/ingest");

module.exports = function runIngestTest() {
  assert.equal(shouldIngestCommit({
    subject: "fix: repair redirect loop",
    body: ""
  }), true);
  assert.equal(shouldIngestCommit({
    subject: "docs: update readme",
    body: ""
  }), false);

  const parsed = parseGitLogOutput("abc123\x1ffix: repair login redirect\x1fguard loop\x1e");
  assert.equal(parsed.length, 1);
  assert.equal(parsed[0].hash, "abc123");
  assert.equal(parsed[0].subject, "fix: repair login redirect");

  const structured = collectIngestCandidates({
    source: "task",
    task: "修复登录重定向问题",
    summary: "排除回调页和当前触发路径",
    file: "src/views/loginRedirect.vue",
    tags: "auth,redirect"
  });
  assert.equal(structured.length, 1);
  assert.equal(structured[0].status, "NEEDS_REVIEW");
  assert.equal(structured[0].confidence, "UNCERTAIN");
  assert.equal(structured[0].source, "ingest/task");

  const state = {};
  const results = createIngestCaptureCandidates(state, {
    source: "task",
    task: "修复登录重定向问题",
    summary: "排除回调页和当前触发路径",
    file: "src/views/loginRedirect.vue"
  });
  assert.equal(results.length, 1);
  assert.equal(results[0].created, true);
  assert.equal(results[0].candidate.id, "C001");
  assert.equal(results[0].candidate.status, "NEEDS_REVIEW");
  assert.equal(results[0].candidate.source, "ingest/task");
};
