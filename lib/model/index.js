const fs = require("node:fs");
const path = require("node:path");
const {
  ROOT_DIR
} = require("../core/paths");
const {
  buildStageMetadata
} = require("../core/stage");
const {
  normalizeText,
  unique
} = require("../core/utils");

function getExperiences(index) {
  return (index.nodes || []).filter((node) => node.kind === "Experience");
}

function getPapers(index) {
  return (index.nodes || []).filter((node) => node.kind === "Paper");
}

function computeStats(experiences, papers = []) {
  const stats = {
    experience_count: experiences.length,
    paper_count: 0,
    active_count: 0,
    needs_review_count: 0,
    stale_count: 0,
    archived_count: 0,
    superseded_count: 0,
    tag_count: 0,
    tech_count: 0,
    topic_count: 0,
    author_count: 0
  };

  const tags = new Set();
  const techs = new Set();
  const topics = new Set();
  const authors = new Set();

  experiences.forEach((experience) => {
    if (experience.status === "ACTIVE") {
      stats.active_count += 1;
    } else if (experience.status === "NEEDS_REVIEW") {
      stats.needs_review_count += 1;
    } else if (experience.status === "STALE") {
      stats.stale_count += 1;
    } else if (experience.status === "ARCHIVED") {
      stats.archived_count += 1;
    } else if (experience.status === "SUPERSEDED") {
      stats.superseded_count += 1;
    }

    (experience.tags || []).forEach((tag) => tags.add(tag));
    (experience.techs || []).forEach((tech) => techs.add(tech));
  });

  papers.forEach((paper) => {
    (paper.topics || []).forEach((topic) => topics.add(topic));
    (paper.authors || []).forEach((author) => authors.add(author));
  });

  stats.paper_count = papers.length;
  stats.tag_count = tags.size;
  stats.tech_count = techs.size;
  stats.topic_count = topics.size;
  stats.author_count = authors.size;
  return stats;
}

function pushIndexValue(bucket, key, value) {
  if (!key) {
    return;
  }

  const normalizedKey = String(key);
  bucket[normalizedKey] = bucket[normalizedKey] || [];
  if (!bucket[normalizedKey].includes(value)) {
    bucket[normalizedKey].push(value);
  }
}

function buildIndexes(experiences, papers = []) {
  const indexes = {
    by_tag: {},
    by_tech: {},
    by_file: {},
    by_status: {},
    by_level: {},
    by_topic: {},
    by_author: {},
    by_venue: {}
  };

  experiences.forEach((experience) => {
    (experience.tags || []).forEach((tag) => pushIndexValue(indexes.by_tag, tag, experience.id));
    (experience.techs || []).forEach((tech) => pushIndexValue(indexes.by_tech, tech, experience.id));
    (((experience.anchors || {}).files) || []).forEach((file) => {
      pushIndexValue(indexes.by_file, file, experience.id);
    });
    pushIndexValue(indexes.by_status, experience.status, experience.id);
    pushIndexValue(indexes.by_level, experience.level, experience.id);
  });

  papers.forEach((paper) => {
    (paper.topics || []).forEach((topic) => pushIndexValue(indexes.by_topic, topic, paper.id));
    (paper.authors || []).forEach((author) => pushIndexValue(indexes.by_author, author, paper.id));
    pushIndexValue(indexes.by_venue, paper.venue || "", paper.id);
  });

  return indexes;
}

function refreshIndex(index) {
  const experiences = getExperiences(index);
  const papers = getPapers(index);
  const stageMeta = buildStageMetadata(index.stage);
  index.version = index.version || "1.0.0";
  index.stage = stageMeta.stage;
  index.stage_label = stageMeta.label;
  index.stage_summary = stageMeta.summary;
  index.generated_at = new Date().toISOString();
  index.stats = computeStats(experiences, papers);
  index.indexes = buildIndexes(experiences, papers);
  return index;
}

function refreshState(state, index) {
  const stats = index.stats || computeStats(getExperiences(index), getPapers(index));
  const stageMeta = buildStageMetadata(state.stage || index.stage);
  state.version = state.version || "1.0.0";
  state.stage = stageMeta.stage;
  state.stage_label = stageMeta.label;
  state.stage_summary = stageMeta.summary;
  state.last_build_at = new Date().toISOString();
  state.counters = {
    experiences: stats.experience_count || 0,
    papers: stats.paper_count || 0,
    active: stats.active_count || 0,
    needs_review: stats.needs_review_count || 0,
    stale: stats.stale_count || 0,
    archived: stats.archived_count || 0,
    superseded: stats.superseded_count || 0,
    topics: stats.topic_count || 0,
    authors: stats.author_count || 0
  };
  state.hook = state.hook || { recent_injections: [] };
  return state;
}

function slugFromTitle(title) {
  const slug = String(title || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40);

  return slug || "experience";
}

function nextExperienceId(index) {
  const maxNumber = getExperiences(index).reduce((maxValue, experience) => {
    const numericPart = Number(String(experience.id || "").replace(/^E/, ""));
    return Number.isFinite(numericPart) ? Math.max(maxValue, numericPart) : maxValue;
  }, 0);

  return `E${String(maxNumber + 1).padStart(3, "0")}`;
}

function nextPaperId(index) {
  const maxNumber = getPapers(index).reduce((maxValue, paper) => {
    const numericPart = Number(String(paper.id || "").replace(/^P/, ""));
    return Number.isFinite(numericPart) ? Math.max(maxValue, numericPart) : maxValue;
  }, 0);

  return `P${String(maxNumber + 1).padStart(3, "0")}`;
}

function buildMarkdownFrontmatterArray(lines, key, values) {
  lines.push(`${key}:`);
  values.forEach((value) => lines.push(`  - ${value}`));
}

function renderExperienceMarkdown(experience) {
  const lines = [
    "---",
    `id: ${experience.id}`,
    `type: ${experience.type}`,
    `title: ${experience.title}`,
    `level: ${experience.level}`,
    `confidence: ${experience.confidence}`,
    `status: ${experience.status}`,
    `source: ${experience.source}`,
    `project_scope: ${experience.project_scope}`
  ];

  buildMarkdownFrontmatterArray(lines, "tags", experience.tags || []);
  buildMarkdownFrontmatterArray(lines, "techs", experience.techs || []);
  buildMarkdownFrontmatterArray(lines, "aliases", experience.aliases || []);
  buildMarkdownFrontmatterArray(lines, "canonical_terms", experience.canonical_terms || []);
  buildMarkdownFrontmatterArray(lines, "suggested_canonical_terms", experience.suggested_canonical_terms || []);
  lines.push("anchors:");
  buildMarkdownFrontmatterArray(lines, "  files", ((experience.anchors || {}).files) || []);
  buildMarkdownFrontmatterArray(lines, "  concepts", ((experience.anchors || {}).concepts) || []);
  buildMarkdownFrontmatterArray(lines, "relations", experience.relations || []);
  lines.push(`created_at: ${experience.created_at}`);
  lines.push(`updated_at: ${experience.updated_at}`);
  lines.push("---");

  if (experience.symptom) {
    lines.push("", "## Symptom", "", experience.symptom);
  }

  lines.push("", "## Problem", "", experience.problem);

  if (experience.cause) {
    lines.push("", "## Cause", "", experience.cause);
  }

  lines.push("", "## Solution", "", experience.solution);

  if (experience.fix) {
    lines.push("", "## Fix", "", experience.fix);
  }

  if (experience.scope) {
    lines.push("", "## Scope", "", experience.scope);
  }

  if (experience.root_cause) {
    lines.push("", "## Root Cause", "", experience.root_cause);
  }

  return `${lines.join("\n")}\n`;
}

function writeExperienceFile(experience) {
  const relativePath = experience.experience_file || path.join(
    "experiences",
    `${experience.id}-${slugFromTitle(experience.title)}.md`
  ).replace(/\\/g, "/");
  const fullPath = path.join(ROOT_DIR, relativePath);
  fs.mkdirSync(path.dirname(fullPath), { recursive: true });
  fs.writeFileSync(fullPath, renderExperienceMarkdown(experience), "utf8");
  return path.relative(ROOT_DIR, fullPath).replace(/\\/g, "/");
}

function renderPaperMarkdown(paper) {
  const lines = [
    "---",
    `id: ${paper.id}`,
    "type: paper",
    `title: ${paper.title}`,
    `year: ${paper.year || ""}`,
    `venue: ${paper.venue || ""}`,
    `url: ${paper.url || ""}`,
    `doi: ${paper.doi || ""}`,
    `arxiv_id: ${paper.arxiv_id || ""}`,
    `source: ${paper.source || ""}`,
    `status: ${paper.status || "ACTIVE"}`,
    `created_at: ${paper.created_at}`,
    `updated_at: ${paper.updated_at}`
  ];

  buildMarkdownFrontmatterArray(lines, "authors", paper.authors || []);
  buildMarkdownFrontmatterArray(lines, "topics", paper.topics || []);
  buildMarkdownFrontmatterArray(lines, "keywords", paper.keywords || []);
  buildMarkdownFrontmatterArray(lines, "aliases", paper.aliases || []);
  buildMarkdownFrontmatterArray(lines, "canonical_terms", paper.canonical_terms || []);
  buildMarkdownFrontmatterArray(lines, "suggested_canonical_terms", paper.suggested_canonical_terms || []);
  buildMarkdownFrontmatterArray(lines, "relations", paper.relations || []);
  lines.push("---");

  if (paper.abstract) {
    lines.push("", "## Abstract", "", paper.abstract);
  }
  if (paper.summary) {
    lines.push("", "## Summary", "", paper.summary);
  }
  if (paper.findings) {
    lines.push("", "## Findings", "", paper.findings);
  }
  if (paper.limitations) {
    lines.push("", "## Limitations", "", paper.limitations);
  }
  if (paper.notes) {
    lines.push("", "## Notes", "", paper.notes);
  }

  return `${lines.join("\n")}\n`;
}

function writePaperFile(paper) {
  const relativePath = paper.paper_file || path.join(
    "papers",
    `${paper.id}-${slugFromTitle(paper.title)}.md`
  ).replace(/\\/g, "/");
  const fullPath = path.join(ROOT_DIR, relativePath);
  fs.mkdirSync(path.dirname(fullPath), { recursive: true });
  fs.writeFileSync(fullPath, renderPaperMarkdown(paper), "utf8");
  return path.relative(ROOT_DIR, fullPath).replace(/\\/g, "/");
}

function getExperienceById(index, id) {
  return getExperiences(index).find((experience) => experience.id === id);
}

function getPaperById(index, id) {
  return getPapers(index).find((paper) => paper.id === id);
}

function resolveExperienceRef(index, ref) {
  const normalized = normalizeText(ref);
  if (!normalized) {
    return null;
  }

  return getExperiences(index).find((experience) => {
    if (normalizeText(experience.id) === normalized) {
      return true;
    }

    if (normalizeText(experience.title) === normalized) {
      return true;
    }

    return normalizeText(experience.title).includes(normalized);
  }) || null;
}

function resolvePaperRef(index, ref) {
  const normalized = normalizeText(ref);
  if (!normalized) {
    return null;
  }

  return getPapers(index).find((paper) => {
    if (normalizeText(paper.id) === normalized) {
      return true;
    }

    if (normalizeText(paper.title) === normalized) {
      return true;
    }

    return normalizeText(paper.title).includes(normalized);
  }) || null;
}

module.exports = {
  getExperiences,
  getPapers,
  computeStats,
  refreshIndex,
  refreshState,
  slugFromTitle,
  nextExperienceId,
  nextPaperId,
  renderExperienceMarkdown,
  writeExperienceFile,
  renderPaperMarkdown,
  writePaperFile,
  getExperienceById,
  getPaperById,
  resolveExperienceRef,
  resolvePaperRef
};
