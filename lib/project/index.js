const fs = require("node:fs");
const path = require("node:path");

function slashPath(filePath) {
  return String(filePath || "").replace(/\\/g, "/");
}

function normalizeProjectPath(filePath) {
  if (!filePath) {
    return "";
  }

  return slashPath(path.resolve(String(filePath).trim())).replace(/\/+$/u, "");
}

function compareProjectPath(filePath) {
  return normalizeProjectPath(filePath).toLowerCase();
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

  return fs.existsSync(path.join(project.root, targetPath));
}

function resolveProjectForPath(state, targetPath) {
  const projects = listProjects(state);
  const activeProject = getActiveProject(state);
  const normalizedTarget = slashPath(String(targetPath || "").trim());

  if (!normalizedTarget) {
    return {
      project: activeProject,
      matched_by: activeProject ? "active-project" : "none",
      target_path: normalizedTarget,
      candidate_count: activeProject ? 1 : 0,
      candidates: activeProject ? [activeProject] : []
    };
  }

  if (path.isAbsolute(normalizedTarget)) {
    const normalizedAbsolute = compareProjectPath(normalizedTarget);
    const matches = projects
      .filter((project) => {
        const root = compareProjectPath(project.root);
        return normalizedAbsolute === root || normalizedAbsolute.startsWith(`${root}/`);
      })
      .sort((left, right) => right.root.length - left.root.length);

    return {
      project: matches[0] || null,
      matched_by: matches[0] ? "absolute-root" : "none",
      target_path: normalizedTarget,
      candidate_count: matches.length,
      candidates: matches
    };
  }

  if (activeProject) {
    return {
      project: activeProject,
      matched_by: pathExistsInsideProject(activeProject, normalizedTarget)
        ? "active-project-existing-file"
        : "active-project",
      target_path: normalizedTarget,
      candidate_count: 1,
      candidates: [activeProject],
      resolved_file: slashPath(path.join(activeProject.root, normalizedTarget))
    };
  }

  const fileMatches = projects.filter((project) => pathExistsInsideProject(project, normalizedTarget));
  if (fileMatches.length === 1) {
    return {
      project: fileMatches[0],
      matched_by: "unique-relative-file",
      target_path: normalizedTarget,
      candidate_count: 1,
      candidates: fileMatches,
      resolved_file: slashPath(path.join(fileMatches[0].root, normalizedTarget))
    };
  }

  return {
    project: null,
    matched_by: fileMatches.length > 1 ? "ambiguous-relative-file" : "none",
    target_path: normalizedTarget,
    candidate_count: fileMatches.length,
    candidates: fileMatches
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
