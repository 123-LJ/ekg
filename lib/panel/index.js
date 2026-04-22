const fs = require("node:fs");
const path = require("node:path");
const childProcess = require("node:child_process");
const {
  ROOT_DIR
} = require("../core/paths");
const {
  getStorageBackendName
} = require("../storage");
const {
  computeStats,
  getExperiences
} = require("../model");
const {
  getActiveProject,
  listProjects
} = require("../project");
const {
  listCaptureCandidates
} = require("../capture");
const {
  buildKnowledgeGraph,
  describeGraphNode
} = require("../graph");

function slashPath(filePath) {
  return String(filePath || "").replace(/\\/g, "/");
}

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function formatDate(value) {
  if (!value) {
    return "n/a";
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return String(value);
  }

  return date.toISOString().replace("T", " ").slice(0, 19);
}

function normalizeOutputFile(runtime, outputPath) {
  if (outputPath) {
    const resolved = path.resolve(ROOT_DIR, outputPath);
    return path.extname(resolved).toLowerCase() === ".html"
      ? resolved
      : path.join(resolved, "index.html");
  }

  const outputDir = ((runtime || {}).storagePaths || {}).OUTPUT_DIR || path.join(ROOT_DIR, "ekg-out");
  return path.join(outputDir, "panel", "index.html");
}

function countIndexBucket(indexBucket = {}) {
  return Object.entries(indexBucket)
    .map(([name, ids]) => ({
      name,
      count: Array.isArray(ids) ? ids.length : 0
    }))
    .sort((left, right) => right.count - left.count || left.name.localeCompare(right.name));
}

function pickRecentExperiences(experiences, limit = 12) {
  return [...experiences]
    .sort((left, right) => {
      const leftTime = Date.parse(left.updated_at || left.created_at || "") || 0;
      const rightTime = Date.parse(right.updated_at || right.created_at || "") || 0;
      return rightTime - leftTime || String(right.id).localeCompare(String(left.id));
    })
    .slice(0, limit);
}

function normalizeExperienceForPanel(experience) {
  return {
    id: experience.id,
    title: experience.title,
    problem: experience.problem,
    solution: experience.solution,
    root_cause: experience.root_cause || "",
    status: experience.status || "UNKNOWN",
    confidence: experience.confidence || "UNKNOWN",
    level: experience.level || "n/a",
    type: experience.type || "workflow",
    source: experience.source || "",
    project_scope: experience.project_scope || "",
    tags: [...(experience.tags || [])],
    techs: [...(experience.techs || [])],
    relations: [...(experience.relations || [])],
    anchors: {
      files: [...(((experience.anchors || {}).files) || [])],
      concepts: [...(((experience.anchors || {}).concepts) || [])],
      commits: [...(((experience.anchors || {}).commits) || [])]
    },
    created_at: experience.created_at || "",
    updated_at: experience.updated_at || "",
    experience_file: experience.experience_file || ""
  };
}

function buildExperienceRelationMap(experiences) {
  const relationsById = {};
  const normalized = experiences.map(normalizeExperienceForPanel);

  normalized.forEach((source) => {
    const related = normalized
      .filter((candidate) => candidate.id !== source.id)
      .map((candidate) => {
        const sharedTags = source.tags.filter((tag) => candidate.tags.includes(tag));
        const sharedTechs = source.techs.filter((tech) => candidate.techs.includes(tech));
        const sharedFiles = source.anchors.files.filter((file) => candidate.anchors.files.includes(file));
        const sharedConcepts = source.anchors.concepts.filter((concept) => candidate.anchors.concepts.includes(concept));
        const score = sharedTags.length * 3
          + sharedTechs.length * 2
          + sharedFiles.length * 4
          + sharedConcepts.length * 2;

        return score
          ? {
              id: candidate.id,
              title: candidate.title,
              score,
              shared_tags: sharedTags,
              shared_techs: sharedTechs,
              shared_files: sharedFiles,
              shared_concepts: sharedConcepts
            }
          : null;
      })
      .filter(Boolean)
      .sort((left, right) => right.score - left.score || left.id.localeCompare(right.id))
      .slice(0, 8);

    relationsById[source.id] = related;
  });

  return relationsById;
}

function inferNodeType(nodeId) {
  if (/^E\d+/u.test(nodeId)) {
    return "experience";
  }

  const prefix = String(nodeId || "").split(":")[0];
  if (["tag", "tech", "file", "concept"].includes(prefix)) {
    return prefix;
  }

  return "other";
}

function buildCytoscapeGraph(index) {
  const graph = buildKnowledgeGraph(index || {});
  const nodes = [...graph.nodes.keys()].map((nodeId) => {
    const node = graph.nodes.get(nodeId);
    const nodeType = inferNodeType(nodeId);
    const fullLabel = describeGraphNode(graph, nodeId);
    const shortLabel = nodeType === "experience"
      ? fullLabel.replace(/^E\d+:\s*/u, "")
      : fullLabel.replace(/^[a-z]+:\s*/u, "");

    return {
      data: {
        id: nodeId,
        label: fullLabel,
        shortLabel,
        nodeType,
        degree: (graph.adjacency.get(nodeId) || new Set()).size
      }
    };
  });

  const edges = [];
  const seen = new Set();
  [...graph.adjacency.keys()].forEach((from) => {
    [...(graph.adjacency.get(from) || [])].forEach((to) => {
      const key = [from, to].sort().join("::");
      if (seen.has(key)) {
        return;
      }

      seen.add(key);
      edges.push({
        data: {
          id: key,
          source: from,
          target: to
        }
      });
    });
  });

  return {
    nodes,
    edges
  };
}

function buildGraphSummary(index) {
  const graph = buildKnowledgeGraph(index || {});
  const nodeCount = graph.nodes.size;
  const edgeCount = [...graph.adjacency.values()].reduce((sum, neighbors) => sum + neighbors.size, 0) / 2;
  const topNodes = [...graph.nodes.keys()]
    .map((nodeId) => ({
      id: nodeId,
      label: describeGraphNode(graph, nodeId),
      degree: (graph.adjacency.get(nodeId) || new Set()).size
    }))
    .filter((node) => node.degree > 0)
    .sort((left, right) => right.degree - left.degree || left.label.localeCompare(right.label))
    .slice(0, 10);

  return {
    node_count: nodeCount,
    edge_count: edgeCount,
    top_nodes: topNodes
  };
}

function buildPanelViewModel(runtime) {
  const index = (runtime || {}).index || {};
  const state = (runtime || {}).state || {};
  const config = (runtime || {}).config || {};
  const experiences = getExperiences(index).map(normalizeExperienceForPanel);
  const stats = index.stats || computeStats(getExperiences(index));
  const projects = listProjects(state);
  const activeProject = getActiveProject(state);
  const pendingCandidates = listCaptureCandidates(state).map((candidate) => ({
    id: candidate.id,
    title: candidate.title,
    problem: candidate.problem || "",
    solution: candidate.solution || "",
    status: candidate.status || "UNKNOWN",
    confidence: candidate.confidence || "UNKNOWN",
    anchors: candidate.anchors || { files: [], concepts: [] }
  }));
  const pipeline = state.pipeline || {};

  return {
    generated_at: new Date().toISOString(),
    storage_backend: getStorageBackendName(config),
    stage: index.stage || state.stage || "n/a",
    stats,
    top_tags: countIndexBucket((index.indexes || {}).by_tag).slice(0, 12),
    top_techs: countIndexBucket((index.indexes || {}).by_tech).slice(0, 12),
    top_files: countIndexBucket((index.indexes || {}).by_file).slice(0, 10),
    recent_experiences: pickRecentExperiences(experiences),
    all_experiences: experiences,
    experience_relations: buildExperienceRelationMap(experiences),
    graph_summary: buildGraphSummary(index),
    graph_view: buildCytoscapeGraph(index),
    projects,
    active_project: activeProject,
    pending_candidates: pendingCandidates,
    pipeline: {
      name: pipeline.name || "ekg-build",
      started_at: pipeline.started_at || "",
      finished_at: pipeline.finished_at || "",
      stages: Array.isArray(pipeline.stages) ? pipeline.stages : []
    }
  };
}

function renderMetricCard(label, value, hint = "") {
  return [
    "<article class=\"metric-card\">",
    `  <div class="metric-label">${escapeHtml(label)}</div>`,
    `  <div class="metric-value">${escapeHtml(value)}</div>`,
    hint ? `  <div class="metric-hint">${escapeHtml(hint)}</div>` : "",
    "</article>"
  ].filter(Boolean).join("\n");
}

function renderPill(text, className = "") {
  return `<span class="pill ${escapeHtml(className)}">${escapeHtml(text)}</span>`;
}

function renderCountBars(items, emptyText, fillClass = "") {
  if (!items.length) {
    return `<div class="empty">${escapeHtml(emptyText)}</div>`;
  }

  const max = Math.max(...items.map((item) => item.count || item.degree), 1);
  return items.map((item) => {
    const numericValue = item.count ?? item.degree ?? 0;
    const width = Math.max(8, Math.round((numericValue / max) * 100));
    return [
      "<div class=\"bar-row\">",
      `  <div class="bar-label" title="${escapeHtml(item.name || item.label)}">${escapeHtml(item.name || item.label)}</div>`,
      "  <div class=\"bar-track\">",
      `    <div class="bar-fill ${escapeHtml(fillClass)}" style="width:${width}%"></div>`,
      "  </div>",
      `  <div class="bar-count">${escapeHtml(numericValue)}</div>`,
      "</div>"
    ].join("\n");
  }).join("\n");
}

function renderExperienceCard(experience) {
  const tags = (experience.tags || []).map((tag) => renderPill(tag, "tag")).join("");
  const techs = (experience.techs || []).map((tech) => renderPill(tech, "tech")).join("");
  const files = (((experience.anchors || {}).files) || []).slice(0, 3)
    .map((file) => `<code>${escapeHtml(file)}</code>`)
    .join("");
  const searchText = [
    experience.id,
    experience.title,
    experience.problem,
    experience.solution,
    ...(experience.tags || []),
    ...(experience.techs || []),
    ...experience.anchors.files,
    ...experience.anchors.concepts
  ].join(" ");

  return [
    `<article class="experience-card" data-experience-id="${escapeHtml(experience.id)}" data-search="${escapeHtml(searchText.toLowerCase())}">`,
    "  <div class=\"experience-head\">",
    `    <h3>${escapeHtml(experience.id)} · ${escapeHtml(experience.title)}</h3>`,
    "    <div class=\"experience-badges\">",
    `      ${renderPill(experience.status || "UNKNOWN", `status-${String(experience.status || "").toLowerCase()}`)}`,
    `      ${renderPill(experience.confidence || "UNKNOWN", "confidence")}`,
    "    </div>",
    "  </div>",
    `  <p class="problem">${escapeHtml(experience.problem)}</p>`,
    `  <p class="solution">${escapeHtml(experience.solution)}</p>`,
    "  <div class=\"meta-line\">",
    `    <span>Updated: ${escapeHtml(formatDate(experience.updated_at || experience.created_at))}</span>`,
    `    <span>Level: ${escapeHtml(experience.level || "n/a")}</span>`,
    "  </div>",
    tags || techs ? `  <div class="pill-row">${tags}${techs}</div>` : "",
    files ? `  <div class="file-row">${files}</div>` : "",
    "  <button class=\"ghost-button\" type=\"button\">Open details</button>",
    "</article>"
  ].filter(Boolean).join("\n");
}

function renderExperiences(experiences) {
  if (!experiences.length) {
    return "<div class=\"empty\">No experiences yet.</div>";
  }

  return experiences.map(renderExperienceCard).join("\n");
}

function renderProjects(projects, activeProject) {
  if (!projects.length) {
    return "<div class=\"empty\">No projects registered.</div>";
  }

  return [
    "<table>",
    "<thead><tr><th>ID</th><th>Name</th><th>Root</th><th>Type</th><th>Tags</th></tr></thead>",
    "<tbody>",
    ...projects.map((project) => {
      const activeMark = activeProject && activeProject.id === project.id ? " active-row" : "";
      return [
        `<tr class="${activeMark.trim()}">`,
        `<td>${escapeHtml(project.id)}</td>`,
        `<td>${escapeHtml(project.name)}${activeMark ? " ★" : ""}</td>`,
        `<td><code>${escapeHtml(project.root)}</code></td>`,
        `<td>${escapeHtml(project.type || "n/a")}</td>`,
        `<td>${escapeHtml((project.tags || []).join(", ") || "n/a")}</td>`,
        "</tr>"
      ].join("");
    }),
    "</tbody></table>"
  ].join("\n");
}

function renderCandidates(candidates) {
  if (!candidates.length) {
    return "<div class=\"empty\">No pending capture candidates.</div>";
  }

  return candidates.map((candidate) => [
    "<article class=\"candidate-card\">",
    `  <strong>${escapeHtml(candidate.id)} · ${escapeHtml(candidate.title)}</strong>`,
    `  <div>${renderPill(candidate.status || "UNKNOWN")} ${renderPill(candidate.confidence || "UNKNOWN")}</div>`,
    `  <p>${escapeHtml(candidate.solution || candidate.problem || "")}</p>`,
    `  <pre class="command-box">node scripts/ekg.js capture-accept ${escapeHtml(candidate.id)} --confirm</pre>`,
    "</article>"
  ].join("\n")).join("\n");
}

function renderPipeline(pipeline) {
  if (!pipeline.stages.length) {
    return "<div class=\"empty\">No pipeline run recorded.</div>";
  }

  return [
    `<div class="meta-line"><span>${escapeHtml(pipeline.name)}</span><span>Finished: ${escapeHtml(formatDate(pipeline.finished_at))}</span></div>`,
    "<ol class=\"pipeline-list\">",
    ...pipeline.stages.map((stage) => [
      "<li>",
      `  <span class="stage-name">${escapeHtml(stage.name)}</span>`,
      `  ${renderPill(stage.status || "unknown", stage.status === "ok" ? "ok" : "warn")}`,
      stage.message ? `  <small>${escapeHtml(stage.message)}</small>` : "",
      "</li>"
    ].join("\n")),
    "</ol>"
  ].join("\n");
}

function renderClientData(view) {
  return JSON.stringify(view)
    .replace(/</g, "\\u003c")
    .replace(/>/g, "\\u003e")
    .replace(/&/g, "\\u0026");
}

function generatePanelHtml(runtime) {
  const view = buildPanelViewModel(runtime);
  const stats = view.stats;
  const activeProjectLabel = view.active_project
    ? `${view.active_project.name} (${view.active_project.id})`
    : "Not selected";

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>EKG Panel</title>
  <script src="https://cdn.jsdelivr.net/npm/cytoscape@3.30.4/dist/cytoscape.min.js"></script>
  <style>
    :root {
      color-scheme: light;
      --bg: #f6f8fb;
      --card: #ffffff;
      --text: #172033;
      --muted: #637083;
      --line: #dfe6f0;
      --primary: #2563eb;
      --primary-soft: #e8f0ff;
      --green: #15803d;
      --yellow: #b45309;
      --red: #b91c1c;
      --purple: #7c3aed;
      --shadow: 0 10px 30px rgba(15, 23, 42, 0.08);
    }
    * { box-sizing: border-box; }
    body {
      margin: 0;
      font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      background: var(--bg);
      color: var(--text);
    }
    header {
      padding: 32px clamp(18px, 4vw, 56px);
      background: linear-gradient(135deg, #172033 0%, #1d4ed8 100%);
      color: #fff;
    }
    header h1 { margin: 0 0 8px; font-size: clamp(28px, 4vw, 44px); }
    header p { margin: 0; opacity: 0.86; }
    main { padding: 24px clamp(18px, 4vw, 56px) 48px; }
    .toolbar {
      display: flex;
      gap: 12px;
      align-items: center;
      justify-content: space-between;
      margin-bottom: 18px;
      flex-wrap: wrap;
    }
    .search, .inline-query, .graph-filter {
      min-width: min(420px, 100%);
      flex: 1;
      border: 1px solid var(--line);
      border-radius: 12px;
      padding: 12px 14px;
      font-size: 14px;
      outline: none;
      background: var(--card);
    }
    .tab-bar {
      display: inline-flex;
      gap: 8px;
      background: #edf3ff;
      padding: 6px;
      border-radius: 999px;
      margin-bottom: 18px;
      border: 1px solid #d7e2f4;
    }
    .tab-button {
      border: 0;
      padding: 10px 16px;
      border-radius: 999px;
      background: transparent;
      color: #334155;
      font-weight: 700;
      cursor: pointer;
      font-size: 13px;
    }
    .tab-button.active {
      background: #fff;
      color: #1d4ed8;
      box-shadow: var(--shadow);
    }
    .tab-panel { display: none; }
    .tab-panel.active { display: block; }
    .grid { display: grid; gap: 16px; }
    .metrics { grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); }
    .two-col { grid-template-columns: minmax(0, 1.15fr) minmax(320px, 0.85fr); }
    .three-col { grid-template-columns: repeat(auto-fit, minmax(260px, 1fr)); }
    .card, .metric-card, .experience-card, .candidate-card {
      background: var(--card);
      border: 1px solid var(--line);
      border-radius: 18px;
      box-shadow: var(--shadow);
    }
    .card { padding: 18px; }
    .metric-card { padding: 18px; }
    .metric-label { color: var(--muted); font-size: 13px; }
    .metric-value { font-size: 30px; font-weight: 800; margin-top: 6px; }
    .metric-hint { color: var(--muted); font-size: 12px; margin-top: 6px; }
    h2 { margin: 0 0 14px; font-size: 18px; }
    .subheading {
      color: var(--muted);
      margin: -4px 0 14px;
      font-size: 13px;
      line-height: 1.5;
    }
    .experience-list, .query-results, .related-list { display: grid; gap: 12px; }
    .experience-card {
      padding: 16px;
      cursor: pointer;
      transition: transform 0.15s ease, box-shadow 0.15s ease, border-color 0.15s ease;
    }
    .experience-card:hover {
      transform: translateY(-1px);
      border-color: #c6d4ea;
      box-shadow: 0 12px 28px rgba(15, 23, 42, 0.12);
    }
    .experience-card.active-card {
      border-color: #93c5fd;
      box-shadow: 0 0 0 3px rgba(37, 99, 235, 0.12);
    }
    .experience-head { display: flex; align-items: flex-start; justify-content: space-between; gap: 12px; }
    .experience-head h3 { margin: 0; font-size: 15px; line-height: 1.35; }
    .experience-badges, .pill-row, .file-row { display: flex; gap: 6px; flex-wrap: wrap; margin-top: 10px; }
    .problem, .solution { margin: 10px 0 0; color: var(--muted); line-height: 1.55; }
    .solution { color: #334155; }
    .meta-line { display: flex; justify-content: space-between; gap: 8px; flex-wrap: wrap; color: var(--muted); font-size: 12px; margin-top: 12px; }
    .pill {
      display: inline-flex;
      align-items: center;
      border-radius: 999px;
      padding: 4px 8px;
      background: #eef2f7;
      color: #334155;
      font-size: 12px;
      line-height: 1;
      white-space: nowrap;
    }
    .tag { background: var(--primary-soft); color: var(--primary); }
    .tech { background: #ecfdf5; color: var(--green); }
    .status-active, .ok { background: #dcfce7; color: var(--green); }
    .status-needs_review, .warn { background: #fef3c7; color: var(--yellow); }
    .status-stale, .status-archived { background: #fee2e2; color: var(--red); }
    .graph-fill { background: linear-gradient(90deg, #a78bfa, var(--purple)); }
    code, .command-box {
      background: #f1f5f9;
      border: 1px solid #e2e8f0;
      border-radius: 7px;
      color: #334155;
    }
    code { padding: 2px 6px; }
    .command-box {
      padding: 10px 12px;
      white-space: pre-wrap;
      word-break: break-word;
      font-size: 12px;
      line-height: 1.6;
      margin-top: 12px;
      overflow-x: auto;
    }
    .bar-row { display: grid; grid-template-columns: 120px 1fr 36px; align-items: center; gap: 10px; margin: 9px 0; }
    .bar-label { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; color: #334155; font-size: 13px; }
    .bar-track { height: 9px; background: #edf2f7; border-radius: 999px; overflow: hidden; }
    .bar-fill { height: 100%; background: linear-gradient(90deg, #60a5fa, #2563eb); border-radius: 999px; }
    .bar-count { color: var(--muted); text-align: right; font-size: 12px; }
    table { width: 100%; border-collapse: collapse; font-size: 13px; }
    th, td { text-align: left; padding: 10px 8px; border-bottom: 1px solid var(--line); vertical-align: top; }
    th { color: var(--muted); font-weight: 600; background: #f8fafc; }
    .active-row { background: #eff6ff; }
    .candidate-card { padding: 14px; margin-bottom: 10px; }
    .candidate-card p { margin: 10px 0 0; color: var(--muted); }
    .pipeline-list { margin: 0; padding-left: 22px; }
    .pipeline-list li { margin: 10px 0; }
    .stage-name { font-weight: 600; margin-right: 8px; }
    .empty {
      color: var(--muted);
      border: 1px dashed var(--line);
      border-radius: 14px;
      padding: 16px;
      background: #fbfdff;
    }
    .ghost-button {
      margin-top: 12px;
      border: 1px solid #dbe4f0;
      background: #fff;
      color: #1d4ed8;
      border-radius: 10px;
      padding: 8px 12px;
      cursor: pointer;
      font-size: 13px;
      font-weight: 600;
    }
    .ghost-button:hover { background: #eff6ff; }
    .query-result-item, .related-item, .graph-inspector {
      border: 1px solid var(--line);
      border-radius: 14px;
      padding: 12px;
      background: #fbfdff;
    }
    .query-result-item h4 { margin: 0 0 8px; font-size: 14px; }
    .query-result-item p, .graph-inspector p { margin: 6px 0 0; color: var(--muted); line-height: 1.5; }
    .query-result-item { cursor: pointer; }
    .detail-drawer {
      position: fixed;
      top: 0;
      right: 0;
      width: min(520px, 100vw);
      height: 100vh;
      background: #fff;
      box-shadow: -18px 0 40px rgba(15, 23, 42, 0.18);
      transform: translateX(100%);
      transition: transform 0.2s ease;
      z-index: 30;
      padding: 22px 20px 28px;
      overflow-y: auto;
    }
    .detail-drawer.open { transform: translateX(0); }
    .drawer-backdrop {
      position: fixed;
      inset: 0;
      background: rgba(15, 23, 42, 0.28);
      opacity: 0;
      pointer-events: none;
      transition: opacity 0.2s ease;
      z-index: 20;
    }
    .drawer-backdrop.visible { opacity: 1; pointer-events: auto; }
    .drawer-head {
      display: flex;
      justify-content: space-between;
      align-items: flex-start;
      gap: 12px;
      margin-bottom: 14px;
    }
    .drawer-head h3 { margin: 0; font-size: 20px; line-height: 1.35; }
    .close-button {
      border: 0;
      background: #eef2f7;
      width: 34px;
      height: 34px;
      border-radius: 999px;
      cursor: pointer;
      font-size: 16px;
      color: #334155;
    }
    .detail-section { margin-top: 18px; }
    .detail-section h4 { margin: 0 0 10px; font-size: 14px; }
    .detail-section p { margin: 0; color: #334155; line-height: 1.65; }
    .related-item { cursor: pointer; }
    .small-note { color: var(--muted); font-size: 12px; }
    .graph-layout {
      display: grid;
      grid-template-columns: minmax(0, 1fr) 320px;
      gap: 16px;
      align-items: start;
    }
    .graph-stage {
      min-height: 680px;
      border: 1px solid var(--line);
      border-radius: 18px;
      background: linear-gradient(180deg, #fbfdff 0%, #f5f8fe 100%);
      overflow: hidden;
      position: relative;
    }
    .cy-container {
      width: 100%;
      height: 680px;
    }
    .graph-tools {
      display: grid;
      gap: 14px;
    }
    .legend-list {
      display: grid;
      gap: 8px;
    }
    .legend-item {
      display: flex;
      gap: 10px;
      align-items: center;
      color: #334155;
      font-size: 13px;
    }
    .legend-dot {
      width: 12px;
      height: 12px;
      border-radius: 999px;
      display: inline-block;
    }
    .legend-experience { background: #2563eb; }
    .legend-tag { background: #f59e0b; }
    .legend-tech { background: #16a34a; }
    .legend-file { background: #ef4444; }
    .legend-concept { background: #8b5cf6; }
    footer { margin-top: 24px; color: var(--muted); font-size: 12px; }
    @media (max-width: 960px) {
      .two-col, .three-col, .graph-layout { grid-template-columns: 1fr; }
      .bar-row { grid-template-columns: 96px 1fr 30px; }
      .detail-drawer { width: 100vw; }
      .graph-stage, .cy-container { min-height: 520px; height: 520px; }
    }
  </style>
</head>
<body>
  <header>
    <h1>EKG Panel</h1>
    <p>Experience Knowledge Graph snapshot · generated ${escapeHtml(formatDate(view.generated_at))}</p>
  </header>
  <main>
    <div class="toolbar">
      <input id="experienceSearch" class="search" placeholder="Filter recent experiences by id, title, tag, tech, file..." />
      <div class="pill-row">
        ${renderPill(`Storage: ${view.storage_backend}`)}
        ${renderPill(`Stage: ${view.stage}`)}
        ${renderPill(`Project: ${activeProjectLabel}`)}
      </div>
    </div>

    <div class="tab-bar" role="tablist" aria-label="Panel views">
      <button class="tab-button active" type="button" data-tab-target="overviewPanel">Overview</button>
      <button class="tab-button" type="button" data-tab-target="graphPanel">Graph View</button>
    </div>

    <section id="overviewPanel" class="tab-panel active">
      <section class="grid metrics">
        ${renderMetricCard("Experiences", stats.experience_count || 0, "Total recorded lessons")}
        ${renderMetricCard("Active", stats.active_count || 0, "Ready to reuse")}
        ${renderMetricCard("Needs Review", stats.needs_review_count || 0, "Pending confirmation")}
        ${renderMetricCard("Pending Captures", view.pending_candidates.length, "Reviewable candidates")}
        ${renderMetricCard("Tags", stats.tag_count || 0, "Indexed concepts")}
        ${renderMetricCard("Projects", view.projects.length, "Registered workspaces")}
      </section>

      <section class="grid two-col" style="margin-top:16px;">
        <div class="card">
          <h2>Recent Experiences</h2>
          <p class="subheading">Click any card to open the detail drawer, view related experiences, and get ready-to-run CLI suggestions.</p>
          <div id="experienceList" class="experience-list">
            ${renderExperiences(view.recent_experiences)}
          </div>
        </div>
        <aside class="grid">
          <div class="card">
            <h2>Browser Query Helper</h2>
            <p class="subheading">Search across the current exported snapshot and jump straight into one experience.</p>
            <input id="queryInput" class="inline-query" placeholder="Try: redirect / project root / loginRedirect.vue" />
            <div id="queryResults" class="query-results">
              <div class="empty">Type above to search across all indexed experiences in this panel snapshot.</div>
            </div>
          </div>
          <div class="card">
            <h2>Graph Summary</h2>
            <div class="meta-line">
              <span>Nodes: ${escapeHtml(view.graph_summary.node_count)}</span>
              <span>Edges: ${escapeHtml(view.graph_summary.edge_count)}</span>
            </div>
            <p class="subheading">Top connected nodes inside the current knowledge graph snapshot.</p>
            ${renderCountBars(view.graph_summary.top_nodes, "No graph nodes to summarize yet.", "graph-fill")}
          </div>
        </aside>
      </section>

      <section class="grid three-col" style="margin-top:16px;">
        <div class="card">
          <h2>Top Tags</h2>
          ${renderCountBars(view.top_tags, "No tags yet.")}
        </div>
        <div class="card">
          <h2>Top Techs</h2>
          ${renderCountBars(view.top_techs, "No techs yet.")}
        </div>
        <div class="card">
          <h2>Hot Files</h2>
          ${renderCountBars(view.top_files, "No file anchors yet.")}
        </div>
      </section>

      <section class="grid three-col" style="margin-top:16px;">
        <div class="card">
          <h2>Pipeline</h2>
          ${renderPipeline(view.pipeline)}
        </div>
        <div class="card">
          <h2>Capture Review Queue</h2>
          ${renderCandidates(view.pending_candidates)}
        </div>
        <div class="card">
          <h2>Operator Shortcuts</h2>
          <p class="subheading">The panel stays read-only, but gives direct command suggestions for common flows.</p>
          <pre class="command-box">node scripts/ekg.js query "keyword"
node scripts/ekg.js explain E001
node scripts/ekg.js path auth vue-router
node scripts/ekg.js review
node scripts/ekg.js capture-status</pre>
        </div>
      </section>

      <section class="card" style="margin-top:16px;">
        <h2>Projects</h2>
        ${renderProjects(view.projects, view.active_project)}
      </section>
    </section>

    <section id="graphPanel" class="tab-panel">
      <div class="graph-layout">
        <div class="graph-stage">
          <div id="cy" class="cy-container"></div>
        </div>
        <aside class="graph-tools">
          <div class="card">
            <h2>Knowledge Graph View</h2>
            <p class="subheading">Powered by Cytoscape.js. Click nodes to inspect, filter, and jump into experience details.</p>
            <input id="graphFilter" class="graph-filter" placeholder="Filter graph by id, tag, file, concept..." />
            <pre class="command-box">Tip: click an Experience node to open the same detail drawer used in Overview mode.</pre>
          </div>
          <div class="card">
            <h2>Legend</h2>
            <div class="legend-list">
              <div class="legend-item"><span class="legend-dot legend-experience"></span> Experience</div>
              <div class="legend-item"><span class="legend-dot legend-tag"></span> Tag</div>
              <div class="legend-item"><span class="legend-dot legend-tech"></span> Tech</div>
              <div class="legend-item"><span class="legend-dot legend-file"></span> File</div>
              <div class="legend-item"><span class="legend-dot legend-concept"></span> Concept</div>
            </div>
          </div>
          <div class="card">
            <h2>Graph Inspector</h2>
            <div id="graphInspector" class="graph-inspector">
              <strong>No node selected.</strong>
              <p>Click a node in Graph View to inspect its label, type, degree, and next-step commands.</p>
            </div>
          </div>
        </aside>
      </div>
    </section>

    <footer>
      Generated by <code>node scripts/ekg.js panel</code>. Re-run the command after new EKG data is added.
    </footer>
  </main>

  <div id="drawerBackdrop" class="drawer-backdrop"></div>
  <aside id="detailDrawer" class="detail-drawer" aria-hidden="true">
    <div class="drawer-head">
      <div>
        <h3 id="drawerTitle">Experience details</h3>
        <div id="drawerMeta" class="pill-row"></div>
      </div>
      <button id="drawerClose" class="close-button" type="button" aria-label="Close">×</button>
    </div>
    <div id="drawerBody"></div>
  </aside>

  <script id="panelViewModel" type="application/json">${renderClientData(view)}</script>
  <script>
    const panelView = JSON.parse(document.getElementById("panelViewModel").textContent);
    const experiences = panelView.all_experiences || [];
    const relationsById = panelView.experience_relations || {};
    const experienceMap = new Map(experiences.map((item) => [item.id, item]));

    const searchInput = document.getElementById("experienceSearch");
    const cards = Array.from(document.querySelectorAll(".experience-card"));
    const queryInput = document.getElementById("queryInput");
    const queryResults = document.getElementById("queryResults");
    const graphFilter = document.getElementById("graphFilter");
    const graphInspector = document.getElementById("graphInspector");
    const drawer = document.getElementById("detailDrawer");
    const drawerBackdrop = document.getElementById("drawerBackdrop");
    const drawerTitle = document.getElementById("drawerTitle");
    const drawerMeta = document.getElementById("drawerMeta");
    const drawerBody = document.getElementById("drawerBody");
    const drawerClose = document.getElementById("drawerClose");
    const tabButtons = Array.from(document.querySelectorAll(".tab-button"));
    const tabPanels = Array.from(document.querySelectorAll(".tab-panel"));
    let cy = null;

    function escapeHtml(value) {
      return String(value ?? "")
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#39;");
    }

    function renderPill(text, className = "") {
      return '<span class="pill ' + className + '">' + escapeHtml(text) + '</span>';
    }

    function renderCodeList(items) {
      if (!items || !items.length) {
        return '<div class="empty">No anchors for this section.</div>';
      }
      return '<div class="file-row">' + items.map((item) => '<code>' + escapeHtml(item) + '</code>').join('') + '</div>';
    }

    function renderCliSuggestions(experience) {
      return [
        'node scripts/ekg.js explain ' + experience.id,
        'node scripts/ekg.js query "' + (experience.tags[0] || experience.title.split(' ')[0] || experience.id) + '"',
        experience.anchors.files[0] ? 'node scripts/ekg.js query "' + experience.anchors.files[0] + '"' : '',
        experience.tags[0] && experience.techs[0] ? 'node scripts/ekg.js path ' + experience.tags[0] + ' ' + experience.techs[0] : ''
      ].filter(Boolean).join('\\n');
    }

    function setActiveCard(experienceId) {
      cards.forEach((card) => {
        card.classList.toggle("active-card", card.dataset.experienceId === experienceId);
      });
    }

    function renderRelatedItems(experienceId) {
      const related = relationsById[experienceId] || [];
      if (!related.length) {
        return '<div class="empty">No related experiences found from shared tags, techs, files, or concepts.</div>';
      }

      return '<div class="related-list">' + related.map((item) => {
        const shared = []
          .concat((item.shared_files || []).map((value) => 'file: ' + value))
          .concat((item.shared_tags || []).map((value) => 'tag: ' + value))
          .concat((item.shared_techs || []).map((value) => 'tech: ' + value))
          .concat((item.shared_concepts || []).map((value) => 'concept: ' + value));

        return [
          '<article class="related-item" data-related-id="' + escapeHtml(item.id) + '">',
          '  <strong>' + escapeHtml(item.id + ' · ' + item.title) + '</strong>',
          '  <div class="small-note">Relation score: ' + escapeHtml(item.score) + '</div>',
          '  <div class="pill-row">' + shared.slice(0, 6).map((text) => renderPill(text)).join('') + '</div>',
          '</article>'
        ].join('');
      }).join('') + '</div>';
    }

    function highlightGraphExperience(experienceId) {
      if (!cy || !experienceId || !cy.getElementById(experienceId).length) {
        return;
      }

      cy.elements().removeClass('is-selected');
      const node = cy.getElementById(experienceId);
      node.addClass('is-selected');
      const neighborhood = node.closedNeighborhood();
      neighborhood.addClass('is-selected');
      cy.animate({
        fit: {
          eles: neighborhood,
          padding: 60
        },
        duration: 300
      });
    }

    function openDetails(experienceId) {
      const experience = experienceMap.get(experienceId);
      if (!experience) {
        return;
      }

      drawerTitle.textContent = experience.id + ' · ' + experience.title;
      drawerMeta.innerHTML = [
        renderPill(experience.status, 'status-' + String(experience.status || '').toLowerCase()),
        renderPill(experience.confidence),
        renderPill('Level: ' + experience.level),
        renderPill('Type: ' + experience.type)
      ].join('');

      drawerBody.innerHTML = [
        '<section class="detail-section"><h4>Problem</h4><p>' + escapeHtml(experience.problem || 'n/a') + '</p></section>',
        '<section class="detail-section"><h4>Solution</h4><p>' + escapeHtml(experience.solution || 'n/a') + '</p></section>',
        experience.root_cause ? '<section class="detail-section"><h4>Root Cause</h4><p>' + escapeHtml(experience.root_cause) + '</p></section>' : '',
        '<section class="detail-section"><h4>Files</h4>' + renderCodeList(experience.anchors.files || []) + '</section>',
        '<section class="detail-section"><h4>Concepts</h4>' + renderCodeList(experience.anchors.concepts || []) + '</section>',
        '<section class="detail-section"><h4>Tags / Techs</h4><div class="pill-row">' +
          (experience.tags || []).map((tag) => renderPill(tag, 'tag')).join('') +
          (experience.techs || []).map((tech) => renderPill(tech, 'tech')).join('') +
        '</div></section>',
        '<section class="detail-section"><h4>CLI Suggestions</h4><pre class="command-box">' + escapeHtml(renderCliSuggestions(experience)) + '</pre></section>',
        '<section class="detail-section"><h4>Related Experiences</h4>' + renderRelatedItems(experience.id) + '</section>'
      ].filter(Boolean).join('');

      drawer.classList.add("open");
      drawer.setAttribute("aria-hidden", "false");
      drawerBackdrop.classList.add("visible");
      setActiveCard(experience.id);
      highlightGraphExperience(experience.id);

      drawerBody.querySelectorAll("[data-related-id]").forEach((node) => {
        node.addEventListener("click", () => openDetails(node.getAttribute("data-related-id")));
      });
    }

    function closeDetails() {
      drawer.classList.remove("open");
      drawer.setAttribute("aria-hidden", "true");
      drawerBackdrop.classList.remove("visible");
      setActiveCard("");
    }

    function updateGraphInspector(contentHtml) {
      graphInspector.innerHTML = contentHtml;
    }

    function focusGraphNodeByQuery(query) {
      if (!cy) {
        return;
      }

      const normalized = (query || '').trim().toLowerCase();
      cy.elements().removeClass('is-selected');

      if (!normalized) {
        cy.fit(undefined, 40);
        updateGraphInspector('<strong>No node selected.</strong><p>Click a node in Graph View to inspect its label, type, degree, and next-step commands.</p>');
        return;
      }

      const matched = cy.nodes().filter((node) => {
        const label = String(node.data('label') || '').toLowerCase();
        const shortLabel = String(node.data('shortLabel') || '').toLowerCase();
        const id = String(node.id() || '').toLowerCase();
        return label.includes(normalized) || shortLabel.includes(normalized) || id.includes(normalized);
      });

      if (!matched.length) {
        updateGraphInspector('<strong>No graph nodes matched.</strong><p>Try a tag, file path, concept name, or experience id.</p>');
        return;
      }

      const focusSet = matched.union(matched.connectedEdges()).union(matched.neighborhood());
      focusSet.addClass('is-selected');
      cy.animate({
        fit: {
          eles: focusSet,
          padding: 50
        },
        duration: 250
      });

      const primary = matched[0];
      updateGraphInspector([
        '<strong>' + escapeHtml(primary.data('label')) + '</strong>',
        '<p>Type: ' + escapeHtml(primary.data('nodeType')) + ' · Degree: ' + escapeHtml(primary.data('degree')) + '</p>',
        '<pre class="command-box">node scripts/ekg.js query "' + escapeHtml(primary.data('shortLabel') || primary.id()) + '"</pre>'
      ].join(''));
    }

    function initTabs() {
      tabButtons.forEach((button) => {
        button.addEventListener('click', () => {
          const target = button.getAttribute('data-tab-target');
          tabButtons.forEach((item) => item.classList.toggle('active', item === button));
          tabPanels.forEach((panel) => panel.classList.toggle('active', panel.id === target));
          if (target === 'graphPanel' && cy) {
            cy.resize();
            cy.fit(undefined, 40);
          }
        });
      });
    }

    function initGraphView() {
      const container = document.getElementById('cy');
      if (!container) {
        return;
      }

      if (typeof window.cytoscape !== 'function') {
        container.innerHTML = '<div class="empty" style="margin:16px;">Cytoscape.js failed to load. Graph View needs network access for the CDN script in this version.</div>';
        return;
      }

      const elements = [].concat(panelView.graph_view.nodes || [], panelView.graph_view.edges || []);
      cy = window.cytoscape({
        container,
        elements,
        style: [
          {
            selector: 'node',
            style: {
              label: 'data(shortLabel)',
              'text-wrap': 'wrap',
              'text-max-width': 110,
              'text-valign': 'center',
              'text-halign': 'center',
              'font-size': 10,
              color: '#111827',
              'background-color': '#e5e7eb',
              width: 'mapData(degree, 1, 12, 26, 54)',
              height: 'mapData(degree, 1, 12, 26, 54)',
              'border-width': 1.5,
              'border-color': '#e2e8f0'
            }
          },
          { selector: 'node[nodeType = "experience"]', style: { 'background-color': '#bfdbfe', color: '#111827', 'font-weight': 700, 'border-color': '#2563eb' } },
          { selector: 'node[nodeType = "tag"]', style: { 'background-color': '#fde68a', color: '#111827', 'border-color': '#f59e0b' } },
          { selector: 'node[nodeType = "tech"]', style: { 'background-color': '#bbf7d0', color: '#111827', 'border-color': '#16a34a' } },
          { selector: 'node[nodeType = "file"]', style: { 'background-color': '#fecaca', color: '#111827', 'border-color': '#ef4444' } },
          { selector: 'node[nodeType = "concept"]', style: { 'background-color': '#ddd6fe', color: '#111827', 'border-color': '#8b5cf6' } },
          {
            selector: 'edge',
            style: {
              width: 1.4,
              'line-color': '#cbd5e1',
              'curve-style': 'bezier',
              opacity: 0.8
            }
          },
          {
            selector: '.is-selected',
            style: {
              'border-width': 4,
              'border-color': '#f97316',
              opacity: 1,
              'line-color': '#f97316',
              width: 3
            }
          }
        ],
        layout: {
          name: 'cose',
          animate: false,
          padding: 40,
          nodeRepulsion: 700000,
          idealEdgeLength: 120
        }
      });

      cy.on('tap', 'node', (event) => {
        const node = event.target;
        const nodeType = node.data('nodeType');
        const nodeLabel = node.data('label');
        const degree = node.data('degree');

        cy.elements().removeClass('is-selected');
        const neighborhood = node.closedNeighborhood();
        neighborhood.addClass('is-selected');

        updateGraphInspector([
          '<strong>' + escapeHtml(nodeLabel) + '</strong>',
          '<p>Type: ' + escapeHtml(nodeType) + ' · Degree: ' + escapeHtml(degree) + '</p>',
          '<pre class="command-box">node scripts/ekg.js query "' + escapeHtml(node.data('shortLabel') || node.id()) + '"</pre>'
        ].join(''));

        if (nodeType === 'experience') {
          openDetails(node.id());
        }
      });

      graphFilter.addEventListener('input', () => {
        focusGraphNodeByQuery(graphFilter.value);
      });
    }

    searchInput.addEventListener("input", () => {
      const query = searchInput.value.trim().toLowerCase();
      cards.forEach((card) => {
        const haystack = card.getAttribute("data-search") || "";
        card.style.display = !query || haystack.includes(query) ? "" : "none";
      });
    });

    cards.forEach((card) => {
      const experienceId = card.getAttribute("data-experience-id");
      card.addEventListener("click", () => openDetails(experienceId));
      const button = card.querySelector(".ghost-button");
      if (button) {
        button.addEventListener("click", (event) => {
          event.stopPropagation();
          openDetails(experienceId);
        });
      }
    });

    queryInput.addEventListener("input", () => {
      const query = queryInput.value.trim().toLowerCase();
      if (!query) {
        queryResults.innerHTML = '<div class="empty">Type above to search across all indexed experiences in this panel snapshot.</div>';
        return;
      }

      const matched = experiences
        .map((experience) => {
          const haystack = [
            experience.id,
            experience.title,
            experience.problem,
            experience.solution,
            ...experience.tags,
            ...experience.techs,
            ...experience.anchors.files,
            ...experience.anchors.concepts
          ].join(' ').toLowerCase();

          const score = haystack.includes(query)
            ? (experience.id.toLowerCase().includes(query) ? 6 : 0)
              + (experience.title.toLowerCase().includes(query) ? 5 : 0)
              + (experience.tags.some((tag) => tag.toLowerCase().includes(query)) ? 4 : 0)
              + (experience.techs.some((tech) => tech.toLowerCase().includes(query)) ? 3 : 0)
              + (experience.anchors.files.some((file) => file.toLowerCase().includes(query)) ? 5 : 0)
              + (experience.problem.toLowerCase().includes(query) ? 2 : 0)
              + (experience.solution.toLowerCase().includes(query) ? 2 : 0)
            : 0;

          return score ? { experience, score } : null;
        })
        .filter(Boolean)
        .sort((left, right) => right.score - left.score || left.experience.id.localeCompare(right.experience.id))
        .slice(0, 8);

      if (!matched.length) {
        queryResults.innerHTML = '<div class="empty">No matches in the current panel snapshot. Try the CLI query command for a fresh search.</div>';
        return;
      }

      queryResults.innerHTML = matched.map(({ experience, score }) => [
        '<article class="query-result-item" data-open-id="' + escapeHtml(experience.id) + '">',
        '  <h4>' + escapeHtml(experience.id + ' · ' + experience.title) + '</h4>',
        '  <div class="pill-row">' + renderPill('score: ' + score) + renderPill(experience.status, 'status-' + String(experience.status || '').toLowerCase()) + '</div>',
        '  <p>' + escapeHtml(experience.solution || experience.problem || '') + '</p>',
        '</article>'
      ].join('')).join('');

      queryResults.querySelectorAll('[data-open-id]').forEach((node) => {
        node.addEventListener('click', () => openDetails(node.getAttribute('data-open-id')));
      });
    });

    drawerClose.addEventListener("click", closeDetails);
    drawerBackdrop.addEventListener("click", closeDetails);
    document.addEventListener("keydown", (event) => {
      if (event.key === "Escape") {
        closeDetails();
      }
    });

    initTabs();
    initGraphView();
  </script>
</body>
</html>
`;
}

function writePanel(runtime, options = {}) {
  const outputFile = normalizeOutputFile(runtime, options.output);
  fs.mkdirSync(path.dirname(outputFile), { recursive: true });
  fs.writeFileSync(outputFile, generatePanelHtml(runtime), "utf8");
  return {
    output_file: outputFile,
    relative_output_file: slashPath(path.relative(ROOT_DIR, outputFile)),
    generated_at: new Date().toISOString()
  };
}

function openPanelFile(outputFile) {
  const resolved = path.resolve(outputFile);
  if (process.platform === "win32") {
    childProcess.spawn("cmd", ["/c", "start", "", resolved], {
      detached: true,
      stdio: "ignore"
    }).unref();
    return;
  }

  const command = process.platform === "darwin" ? "open" : "xdg-open";
  childProcess.spawn(command, [resolved], {
    detached: true,
    stdio: "ignore"
  }).unref();
}

module.exports = {
  slashPath,
  escapeHtml,
  formatDate,
  normalizeOutputFile,
  countIndexBucket,
  pickRecentExperiences,
  normalizeExperienceForPanel,
  buildExperienceRelationMap,
  buildGraphSummary,
  buildCytoscapeGraph,
  buildPanelViewModel,
  generatePanelHtml,
  writePanel,
  openPanelFile
};
