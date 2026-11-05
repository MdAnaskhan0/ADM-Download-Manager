const { app, BrowserWindow, ipcMain, shell, dialog } = require("electron");
const path = require("path");
const fs = require("fs");
const os = require("os");
const { spawn } = require("child_process");
const http = require("http");
const crypto = require("crypto");

let win;
let aria2;
let bridge;
let poller;
const jobs = new Map();
let rpcPort = 6800;
let rpcSecret = crypto.randomBytes(24).toString("hex");
let bridgeToken = crypto.randomBytes(24).toString("hex");
let downloadDir = path.join(os.homedir(), "Downloads", "ADM");
let settings = { theme: "dark", maxConcurrent: 3, speedLimit: 0, downloadDir };
let settingsPath;
let jobsPath;

function ensureDir(dir) { fs.mkdirSync(dir, { recursive: true }); }
function persist() {
  try {
    ensureDir(path.dirname(settingsPath));
    fs.writeFileSync(settingsPath, JSON.stringify(settings, null, 2));
    fs.writeFileSync(jobsPath, JSON.stringify([...jobs.values()], null, 2));
  } catch (e) { console.error("Persist error:", e); }
}
function loadState() {
  settingsPath = path.join(app.getPath("userData"), "settings.json");
  jobsPath = path.join(app.getPath("userData"), "jobs.json");
  try { settings = { ...settings, ...JSON.parse(fs.readFileSync(settingsPath, "utf8")) }; } catch {}
  downloadDir = settings.downloadDir || downloadDir;
  try {
    const saved = JSON.parse(fs.readFileSync(jobsPath, "utf8"));
    for (const j of saved) {
      if (["active", "queued", "processing"].includes(j.status)) j.status = "interrupted";
      jobs.set(j.id, j);
    }
  } catch {}
}
function send(channel, payload) {
  if (win && !win.isDestroyed()) win.webContents.send(channel, payload);
}
function createWindow() {
  win = new BrowserWindow({
    width: 1400, height: 900, minWidth: 980, minHeight: 650,
    backgroundColor: "#10131b",
    webPreferences: {
      preload: path.join(__dirname, "preload.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true
    }
  });
  if (process.env.VITE_DEV_SERVER_URL) win.loadURL(process.env.VITE_DEV_SERVER_URL);
  else win.loadFile(path.join(__dirname, "../dist/index.html"));
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith("http:") || url.startsWith("https:")) shell.openExternal(url);
    return { action: "deny" };
  });
}
function startAria2() {
  const args = [
    "--enable-rpc=true", "--rpc-listen-all=false", `--rpc-listen-port=${rpcPort}`,
    `--rpc-secret=${rpcSecret}`, "--rpc-allow-origin-all=true",
    "--continue=true", "--file-allocation=none", "--summary-interval=1",
    `--max-concurrent-downloads=${settings.maxConcurrent || 3}`, "--check-certificate=true"
  ];
  try {
    aria2 = spawn("aria2c", args, { stdio: "ignore" });
    aria2.on("error", () => send("engine-status", { aria2: false, message: "aria2c not found. Install aria2." }));
    aria2.on("exit", () => { aria2 = null; });
  } catch (e) { console.error(e); }
}
async function rpc(method, params = []) {
  const response = await fetch(`http://127.0.0.1:${rpcPort}/jsonrpc`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: "adm", method, params: [`token:${rpcSecret}`, ...params] })
  });
  const data = await response.json();
  if (data.error) throw new Error(data.error.message || "aria2 error");
  return data.result;
}
function newJob(data) {
  const job = {
    id: crypto.randomUUID(), url: data.url, name: data.name || data.url,
    type: data.type || "file", status: "queued", progress: 0, speed: 0,
    total: 0, downloaded: 0, createdAt: Date.now(), path: downloadDir,
    gid: null, error: null
  };
  jobs.set(job.id, job); persist(); send("jobs-updated", [...jobs.values()]);
  return job;
}
async function addFileDownload(data) {
  if (!data.url || !/^https?:\/\//i.test(data.url)) throw new Error("Enter a valid HTTP or HTTPS URL.");
  ensureDir(downloadDir);
  const job = newJob(data);
  try {
    const opts = {
      dir: downloadDir,
      "continue": "true",
      "max-connection-per-server": "8",
      split: "8",
      "min-split-size": "1M",
      "file-allocation": "none",
      "allow-overwrite": "false"
    };
    if (settings.speedLimit > 0) opts["max-download-limit"] = `${settings.speedLimit}K`;
    const gid = await rpc("aria2.addUri", [[data.url], opts]);
    job.gid = gid; job.status = "active"; persist();
    return job;
  } catch (e) {
    job.status = "failed"; job.error = e.message; persist(); throw e;
  }
}
function addVideoDownload(data) {
  if (!data.url || !/^https?:\/\//i.test(data.url)) throw new Error("Enter a valid HTTP or HTTPS URL.");
  ensureDir(downloadDir);
  const job = newJob({ ...data, type: "video" });
  const args = [
    "--newline", "--no-warnings", "--no-playlist",
    "-P", downloadDir,
    "-o", "%(title).180B [%(id)s].%(ext)s",
    "--print", "after_move:ADM_FILE:%(filepath)s",
    "--progress",
    data.audioOnly ? "-x" : "-f",
    ...(data.audioOnly ? [] : [data.format || "bv*+ba/b"]),
    data.url
  ];
  const proc = spawn("yt-dlp", args, { stdio: ["ignore", "pipe", "pipe"] });
  job.pid = proc.pid; job.status = "active"; persist();
  let buffer = "";
  const parse = chunk => {
    buffer += chunk.toString();
    const lines = buffer.split(/\r?\n/); buffer = lines.pop() || "";
    for (const line of lines) {
      const match = line.match(/\[download\]\s+([\d.]+)%.*?at\s+([^\s]+)/);
      if (match) { job.progress = Number(match[1]); job.speedText = match[2]; }
      const file = line.match(/^ADM_FILE:(.*)$/);
      if (file) job.file = file[1];
      send("jobs-updated", [...jobs.values()]);
    }
  };
  proc.stdout.on("data", parse);
  proc.stderr.on("data", parse);
  proc.on("error", e => { job.status = "failed"; job.error = e.message; persist(); send("jobs-updated", [...jobs.values()]); });
  proc.on("close", code => {
    job.status = code === 0 ? "completed" : "failed";
    if (code !== 0) job.error = `yt-dlp exited with code ${code}`;
    if (code === 0) job.progress = 100;
    job.pid = null; persist(); send("jobs-updated", [...jobs.values()]);
  });
  return job;
}
async function updateAriaJobs() {
  if (!aria2) return;
  try {
    const active = await rpc("aria2.tellActive", [["gid", "status", "totalLength", "completedLength", "downloadSpeed", "files", "errorMessage"]]);
    const waiting = await rpc("aria2.tellWaiting", [0, 100, ["gid", "status", "totalLength", "completedLength", "downloadSpeed", "files"]]);
    const stopped = await rpc("aria2.tellStopped", [0, 100, ["gid", "status", "totalLength", "completedLength", "downloadSpeed", "files", "errorMessage"]]);
    for (const item of [...active, ...waiting, ...stopped]) {
      const job = [...jobs.values()].find(j => j.gid === item.gid);
      if (!job) continue;
      job.status = item.status === "complete" ? "completed" : item.status === "error" ? "failed" : item.status === "paused" ? "paused" : item.status === "waiting" ? "queued" : "active";
      job.total = Number(item.totalLength || 0);
      job.downloaded = Number(item.completedLength || 0);
      job.progress = job.total ? Math.round(job.downloaded / job.total * 1000) / 10 : 0;
      job.speed = Number(item.downloadSpeed || 0);
      if (item.errorMessage) job.error = item.errorMessage;
      if (item.files?.[0]?.path) job.file = item.files[0].path;
    }
    persist(); send("jobs-updated", [...jobs.values()]);
  } catch {}
}
function startBridge() {
  bridge = http.createServer((req, res) => {
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type, X-ADM-Token");
    if (req.method === "OPTIONS") { res.writeHead(204); return res.end(); }
    if (req.method !== "POST" || req.url !== "/api/download") { res.writeHead(404); return res.end("Not found"); }
    let body = "";
    req.on("data", chunk => { body += chunk; if (body.length > 100000) req.destroy(); });
    req.on("end", async () => {
      try {
        if (req.headers["x-adm-token"] !== bridgeToken) throw new Error("Invalid ADM pairing token.");
        const data = JSON.parse(body || "{}");
        const job = data.type === "video" ? addVideoDownload(data) : await addFileDownload(data);
        res.writeHead(200, { "content-type": "application/json" });
        res.end(JSON.stringify({ ok: true, id: job.id }));
      } catch (e) {
        res.writeHead(400, { "content-type": "application/json" });
        res.end(JSON.stringify({ ok: false, error: e.message }));
      }
    });
  });
  bridge.listen(43821, "127.0.0.1");
}
app.whenReady().then(() => {
  loadState(); ensureDir(downloadDir); startAria2(); startBridge(); createWindow();
  poller = setInterval(updateAriaJobs, 1000);
  app.on("activate", () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });
});
app.on("before-quit", () => { clearInterval(poller); if (aria2) aria2.kill(); if (bridge) bridge.close(); persist(); });
app.on("window-all-closed", () => { if (process.platform !== "darwin") app.quit(); });

ipcMain.handle("jobs:list", () => [...jobs.values()].sort((a,b) => b.createdAt-a.createdAt));
ipcMain.handle("download:add", async (_, data) => {
  const job = data.type === "video" ? addVideoDownload(data) : await addFileDownload(data);
  return job;
});
ipcMain.handle("download:pause", async (_, id) => {
  const j = jobs.get(id); if (!j) return;
  if (j.gid) await rpc("aria2.pause", [j.gid]);
  else if (j.pid) { try { process.kill(j.pid, "SIGSTOP"); j.status = "paused"; } catch {} }
  persist(); send("jobs-updated", [...jobs.values()]);
});
ipcMain.handle("download:resume", async (_, id) => {
  const j = jobs.get(id); if (!j) return;
  if (j.gid) await rpc("aria2.unpause", [j.gid]);
  else if (j.pid) { try { process.kill(j.pid, "SIGCONT"); j.status = "active"; } catch {} }
  else if (j.type === "file") await addFileDownload({ url: j.url, name: j.name });
  persist(); send("jobs-updated", [...jobs.values()]);
});
ipcMain.handle("download:cancel", async (_, id) => {
  const j = jobs.get(id); if (!j) return;
  if (j.gid) { try { await rpc("aria2.forceRemove", [j.gid]); } catch {} }
  if (j.pid) { try { process.kill(j.pid, "SIGTERM"); } catch {} }
  j.status = "cancelled"; j.pid = null; persist(); send("jobs-updated", [...jobs.values()]);
});
ipcMain.handle("download:remove", (_, id) => { jobs.delete(id); persist(); send("jobs-updated", [...jobs.values()]); });
ipcMain.handle("settings:get", () => ({ ...settings, bridgeToken, bridgePort: 43821 }));
ipcMain.handle("settings:update", (_, patch) => {
  settings = { ...settings, ...patch };
  if (patch.downloadDir) { downloadDir = patch.downloadDir; ensureDir(downloadDir); }
  persist(); return { ...settings, bridgeToken, bridgePort: 43821 };
});
ipcMain.handle("settings:choose-folder", async () => {
  const result = await dialog.showOpenDialog(win, { properties: ["openDirectory", "createDirectory"] });
  return result.canceled ? null : result.filePaths[0];
});
ipcMain.handle("app:open-path", (_, p) => shell.openPath(p));
ipcMain.handle("app:reveal", (_, p) => shell.showItemInFolder(p));
ipcMain.handle("app:open-download-folder", () => shell.openPath(downloadDir));
