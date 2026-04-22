const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const {
  BACKUP_FORMAT,
  collectPortableBackupFiles,
  exportPortableBackup,
  readPortableBackupPackage,
  importPortableBackup,
  inspectPortableBackup,
  resolveBackupEntryDestination
} = require("../lib/backup");

function writeFile(filePath, content) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, content);
}

module.exports = function runBackupTest() {
  const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), "ekg-backup-test-"));
  const sourceRoot = path.join(tmpRoot, "source");
  const restoreRoot = path.join(tmpRoot, "restore");

  fs.mkdirSync(sourceRoot, { recursive: true });
  fs.mkdirSync(restoreRoot, { recursive: true });

  writeFile(path.join(sourceRoot, "config.json"), JSON.stringify({
    storage: {
      backend: "sqlite",
      outputDir: "ekg-out"
    }
  }, null, 2));
  writeFile(path.join(sourceRoot, "ekg-out", "ekg.sqlite"), Buffer.from([0x53, 0x51, 0x4c, 0x69]));
  writeFile(path.join(sourceRoot, "ekg-out", "ekg.sqlite-wal"), Buffer.from([0x01, 0x02, 0x03]));
  writeFile(path.join(sourceRoot, "ekg-out", "state.json"), JSON.stringify({ capture: { pending_candidates: [] } }, null, 2));
  writeFile(path.join(sourceRoot, "ekg-out", "ekg.json"), JSON.stringify({ nodes: [], edges: [] }, null, 2));
  writeFile(path.join(sourceRoot, "ekg-out", "reports", "EKG_REPORT.md"), "# report\n");
  writeFile(path.join(sourceRoot, "experiences", "E001-test.md"), "---\nid: E001\n---\n");

  const runtime = {
    config: {
      storage: {
        backend: "sqlite"
      }
    },
    storagePaths: {
      SQLITE_FILE: path.join(sourceRoot, "ekg-out", "ekg.sqlite"),
      INDEX_FILE: path.join(sourceRoot, "ekg-out", "ekg.json"),
      STATE_FILE: path.join(sourceRoot, "ekg-out", "state.json"),
      REPORT_FILE: path.join(sourceRoot, "ekg-out", "reports", "EKG_REPORT.md"),
      EXPERIENCES_DIR: path.join(sourceRoot, "experiences"),
      LEGACY_INDEX_FILE: path.join(sourceRoot, "ekg.json"),
      LEGACY_STATE_FILE: path.join(sourceRoot, "state.json"),
      LEGACY_REPORT_FILE: path.join(sourceRoot, "reports", "EKG_REPORT.md"),
      storage: {
        outputDir: "ekg-out",
        legacyMirror: false
      }
    }
  };

  const collectedFiles = collectPortableBackupFiles(sourceRoot, runtime);
  assert.equal(collectedFiles.some((filePath) => filePath.endsWith("ekg.sqlite")), true);
  assert.equal(collectedFiles.some((filePath) => filePath.endsWith("ekg.sqlite-wal")), true);
  assert.equal(collectedFiles.some((filePath) => filePath.endsWith("E001-test.md")), true);

  const exportResult = exportPortableBackup(runtime, {
    rootDir: sourceRoot,
    outputPath: path.join("backups", "portable")
  });
  assert.equal(fs.existsSync(exportResult.output_file), true);

  const bundle = readPortableBackupPackage(exportResult.output_file);
  assert.equal(bundle.format, BACKUP_FORMAT);
  assert.equal(bundle.files.some((entry) => entry.path === "config.json"), true);
  assert.equal(bundle.files.some((entry) => entry.path === "ekg-out/ekg.sqlite"), true);

  const inspectResult = inspectPortableBackup(exportResult.output_file);
  assert.equal(inspectResult.format, BACKUP_FORMAT);
  assert.equal(inspectResult.file_count, bundle.files.length);
  assert.equal(inspectResult.files.some((entry) => entry.path === "config.json"), true);

  const staleSidecar = resolveBackupEntryDestination(restoreRoot, "ekg-out/ekg.sqlite-shm");
  writeFile(staleSidecar, Buffer.from([0x09]));

  const importResult = importPortableBackup(exportResult.output_file, {
    rootDir: restoreRoot
  });
  assert.equal(importResult.file_count, bundle.files.length);
  assert.equal(fs.existsSync(path.join(restoreRoot, "config.json")), true);
  assert.equal(fs.existsSync(path.join(restoreRoot, "ekg-out", "ekg.sqlite")), true);
  assert.equal(fs.existsSync(path.join(restoreRoot, "experiences", "E001-test.md")), true);
  assert.equal(fs.existsSync(staleSidecar), false);

  fs.rmSync(tmpRoot, { recursive: true, force: true });
};
