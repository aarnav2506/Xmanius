"use strict";

const requestIdFor = () => globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(36).slice(2)}`;

const environmentValue = (...names) => names.map((name) => process.env[name]).find((value) => typeof value === "string" && value.trim())?.trim() || "";

const apiKeyForModel = (model = "xmanius-1") => {
  const slot = Number(String(model).slice("xmanius-".length)) || 1;
  const suffix = slot === 1 ? "" : `_${slot}`;
  return environmentValue(
    `XMANIUS_GEMINI_API_KEY${suffix}`,
    `XMANIUS_GEMINI_API_KEY_${slot}`,
    `XMANIUS_DEMO_API_KEY${suffix}`,
    `XMANIUS_DEMO_API_KEY_${slot}`,
    `XMANTIUS_GEMINI_API_KEY${suffix}`,
    `XMANTIUS_GEMINI_API_KEY_${slot}`,
    "XMANIUS_GEMINI_API_KEY",
    "XMANIUS_DEMO_API_KEY",
    "GEMINI_API_KEY",
    "GOOGLE_API_KEY"
  );
};

const normalizeMimeType = (mimeType, name = "") => {
  let mime = (mimeType || "").toLowerCase().trim();
  const ext = (name.split(".").pop() || "").toLowerCase();
  if (mime === "audio/mp3" || ext === "mp3") return "audio/mp3";
  if (mime === "audio/mpeg") return "audio/mpeg";
  if (mime === "audio/wav" || mime === "audio/x-wav" || ext === "wav") return "audio/wav";
  if (mime === "audio/ogg" || ext === "ogg") return "audio/ogg";
  if (mime === "audio/flac" || ext === "flac") return "audio/flac";
  if (mime === "audio/aac" || ext === "aac") return "audio/aac";
  if (mime === "audio/m4a" || mime === "audio/x-m4a" || ext === "m4a") return "audio/mp4";
  if (mime === "video/mp4" || ext === "mp4" || ext === "m4v") return "video/mp4";
  if (mime === "video/webm" || ext === "webm") return "video/webm";
  if (mime === "video/quicktime" || ext === "mov") return "video/quicktime";
  if (mime === "video/x-matroska" || ext === "mkv") return "video/x-matroska";
  if (mime === "video/avi" || mime === "video/x-msvideo" || ext === "avi") return "video/avi";
  if (mime === "image/jpg" || mime === "image/jpeg" || ext === "jpg" || ext === "jpeg") return "image/jpeg";
  if (mime === "image/png" || ext === "png") return "image/png";
  if (mime === "image/webp" || ext === "webp") return "image/webp";
  if (mime === "image/gif" || ext === "gif") return "image/gif";
  if (mime === "application/pdf" || ext === "pdf") return "application/pdf";
  return mime || "application/octet-stream";
};

async function handler(request, response) {
  const requestId = requestIdFor();
  const applyCorsHeaders = () => {
    const origin = String(request.headers?.origin || "");
    const allowed = !origin || origin === "null" || ["http://localhost", "https://localhost", "capacitor://localhost"].includes(origin) || /^https:\/\/[a-z0-9-]+\.vercel\.app$/i.test(origin);
    if (allowed) response.setHeader("Access-Control-Allow-Origin", origin || "*");
    response.setHeader("Access-Control-Allow-Headers", "Content-Type, Accept, X-Goog-Upload-Protocol, X-Goog-Upload-Command, X-Goog-Upload-Header-Content-Length, X-Goog-Upload-Header-Content-Type");
    response.setHeader("Access-Control-Allow-Methods", "POST, GET, OPTIONS");
    response.setHeader("Vary", "Origin");
  };
  const applyPrivacyHeaders = () => {
    response.setHeader("Cache-Control", "no-store, private, max-age=0");
    response.setHeader("Pragma", "no-cache");
    response.setHeader("Expires", "0");
    response.setHeader("X-Content-Type-Options", "nosniff");
    response.setHeader("Referrer-Policy", "no-referrer");
  };

  applyCorsHeaders();
  applyPrivacyHeaders();

  if (request.method === "OPTIONS") return response.status(204).end();

  // Check file state if requested
  if (request.method === "GET") {
    const fileId = request.query?.fileId || request.query?.name;
    const model = request.query?.model || "xmanius-1";
    if (!fileId) return response.status(400).json({ error: "Missing fileId parameter." });
    const apiKey = apiKeyForModel(model);
    if (!apiKey) return response.status(503).json({ error: "API key not configured." });
    try {
      const cleanId = String(fileId).replace(/^files\//, "");
      const checkRes = await fetch(`https://generativelanguage.googleapis.com/v1beta/files/${encodeURIComponent(cleanId)}?key=${encodeURIComponent(apiKey)}`);
      const fileData = await checkRes.json();
      return response.status(checkRes.status).json(fileData);
    } catch (err) {
      return response.status(500).json({ error: err.message || "Failed to check file status." });
    }
  }

  if (request.method !== "POST") return response.status(405).json({ error: "Only POST and GET requests are supported." });

  let body = request.body || {};
  if (typeof body === "string") {
    try { body = JSON.parse(body || "{}"); } catch { return response.status(400).json({ error: "Invalid JSON body." }); }
  }

  const { name, size, mimeType: rawMime, model = "xmanius-1" } = body;
  if (!name || !size) {
    return response.status(400).json({ error: "File name and size are required." });
  }

  const mimeType = normalizeMimeType(rawMime, name);
  const apiKey = apiKeyForModel(model);
  if (!apiKey) {
    return response.status(503).json({ error: "Xmanius upload credentials not configured. Please check Vercel environment variables." });
  }

  try {
    const startUrl = `https://generativelanguage.googleapis.com/upload/v1beta/files?key=${encodeURIComponent(apiKey)}`;
    const googleRes = await fetch(startUrl, {
      method: "POST",
      headers: {
        "X-Goog-Upload-Protocol": "resumable",
        "X-Goog-Upload-Command": "start",
        "X-Goog-Upload-Header-Content-Length": String(size),
        "X-Goog-Upload-Header-Content-Type": mimeType,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({ file: { display_name: String(name).slice(0, 150) } })
    });

    const uploadUrl = googleRes.headers.get("x-goog-upload-url");
    if (!uploadUrl) {
      const errBody = await googleRes.text().catch(() => "");
      return response.status(googleRes.status || 500).json({
        error: `Could not initiate file upload session (${googleRes.status}). ${errBody}`
      });
    }

    return response.status(200).json({
      ok: true,
      uploadUrl,
      name,
      mimeType,
      size,
      requestId
    });
  } catch (err) {
    return response.status(500).json({
      error: err.message || "Failed to contact Google upload service."
    });
  }
}

module.exports = handler;
module.exports.default = handler;
