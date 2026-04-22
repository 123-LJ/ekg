const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const {
  normalizeProjectPath,
  registerProject,
  setActiveProject,
  getActiveProject,
  listProjects,
  resolveProjectForPath
} = require("../lib/project");

function ensureFile(filePath, content = "") {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, content);
}

module.exports = function runProjectTest() {
  const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), "ekg-project-"));
  const mallRoot = path.join(tmpRoot, "mall-app");
  const adminRoot = path.join(tmpRoot, "admin-app");
  const loginFile = path.join(mallRoot, "src", "views", "loginRedirect.vue");

  ensureFile(loginFile, "<template />\n");
  fs.mkdirSync(adminRoot, { recursive: true });

  const state = {};
  const mallProject = registerProject(state, {
    name: "Mall App",
    root: mallRoot,
    type: "vue",
    tags: ["mall", "h5"]
  });

  assert.equal(mallProject.id, "P001");
  assert.equal(mallProject.root, normalizeProjectPath(mallRoot));
  assert.deepEqual(mallProject.tags, ["mall", "h5"]);
  assert.equal(getActiveProject(state).id, "P001");

  const adminProject = registerProject(state, {
    name: "Admin App",
    root: adminRoot,
    type: "vue",
    tags: ["admin"]
  }, {
    activate: false
  });

  assert.equal(adminProject.id, "P002");
  assert.equal(listProjects(state).length, 2);
  assert.equal(getActiveProject(state).id, "P001");

  const activeByName = setActiveProject(state, "Admin App");
  assert.equal(activeByName.id, "P002");
  assert.equal(getActiveProject(state).id, "P002");

  setActiveProject(state, "P001");
  const relativeResolved = resolveProjectForPath(state, "src/views/loginRedirect.vue");
  assert.equal(relativeResolved.project.id, "P001");
  assert.equal(relativeResolved.matched_by, "active-project-existing-file");
  assert.equal(relativeResolved.resolved_file.endsWith("src/views/loginRedirect.vue"), true);

  const absoluteResolved = resolveProjectForPath(state, loginFile);
  assert.equal(absoluteResolved.project.id, "P001");
  assert.equal(absoluteResolved.matched_by, "absolute-root");

  state.projects.active_project_id = "";
  const uniqueRelativeResolved = resolveProjectForPath(state, "src/views/loginRedirect.vue");
  assert.equal(uniqueRelativeResolved.project.id, "P001");
  assert.equal(uniqueRelativeResolved.matched_by, "unique-relative-file");

  fs.rmSync(tmpRoot, { recursive: true, force: true });
};
