const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");
const {
  ROOT_DIR
} = require("../core/paths");
const {
  getExperiences,
  writeExperienceFile
} = require("../model");

function slashPath(filePath) {
  return String(filePath || "").replace(/\\/g, "/");
}

function resolveAnchorFile(filePath, projectRoot = ROOT_DIR) {
  if (!filePath) {
    return "";
  }

  return path.isAbsolute(filePath)
    ? path.resolve(filePath)
    : path.resolve(projectRoot || ROOT_DIR, filePath);
}

function hashFile(filePath) {
  return crypto.createHash("sha256").update(fs.readFileSync(filePath)).digest("hex");
}

function snapshotFile(filePath, projectRoot = ROOT_DIR) {
  const resolvedFile = resolveAnchorFile(filePath, projectRoot);
  if (!fs.existsSync(resolvedFile)) {
    return {
      file: slashPath(filePath),
      exists: false,
      resolved_file: slashPath(resolvedFile)
    };
  }

  const stat = fs.statSync(resolvedFile);
  if (!stat.isFile()) {
    return {
      file: slashPath(filePath),
      exists: false,
      resolved_file: slashPath(resolvedFile),
      reason: "not-a-file"
    };
  }

  return {
    file: slashPath(filePath),
    exists: true,
    resolved_file: slashPath(resolvedFile),
    size: stat.size,
    mtime_ms: Math.round(stat.mtimeMs),
    sha256: hashFile(resolvedFile)
  };
}

function ensureAnchorSnapshots(experience, projectRoot = ROOT_DIR) {
  const anchors = experience.anchors || {};
  const files = Array.isArray(anchors.files) ? anchors.files : [];
  const snapshots = {};

  files.forEach((file) => {
    snapshots[slashPath(file)] = snapshotFile(file, projectRoot);
  });

  experience.anchors = {
    ...anchors,
    file_snapshots: {
      ...(anchors.file_snapshots || {}),
      ...snapshots
    }
  };

  return snapshots;
}

function detectExperienceStaleness(experience, projectRoot = ROOT_DIR) {
  const anchors = experience.anchors || {};
  const files = Array.isArray(anchors.files) ? anchors.files : [];
  const baselines = anchors.file_snapshots || {};
  const findings = [];

  files.forEach((file) => {
    const normalizedFile = slashPath(file);
    const baseline = baselines[normalizedFile];
    const current = snapshotFile(file, projectRoot);

    if (!current.exists) {
      findings.push({
        experience_id: experience.id,
        file: normalizedFile,
        reason: "missing-file",
        baseline: baseline || null,
        current
      });
      return;
    }

    if (!baseline) {
      return;
    }

    if (baseline.sha256 && current.sha256 && baseline.sha256 !== current.sha256) {
      findings.push({
        experience_id: experience.id,
        file: normalizedFile,
        reason: "content-changed",
        baseline,
        current
      });
    }
  });

  return findings;
}

function detectStaleExperiences(index, options = {}) {
  const projectRoot = options.projectRoot || ROOT_DIR;
  return getExperiences(index).flatMap((experience) => detectExperienceStaleness(experience, projectRoot));
}

function updateAnchorBaselines(index, options = {}) {
  const projectRoot = options.projectRoot || ROOT_DIR;
  const changed = [];

  getExperiences(index).forEach((experience) => {
    const snapshots = ensureAnchorSnapshots(experience, projectRoot);
    if (Object.keys(snapshots).length) {
      experience.updated_at = new Date().toISOString();
      if (!options.skipExperienceFile) {
        experience.experience_file = writeExperienceFile(experience);
      }
      changed.push({
        experience_id: experience.id,
        snapshot_count: Object.keys(snapshots).length
      });
    }
  });

  return changed;
}

function markStaleFindings(index, findings, options = {}) {
  const now = new Date().toISOString();
  const changedIds = new Set();

  getExperiences(index).forEach((experience) => {
    const related = findings.filter((finding) => finding.experience_id === experience.id);
    if (!related.length) {
      return;
    }

    if (experience.status !== "ARCHIVED") {
      experience.status = options.status || "NEEDS_REVIEW";
      experience.updated_at = now;
      experience.stale_findings = related.map((finding) => ({
        file: finding.file,
        reason: finding.reason,
        checked_at: now
      }));
      if (!options.skipExperienceFile) {
        experience.experience_file = writeExperienceFile(experience);
      }
      changedIds.add(experience.id);
    }
  });

  return [...changedIds];
}

module.exports = {
  slashPath,
  resolveAnchorFile,
  snapshotFile,
  ensureAnchorSnapshots,
  detectExperienceStaleness,
  detectStaleExperiences,
  updateAnchorBaselines,
  markStaleFindings
};
