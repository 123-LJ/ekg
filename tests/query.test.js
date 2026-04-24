const assert = require("node:assert/strict");
const {
  queryExperiences,
  queryPapers,
  traceExperiences,
  scoreSemanticExperience,
  scoreSemanticPaper,
  buildExperienceEvolutionMaps
} = require("../lib/query");

module.exports = function runQueryTest() {
  const index = {
    nodes: [
      {
        id: "E001",
        kind: "Experience",
        title: "Login redirect loop",
        symptom: "Login succeeds but the page jumps away.",
        problem: "Redirect loop after login.",
        cause: "Route guard handles callback as a protected page.",
        solution: "Exclude callback path from guard.",
        fix: "Short-circuit the callback route before auth fallback.",
        scope: "Affects the login redirect and auth guard flow.",
        root_cause: "Guard re-entered itself.",
        tags: ["auth", "redirect"],
        aliases: ["\u767b\u5f55\u8df3\u8f6c", "\u8ba4\u8bc1\u8df3\u8f6c"],
        canonical_terms: ["auth-redirect"],
        techs: ["vue-router"],
        status: "ACTIVE",
        anchors: {
          files: ["src/views/loginRedirect.vue"],
          concepts: ["loginRedirect", "beforeEach"]
        },
        relations: ["causes:E003"]
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
        },
        relations: []
      },
      {
        id: "E003",
        kind: "Experience",
        title: "Token refresh fallback redirect",
        symptom: "After refresh failure the app falls back to a generic route.",
        problem: "Refresh failure sends users to the default page.",
        cause: "Refresh handler skipped auth callback state.",
        solution: "Check callback redirect before fallback.",
        fix: "Preserve callback state during token refresh.",
        scope: "Touches refresh guard and callback redirect handling.",
        root_cause: "Refresh handler skipped auth callback state.",
        tags: ["auth", "token"],
        techs: ["vue-router"],
        status: "ACTIVE",
        anchors: {
          files: ["src/auth/refreshGuard.ts"],
          concepts: ["refreshGuard", "callbackRedirect"]
        },
        relations: ["blocked-by:E001"]
      },
      {
        id: "E004",
        kind: "Experience",
        title: "Login redirect loop v2",
        problem: "Old callback exclusion was too narrow.",
        solution: "Exclude callback path and preserve callback state.",
        root_cause: "Old guard fix did not handle refresh state.",
        tags: ["auth", "redirect"],
        techs: ["vue-router"],
        status: "ACTIVE",
        anchors: {
          files: ["src/views/loginRedirect.vue"],
          concepts: ["loginRedirect", "callbackRedirect"]
        },
        relations: ["supersedes:E001"]
      },
      {
        id: "P001",
        kind: "Paper",
        title: "Callback-aware authentication routing",
        abstract: "This paper studies redirect-safe callback handling in authentication flows.",
        summary: "Explains why callback routes should be handled before generic auth fallback logic.",
        findings: "Callback-aware routing reduces redirect loops during sign-in.",
        limitations: "Focuses on SPA routing instead of server-side auth.",
        authors: ["Alice Zhang", "Bo Li"],
        topics: ["authentication", "routing"],
        keywords: ["callback", "redirect", "signin"],
        aliases: ["\u8ba4\u8bc1\u8df3\u8f6c", "\u767b\u5f55\u91cd\u5b9a\u5411"],
        canonical_terms: ["auth-redirect"],
        venue: "ICSE",
        year: "2025",
        status: "ACTIVE",
        relations: ["fixes:E001"]
      }
    ],
    edges: []
  };

  const matches = queryExperiences(index, {
    text: "loginRedirect",
    targetFile: "src/views/loginRedirect.vue",
    mode: "hook",
    minScore: 1
  }, 3);

  assert.equal(matches.length > 0, true);
  assert.equal(matches[0].experience.id, "E004");
  assert.equal(matches[0].direct, true);
  assert.equal(matches.some((match) => match.experience.id === "E001"), true);
  assert.equal(matches.find((match) => match.experience.id === "E001").reasons.some((reason) => reason.includes("superseded by")), true);

  const semanticOnlyMatches = queryExperiences(index, {
    text: "signin reroute failure",
    minScore: 1,
    semanticConfig: {
      enabled: true,
      minimumScore: 0.1,
      scoreWeight: 10
    }
  }, 3);

  assert.equal(semanticOnlyMatches.length > 0, true);
  assert.equal(["E001", "E003"].includes(semanticOnlyMatches[0].experience.id), true);
  assert.equal(semanticOnlyMatches[0].semanticScore > 0, true);
  assert.equal(semanticOnlyMatches[0].reasons.some((reason) => reason.includes("semantic")), true);

  const semanticScore = scoreSemanticExperience(index.nodes[0], {
    text: "signin reroute callback",
    semanticConfig: {
      enabled: true
    }
  });
  assert.equal(semanticScore.semanticScore > 0, true);

  const evolution = buildExperienceEvolutionMaps(index);
  assert.equal(evolution.supersededBy.get("E001")[0], "E004");
  assert.equal(evolution.supersedes.get("E004")[0], "E001");

  const paperMatches = queryPapers(index, {
    text: "signin callback routing research",
    minScore: 1
  }, 3);
  assert.equal(paperMatches.length > 0, true);
  assert.equal(paperMatches[0].paper.id, "P001");

  const multilingualPaperMatches = queryPapers(index, {
    text: "\u767b\u5f55\u8df3\u8f6c \u8ba4\u8bc1\u91cd\u5b9a\u5411",
    minScore: 1,
    semanticConfig: {
      enabled: true,
      multilingual: {
        enabled: true,
        concepts: {
          "auth-redirect": ["\u767b\u5f55\u8df3\u8f6c", "\u8ba4\u8bc1\u91cd\u5b9a\u5411", "authentication redirect", "signin redirect"]
        }
      }
    }
  }, 3);
  assert.equal(multilingualPaperMatches.length > 0, true);
  assert.equal(multilingualPaperMatches[0].paper.id, "P001");

  const paperSemanticScore = scoreSemanticPaper(index.nodes[3], {
    text: "sign-in reroute study",
    semanticConfig: {
      enabled: true
    }
  });
  assert.equal(paperSemanticScore.semanticScore > 0, true);

  const trace = traceExperiences(index, {
    text: "login redirect callback",
    minScore: 1
  }, {
    seedLimit: 2,
    pathLimit: 4,
    maxDepth: 4
  });

  assert.equal(trace.matches.length > 0, true);
  assert.equal(trace.traces.length > 0, true);
  assert.equal(trace.traces.some((item) => item.path_labels.join(" -> ").includes("E003: Token refresh fallback redirect")), true);
  assert.equal(trace.traces.some((item) => item.reasons.join("; ").includes("relation causes")), true);
  assert.equal(trace.traces.some((item) => item.summary.includes("likely cause")), true);
  assert.equal(trace.traces.some((item) => item.suggested_files.includes("src/auth/refreshGuard.ts")), true);
  assert.equal(trace.traces.some((item) => (item.relation_chain || []).includes("E001 causes E003")), true);
  assert.equal(trace.traces.some((item) => item.path_labels.join(" -> ").includes("E003: Token refresh fallback redirect")), true);
};
