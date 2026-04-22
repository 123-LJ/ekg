const assert = require("node:assert/strict");
const { queryExperiences } = require("../lib/query");

module.exports = function runQueryTest() {
  const index = {
    nodes: [
      {
        id: "E001",
        kind: "Experience",
        title: "Login redirect loop",
        problem: "Redirect loop after login.",
        solution: "Exclude callback path from guard.",
        root_cause: "Guard re-entered itself.",
        tags: ["auth", "redirect"],
        techs: ["vue-router"],
        status: "ACTIVE",
        anchors: {
          files: ["src/views/loginRedirect.vue"],
          concepts: ["loginRedirect", "beforeEach"]
        }
      },
      {
        id: "E002",
        kind: "Experience",
        title: "Footer navigation mismatch",
        problem: "Tabbar did not match product requirements.",
        solution: "Rebuild navigation.",
        root_cause: "",
        tags: ["h5", "navigation"],
        techs: ["vue"],
        status: "ACTIVE",
        anchors: {
          files: ["src/components/Footer.vue"],
          concepts: ["tabbar"]
        }
      }
    ]
  };

  const matches = queryExperiences(index, {
    text: "loginRedirect",
    targetFile: "src/views/loginRedirect.vue",
    mode: "hook",
    minScore: 1
  }, 3);

  assert.equal(matches.length > 0, true);
  assert.equal(matches[0].experience.id, "E001");
  assert.equal(matches[0].direct, true);
};
