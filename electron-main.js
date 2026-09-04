const { app, BrowserWindow, ipcMain, globalShortcut, shell } = require("electron");
const path = require("path");
const { exec } = require("child_process");
const fs = require("fs");

let mainWindow;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 820,
    minWidth: 900,
    minHeight: 600,
    title: "XManius AI - Desktop Jarvis",
    backgroundColor: "#0b0f19",
    icon: path.join(__dirname, "assets", "xmanius-icon.png"),
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, "preload.js")
    },
    frame: true,
    autoHideMenuBar: true
  });

  // Load the XManius Chat interface
  const indexPath = path.join(__dirname, "xmanius-chat.html");
  mainWindow.loadFile(indexPath).catch(() => {
    // If running with local dev server, fall back to localhost
    mainWindow.loadURL("http://localhost:3000/xmanius-chat.html");
  });

  // Open external links in default system browser
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith("http:") || url.startsWith("https:")) {
      shell.openExternal(url);
      return { action: "deny" };
    }
    return { action: "allow" };
  });

  // Global hotkey to summon XManius like Tony Stark's JARVIS: Ctrl + Shift + X
  globalShortcut.register("CommandOrControl+Shift+X", () => {
    if (mainWindow.isVisible() && !mainWindow.isMinimized()) {
      mainWindow.hide();
    } else {
      mainWindow.show();
      mainWindow.focus();
    }
  });

  mainWindow.on("closed", () => {
    mainWindow = null;
  });
}

// ─── Native Jarvis IPC Handlers (CMD execution, App Launcher, File Operations) ───

// 1. Run CMD / PowerShell command
ipcMain.handle("jarvis-exec-cmd", async (event, command) => {
  return new Promise((resolve) => {
    exec(command, { maxBuffer: 10 * 1024 * 1024 }, (err, stdout, stderr) => {
      resolve({
        success: !err,
        stdout: stdout || "",
        stderr: stderr || "",
        exitCode: err ? (err.code || 1) : 0
      });
    });
  });
});

// 2. Launch Windows application (e.g. "code", "chrome", "calc", "notepad")
ipcMain.handle("jarvis-launch-app", async (event, appName) => {
  return new Promise((resolve) => {
    const cmd = process.platform === "win32" ? `start "" "${appName}"` : `open "${appName}"`;
    exec(cmd, (err) => {
      resolve({
        success: !err,
        message: err ? err.message : `Launched ${appName}`
      });
    });
  });
});

// 3. File System: Read file
ipcMain.handle("jarvis-file-read", async (event, filePath) => {
  try {
    const content = fs.readFileSync(filePath, "utf-8");
    return { success: true, content };
  } catch (err) {
    return { success: false, error: err.message };
  }
});

// 4. File System: Write/Modify file
ipcMain.handle("jarvis-file-write", async (event, filePath, content) => {
  try {
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    fs.writeFileSync(filePath, content || "", "utf-8");
    return { success: true, message: `Saved ${filePath}` };
  } catch (err) {
    return { success: false, error: err.message };
  }
});

app.whenReady().then(createWindow);

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});

app.on("activate", () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow();
});
