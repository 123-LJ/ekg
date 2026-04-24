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

function computeStats(experiences) {
  const stats = {
    experience_count: experiences.length,
    active_count: 0,
    needs_review_count: 0,
    stale_count: 0,
    archived_count: 0,
    tag_count: 0,
    tech_count: 0
  };

  const tags = new Set();
  const techs = new Set();

  experiences.forEach((experience) => {
    if (experience.status === "ACTIVE") {
      stats.active_count += 1;
    } else if (experience.status === "NEEDS_REVIEW") {
      stats.needs_review_count += 1;
    } else if (experience.status === "STALE") {
      stats.stale_count += 1;
    } else if (experience.status === "ARCHIVED") {
      stats.archived_count += 1;
    }

    (experience.tags || []).forEach((tag) => tags.add(tag));
    (experience.techs || []).forEach((tech) => techs.add(tech));
  });

  stats.tag_count = tags.size;
  stats.tech_count = techs.size;
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

function buildIndexes(experiences) {
  const indexes = {
    by_tag: {},
    by_tech: {},
    by_file: {},
    by_status: {},
    by_level: {}
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

  return indexes;
}

function refreshIndex(index) {
  const experiences = getExperiences(index);
  const stageMeta = buildStageMetadata(index.stage);
  index.version = index.version || "1.0.0";
  index.stage = stageMeta.stage;
  index.stage_label = stageMeta.label;
  index.stage_summary = stageMeta.summary;
  index.generated_at = new Date().toISOString();
  index.stats = computeStats(experiences);
  index.indexes = buildIndexes(experiences);
  return index;
}

function refreshState(state, index) {
  const stats = index.stats || computeStats(getExperiences(index));
  const stageMeta = buildStageMetadata(state.stage || index.stage);
  state.version = state.version || "1.0.0";
  state.stage = stageMeta.stage;
  state.stage_label = stageMeta.label;
  state.stage_summary = stageMeta.summary;
  state.last_build_at = new Date().toISOString();
  state.counters = {
    experiences: stats.experience_count || 0,
    active: stats.active_count || 0,
    needs_review: stats.needs_review_count || 0,
    stale: stats.stale_count || 0,
    archived: stats.archived_count || 0
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
  lines.push("anchors:");
  buildMarkdownFrontmatterArray(lines, "  files", ((experience.anchors || {}).files) || []);
  buildMarkdownFrontmatterArray(lines, "  concepts", ((experience.anchors || {}).concepts) || []);
  buildMarkdownFrontmatterArray(lines, "relations", experience.relations || []);
  lines.push(`created_at: ${experience.created_at}`);
  lines.push(`updated_at: ${experience.updated_at}`);
  lines.push("---", "", "## Problem", "", experience.problem, "", "## Solution", "", experience.solution);

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

function getExperienceById(index, id) {
  return getExperiences(index).find((experience) => experience.id === id);
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

module.exports = {
  getExperiences,
  computeStats,
  refreshIndex,
  refreshState,
  slugFromTitle,
  nextExperienceId,
  renderExperienceMarkdown,
  writeExperienceFile,
  getExperienceById,
  resolveExperienceRef
};
