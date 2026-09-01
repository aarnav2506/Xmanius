"use strict";

/**
 * XManius Sandboxed Workspace & Filesystem Tool Manager
 * Enforces path containment, directory structure (input/src/output/logs/artifacts),
 * and safe file I/O operations for autonomous coding and task execution.
 */

const fs = require("fs");
const path = require("path");
const os = require("os");

function ensureDirSync(dirPath) {
  if (fs.existsSync(dirPath)) return;
  try {
    fs.mkdirSync(dirPath, { recursive: true });
  } catch (e) {
    const parent = path.dirname(dirPath);
    if (!fs.existsSync(parent)) ensureDirSync(parent);
    try { fs.mkdirSync(dirPath); } catch (err) {}
  }
}

function removeDirSync(dirPath) {
  if (!fs.existsSync(dirPath)) return;
  const entries = fs.readdirSync(dirPath);
  for (let i = 0; i < entries.length; i++) {
    const full = path.join(dirPath, entries[i]);
    const stat = fs.statSync(full);
    if (stat.isDirectory()) {
      removeDirSync(full);
    } else {
      fs.unlinkSync(full);
    }
  }
  fs.rmdirSync(dirPath);
}

class SandboxWorkspace {
  constructor(opts) {
    const options = opts || {};
    if (!options.taskId) throw new Error("taskId is required for SandboxWorkspace");
    this.taskId = String(options.taskId).replace(/[^a-zA-Z0-9_-]/g, "_");
    
    const rootParent = options.baseDir || path.join(os.tmpdir(), "xmanius_workspaces");
    this.workspaceDir = path.resolve(path.join(rootParent, "task_" + this.taskId));

    this.folders = {
      root: this.workspaceDir,
      input: path.join(this.workspaceDir, "input"),
      src: path.join(this.workspaceDir, "src"),
      output: path.join(this.workspaceDir, "output"),
      logs: path.join(this.workspaceDir, "logs"),
      artifacts: path.join(this.workspaceDir, "artifacts"),
    };

    this.maxFileSize = 20 * 1024 * 1024;
    this.maxTotalFiles = 500;
  }

  init() {
    for (const key in this.folders) {
      ensureDirSync(this.folders[key]);
    }
    return Promise.resolve(this);
  }

  resolveSafePath(filePath, targetFolder) {
    const baseFolder = this.folders[targetFolder || "src"] || this.workspaceDir;
    const absolute = path.resolve(baseFolder, filePath);

    const relative = path.relative(this.workspaceDir, absolute);
    if (relative.indexOf("..") === 0 || path.isAbsolute(relative)) {
      throw new Error("Security Violation: Path traversal outside workspace is prohibited (" + filePath + ").");
    }

    return absolute;
  }

  writeFile(relativePath, content, targetFolder) {
    const safePath = this.resolveSafePath(relativePath, targetFolder || "src");
    const parent = path.dirname(safePath);
    ensureDirSync(parent);

    const data = typeof content === "string" ? Buffer.from(content, "utf8") : Buffer.from(content);
    if (data.length > this.maxFileSize) {
      throw new Error("File size exceeds maximum allowed limit (" + this.maxFileSize + " bytes).");
    }

    fs.writeFileSync(safePath, data);
    return {
      relativePath: path.relative(this.workspaceDir, safePath).replace(/\\/g, "/"),
      absolutePath: safePath,
      sizeBytes: data.length,
      writtenAt: new Date().toISOString(),
    };
  }

  readFile(relativePath, targetFolder, encoding) {
    const safePath = this.resolveSafePath(relativePath, targetFolder || "src");
    if (!fs.existsSync(safePath)) {
      throw new Error("File not found: " + relativePath);
    }
    return fs.readFileSync(safePath, encoding || "utf8");
  }

  fileExists(relativePath, targetFolder) {
    try {
      const safePath = this.resolveSafePath(relativePath, targetFolder || "src");
      return fs.existsSync(safePath);
    } catch (e) {
      return false;
    }
  }

  listFiles(targetFolder, recursive) {
    const isRec = recursive !== false;
    const folderKey = targetFolder || "src";
    const baseFolder = this.folders[folderKey] || this.workspaceDir;
    if (!fs.existsSync(baseFolder)) return [];

    const results = [];
    const self = this;
    function scan(currentDir) {
      const entries = fs.readdirSync(currentDir);
      for (let i = 0; i < entries.length; i++) {
        const full = path.join(currentDir, entries[i]);
        const rel = path.relative(self.workspaceDir, full).replace(/\\/g, "/");
        const stats = fs.statSync(full);
        if (stats.isDirectory()) {
          if (isRec) scan(full);
        } else if (stats.isFile()) {
          results.push({
            name: entries[i],
            relativePath: rel,
            sizeBytes: stats.size,
            updatedAt: stats.mtime.toISOString(),
            folder: folderKey,
          });
        }
      }
    }

    scan(baseFolder);
    return results;
  }

  moveFile(fromPath, toPath, targetFolder) {
    const safeFrom = this.resolveSafePath(fromPath, targetFolder || "src");
    const safeTo = this.resolveSafePath(toPath, targetFolder || "src");
    if (!fs.existsSync(safeFrom)) {
      throw new Error("Source file not found: " + fromPath);
    }

    ensureDirSync(path.dirname(safeTo));
    fs.renameSync(safeFrom, safeTo);
    return {
      from: path.relative(this.workspaceDir, safeFrom).replace(/\\/g, "/"),
      to: path.relative(this.workspaceDir, safeTo).replace(/\\/g, "/"),
    };
  }

  deleteFile(relativePath, targetFolder, isApproved) {
    if (!isApproved) {
      throw new Error("File deletion requires explicit approval.");
    }
    const safePath = this.resolveSafePath(relativePath, targetFolder || "src");
    if (fs.existsSync(safePath)) {
      fs.unlinkSync(safePath);
      return true;
    }
    return false;
  }

  getWorkspaceSummary() {
    const summary = {
      taskId: this.taskId,
      workspaceDir: this.workspaceDir,
      files: {},
    };
    for (const folderKey in this.folders) {
      if (folderKey === "root") continue;
      summary.files[folderKey] = this.listFiles(folderKey, true);
    }
    return summary;
  }

  cleanup() {
    try {
      if (fs.existsSync(this.workspaceDir)) {
        removeDirSync(this.workspaceDir);
      }
      return true;
    } catch (err) {
      return false;
    }
  }
}

module.exports = { SandboxWorkspace: SandboxWorkspace };
