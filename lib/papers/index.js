const {
  unique,
  normalizeText,
  findCanonicalConcepts,
  suggestCanonicalConcepts
} = require("../core/utils");

const OPENALEX_API = "https://api.openalex.org/works";
const SEMANTIC_SCHOLAR_API = "https://api.semanticscholar.org/graph/v1/paper/search";

async function fetchJson(url, options = {}) {
  const fetchImpl = options.fetchImpl || globalThis.fetch;
  if (typeof fetchImpl !== "function") {
    throw new Error("fetch is not available in this environment");
  }

  const response = await fetchImpl(url, {
    headers: {
      Accept: "application/json",
      ...(options.headers || {})
    }
  });

  if (!response.ok) {
    throw new Error(`metadata request failed: ${response.status} ${response.statusText}`);
  }

  return response.json();
}

function buildPaperAliases(paper = {}) {
  return unique([
    paper.title,
    ...(paper.authors || []),
    paper.venue,
    ...(paper.topics || []),
    ...(paper.keywords || [])
  ].filter(Boolean));
}

function enrichPaperConcepts(paper, multilingualConfig = {}) {
  const aliases = unique([
    ...(paper.aliases || []),
    ...buildPaperAliases(paper)
  ]);
  const canonicalTerms = unique([
    ...(paper.canonical_terms || []),
    ...findCanonicalConcepts([
      paper.title,
      paper.abstract,
      paper.summary,
      ...(paper.topics || []),
      ...(paper.keywords || []),
      ...aliases
    ], multilingualConfig)
  ]);
  const suggestedCanonicalTerms = unique([
    ...(paper.suggested_canonical_terms || []),
    ...suggestCanonicalConcepts([
      paper.title,
      paper.abstract,
      paper.summary,
      ...(paper.topics || []),
      ...(paper.keywords || []),
      ...aliases
    ], multilingualConfig)
  ]).filter((item) => !canonicalTerms.includes(item));

  return {
    ...paper,
    aliases,
    canonical_terms: canonicalTerms,
    suggested_canonical_terms: suggestedCanonicalTerms
  };
}

function mapOpenAlexWorkToPaper(work, options = {}) {
  const authors = (work.authorships || [])
    .map((entry) => ((entry || {}).author || {}).display_name)
    .filter(Boolean);
  const topics = unique([
    ...((work.concepts || []).slice(0, 6).map((concept) => concept.display_name).filter(Boolean)),
    ...((work.topics || []).slice(0, 6).map((topic) => topic.display_name).filter(Boolean))
  ]);
  const keywords = unique([
    ...(work.keywords || []).map((keyword) => keyword.display_name || keyword).filter(Boolean),
    ...topics
  ]).slice(0, 10);
  const ids = work.ids || {};
  const paper = {
    title: work.display_name || "",
    abstract: work.abstract || work.display_name || "",
    summary: work.display_name || "",
    findings: "",
    limitations: "",
    notes: "",
    authors,
    topics,
    keywords,
    venue: (((work.primary_location || {}).source) || {}).display_name || "",
    year: String(work.publication_year || ""),
    url: work.primary_location?.landing_page_url || ids.openalex || work.id || "",
    doi: ids.doi ? String(ids.doi).replace(/^https?:\/\/doi\.org\//i, "") : "",
    arxiv_id: ids.arxiv ? String(ids.arxiv).split("/").slice(-1)[0] : "",
    source: "openalex/import",
    status: options.status || "ACTIVE",
    relations: unique(options.relations || [])
  };

  return enrichPaperConcepts(paper, options.multilingualConfig);
}

function mapSemanticScholarPaperToPaper(paper, options = {}) {
  const authors = (paper.authors || []).map((author) => author.name).filter(Boolean);
  const topics = unique([
    ...((paper.fieldsOfStudy || []).filter(Boolean)),
    ...((paper.s2FieldsOfStudy || []).map((field) => field.category).filter(Boolean))
  ]);
  const keywords = unique([
    ...(paper.fieldsOfStudy || []).filter(Boolean),
    ...topics
  ]);
  const externalIds = paper.externalIds || {};
  const nextPaper = {
    title: paper.title || "",
    abstract: paper.abstract || paper.title || "",
    summary: paper.abstract || paper.title || "",
    findings: "",
    limitations: "",
    notes: "",
    authors,
    topics,
    keywords,
    venue: paper.venue || "",
    year: String(paper.year || ""),
    url: paper.url || "",
    doi: externalIds.DOI || "",
    arxiv_id: externalIds.ArXiv || externalIds.ARXIV || "",
    source: "semanticscholar/import",
    status: options.status || "ACTIVE",
    relations: unique(options.relations || [])
  };

  return enrichPaperConcepts(nextPaper, options.multilingualConfig);
}

async function searchOpenAlexWorks(queryText, options = {}) {
  const limit = Math.max(1, Math.min(Number(options.limit || 5), 25));
  const url = new URL(OPENALEX_API);
  url.searchParams.set("search", queryText);
  url.searchParams.set("per-page", String(limit));
  url.searchParams.set("select", [
    "id",
    "display_name",
    "publication_year",
    "primary_location",
    "authorships",
    "concepts",
    "topics",
    "keywords",
    "ids"
  ].join(","));

  const data = await fetchJson(url.toString(), options);
  return (data.results || []).map((work) => mapOpenAlexWorkToPaper(work, options));
}

async function searchSemanticScholarPapers(queryText, options = {}) {
  const limit = Math.max(1, Math.min(Number(options.limit || 5), 25));
  const url = new URL(SEMANTIC_SCHOLAR_API);
  url.searchParams.set("query", queryText);
  url.searchParams.set("limit", String(limit));
  url.searchParams.set("fields", [
    "title",
    "abstract",
    "year",
    "venue",
    "authors",
    "fieldsOfStudy",
    "s2FieldsOfStudy",
    "url",
    "externalIds"
  ].join(","));

  const data = await fetchJson(url.toString(), options);
  return (data.data || []).map((paper) => mapSemanticScholarPaperToPaper(paper, options));
}

function findExistingPaper(index, incomingPaper = {}) {
  const nodes = (index.nodes || []).filter((node) => node.kind === "Paper");
  const normalizedTitle = normalizeText(incomingPaper.title);
  return nodes.find((paper) => {
    if (incomingPaper.doi && paper.doi && normalizeText(paper.doi) === normalizeText(incomingPaper.doi)) {
      return true;
    }
    if (incomingPaper.arxiv_id && paper.arxiv_id && normalizeText(paper.arxiv_id) === normalizeText(incomingPaper.arxiv_id)) {
      return true;
    }
    return normalizedTitle && normalizeText(paper.title) === normalizedTitle;
  }) || null;
}

function mergeImportedPaper(existingPaper, incomingPaper) {
  const now = new Date().toISOString();
  return enrichPaperConcepts({
    ...existingPaper,
    ...incomingPaper,
    id: existingPaper.id,
    aliases: unique([...(existingPaper.aliases || []), ...(incomingPaper.aliases || [])]),
    canonical_terms: unique([...(existingPaper.canonical_terms || []), ...(incomingPaper.canonical_terms || [])]),
    suggested_canonical_terms: unique([
      ...(existingPaper.suggested_canonical_terms || []),
      ...(incomingPaper.suggested_canonical_terms || [])
    ]),
    relations: unique([...(existingPaper.relations || []), ...(incomingPaper.relations || [])]),
    created_at: existingPaper.created_at,
    updated_at: now,
    paper_file: existingPaper.paper_file || ""
  }, {});
}

async function fetchPaperMetadata(options = {}) {
  const source = String(options.source || "openalex").trim().toLowerCase();
  const queryText = String(options.query || "").trim();
  if (!queryText) {
    throw new Error("paper-import requires --query");
  }

  const providerOptions = {
    ...options
  };
  const imported = source === "semanticscholar"
    ? await searchSemanticScholarPapers(queryText, providerOptions)
    : await searchOpenAlexWorks(queryText, providerOptions);

  return {
    source,
    query: queryText,
    imported
  };
}

function applyImportedPapers(runtime, payload = {}, options = {}) {
  const source = String(payload.source || options.source || "openalex").trim().toLowerCase();
  const queryText = String(payload.query || options.query || "").trim();
  const incomingItems = payload.results || (payload.imported || []).map((paper) => ({ paper }));
  const runtimeNodes = (runtime.index.nodes = runtime.index.nodes || []);
  const results = incomingItems.map((item) => {
    const paper = item.paper || item;
    const existing = findExistingPaper(runtime.index, paper);
    if (existing) {
      const nextPaper = mergeImportedPaper(existing, paper);
      const index = runtimeNodes.findIndex((node) => node.id === existing.id);
      runtimeNodes[index] = nextPaper;
      return {
        action: "updated",
        paper: nextPaper
      };
    }

    const now = new Date().toISOString();
    const nextPaper = {
      ...paper,
      kind: "Paper",
      id: options.nextPaperId(),
      created_at: now,
      updated_at: now
    };
    runtimeNodes.push(nextPaper);
    return {
      action: item.action || "created",
      paper: nextPaper
    };
  });

  return {
    source,
    query: queryText,
    count: results.length,
    results
  };
}

module.exports = {
  fetchJson,
  buildPaperAliases,
  enrichPaperConcepts,
  mapOpenAlexWorkToPaper,
  mapSemanticScholarPaperToPaper,
  searchOpenAlexWorks,
  searchSemanticScholarPapers,
  findExistingPaper,
  mergeImportedPaper,
  fetchPaperMetadata,
  applyImportedPapers
};
