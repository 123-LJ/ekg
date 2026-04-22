const fs = require("node:fs");
const path = require("node:path");

const WINDOWS_DRIVE_PATTERN = /^[A-Za-z]:/u;

function slashPath(filePath) {
  return String(filePath || "").replace(/\\/g, "/");
}

function normalizeProjectPath(filePath) {
  if (!filePath) {
    return "";
  }

  const resolvedPath = path.resolve(String(filePath).trim());
  const normalizedPath = slashPath(resolvedPath);
  const normalizedRoot = slashPath(path.parse(resolvedPath).root);

  if (normalizedPath === normalizedRoot) {
    return normalizedRoot || normalizedPath;
  }

  return normalizedPath.replace(/\/+$/u, "");
}

function compareProjectPath(filePath) {
  const normalizedPath = normalizeProjectPath(filePath);
  return process.platform === "win32"
    ? normalizedPath.toLowerCase()
    : normalizedPath;
}

function isProjectPathPrefix(rootPath, filePath) {
  const normalizedRoot = compareProjectPath(rootPath);
  const normalizedFile = compareProjectPath(filePath);

  if (!normalizedRoot || !normalizedFile) {
    return false;
  }

  return normalizedFile === normalizedRoot
    || normalizedFile.startsWith(normalizedRoot.endsWith("/") ? normalizedRoot : `${normalizedRoot}/`);
}

function resolvePathInsideProject(project, targetPath) {
  if (!project || !project.root || !targetPath) {
    return "";
  }

  const rawTarget = String(targetPath || "").trim();
  if (!rawTarget || path.isAbsolute(rawTarget) || WINDOWS_DRIVE_PATTERN.test(rawTarget)) {
    return "";
  }

  const resolvedFile = normalizeProjectPath(path.resolve(project.root, rawTarget));
  if (!resolvedFile || !isProjectPathPrefix(project.root, resolvedFile)) {
    return "";
  }

  return resolvedFile;
}

function ensureProjectsState(state) {
  state.projects = state.projects || {};
  state.projects.next_project_number = Number.isFinite(state.projects.next_project_number)
    ? state.projects.next_project_number
    : 1;
  state.projects.registry = Array.isArray(state.projects.registry)
    ? state.projects.registry
    : [];
  state.projects.active_project_id = String(state.projects.active_project_id || "").trim();
  return state.projects;
}

function listProjects(state) {
  return [...ensureProjectsState(state).registry];
}

function nextProjectId(state) {
  const projectsState = ensureProjectsState(state);
  const id = `P${String(projectsState.next_project_number).padStart(3, "0")}`;
  projectsState.next_project_number += 1;
  return id;
}

function findProject(state, ref) {
  const rawRef = String(ref || "").trim();
  const normalizedRef = rawRef.toLowerCase();
  if (!normalizedRef) {
    return null;
  }

  return listProjects(state).find((project) => {
    return String(project.id || "").toLowerCase() === normalizedRef
      || String(project.name || "").trim().toLowerCase() === normalizedRef
      || compareProjectPath(project.root) === compareProjectPath(rawRef);
  }) || null;
}

function getActiveProject(state) {
  const projectsState = ensureProjectsState(state);
  return findProject(state, projectsState.active_project_id) || null;
}

function touchProject(project) {
  project.last_used_at = new Date().toISOString();
  return project;
}

function registerProject(state, input = {}, options = {}) {
  const projectsState = ensureProjectsState(state);
  const name = String(input.name || "").trim();
  const root = normalizeProjectPath(input.root);

  if (!name) {
    throw new Error("project-register requires --name");
  }

  if (!root) {
    throw new Error("project-register requires --root");
  }

  if (!fs.existsSync(root) || !fs.statSync(root).isDirectory()) {
    throw new Error(`project root does not exist or is not a directory: ${root}`);
  }

  const now = new Date().toISOString();
  const normalizedRoot = compareProjectPath(root);
  let project = projectsState.registry.find((candidate) => {
    return compareProjectPath(candidate.root) === normalizedRoot;
  }) || null;

  if (project) {
    project.name = name;
    project.root = root;
    project.type = String(input.type || project.type || "").trim();
    project.tags = [...new Set([...(project.tags || []), ...((input.tags || []).filter(Boolean))])];
    project.updated_at = now;
  } else {
    project = {
      id: nextProjectId(state),
      name,
      root,
      type: String(input.type || "").trim(),
      tags: [...new Set((input.tags || []).filter(Boolean))],
      created_at: now,
      updated_at: now,
      last_used_at: ""
    };
    projectsState.registry.push(project);
  }

  if (options.activate !== false) {
    projectsState.active_project_id = project.id;
    touchProject(project);
  }

  return project;
}

function setActiveProject(state, ref) {
  const projectsState = ensureProjectsState(state);
  const project = findProject(state, ref);
  if (!project) {
    throw new Error(`project not found: ${ref}`);
  }

  projectsState.active_project_id = project.id;
  touchProject(project);
  return project;
}

function pathExistsInsideProject(project, targetPath) {
  if (!project || !project.root || !targetPath) {
    return false;
  }

  const resolvedFile = resolvePathInsideProject(project, targetPath);
  return Boolean(resolvedFile) && fs.existsSync(resolvedFile);
}

function resolveProjectForPath(state, targetPath) {
  const projects = listProjects(state);
  const activeProject = getActiveProject(state);
  const rawTarget = String(targetPath || "").trim();
  const normalizedTarget = slashPath(rawTarget);

  if (!normalizedTarget) {
    return {
      project: activeProject,
      matched_by: activeProject ? "active-project" : "none",
      target_path: normalizedTarget,
      candidate_count: activeProject ? 1 : 0,
      candidates: activeProject ? [activeProject] : []
    };
  }

  if (path.isAbsolute(rawTarget)) {
    const normalizedAbsolute = normalizeProjectPath(rawTarget);
    const matches = projects
      .filter((project) => {
        return isProjectPathPrefix(project.root, normalizedAbsolute);
      })
      .sort((left, right) => compareProjectPath(right.root).length - compareProjectPath(left.root).length);

    return {
      project: matches[0] || null,
      matched_by: matches[0] ? "absolute-root" : "none",
      target_path: normalizedTarget,
      candidate_count: matches.length,
      candidates: matches,
      resolved_file: matches[0] ? normalizedAbsolute : ""
    };
  }

  if (activeProject) {
    const resolvedActiveFile = resolvePathInsideProject(activeProject, rawTarget);
    if (!resolvedActiveFile) {
      return {
        project: null,
        matched_by: "none",
        target_path: normalizedTarget,
        candidate_count: 0,
        candidates: []
      };
    }

    return {
      project: activeProject,
      matched_by: fs.existsSync(resolvedActiveFile)
        ? "active-project-existing-file"
        : "active-project",
      target_path: normalizedTarget,
      candidate_count: 1,
      candidates: [activeProject],
      resolved_file: resolvedActiveFile
    };
  }

  const fileMatches = projects
    .map((project) => ({
      project,
      resolved_file: resolvePathInsideProject(project, rawTarget)
    }))
    .filter((entry) => entry.resolved_file && fs.existsSync(entry.resolved_file));

  if (fileMatches.length === 1) {
    return {
      project: fileMatches[0].project,
      matched_by: "unique-relative-file",
      target_path: normalizedTarget,
      candidate_count: 1,
      candidates: fileMatches.map((entry) => entry.project),
      resolved_file: fileMatches[0].resolved_file
    };
  }

  return {
    project: null,
    matched_by: fileMatches.length > 1 ? "ambiguous-relative-file" : "none",
    target_path: normalizedTarget,
    candidate_count: fileMatches.length,
    candidates: fileMatches.map((entry) => entry.project)
  };
}

module.exports = {
  slashPath,
  normalizeProjectPath,
  compareProjectPath,
  ensureProjectsState,
  listProjects,
  nextProjectId,
  findProject,
  getActiveProject,
  touchProject,
  registerProject,
  setActiveProject,
  pathExistsInsideProject,
  resolveProjectForPath
};
