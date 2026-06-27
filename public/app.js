(() => {
  "use strict";

  /* ---------------- STATE ---------------- */
  let bots = [];          // [{id, name, status, updatedAt}]
  let activeId = null;
  let activeBot = null;    // full bot object {id, name, code, status, logs}
  let dirty = false;
  let savedCodeSnapshot = "";

  /* ---------------- DOM ---------------- */
  const el = (id) => document.getElementById(id);
  const botList = el("botList");
  const emptyHint = el("emptyHint");
  const emptyMain = el("emptyMain");
  const botView = el("botView");
  const headerDot = el("headerDot");
  const headerName = el("headerName");
  const unsavedTag = el("unsavedTag");
  const codeEditor = el("codeEditor");
  const consoleBody = el("consoleBody");
  const consoleLiveTag = el("consoleLiveTag");
  const btnToggleLive = el("btnToggleLive");
  const toggleLiveText = el("toggleLiveText");
  const liveDot = el("liveDot");
  const liveNum = el("liveNum");

  /* ---------------- HELPERS ---------------- */
  function timeAgo(ts) {
    if (!ts) return "";
    const diff = Math.max(0, Date.now() - ts);
    const m = Math.floor(diff / 60000);
    if (m < 1) return "vừa xong";
    if (m < 60) return `${m} phút trước`;
    const h = Math.floor(m / 60);
    if (h < 24) return `${h} giờ trước`;
    return `${Math.floor(h / 24)} ngày trước`;
  }

  async function api(path, opts) {
    const res = await fetch(path, {
      headers: { "Content-Type": "application/json" },
      ...opts,
    });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      throw new Error(body.error || `Lỗi ${res.status}`);
    }
    return res.json();
  }

  /* ---------------- RENDER: SIDEBAR ---------------- */
  function renderBotList() {
    const sorted = [...bots].sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));
    emptyHint.style.display = sorted.length === 0 ? "block" : "none";

    botList.querySelectorAll(".bot-item").forEach((n) => n.remove());

    sorted.forEach((b) => {
      const item = document.createElement("div");
      item.className = "bot-item" + (b.id === activeId ? " active" : "");
      item.innerHTML = `
        <span class="dot ${b.status === "live" ? "on" : "off"}"></span>
        <div class="bot-info">
          <div class="bot-name mono">${escapeHtml(b.name)}.js</div>
          <div class="bot-time">${timeAgo(b.updatedAt)}</div>
        </div>
        <span class="bot-trash" title="Xoá">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/></svg>
        </span>
      `;
      item.addEventListener("click", (e) => {
        if (e.target.closest(".bot-trash")) {
          openDeleteModal(b.id);
        } else {
          selectBot(b.id);
        }
      });
      botList.appendChild(item);
    });

    const liveCount = bots.filter((b) => b.status === "live").length;
    liveDot.className = "dot " + (liveCount > 0 ? "on" : "off");
    liveNum.textContent = liveCount;
  }

  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, (c) => ({
      "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
    }[c]));
  }

  /* ---------------- RENDER: MAIN VIEW ---------------- */
  function renderMain() {
    if (!activeBot) {
      emptyMain.style.display = "flex";
      botView.style.display = "none";
      return;
    }
    emptyMain.style.display = "none";
    botView.style.display = "flex";

    headerName.textContent = activeBot.name + ".js";
    headerDot.className = "dot " + (activeBot.status === "live" ? "on" : "off");
    unsavedTag.style.display = dirty ? "inline-block" : "none";

    if (codeEditor.value !== activeBot.code) {
      codeEditor.value = activeBot.code || "";
    }

    const isLive = activeBot.status === "live";
    btnToggleLive.classList.toggle("live", isLive);
    toggleLiveText.textContent = isLive ? "Đang chạy 24/7" : "Bật chạy 24/7";
    consoleLiveTag.style.display = isLive ? "flex" : "none";

    renderLogs(activeBot.logs || []);
  }

  function renderLogs(logs) {
    if (!logs.length) {
      consoleBody.innerHTML = `<p class="console-hint">Bật "chạy 24/7" để khởi động bot thật bằng Node.js trên server. Log sẽ hiện ở đây theo thời gian thực.</p>`;
      return;
    }
    consoleBody.innerHTML = "";
    logs.forEach((l) => appendLogLine(l, false));
    scrollConsoleToBottom();
  }

  function appendLogLine(entry, autoScroll = true) {
    const hint = consoleBody.querySelector(".console-hint");
    if (hint) hint.remove();
    const div = document.createElement("div");
    div.className = `log-line ${entry.type}`;
    div.textContent = entry.text;
    consoleBody.appendChild(div);
    if (autoScroll) scrollConsoleToBottom();
  }

  function scrollConsoleToBottom() {
    consoleBody.scrollTop = consoleBody.scrollHeight;
  }

  /* ---------------- ACTIONS ---------------- */
  async function loadBots() {
    bots = await api("/api/bots");
    renderBotList();
  }

  async function selectBot(id) {
    if (dirty && activeId && !confirm("Bạn có thay đổi chưa lưu. Chuyển bot và bỏ thay đổi?")) {
      return;
    }
    activeId = id;
    activeBot = await api(`/api/bots/${id}`);
    savedCodeSnapshot = activeBot.code || "";
    dirty = false;
    renderBotList();
    renderMain();
  }

  async function createBot(name) {
    const created = await api("/api/bots", {
      method: "POST",
      body: JSON.stringify({ name }),
    });
    await loadBots();
    await selectBot(created.id);
  }

  async function saveCode() {
    if (!activeId) return;
    await api(`/api/bots/${activeId}/code`, {
      method: "PUT",
      body: JSON.stringify({ code: codeEditor.value }),
    });
    savedCodeSnapshot = codeEditor.value;
    dirty = false;
    activeBot.code = codeEditor.value;
    activeBot.updatedAt = Date.now();
    renderMain();
    await loadBots();
  }

  async function toggleLive() {
    if (!activeId) return;
    const isLive = activeBot.status === "live";
    if (dirty) await saveCode();
    await api(`/api/bots/${activeId}/${isLive ? "stop" : "start"}`, { method: "POST" });
    activeBot.status = isLive ? "stopped" : "live";
    renderMain();
    await loadBots();
  }

  async function deleteBot(id) {
    await api(`/api/bots/${id}`, { method: "DELETE" });
    if (activeId === id) {
      activeId = null;
      activeBot = null;
      dirty = false;
    }
    await loadBots();
    renderMain();
  }

  /* ---------------- MODALS ---------------- */
  function openNewModal() {
    el("newBotName").value = "";
    el("modalNew").style.display = "flex";
    setTimeout(() => el("newBotName").focus(), 50);
  }
  function closeNewModal() { el("modalNew").style.display = "none"; }

  let pendingDeleteId = null;
  function openDeleteModal(id) {
    pendingDeleteId = id;
    el("modalDelete").style.display = "flex";
  }
  function closeDeleteModal() {
    pendingDeleteId = null;
    el("modalDelete").style.display = "none";
  }

  /* ---------------- EVENTS ---------------- */
  el("btnNewBot").addEventListener("click", openNewModal);
  el("btnCancelNew").addEventListener("click", closeNewModal);
  el("btnConfirmNew").addEventListener("click", async () => {
    const name = el("newBotName").value.trim() || "bot-moi";
    closeNewModal();
    await createBot(name);
  });
  el("newBotName").addEventListener("keydown", (e) => {
    if (e.key === "Enter") el("btnConfirmNew").click();
  });

  el("btnCancelDelete").addEventListener("click", closeDeleteModal);
  el("btnConfirmDelete").addEventListener("click", async () => {
    const id = pendingDeleteId;
    closeDeleteModal();
    if (id) await deleteBot(id);
  });

  el("btnSave").addEventListener("click", saveCode);
  el("btnDelete").addEventListener("click", () => {
    if (activeId) openDeleteModal(activeId);
  });
  el("btnToggleLive").addEventListener("click", toggleLive);

  codeEditor.addEventListener("input", () => {
    dirty = codeEditor.value !== savedCodeSnapshot;
    unsavedTag.style.display = dirty ? "inline-block" : "none";
  });

  // Ctrl/Cmd+S để lưu nhanh
  document.addEventListener("keydown", (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key === "s") {
      e.preventDefault();
      if (activeId) saveCode();
    }
  });

  window.addEventListener("beforeunload", (e) => {
    if (dirty) {
      e.preventDefault();
      e.returnValue = "";
    }
  });

  /* ---------------- WEBSOCKET: log realtime ---------------- */
  function connectWS() {
    const proto = location.protocol === "https:" ? "wss:" : "ws:";
    const ws = new WebSocket(`${proto}//${location.host}/ws`);

    ws.addEventListener("message", (ev) => {
      let msg;
      try { msg = JSON.parse(ev.data); } catch { return; }

      if (msg.kind === "log") {
        if (msg.id === activeId) {
          appendLogLine(msg.entry);
        }
        const b = bots.find((x) => x.id === msg.id);
        if (b) renderBotList();
      }

      if (msg.kind === "status") {
        const b = bots.find((x) => x.id === msg.id);
        if (b) b.status = msg.status;
        if (msg.id === activeId && activeBot) {
          activeBot.status = msg.status;
          renderMain();
        }
        renderBotList();
      }
    });

    ws.addEventListener("close", () => {
      setTimeout(connectWS, 2000); // tự kết nối lại
    });
    ws.addEventListener("error", () => ws.close());
  }

  /* ---------------- INIT ---------------- */
  (async function init() {
    try {
      await loadBots();
    } catch (e) {
      botList.innerHTML = `<div class="empty-hint" style="color:#FF8B8B">Lỗi kết nối server: ${escapeHtml(e.message)}</div>`;
    }
    connectWS();
    // Cập nhật "x phút trước" mỗi 30s
    setInterval(renderBotList, 30000);
  })();
})();
