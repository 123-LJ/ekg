const assert = require("node:assert/strict");
const {
  mapOpenAlexWorkToPaper,
  mapSemanticScholarPaperToPaper,
  fetchPaperMetadata,
  applyImportedPapers
} = require("../lib/papers");

module.exports = async function runPapersTest() {
  const multilingualConfig = {
    concepts: {
      "agent-memory": ["智能体记忆", "agent memory"],
      "auth-redirect": ["登录跳转", "signin redirect"]
    }
  };

  const openAlexPaper = mapOpenAlexWorkToPaper({
    display_name: "Agent memory graphs for coding",
    publication_year: 2026,
    primary_location: {
      landing_page_url: "https://example.com/openalex-paper",
      source: {
        display_name: "ICSE"
      }
    },
    authorships: [
      { author: { display_name: "Lin Chen" } }
    ],
    concepts: [
      { display_name: "Agent memory" }
    ],
    topics: [
      { display_name: "Coding agents" }
    ],
    keywords: [
      { display_name: "智能体记忆" }
    ],
    ids: {
      doi: "https://doi.org/10.1000/demo",
      arxiv: "https://arxiv.org/abs/2604.00001"
    }
  }, { multilingualConfig });
  assert.equal(openAlexPaper.canonical_terms.includes("agent-memory"), true);
  assert.equal(openAlexPaper.suggested_canonical_terms.length >= 0, true);
  assert.equal(openAlexPaper.doi, "10.1000/demo");

  const semanticScholarPaper = mapSemanticScholarPaperToPaper({
    title: "Signin redirect recovery",
    abstract: "Studies redirect handling.",
    year: 2025,
    venue: "FSE",
    authors: [{ name: "Alice Zhang" }],
    fieldsOfStudy: ["Authentication"],
    s2FieldsOfStudy: [{ category: "Routing" }],
    url: "https://example.com/ss-paper",
    externalIds: {
      DOI: "10.1000/ss-demo"
    }
  }, { multilingualConfig });
  assert.equal(semanticScholarPaper.authors[0], "Alice Zhang");

  const fetched = await fetchPaperMetadata({
    source: "openalex",
    query: "agent memory",
    multilingualConfig,
    fetchImpl: async () => ({
      ok: true,
      json: async () => ({
        results: [
          {
            display_name: "Agent memory graphs for coding",
            publication_year: 2026,
            primary_location: {
              landing_page_url: "https://example.com/openalex-paper",
              source: { display_name: "ICSE" }
            },
            authorships: [{ author: { display_name: "Lin Chen" } }],
            concepts: [{ display_name: "Agent memory" }],
            topics: [{ display_name: "Coding agents" }],
            keywords: [{ display_name: "智能体记忆" }],
            ids: { doi: "https://doi.org/10.1000/demo" }
          }
        ]
      })
    })
  });
  assert.equal(fetched.imported.length, 1);
  assert.equal(fetched.imported[0].canonical_terms.includes("agent-memory"), true);
  assert.equal(Array.isArray(fetched.imported[0].suggested_canonical_terms), true);

  const runtime = {
    index: {
      nodes: [],
      edges: []
    }
  };
  const applied = applyImportedPapers(runtime, fetched, {
    nextPaperId: () => `P${String(((runtime.index.nodes || []).length + 1)).padStart(3, "0")}`
  });
  assert.equal(applied.count, 1);
  assert.equal(runtime.index.nodes[0].id, "P001");
  assert.equal(runtime.index.nodes[0].canonical_terms.includes("agent-memory"), true);
  assert.equal(Array.isArray(runtime.index.nodes[0].suggested_canonical_terms), true);
};
