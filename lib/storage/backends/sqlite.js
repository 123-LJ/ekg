const fs = require("node:fs");
const path = require("node:path");
const {
  ROOT_DIR,
  resolveStoragePaths
} = require("../../core/paths");
const {
  readJson,
  writeJson
} = require("../../core/json-store");

function loadSqliteModule() {
  const originalEmitWarning = process.emitWarning;

  process.emitWarning = function patchedEmitWarning(warning, ...args) {
    const message = typeof warning === "string"
      ? warning
      : (warning && warning.message) || "";
    const type = typeof warning === "string"
      ? args[0]
      : warning && warning.name;

    if (
      type === "ExperimentalWarning" &&
      String(message).includes("SQLite is an experimental feature")
    ) {
      return;
    }

    return originalEmitWarning.call(process, warning, ...args);
  };

  try {
    return require("node:sqlite");
  } finally {
    process.emitWarning = originalEmitWarning;
  }
}

const { DatabaseSync } = loadSqliteModule();

function ensureParentDir(filePath) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
}

function mirrorJsonIfNeeded(filePath, data, mirrorTarget, shouldMirror) {
  if (!shouldMirror || !mirrorTarget || mirrorTarget === filePath) {
    return;
  }

  ensureParentDir(mirrorTarget);
  writeJson(mirrorTarget, data);
}

function mirrorTextIfNeeded(filePath, content, mirrorTarget, shouldMirror) {
  if (!shouldMirror || !mirrorTarget || mirrorTarget === filePath) {
    return;
  }

  ensureParentDir(mirrorTarget);
  fs.writeFileSync(mirrorTarget, content, "utf8");
}

function migrateLegacyFile(primaryFile, legacyFile) {
  if (!legacyFile || primaryFile === legacyFile) {
    return;
  }

  if (fs.existsSync(primaryFile) || !fs.existsSync(legacyFile)) {
    return;
  }

  ensureParentDir(primaryFile);
  fs.copyFileSync(legacyFile, primaryFile);
}

function ensureLayout(config = {}) {
  const storagePaths = resolveStoragePaths(config);

  if (storagePaths.OUTPUT_DIR !== ROOT_DIR) {
    fs.mkdirSync(storagePaths.OUTPUT_DIR, { recursive: true });
    migrateLegacyFile(storagePaths.INDEX_FILE, storagePaths.LEGACY_INDEX_FILE);
    migrateLegacyFile(storagePaths.STATE_FILE, storagePaths.LEGACY_STATE_FILE);
    migrateLegacyFile(storagePaths.REPORT_FILE, storagePaths.LEGACY_REPORT_FILE);
  }

  ensureParentDir(storagePaths.SQLITE_FILE);
  return storagePaths;
}

function openDatabase(storagePaths) {
  const db = new DatabaseSync(storagePaths.SQLITE_FILE);
  db.exec("PRAGMA journal_mode = WAL;");
  db.exec("PRAGMA synchronous = NORMAL;");
  db.exec("PRAGMA busy_timeout = 5000;");
  return db;
}

function ensureSchema(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS experiences (
      id TEXT PRIMARY KEY,
      type TEXT NOT NULL,
      title TEXT NOT NULL,
      symptom TEXT NOT NULL DEFAULT '',
      problem TEXT NOT NULL,
      cause TEXT NOT NULL DEFAULT '',
      solution TEXT NOT NULL,
      fix TEXT NOT NULL DEFAULT '',
      scope TEXT NOT NULL DEFAULT '',
      root_cause TEXT NOT NULL DEFAULT '',
      level TEXT NOT NULL,
      confidence TEXT NOT NULL,
      status TEXT NOT NULL,
      source TEXT NOT NULL,
      project_scope TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      experience_file TEXT NOT NULL DEFAULT '',
      tags_json TEXT NOT NULL DEFAULT '[]',
      techs_json TEXT NOT NULL DEFAULT '[]',
      anchors_json TEXT NOT NULL DEFAULT '{}',
      relations_json TEXT NOT NULL DEFAULT '[]',
      writer_json TEXT NOT NULL DEFAULT '{}'
    );

    CREATE TABLE IF NOT EXISTS edges (
      from_id TEXT NOT NULL,
      to_id TEXT NOT NULL,
      type TEXT NOT NULL DEFAULT 'related',
      reason TEXT NOT NULL DEFAULT '',
      confidence TEXT NOT NULL DEFAULT '',
      payload_json TEXT NOT NULL DEFAULT '{}',
      PRIMARY KEY (from_id, to_id, type)
    );

    CREATE TABLE IF NOT EXISTS documents (
      key TEXT PRIMARY KEY,
      json TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
  `);

  ensureColumn(db, "experiences", "symptom", "TEXT NOT NULL DEFAULT ''");
  ensureColumn(db, "experiences", "cause", "TEXT NOT NULL DEFAULT ''");
  ensureColumn(db, "experiences", "fix", "TEXT NOT NULL DEFAULT ''");
  ensureColumn(db, "experiences", "scope", "TEXT NOT NULL DEFAULT ''");
}

function ensureColumn(db, tableName, columnName, definition) {
  const columns = db.prepare(`PRAGMA table_info(${tableName})`).all();
  if (columns.some((column) => column.name === columnName)) {
    return;
  }

  db.exec(`ALTER TABLE ${tableName} ADD COLUMN ${columnName} ${definition};`);
}

function parseJsonText(value, fallback) {
  if (!value) {
    return structuredClone(fallback);
  }

  try {
    return JSON.parse(value);
  } catch {
    return structuredClone(fallback);
  }
}

function experienceToRow(experience) {
  return {
    id: experience.id,
    type: experience.type || "workflow",
    title: experience.title || "",
    symptom: experience.symptom || "",
    problem: experience.problem || "",
    cause: experience.cause || "",
    solution: experience.solution || "",
    fix: experience.fix || "",
    scope: experience.scope || "",
    root_cause: experience.root_cause || "",
    level: experience.level || "L1",
    confidence: experience.confidence || "CONFIRMED",
    status: experience.status || "ACTIVE",
    source: experience.source || "manual/cli",
    project_scope: experience.project_scope || "current-project",
    created_at: experience.created_at || new Date().toISOString(),
    updated_at: experience.updated_at || new Date().toISOString(),
    experience_file: experience.experience_file || "",
    tags_json: JSON.stringify(experience.tags || []),
    techs_json: JSON.stringify(experience.techs || []),
    anchors_json: JSON.stringify(experience.anchors || { files: [], concepts: [], commits: [] }),
    relations_json: JSON.stringify(experience.relations || []),
    writer_json: JSON.stringify(experience.writer || {})
  };
}

function rowToExperience(row) {
  return {
    id: row.id,
    kind: "Experience",
    type: row.type,
    title: row.title,
    symptom: row.symptom || "",
    problem: row.problem,
    cause: row.cause || "",
    solution: row.solution,
    fix: row.fix || "",
    scope: row.scope || "",
    root_cause: row.root_cause || "",
    tags: parseJsonText(row.tags_json, []),
    techs: parseJsonText(row.techs_json, []),
    level: row.level,
    confidence: row.confidence,
    status: row.status,
    source: row.source,
    project_scope: row.project_scope,
    anchors: parseJsonText(row.anchors_json, { files: [], concepts: [], commits: [] }),
    relations: parseJsonText(row.relations_json, []),
    writer: parseJsonText(row.writer_json, {}),
    created_at: row.created_at,
    updated_at: row.updated_at,
    experience_file: row.experience_file || ""
  };
}

function edgeToRow(edge) {
  return {
    from_id: edge.from,
    to_id: edge.to,
    type: edge.type || "related",
    reason: edge.reason || "",
    confidence: edge.confidence || "",
    payload_json: JSON.stringify(edge.payload || {})
  };
}

function rowToEdge(row) {
  const payload = parseJsonText(row.payload_json, {});
  return {
    from: row.from_id,
    to: row.to_id,
    type: row.type,
    ...(row.reason ? { reason: row.reason } : {}),
    ...(row.confidence ? { confidence: row.confidence } : {}),
    ...payload
  };
}

function getDocument(db, key, fallback) {
  const row = db.prepare("SELECT json FROM documents WHERE key = ?").get(key);
  return row ? parseJsonText(row.json, fallback) : structuredClone(fallback);
}

function setDocument(db, key, value) {
  const now = new Date().toISOString();
  db.prepare(`
    INSERT INTO documents (key, json, updated_at)
    VALUES (?, ?, ?)
    ON CONFLICT(key) DO UPDATE SET
      json = excluded.json,
      updated_at = excluded.updated_at
  `).run(key, JSON.stringify(value), now);
}

function syncExperienceRows(db, experiences) {
  const nextIds = new Set(experiences.map((experience) => experience.id));
  const existingIds = new Set(
    db.prepare("SELECT id FROM experiences").all().map((row) => row.id)
  );
  const upsertExperience = db.prepare(`
    INSERT INTO experiences (
      id, type, title, symptom, problem, cause, solution, fix, scope, root_cause, level, confidence, status,
      source, project_scope, created_at, updated_at, experience_file,
      tags_json, techs_json, anchors_json, relations_json, writer_json
    ) VALUES (
      @id, @type, @title, @symptom, @problem, @cause, @solution, @fix, @scope, @root_cause, @level, @confidence, @status,
      @source, @project_scope, @created_at, @updated_at, @experience_file,
      @tags_json, @techs_json, @anchors_json, @relations_json, @writer_json
    )
    ON CONFLICT(id) DO UPDATE SET
      type = excluded.type,
      title = excluded.title,
      symptom = excluded.symptom,
      problem = excluded.problem,
      cause = excluded.cause,
      solution = excluded.solution,
      fix = excluded.fix,
      scope = excluded.scope,
      root_cause = excluded.root_cause,
      level = excluded.level,
      confidence = excluded.confidence,
      status = excluded.status,
      source = excluded.source,
      project_scope = excluded.project_scope,
      created_at = excluded.created_at,
      updated_at = excluded.updated_at,
      experience_file = excluded.experience_file,
      tags_json = excluded.tags_json,
      techs_json = excluded.techs_json,
      anchors_json = excluded.anchors_json,
      relations_json = excluded.relations_json,
      writer_json = excluded.writer_json
  `);
  const deleteExperience = db.prepare("DELETE FROM experiences WHERE id = ?");

  experiences.forEach((experience) => {
    upsertExperience.run(experienceToRow(experience));
  });

  existingIds.forEach((id) => {
    if (!nextIds.has(id)) {
      deleteExperience.run(id);
    }
  });
}

function edgePrimaryKey(edge) {
  return `${edge.from_id}::${edge.to_id}::${edge.type}`;
}

function syncEdgeRows(db, edges) {
  const nextRows = edges.map(edgeToRow);
  const nextKeys = new Set(nextRows.map(edgePrimaryKey));
  const existingRows = db.prepare("SELECT from_id, to_id, type FROM edges").all();
  const upsertEdge = db.prepare(`
    INSERT INTO edges (from_id, to_id, type, reason, confidence, payload_json)
    VALUES (@from_id, @to_id, @type, @reason, @confidence, @payload_json)
    ON CONFLICT(from_id, to_id, type) DO UPDATE SET
      reason = excluded.reason,
      confidence = excluded.confidence,
      payload_json = excluded.payload_json
  `);
  const deleteEdge = db.prepare("DELETE FROM edges WHERE from_id = ? AND to_id = ? AND type = ?");

  nextRows.forEach((row) => {
    upsertEdge.run(row);
  });

  existingRows.forEach((row) => {
    if (!nextKeys.has(edgePrimaryKey(row))) {
      deleteEdge.run(row.from_id, row.to_id, row.type);
    }
  });
}

function exportJsonSnapshots(runtime, storagePaths, reportContent) {
  ensureParentDir(storagePaths.INDEX_FILE);
  ensureParentDir(storagePaths.STATE_FILE);
  ensureParentDir(storagePaths.REPORT_FILE);

  writeJson(storagePaths.INDEX_FILE, runtime.index);
  writeJson(storagePaths.STATE_FILE, runtime.state);
  fs.writeFileSync(storagePaths.REPORT_FILE, reportContent, "utf8");

  mirrorJsonIfNeeded(
    storagePaths.INDEX_FILE,
    runtime.index,
    storagePaths.LEGACY_INDEX_FILE,
    storagePaths.storage.legacyMirror
  );
  mirrorJsonIfNeeded(
    storagePaths.STATE_FILE,
    runtime.state,
    storagePaths.LEGACY_STATE_FILE,
    storagePaths.storage.legacyMirror
  );
  mirrorTextIfNeeded(
    storagePaths.REPORT_FILE,
    reportContent,
    storagePaths.LEGACY_REPORT_FILE,
    storagePaths.storage.legacyMirror
  );
}

function saveReport(runtime, reportContent = "") {
  const storagePaths = runtime.storagePaths || ensureLayout(runtime.config);
  exportJsonSnapshots(runtime, storagePaths, reportContent);
  return storagePaths;
}

function importJsonSnapshotIfNeeded(db, storagePaths) {
  const row = db.prepare("SELECT COUNT(*) AS count FROM experiences").get();
  if (row && row.count > 0) {
    return;
  }

  const emptyIndex = { nodes: [], edges: [], indexes: {} };
  const emptyState = { hook: { recent_injections: [] } };
  const index = readJson(
    storagePaths.INDEX_FILE,
    readJson(storagePaths.LEGACY_INDEX_FILE, emptyIndex)
  );
  const state = readJson(
    storagePaths.STATE_FILE,
    readJson(storagePaths.LEGACY_STATE_FILE, emptyState)
  );

  if (!(index.nodes || []).length && !(index.edges || []).length) {
    return;
  }

  saveRuntimeToDatabase(db, {
    index,
    state
  });
}

function saveRuntimeToDatabase(db, runtime) {
  db.exec("BEGIN IMMEDIATE TRANSACTION;");

  try {
    syncExperienceRows(db, (runtime.index.nodes || []).filter((node) => node.kind === "Experience"));
    syncEdgeRows(db, runtime.index.edges || []);

    const {
      nodes = [],
      edges = [],
      ...meta
    } = runtime.index || {};
    setDocument(db, "index_meta", meta);
    setDocument(db, "state", runtime.state || { hook: { recent_injections: [] } });

    db.exec("COMMIT;");
  } catch (error) {
    db.exec("ROLLBACK;");
    throw error;
  }
}

function loadData(config = {}) {
  const storagePaths = ensureLayout(config);
  const db = openDatabase(storagePaths);

  try {
    ensureSchema(db);
    importJsonSnapshotIfNeeded(db, storagePaths);

    const experienceRows = db.prepare("SELECT * FROM experiences ORDER BY id").all();
    const edgeRows = db.prepare("SELECT * FROM edges ORDER BY from_id, to_id, type").all();
    const meta = getDocument(db, "index_meta", {});
    const state = getDocument(db, "state", { hook: { recent_injections: [] } });

    return {
      storagePaths,
      index: {
        ...meta,
        nodes: experienceRows.map(rowToExperience),
        edges: edgeRows.map(rowToEdge)
      },
      state
    };
  } finally {
    db.close();
  }
}

function saveData(runtime, options = {}) {
  const storagePaths = runtime.storagePaths || ensureLayout(runtime.config);
  const reportContent = options.reportContent || "";
  const shouldWriteReport = options.skipReportWrite !== true;
  const db = openDatabase(storagePaths);

  try {
    ensureSchema(db);
    saveRuntimeToDatabase(db, runtime);
  } finally {
    db.close();
  }

  if (shouldWriteReport) {
    exportJsonSnapshots(runtime, storagePaths, reportContent);
  } else {
    ensureParentDir(storagePaths.INDEX_FILE);
    ensureParentDir(storagePaths.STATE_FILE);
    writeJson(storagePaths.INDEX_FILE, runtime.index);
    writeJson(storagePaths.STATE_FILE, runtime.state);
    mirrorJsonIfNeeded(
      storagePaths.INDEX_FILE,
      runtime.index,
      storagePaths.LEGACY_INDEX_FILE,
      storagePaths.storage.legacyMirror
    );
    mirrorJsonIfNeeded(
      storagePaths.STATE_FILE,
      runtime.state,
      storagePaths.LEGACY_STATE_FILE,
      storagePaths.storage.legacyMirror
    );
  }
  return storagePaths;
}

function saveState(runtime, nextState) {
  const storagePaths = runtime.storagePaths || ensureLayout(runtime.config);
  const db = openDatabase(storagePaths);

  try {
    ensureSchema(db);
    setDocument(db, "state", nextState);
  } finally {
    db.close();
  }

  runtime.state = nextState;
  ensureParentDir(storagePaths.STATE_FILE);
  writeJson(storagePaths.STATE_FILE, nextState);
  mirrorJsonIfNeeded(
    storagePaths.STATE_FILE,
    nextState,
    storagePaths.LEGACY_STATE_FILE,
    storagePaths.storage.legacyMirror
  );

  return storagePaths;
}

module.exports = {
  name: "sqlite",
  ensureLayout,
  loadData,
  saveData,
  saveState,
  saveReport
};
