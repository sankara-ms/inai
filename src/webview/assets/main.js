// INAI webview controller (plain JS, no framework).
(function () {
  const vscode = acquireVsCodeApi();
  const $ = (id) => document.getElementById(id);

  const messagesEl = $("messages");
  const contextBar = $("contextBar");
  const editsBar = $("editsBar");
  const input = $("input");
  const sendBtn = $("send");
  const stopBtn = $("stop");
  const modeSel = $("mode");

  let currentAssistant = null;

  function scroll() {
    messagesEl.scrollTop = messagesEl.scrollHeight;
  }

  function addMessage(role, content) {
    const div = document.createElement("div");
    div.className = "msg " + role;
    const r = document.createElement("div");
    r.className = "role";
    r.textContent = role;
    const body = document.createElement("div");
    body.className = "body";
    body.textContent = content || "";
    div.appendChild(r);
    div.appendChild(body);
    messagesEl.appendChild(div);
    scroll();
    return body;
  }

  function setBusy(busy) {
    sendBtn.disabled = busy;
    stopBtn.disabled = !busy;
  }

  function renderContext(items) {
    contextBar.innerHTML = "";
    for (const it of items) {
      const chip = document.createElement("span");
      chip.className = "chip";
      chip.textContent = it.label;
      const x = document.createElement("button");
      x.textContent = "×";
      x.title = "Remove";
      x.onclick = () => vscode.postMessage({ type: "removeContext", relPath: it.relPath });
      chip.appendChild(x);
      contextBar.appendChild(chip);
    }
  }

  function renderEdits(edits) {
    editsBar.innerHTML = "";
    if (!edits || edits.length === 0) return;
    for (const e of edits) {
      const chip = document.createElement("div");
      chip.className = "edit-chip";
      const label = document.createElement("span");
      label.textContent = `${e.relPath} (+${e.added}/-${e.removed})`;
      const diff = document.createElement("button");
      diff.textContent = "Diff";
      diff.onclick = () => vscode.postMessage({ type: "showDiff", relPath: e.relPath });
      const acc = document.createElement("button");
      acc.textContent = "Accept";
      acc.onclick = () => vscode.postMessage({ type: "acceptEdit", relPath: e.relPath });
      const rej = document.createElement("button");
      rej.textContent = "Reject";
      rej.onclick = () => vscode.postMessage({ type: "rejectEdit", relPath: e.relPath });
      chip.append(label, diff, acc, rej);
      editsBar.appendChild(chip);
    }
    const all = document.createElement("div");
    all.className = "edit-chip";
    const accAll = document.createElement("button");
    accAll.textContent = "Accept All";
    accAll.onclick = () => vscode.postMessage({ type: "acceptAll" });
    const rejAll = document.createElement("button");
    rejAll.textContent = "Reject All";
    rejAll.onclick = () => vscode.postMessage({ type: "rejectAll" });
    all.append(accAll, rejAll);
    editsBar.appendChild(all);
  }

  function send() {
    const text = input.value.trim();
    if (!text) return;
    vscode.postMessage({ type: "send", text, mode: modeSel.value });
    input.value = "";
  }

  sendBtn.onclick = send;
  stopBtn.onclick = () => vscode.postMessage({ type: "stop" });
  $("newChat").onclick = () => vscode.postMessage({ type: "newChat" });
  $("model").onclick = () => vscode.postMessage({ type: "pickModel" });
  $("addContext").onclick = () => vscode.postMessage({ type: "addContextPick" });

  input.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      send();
    }
  });

  window.addEventListener("message", (event) => {
    const m = event.data;
    switch (m.type) {
      case "session":
        messagesEl.innerHTML = "";
        modeSel.value = m.session.mode || "ask";
        for (const msg of m.session.messages || []) {
          if (msg.role === "user" || msg.role === "assistant") {
            addMessage(msg.role, msg.content);
          }
        }
        break;
      case "context":
        renderContext(m.items || []);
        break;
      case "edits":
        renderEdits(m.edits || []);
        break;
      case "userMessage":
        addMessage("user", m.content);
        break;
      case "assistantStart":
        currentAssistant = addMessage("assistant", "");
        setBusy(true);
        break;
      case "assistantDelta":
        if (currentAssistant) {
          currentAssistant.textContent += m.delta;
          scroll();
        }
        break;
      case "assistantEnd":
        currentAssistant = null;
        setBusy(false);
        break;
      case "toolResult": {
        const div = document.createElement("div");
        div.className = "tool-result";
        const safety = m.result.safety ? ` safety-${m.result.safety}` : "";
        div.innerHTML =
          `<span class="${safety.trim()}">[${m.name}]</span> ` +
          escapeHtml(m.result.output || "");
        messagesEl.appendChild(div);
        scroll();
        break;
      }
    }
  });

  function escapeHtml(s) {
    return s
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;");
  }

  vscode.postMessage({ type: "ready" });
})();
