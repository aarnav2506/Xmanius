"use strict";

/**
 * XManius Artifact Service & Registry
 * Manages first-class task deliverables (PDFs, HTML web apps, DOCX/PPTX, code bundles, spreadsheets).
 * Computes checksums, stores metadata, and provides preview/download endpoints.
 */

const crypto = require("crypto");
const path = require("path");

const ARTIFACT_TYPES = Object.freeze({
  PDF: "pdf",
  HTML: "html",
  CODE: "code",
  DOCX: "docx",
  PPTX: "pptx",
  XLSX: "xlsx",
  PNG: "png",
  ZIP: "zip",
  JSON: "json",
  TEXT: "txt",
});

const MIME_MAP = Object.freeze({
  pdf: "application/pdf",
  html: "text/html; charset=utf-8",
  code: "text/plain; charset=utf-8",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  pptx: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  png: "image/png",
  zip: "application/zip",
  json: "application/json; charset=utf-8",
  txt: "text/plain; charset=utf-8",
  js: "application/javascript; charset=utf-8",
  css: "text/css; charset=utf-8",
});

class ArtifactRegistry {
  constructor() {
    this.artifacts = new Map();
  }

  createArtifact(opts) {
    const options = opts || {};
    const taskId = options.taskId || "global";
    const title = options.title || "";
    const type = options.type || ARTIFACT_TYPES.TEXT;
    const content = options.content || "";
    const filename = options.filename || null;
    const metadata = options.metadata || {};

    const artifactId = "art_" + Date.now() + "_" + Math.random().toString(36).slice(2, 7);
    const buffer = Buffer.isBuffer(content) ? content : Buffer.from(String(content || ""), "utf8");
    const checksum = crypto.createHash("sha256").update(buffer).digest("hex").slice(0, 16);
    
    const ext = type === "code" ? (metadata.language || "txt") : type;
    const resolvedFilename = filename || (title || "artifact") + "." + ext;
    const cleanFilename = resolvedFilename.replace(/[\\/:*?"<>|]/g, "_");
    const mimeType = MIME_MAP[type] || MIME_MAP[ext] || "application/octet-stream";

    const artifact = {
      id: artifactId,
      taskId: taskId,
      title: title || cleanFilename,
      filename: cleanFilename,
      type: type,
      mimeType: mimeType,
      sizeBytes: buffer.length,
      checksum: checksum,
      version: metadata.version || 1,
      status: "ready",
      createdAt: new Date().toISOString(),
      metadata: Object.assign({}, metadata),
      previewUrl: "/api/xmanius-task?action=artifact&artifactId=" + artifactId + "&preview=1",
      downloadUrl: "/api/xmanius-task?action=artifact&artifactId=" + artifactId + "&download=1",
      contentBuffer: buffer,
      rawContent: typeof content === "string" ? content : buffer.toString("utf8"),
    };

    this.artifacts.set(artifactId, artifact);
    return this.sanitizeArtifactForClient(artifact);
  }

  getArtifact(artifactId) {
    return this.artifacts.get(artifactId) || null;
  }

  listTaskArtifacts(taskId) {
    const self = this;
    return Array.from(this.artifacts.values())
      .filter(function(a) { return !taskId || a.taskId === taskId; })
      .map(function(a) { return self.sanitizeArtifactForClient(a); });
  }

  sanitizeArtifactForClient(artifact) {
    if (!artifact) return null;
    const clientSafe = Object.assign({}, artifact);
    delete clientSafe.contentBuffer;

    clientSafe.snippet = artifact.rawContent ? artifact.rawContent.slice(0, 300) : "";
    clientSafe.hasPreview = ["html", "pdf", "code", "json", "txt"].indexOf(artifact.type) !== -1;

    // Include full content for HTML and code so the browser can render inline
    // without needing a network round-trip to the artifact download endpoint
    if (artifact.type === "html" || artifact.type === "code") {
      clientSafe.bundleHtml = artifact.rawContent || "";
      clientSafe.content = artifact.rawContent || "";
    }

    return clientSafe;
  }
}

const globalArtifactRegistry = new ArtifactRegistry();

module.exports = {
  ARTIFACT_TYPES: ARTIFACT_TYPES,
  MIME_MAP: MIME_MAP,
  ArtifactRegistry: ArtifactRegistry,
  globalArtifactRegistry: globalArtifactRegistry,
};
