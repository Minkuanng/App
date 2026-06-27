/**
 * CodeBot Studio — server.js
 * ---------------------------------------------------------------
 * 1 web app DUY NHẤT: vừa phục vụ giao diện, vừa thực sự chạy các
 * bot Node.js của bạn 24/7 bằng child_process thật (có đầy đủ
 * require(), npm package, mạng...).
 *
 * Lưu trữ: file JSON đơn giản trong ./data (không cần Firebase,
 * không cần service account, deploy 1 lần là chạy được luôn).
 *
 * Chạy local:
 *   npm install
 *   npm start
 *   -> mở http://localhost:3000
 *
 * Deploy: xem HUONG-DAN.md
 */

const express = require("express");
const http = require("http");
const WebSocket = require("ws");
const fs = require("fs");
const path = require("path");
const { spawn } = require("child_process");
const crypto = require("crypto");

const PORT = process.env.PORT || 3000;
const DATA_DIR = path.join(__dirname, "data");
const BOTS_DIR = path.join(__dirname, "bots");
const DB_FILE = path.join(DATA_DIR, "db.json");
const MAX_LOG_LINES = 500;

for (const dir of [DATA_DIR, BOTS_DIR]) {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

/* ----------------------------------------------------------------
   LƯU TRỮ (file JSON đơn giản, ghi an toàn)
---------------------------------------------------------------- */
function loadDB() {
  if (!fs.existsSync(DB_FILE)) return { bots: {} };
  try {
    return JSON.parse(fs.readFileSync(DB_FILE, "utf8"));
  } catch {
    return { bots: {} };
  }
}

let db = loadDB();
let writeTimer = null;
function saveDB() {
  clearTimeout(writeTimer);
  writeTimer = setTimeout(() => {
    fs.writeFileSync(DB_FILE, JSON.stringify(db, null, 2));
  }, 150);
}

function newId() {
  return crypto.randomBytes(5).toString("hex");
}

const DEFAULT_CODE = `// bot.js — code của bot bạn
// File này được chạy bằng Node.js thật, đầy đủ require(), 24/7.

console.log("Bot đã khởi động lúc " + new Date().toLocaleString());

let dem = 0;
setInterval(() => {
  dem++;
  console.log("Nhịp tim bot #" + dem);
}, 5000);
`;

/* ----------------------------------------------------------------
   QUẢN LÝ TIẾN TRÌNH BOT (mỗi bot = 1 process con Node thật)
---------------------------------------------------------------- */
// id -> { proc, codeHash }
const running = new Map();
const wsClients = new Set();

function broadcast(msg) {
  const data = JSON.stringify(msg);
  for (const ws of wsClients) {
    if (ws.readyState === WebSocket.OPEN) ws.send(data);
  }
}

function hashCode(code) {
  return crypto.createHash("md5").update(code || "").digest("hex");
}

function pushLog(id, type, text) {
  const bot = db.bots[id];
  if (!bot) return;
  if (!bot.logs) bot.logs = [];
  const entry = { type, text: String(text).slice(0, 4000), t: Date.now() };
  bot.logs.push(entry);
  if (bot.logs.length > MAX_LOG_LINES) {
    bot.logs = bot.logs.slice(-MAX_LOG_LINES);
  }
  saveDB();
  broadcast({ kind: "log", id, entry });
}

function setStatus(id, status) {
  const bot = db.bots[id];
  if (!bot) return;
  bot.status = status;
  bot.updatedAt = Date.now();
  saveDB();
  broadcast({ kind: "status", id, status });
}

function startBot(id) {
  const bot = db.bots[id];
  if (!bot || running.has(id)) return;

  const filePath = path.join(BOTS_DIR, `${id}.js`);
  fs.writeFileSync(filePath, bot.code || "// (rỗng)");

  pushLog(id, "system", `Đang khởi động bot "${bot.name}"...`);

  const child = spawn(process.execPath, [filePath], {
    stdio: ["ignore", "pipe", "pipe"],
    env: { ...process.env },
    cwd: BOTS_DIR,
  });

  child.stdout.on("data", (chunk) => {
    chunk.toString().split("\n").filter(Boolean).forEach((l) => pushLog(id, "log", l));
  });
  child.stderr.on("data", (chunk) => {
    chunk.toString().split("\n").filter(Boolean).forEach((l) => pushLog(id, "error", l));
  });

  child.on("exit", (code, signal) => {
    running.delete(id);
    pushLog(id, "system", `Bot "${bot.name}" đã dừng (mã: ${code}, signal: ${signal || "none"}).`);
    const stillWantsLive = db.bots[id] && db.bots[id].status === "live";
    setStatus(id, "stopped");
    // tự khởi động lại nếu bot crash ngoài ý muốn trong khi vẫn được đánh dấu live
    if (stillWantsLive && code !== 0) {
      setTimeout(() => {
        if (db.bots[id]) {
          setStatus(id, "live");
          startBot(id);
        }
      }, 3000);
    }
  });

  running.set(id, { proc: child, codeHash: hashCode(bot.code) });
  setStatus(id, "live");
  pushLog(id, "system", `Bot "${bot.name}" đang chạy (PID ${child.pid}).`);
}

function stopBot(id, reason) {
  const entry = running.get(id);
  if (!entry) return;
  entry.proc.kill();
  running.delete(id);
  if (db.bots[id]) {
    if (reason) pushLog(id, "system", reason);
    setStatus(id, "stopped");
  }
}

function restartBot(id, reason) {
  if (running.has(id)) {
    running.get(id).proc.removeAllListeners("exit");
    running.get(id).proc.kill();
    running.delete(id);
  }
  if (reason) pushLog(id, "system", reason);
  startBot(id);
}

/* ----------------------------------------------------------------
   EXPRESS APP
---------------------------------------------------------------- */
const app = express();
app.use(express.json({ limit: "2mb" }));
app.use(express.static(path.join(__dirname, "public")));

app.get("/api/bots", (req, res) => {
  const list = Object.entries(db.bots).map(([id, b]) => ({
    id,
    name: b.name,
    status: running.has(id) ? "live" : "stopped",
    createdAt: b.createdAt,
    updatedAt: b.updatedAt,
  }));
  res.json(list);
});

app.get("/api/bots/:id", (req, res) => {
  const bot = db.bots[req.params.id];
  if (!bot) return res.status(404).json({ error: "Không tìm thấy bot" });
  res.json({
    id: req.params.id,
    ...bot,
    status: running.has(req.params.id) ? "live" : "stopped",
  });
});

app.post("/api/bots", (req, res) => {
  const name = (req.body.name || "bot-moi").trim().replace(/[^a-zA-Z0-9-_]/g, "-");
  const id = newId();
  db.bots[id] = {
    name,
    code: DEFAULT_CODE,
    status: "stopped",
    logs: [],
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };
  saveDB();
  res.json({ id, ...db.bots[id] });
});

app.put("/api/bots/:id/code", (req, res) => {
  const bot = db.bots[req.params.id];
  if (!bot) return res.status(404).json({ error: "Không tìm thấy bot" });
  bot.code = req.body.code ?? "";
  bot.updatedAt = Date.now();
  saveDB();

  // Nếu bot đang live, tự khởi động lại với code mới
  if (running.has(req.params.id)) {
    restartBot(req.params.id, "Phát hiện code mới — khởi động lại bot...");
  }
  res.json({ ok: true });
});

app.post("/api/bots/:id/start", (req, res) => {
  const id = req.params.id;
  if (!db.bots[id]) return res.status(404).json({ error: "Không tìm thấy bot" });
  startBot(id);
  res.json({ ok: true });
});

app.post("/api/bots/:id/stop", (req, res) => {
  const id = req.params.id;
  if (!db.bots[id]) return res.status(404).json({ error: "Không tìm thấy bot" });
  stopBot(id, `Bot "${db.bots[id].name}" đã được tắt từ trang web.`);
  res.json({ ok: true });
});

app.delete("/api/bots/:id", (req, res) => {
  const id = req.params.id;
  stopBot(id, null);
  delete db.bots[id];
  saveDB();
  const f = path.join(BOTS_DIR, `${id}.js`);
  if (fs.existsSync(f)) fs.unlinkSync(f);
  res.json({ ok: true });
});

app.get("/api/bots/:id/logs", (req, res) => {
  const bot = db.bots[req.params.id];
  if (!bot) return res.status(404).json({ error: "Không tìm thấy bot" });
  res.json(bot.logs || []);
});

/* ----------------------------------------------------------------
   HTTP + WEBSOCKET SERVER
---------------------------------------------------------------- */
const server = http.createServer(app);
const wss = new WebSocket.Server({ server, path: "/ws" });

wss.on("connection", (ws) => {
  wsClients.add(ws);
  ws.on("close", () => wsClients.delete(ws));
});

server.listen(PORT, () => {
  console.log(`[READY] CodeBot Studio đang chạy tại http://localhost:${PORT}`);

  // Tự khởi động lại các bot đang ở trạng thái "live" từ lần chạy trước
  // (ví dụ sau khi server restart/deploy lại)
  Object.entries(db.bots).forEach(([id, bot]) => {
    if (bot.status === "live") {
      console.log(`[RESUME] Tự khởi động lại bot đang live: ${bot.name}`);
      startBot(id);
    }
  });
});

process.on("SIGTERM", shutdown);
process.on("SIGINT", shutdown);
function shutdown() {
  console.log("[SHUTDOWN] Đang dừng server...");
  for (const id of running.keys()) {
    running.get(id).proc.kill();
  }
  process.exit(0);
}

