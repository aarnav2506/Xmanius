/**
 * XManius Jarvis Desktop Bridge
 * Local daemon enabling XManius to:
 * 1. Execute CMD / PowerShell commands directly on your PC
 * 2. Launch any Windows desktop application (Chrome, VS Code, Spotify, Notepad, Calculator, etc.)
 * 3. Inspect, create, and modify files across your computer
 * 4. Act as an autonomous Tony Stark JARVIS desktop companion
 *
 * Usage:
 *   node desktop-bridge.js
 * Default Port: 3001
 */

const http = require("http");
const { exec, spawn } = require("child_process");
const fs = require("fs");
const path = require("path");

const PORT = process.env.XMANIUS_BRIDGE_PORT || 3001;
const AUTH_TOKEN = process.env.XMANIUS_BRIDGE_TOKEN || "xmanius-jarvis-local-auth";

const sendJson = (res, statusCode, data) => {
  res.writeHead(statusCode, {
    "Content-Type": "application/json",
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS"
  });
  res.end(JSON.stringify(data));
};

const server = http.createServer((req, res) => {
  if (req.method === "OPTIONS") {
    res.writeHead(204, {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Headers": "Content-Type, Authorization",
      "Access-Control-Allow-Methods": "GET, POST, OPTIONS"
    });
    return res.end();
  }

  const url = new URL(req.url, `http://${req.headers.host || "localhost"}`);
  const pathname = url.pathname;

  if (pathname === "/api/health") {
    return sendJson(res, 200, { status: "online", system: "JARVIS Desktop Bridge", platform: process.platform });
  }

  let body = "";
  req.on("data", chunk => { body += chunk; });
  req.on("end", () => {
    let payload = {};
    if (body) {
      try { payload = JSON.parse(body); } catch (_) {}
    }

    // 1. Execute CMD / Terminal Commands
    if (pathname === "/api/terminal" && req.method === "POST") {
      const command = payload.command;
      if (!command) return sendJson(res, 400, { error: "Command required." });
      
      console.log(`[JARVIS CMD] Executing: ${command}`);
      exec(command, { cwd: payload.cwd || process.cwd(), maxBuffer: 10 * 1024 * 1024 }, (err, stdout, stderr) => {
        return sendJson(res, 200, {
          command,
          stdout: stdout || "",
          stderr: stderr || "",
          exitCode: err ? (err.code || 1) : 0,
          success: !err
        });
      });
      return;
    }

    // 2. Launch Windows Apps (e.g. "code", "chrome", "notepad", "calc", "spotify")
    if (pathname === "/api/apps/launch" && req.method === "POST") {
      const appName = payload.app;
      if (!appName) return sendJson(res, 400, { error: "Application name required." });
      
      const cmd = process.platform === "win32" ? `start "" "${appName}"` : `open "${appName}"`;
      console.log(`[JARVIS APP] Launching: ${appName}`);
      exec(cmd, (err) => {
        if (err) return sendJson(res, 500, { error: err.message });
        return sendJson(res, 200, { message: `Launched ${appName} successfully.` });
      });
      return;
    }

    // 3. File Operations (read, write, modify, list)
    if (pathname === "/api/files/read" && req.method === "POST") {
      const targetPath = payload.path;
      if (!targetPath || !fs.existsSync(targetPath)) return sendJson(res, 404, { error: "File not found." });
      try {
        const content = fs.readFileSync(targetPath, "utf-8");
        return sendJson(res, 200, { path: targetPath, content });
      } catch (e) {
        return sendJson(res, 500, { error: e.message });
      }
    }

    if (pathname === "/api/files/write" && req.method === "POST") {
      const { path: targetPath, content } = payload;
      if (!targetPath) return sendJson(res, 400, { error: "File path required." });
      try {
        fs.mkdirSync(path.dirname(targetPath), { recursive: true });
        fs.writeFileSync(targetPath, content || "", "utf-8");
        return sendJson(res, 200, { message: `File ${targetPath} saved successfully.` });
      } catch (e) {
        return sendJson(res, 500, { error: e.message });
      }
    }

    if (pathname === "/api/files/list" && req.method === "POST") {
      const targetDir = payload.path || process.cwd();
      try {
        const entries = fs.readdirSync(targetDir, { withFileTypes: true }).map(e => ({
          name: e.name,
          isDirectory: e.isDirectory()
        }));
        return sendJson(res, 200, { directory: targetDir, entries });
      } catch (e) {
        return sendJson(res, 500, { error: e.message });
      }
    }

    return sendJson(res, 404, { error: "Endpoint not found." });
  });
});

server.listen(PORT, () => {
  console.log(`=================================================`);
  console.log(`   XManius Jarvis Desktop Bridge Active`);
  console.log(`   Listening at: http://localhost:${PORT}`);
  console.log(`   CMD Execution: READY`);
  console.log(`   App Launcher: READY`);
  console.log(`   File Access: READY`);
  console.log(`=================================================`);
});
