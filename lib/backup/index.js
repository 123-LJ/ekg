const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");
const zlib = require("node:zlib");
const {
  ROOT_DIR
} = require("../core/paths");

const BACKUP_FORMAT = "ekg-portable-backup";
const BACKUP_VERSION = "1.0.0";
const BACKUP_EXTENSION = ".ekgpack.json.gz";
const TEXT_FILE_EXTENSIONS = new Set([
  ".json",
  ".md",
  ".txt",
  ".toml",
  ".yaml",
  ".yml"
]);

function slashPath(filePath) {
  return String(filePath || "").replace(/\\/g, "/");
}

function ensureDir(dirPath) {
  fs.mkdirSync(dirPath, { recursive: true });
}

function formatTimestampForFileName(input = new Date()) {
  const date = input instanceof Date ? input : new Date(input);
  const pad = (value) => String(value).padStart(2, "0");
  return [
    date.getFullYear(),
    pad(date.getMonth() + 1),
    pad(date.getDate())
  ].join("")
    + "-"
    + [
      pad(date.getHours()),
      pad(date.getMinutes()),
      pad(date.getSeconds())
    ].join("");
}

function isInsideRoot(rootDir, filePath) {
  const resolvedRoot = path.resolve(rootDir);
  const resolvedFile = path.resolve(filePath);
  return resolvedFile === resolvedRoot || resolvedFile.startsWith(`${resolvedRoot}${path.sep}`);
}

function toRelativeBackupPath(rootDir, filePath) {
  const resolvedRoot = path.resolve(rootDir);
  const resolvedFile = path.resolve(filePath);
  const relativePath = path.relative(resolvedRoot, resolvedFile);

  if (!relativePath || relativePath.startsWith("..") || path.isAbsolute(relativePath)) {
    throw new Error(`backup path escapes root: ${filePath}`);
  }

  return slashPath(relativePath);
}

function resolveBackupEntryDestination(rootDir, relativePath) {
  const normalized = slashPath(relativePath).replace(/^\/+/u, "");
  if (!normalized || normalized.split("/").some((segment) => segment === "..")) {
    throw new Error(`invalid backup entry path: ${relativePath}`);
  }

  const destination = path.resolve(rootDir, normalized);
  if (!isInsideRoot(rootDir, destination)) {
    throw new Error(`backup entry would restore outside target root: ${relativePath}`);
  }

  return destination;
}

function listFilesRecursive(dirPath) {
  if (!fs.existsSync(dirPath)) {
    return [];
  }

  const entries = fs.readdirSync(dirPath, { withFileTypes: true });
  const files = [];

  entries.forEach((entry) => {
    const fullPath = path.join(dirPath, entry.name);
    if (entry.isDirectory()) {
      files.push(...listFilesRecursive(fullPath));
      return;
    }

    if (entry.isFile()) {
      files.push(fullPath);
    }
  });

  return files;
}

function uniqueFilePaths(filePaths = []) {
  return [...new Set(
    filePaths
      .filter(Boolean)
      .map((filePath) => path.resolve(filePath))
  )];
}

function collectPortableBackupFiles(rootDir, runtime, options = {}) {
  const storagePaths = runtime.storagePaths || {};
  const includeLegacy = options.includeLegacy !== false;
  const candidates = [
    path.join(rootDir, "config.json"),
    storagePaths.SQLITE_FILE,
    storagePaths.SQLITE_FILE ? `${storagePaths.SQLITE_FILE}-wal` : "",
    storagePaths.SQLITE_FILE ? `${storagePaths.SQLITE_FILE}-shm` : "",
    storagePaths.INDEX_FILE,
    storagePaths.STATE_FILE,
    storagePaths.REPORT_FILE,
    includeLegacy ? storagePaths.LEGACY_INDEX_FILE : "",
    includeLegacy ? storagePaths.LEGACY_STATE_FILE : "",
    includeLegacy ? storagePaths.LEGACY_REPORT_FILE : "",
    ...listFilesRecursive(storagePaths.EXPERIENCES_DIR || path.join(rootDir, "experiences"))
  ];

  return uniqueFilePaths(candidates).filter((filePath) => {
    return fs.existsSync(filePath) && fs.statSync(filePath).isFile() && isInsideRoot(rootDir, filePath);
  });
}

function detectEntryEncoding(filePath) {
  const extension = path.extname(filePath).toLowerCase();
  return TEXT_FILE_EXTENSIONS.has(extension) ? "utf8" : "base64";
}

function checksumBuffer(buffer) {
  return crypto.createHash("sha256").update(buffer).digest("hex");
}

function buildBackupEntry(rootDir, filePath) {
  const buffer = fs.readFileSync(filePath);
  const encoding = detectEntryEncoding(filePath);

  return {
    path: toRelativeBackupPath(rootDir, filePath),
    encoding,
    size_bytes: buffer.length,
    sha256: checksumBuffer(buffer),
    content: encoding === "utf8"
      ? buffer.toString("utf8")
      : buffer.toString("base64")
  };
}

function buildPortableBackupPackage(rootDir, runtime, options = {}) {
  const createdAt = options.createdAt || new Date().toISOString();
  const files = collectPortableBackupFiles(rootDir, runtime, options).map((filePath) => {
    return buildBackupEntry(rootDir, filePath);
  });
  const storage = (((runtime || {}).storagePaths || {}).storage) || {};

  return {
    format: BACKUP_FORMAT,
    version: BACKUP_VERSION,
    backup_type: "portable-package",
    created_at: createdAt,
    source: {
      root_dir_name: path.basename(rootDir),
      storage_backend: ((((runtime || {}).config || {}).storage || {}).backend) || "json",
      output_dir: storage.outputDir || "ekg-out",
      legacy_mirror: Boolean(storage.legacyMirror)
    },
    restore: {
      host_reinstall_required: true,
      reinstall_commands: [
        "node scripts/install-host.js --host codex --codex-mode strong",
        "node scripts/install-host.js --host claude"
      ]
    },
    files
  };
}

function resolveBackupOutputFile(rootDir, requestedPath = "", createdAt = new Date()) {
  const defaultName = `ekg-backup-${formatTimestampForFileName(createdAt)}${BACKUP_EXTENSION}`;

  if (!requestedPath) {
    return path.join(rootDir, "backups", defaultName);
  }

  const resolved = path.resolve(rootDir, requestedPath);
  if (fs.existsSync(resolved) && fs.statSync(resolved).isDirectory()) {
    return path.join(resolved, defaultName);
  }

  if (!path.extname(resolved) || slashPath(requestedPath).endsWith("/")) {
    return path.join(resolved, defaultName);
  }

  return resolved;
}

function exportPortableBackup(runtime, options = {}) {
  const rootDir = options.rootDir || ROOT_DIR;
  const bundle = buildPortableBackupPackage(rootDir, runtime, options);
  const outputFile = resolveBackupOutputFile(rootDir, options.outputPath, bundle.created_at);
  const serialized = Buffer.from(JSON.stringify(bundle, null, 2), "utf8");
  const compressed = zlib.gzipSync(serialized);

  ensureDir(path.dirname(outputFile));
  fs.writeFileSync(outputFile, compressed);

  return {
    output_file: outputFile,
    format: bundle.format,
    created_at: bundle.created_at,
    file_count: bundle.files.length,
    package_size_bytes: compressed.length,
    entries: bundle.files.map((entry) => ({
      path: entry.path,
      size_bytes: entry.size_bytes,
      encoding: entry.encoding
    }))
  };
}

function readPortableBackupPackage(inputFile) {
  const buffer = fs.readFileSync(inputFile);
  const content = buffer[0] === 0x1f && buffer[1] === 0x8b
    ? zlib.gunzipSync(buffer).toString("utf8")
    : buffer.toString("utf8");
  const bundle = JSON.parse(content);

  if (!bundle || bundle.format !== BACKUP_FORMAT || !Array.isArray(bundle.files)) {
    throw new Error(`invalid portable backup package: ${inputFile}`);
  }

  return bundle;
}

function decodeBackupEntry(entry) {
  const buffer = entry.encoding === "utf8"
    ? Buffer.from(String(entry.content || ""), "utf8")
    : Buffer.from(String(entry.content || ""), "base64");

  if (entry.sha256 && checksumBuffer(buffer) !== entry.sha256) {
    throw new Error(`backup entry checksum mismatch: ${entry.path}`);
  }

  return buffer;
}

function removeStaleSqliteSidecars(rootDir, bundle) {
  const sqliteEntries = bundle.files
    .map((entry) => entry.path)
    .filter((entryPath) => entryPath.endsWith(".sqlite"));

  sqliteEntries.forEach((relativeSqlitePath) => {
    const walPath = resolveBackupEntryDestination(rootDir, `${relativeSqlitePath}-wal`);
    const shmPath = resolveBackupEntryDestination(rootDir, `${relativeSqlitePath}-shm`);
    const bundlePaths = new Set(bundle.files.map((entry) => entry.path));

    if (!bundlePaths.has(`${relativeSqlitePath}-wal`)) {
      fs.rmSync(walPath, { force: true });
    }

    if (!bundlePaths.has(`${relativeSqlitePath}-shm`)) {
      fs.rmSync(shmPath, { force: true });
    }
  });
}

function importPortableBackup(inputFile, options = {}) {
  const rootDir = options.rootDir || ROOT_DIR;
  const bundle = readPortableBackupPackage(inputFile);

  bundle.files.forEach((entry) => {
    const destination = resolveBackupEntryDestination(rootDir, entry.path);
    ensureDir(path.dirname(destination));
    fs.writeFileSync(destination, decodeBackupEntry(entry));
  });

  removeStaleSqliteSidecars(rootDir, bundle);

  return {
    input_file: inputFile,
    target_root: rootDir,
    format: bundle.format,
    created_at: bundle.created_at,
    file_count: bundle.files.length,
    restored_paths: bundle.files.map((entry) => entry.path),
    host_reinstall_required: Boolean(((bundle.restore || {}).host_reinstall_required)),
    reinstall_commands: ((bundle.restore || {}).reinstall_commands) || []
  };
}

function inspectPortableBackup(inputFile) {
  const bundle = readPortableBackupPackage(inputFile);
  return {
    format: bundle.format,
    version: bundle.version,
    backup_type: bundle.backup_type || "portable-package",
    created_at: bundle.created_at,
    source: bundle.source || {},
    restore: bundle.restore || {},
    file_count: Array.isArray(bundle.files) ? bundle.files.length : 0,
    total_file_bytes: Array.isArray(bundle.files)
      ? bundle.files.reduce((sum, entry) => sum + Number(entry.size_bytes || 0), 0)
      : 0,
    files: Array.isArray(bundle.files)
      ? bundle.files.map((entry) => ({
          path: entry.path,
          encoding: entry.encoding,
          size_bytes: entry.size_bytes,
          sha256: entry.sha256
        }))
      : []
  };
}

module.exports = {
  BACKUP_FORMAT,
  BACKUP_VERSION,
  BACKUP_EXTENSION,
  slashPath,
  ensureDir,
  formatTimestampForFileName,
  isInsideRoot,
  toRelativeBackupPath,
  resolveBackupEntryDestination,
  listFilesRecursive,
  uniqueFilePaths,
  collectPortableBackupFiles,
  detectEntryEncoding,
  checksumBuffer,
  buildBackupEntry,
  buildPortableBackupPackage,
  resolveBackupOutputFile,
  exportPortableBackup,
  readPortableBackupPackage,
  decodeBackupEntry,
  removeStaleSqliteSidecars,
  importPortableBackup,
  inspectPortableBackup
};
