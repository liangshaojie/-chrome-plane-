// 侧边栏交互：解析当前 Tab URL → 调用本地后端 SSE → 渲染流式分析

console.log("[sidepanel] loaded at", new Date().toISOString());
window.addEventListener("pagehide", () =>
  console.warn("[sidepanel] pagehide — side panel 被卸载，fetch 会被中断")
);
window.addEventListener("beforeunload", () =>
  console.warn("[sidepanel] beforeunload")
);
document.addEventListener("visibilitychange", () =>
  console.log("[sidepanel] visibility →", document.visibilityState)
);

const $ = (id) => document.getElementById(id);
const metaEl = $("meta");
const analyzeBtn = $("analyzeBtn");
const stopBtn = $("stopBtn");
const serverUrlInput = $("serverUrl");
const statusEl = $("status");
const outputEl = $("output");
const processEl = $("process");
const issueCard = $("issueCard");
const issueTitleEl = $("issueTitle");
const issueStateEl = $("issueState");
const issueLabelsEl = $("issueLabels");
const issueLinkEl = $("issueLink");

let currentParsed = null; // { workspaceSlug, issueIdentifier }
let abortCtrl = null;

// 持久化后端地址
chrome.storage?.local.get(["serverUrl"]).then((s) => {
  if (s?.serverUrl) serverUrlInput.value = s.serverUrl;
});
serverUrlInput.addEventListener("change", () => {
  chrome.storage?.local.set({ serverUrl: serverUrlInput.value.trim() });
});

// 解析 https://app.plane.so/<workspace>/browse/<IDENT-N>/...
function parsePlaneUrl(url) {
  if (!url) return null;
  try {
    const u = new URL(url);
    if (!u.hostname.endsWith("plane.so")) return null;
    const parts = u.pathname.split("/").filter(Boolean);
    // 期望: [workspace, "browse", "CSDK-2", ...]
    const browseIdx = parts.indexOf("browse");
    if (browseIdx < 1 || browseIdx + 1 >= parts.length) return null;
    const workspaceSlug = parts[browseIdx - 1];
    const ident = parts[browseIdx + 1];
    if (!/^[A-Za-z0-9]+-\d+$/.test(ident)) return null;
    return { workspaceSlug, issueIdentifier: ident.toUpperCase() };
  } catch {
    return null;
  }
}

async function refreshActiveTab() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  const parsed = parsePlaneUrl(tab?.url);
  currentParsed = parsed;
  if (parsed) {
    metaEl.textContent = `${parsed.workspaceSlug} / ${parsed.issueIdentifier}`;
    analyzeBtn.disabled = false;
  } else {
    metaEl.textContent = "未识别 Plane 链接（请打开 app.plane.so 的 workItem 页面）";
    analyzeBtn.disabled = true;
  }
}

refreshActiveTab();
chrome.tabs.onActivated.addListener(refreshActiveTab);
chrome.tabs.onUpdated.addListener((_id, info) => {
  if (info.url || info.status === "complete") refreshActiveTab();
});

function setStatus(text, isError = false) {
  statusEl.textContent = text || "";
  statusEl.classList.toggle("error", Boolean(isError));
}

function appendText(text) {
  outputEl.appendChild(document.createTextNode(text));
  outputEl.scrollTop = outputEl.scrollHeight;
}

// ===== 过程日志 =====
const stepByToolId = new Map(); // tool_use_id -> {stepEl, bodyEl}
let startTs = 0;

function nowLabel() {
  if (!startTs) return "";
  const s = ((Date.now() - startTs) / 1000).toFixed(1);
  return `+${s}s`;
}

function addStep({ kind, badge, title, body, extraClass = "" }) {
  const el = document.createElement("div");
  el.className = `step step-${kind} ${extraClass}`;

  const head = document.createElement("div");
  head.className = "step-head";
  head.innerHTML = `
    <span class="step-badge">${badge}</span>
    <span class="step-title"></span>
    <span class="step-time">${nowLabel()}</span>
    <span class="step-chevron">▸</span>
  `;
  head.querySelector(".step-title").textContent = title;

  const bodyEl = document.createElement("div");
  bodyEl.className = "step-body";
  if (body != null) bodyEl.textContent = body;

  head.addEventListener("click", () => {
    el.classList.toggle("open");
    head.querySelector(".step-chevron").textContent = el.classList.contains("open") ? "▾" : "▸";
  });

  // 有 body 时默认允许展开；tool_use 默认收起，tool_result 略长默认收起
  el.appendChild(head);
  el.appendChild(bodyEl);
  processEl.appendChild(el);
  processEl.scrollTop = processEl.scrollHeight;
  return { el, bodyEl };
}

function truncate(str, n = 120) {
  if (!str) return "";
  const one = String(str).replace(/\s+/g, " ").trim();
  return one.length > n ? one.slice(0, n) + "…" : one;
}
function showIssue(issue) {
  issueCard.classList.remove("hidden");
  issueTitleEl.textContent = `[${issue.identifier}] ${issue.title}`;
  issueStateEl.textContent = issue.state ? `状态：${issue.state}` : "";
  issueLabelsEl.textContent = issue.labels?.length
    ? `标签：${issue.labels.join(", ")}`
    : "";
  issueLinkEl.textContent = issue.url;
  issueLinkEl.href = issue.url;
}

function resetOutput() {
  outputEl.textContent = "";
  processEl.textContent = "";
  stepByToolId.clear();
  startTs = Date.now();
  issueCard.classList.add("hidden");
}

async function startAnalyze() {
  if (!currentParsed) return;
  const serverUrl = serverUrlInput.value.trim().replace(/\/$/, "");
  if (!serverUrl) {
    setStatus("请填写后端地址", true);
    return;
  }
  resetOutput();
  setStatus("连接后端…");
  analyzeBtn.disabled = true;
  stopBtn.disabled = false;

  abortCtrl = new AbortController();
  abortCtrl.signal.addEventListener("abort", () => {
    console.warn("[sidepanel] fetch aborted", {
      stack: new Error().stack,
      visibility: document.visibilityState,
      hidden: document.hidden,
    });
  });
  console.log("[sidepanel] fetch start →", serverUrl, currentParsed);
  try {
    const res = await fetch(`${serverUrl}/analyze`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(currentParsed),
      signal: abortCtrl.signal,
    });
    console.log("[sidepanel] fetch response", res.status, res.headers.get("content-type"));
    if (!res.ok || !res.body) {
      const txt = await res.text().catch(() => "");
      throw new Error(`后端响应错误 ${res.status}: ${txt}`);
    }

    const reader = res.body.getReader();
    const decoder = new TextDecoder("utf-8");
    let buf = "";
    while (true) {
      const { value, done } = await reader.read();
      if (done) {
        console.log("[sidepanel] reader done");
        break;
      }
      console.log("[sidepanel] chunk bytes=", value?.byteLength);
      buf += decoder.decode(value, { stream: true });
      // 按 SSE 事件切分
      let idx;
      while ((idx = buf.indexOf("\n\n")) !== -1) {
        const raw = buf.slice(0, idx);
        buf = buf.slice(idx + 2);
        const line = raw.split("\n").find((l) => l.startsWith("data:"));
        if (!line) continue;
        const json = line.slice(5).trim();
        if (!json) continue;
        try {
          handleEvent(JSON.parse(json));
        } catch (e) {
          console.error("parse SSE failed", e, json);
        }
      }
    }
    setStatus("完成");
  } catch (err) {
    if (err?.name === "AbortError") {
      setStatus("已停止");
    } else {
      setStatus(err?.message || String(err), true);
    }
  } finally {
    analyzeBtn.disabled = !currentParsed;
    stopBtn.disabled = true;
    abortCtrl = null;
  }
}

function handleEvent(ev) {
  switch (ev.type) {
    case "status":
      setStatus(ev.message);
      addStep({ kind: "sys", badge: "状态", title: ev.message });
      break;
    case "issue":
      showIssue(ev.issue);
      addStep({
        kind: "sys",
        badge: "Plane",
        title: `已拉取 ${ev.issue.identifier} · ${ev.issue.title}`,
        body: JSON.stringify(ev.issue, null, 2),
      });
      break;
    case "system":
      addStep({
        kind: "sys",
        badge: "SDK",
        title: `初始化 ${ev.model || ""}${ev.subtype ? " · " + ev.subtype : ""}`,
        body:
          `session: ${ev.sessionId || "-"}\n` +
          `cwd: ${ev.cwd || "-"}\n` +
          `tools: ${(ev.tools || []).join(", ") || "-"}`,
      });
      break;
    case "thinking":
      addStep({ kind: "think", badge: "思考", title: truncate(ev.text), body: ev.text });
      break;
    case "text":
      // 分析正文写入「分析结果」面板；同时在过程中记录一条摘要
      appendText(ev.text);
      addStep({ kind: "text", badge: "回答", title: truncate(ev.text, 80), body: ev.text });
      break;
    case "tool_use": {
      const inputStr =
        typeof ev.input === "string" ? ev.input : JSON.stringify(ev.input, null, 2);
      const summary = truncate(
        typeof ev.input === "string" ? ev.input : JSON.stringify(ev.input),
        80
      );
      const step = addStep({
        kind: "tool",
        badge: `🔧 ${ev.name}`,
        title: summary || "(无参数)",
        body: inputStr,
      });
      if (ev.id) stepByToolId.set(ev.id, step);
      break;
    }
    case "tool_result": {
      const target = stepByToolId.get(ev.toolUseId);
      const preview = truncate(ev.content, 80);
      if (target) {
        // 把结果附加到对应 tool_use 卡片
        target.el.classList.toggle("error", !!ev.isError);
        const extra = document.createElement("div");
        extra.style.marginTop = "6px";
        extra.style.paddingTop = "6px";
        extra.style.borderTop = "1px dashed #e5e7eb";
        extra.textContent = `← 结果${ev.isError ? "（错误）" : ""}:\n${ev.content}`;
        target.bodyEl.appendChild(extra);
        // 标题尾部附加一段结果摘要
        const t = target.el.querySelector(".step-title");
        if (t) t.textContent = `${t.textContent} → ${preview}`;
      } else {
        addStep({
          kind: "result",
          extraClass: ev.isError ? "error" : "",
          badge: ev.isError ? "工具错误" : "工具结果",
          title: preview,
          body: ev.content,
        });
      }
      break;
    }
    case "usage":
      addStep({
        kind: "usage",
        badge: "Token",
        title: `输入 ${ev.inputTokens ?? "-"} / 输出 ${ev.outputTokens ?? "-"}`,
      });
      break;
    case "error":
      setStatus(ev.message, true);
      addStep({ kind: "err", badge: "错误", title: ev.message, body: ev.message });
      break;
    case "done": {
      const parts = [`subtype=${ev.subtype}`];
      if (ev.numTurns != null) parts.push(`turns=${ev.numTurns}`);
      if (ev.durationMs != null) parts.push(`${(ev.durationMs / 1000).toFixed(1)}s`);
      if (ev.costUsd != null) parts.push(`$${ev.costUsd.toFixed(4)}`);
      setStatus(`完成（${parts.join(", ")}）`);
      addStep({ kind: "done", badge: "完成", title: parts.join(" · ") });
      break;
    }
    case "end":
      break;
    default:
      console.debug("unknown event", ev);
  }
}

// Tab 切换
document.querySelectorAll(".tabs .tab").forEach((btn) => {
  btn.addEventListener("click", () => {
    const name = btn.dataset.tab;
    document.querySelectorAll(".tabs .tab").forEach((b) => b.classList.toggle("active", b === btn));
    processEl.classList.toggle("active", name === "process");
    outputEl.classList.toggle("active", name === "result");
  });
});

analyzeBtn.addEventListener("click", startAnalyze);
stopBtn.addEventListener("click", () => abortCtrl?.abort());
