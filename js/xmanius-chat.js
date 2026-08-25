(() => {
  "use strict";
  const app = document.querySelector(".chat-app");
  const form = document.querySelector("[data-chat-form]");
  const input = document.querySelector("[data-chat-input]");
  const list = document.querySelector("[data-message-list]");
  const empty = document.querySelector("[data-empty-state]");
  const recent = document.querySelector("[data-recent-list]");
  const accountButton = document.querySelector("[data-account-button]");
  const accountName = document.querySelector("[data-account-name]");
  const accountStatus = document.querySelector("[data-account-status]");
  const modelToggle = document.querySelector("[data-model-toggle]");
  const modelPicker = document.querySelector("[data-model-picker]");
  const modelName = document.querySelector(".model-name");
  const thinkToggle = document.querySelector("[data-think-toggle]");
  const webSearchToggle = document.querySelector("[data-web-search]");
  const usageIndicator = document.querySelector("[data-usage-indicator]");
  const usageLabel = document.querySelector("[data-usage-label]");
  const usageNotice = document.querySelector("[data-usage-notice]");
  const dictationBar = document.querySelector("[data-dictation-bar]");
  const dictationCancel = document.querySelector("[data-dictation-cancel]");
  const dictationStop = document.querySelector("[data-dictation-stop]");
  const dictationSend = document.querySelector("[data-dictation-send]");
  const sendButton = document.querySelector(".send-button");
  let recognition = null;
  let listening = false;
  let audioContext = null;
  let audioAnalyser = null;
  let audioSource = null;
  let audioStream = null;
  let audioFrame = 0;
  let activeRequestController = null;
  let generalAssistant = null;
  let thinkMode = false;
  let webSearch = false;
  let selectedModel = "xmanius-1";
  const usageKey = "xmanius-usage-v1";
  const usageLimit = 50;
  const usageWindow = 5 * 60 * 60 * 1000;
  const readUsage = () => { try { const value = JSON.parse(localStorage.getItem(usageKey) || "null"); if (!value || Date.now() - value.startedAt >= usageWindow) return { count: 0, startedAt: Date.now() }; return value; } catch { return { count: 0, startedAt: Date.now() }; } };
  const updateUsage = (increment = false) => { const usage = readUsage(); if (increment) usage.count += 1; localStorage.setItem(usageKey, JSON.stringify(usage)); const percent = Math.min(100, Math.round(usage.count / usageLimit * 100)); usageIndicator?.style.setProperty("--usage", `${percent}%`); if (usageLabel) usageLabel.textContent = `${percent}%`; usageIndicator?.setAttribute("title", `${Math.max(0, usageLimit - usage.count)} requests left. Resets every 5 hours.`); if (usageNotice) { usageNotice.textContent = usage.count >= usageLimit ? "Your 5-hour Xmanius limit is over. It will refresh automatically." : ""; usageNotice.classList.toggle("is-visible", usage.count >= usageLimit); } return usage.count < usageLimit; };
  const chatsKey = "xmanius-chats-v1";
  let currentChatId = crypto.randomUUID?.() || String(Date.now());
  const readChats = () => { try { return JSON.parse(localStorage.getItem(chatsKey) || "[]"); } catch { return []; } };
  const saveChats = (chats) => localStorage.setItem(chatsKey, JSON.stringify(chats.slice(0, 50)));
  const saveCurrentChat = () => { const messages = [...list.querySelectorAll(".message")].map((item) => ({ type: item.classList.contains("user") ? "user" : "assistant", text: item.querySelector(".message-body")?.textContent || item.textContent.replace(/CopyRead aloud/g, "").trim() })).filter((item) => item.text); if (!messages.length) return; const chats = readChats(); const existing = chats.find((chat) => chat.id === currentChatId); const chat = { id: currentChatId, title: messages.find((item) => item.type === "user")?.text.slice(0, 42) || "New chat", messages, updatedAt: Date.now() }; if (existing) Object.assign(existing, chat); else chats.unshift(chat); saveChats(chats); renderRecents(); };
  const renderRecents = () => { if (!recent) return; recent.replaceChildren(); readChats().sort((a, b) => Number(b.pinned) - Number(a.pinned) || b.updatedAt - a.updatedAt).forEach((chat) => { const row = document.createElement("div"); row.className = `conversation-row${chat.pinned ? " is-pinned" : ""}`; row.dataset.chatId = chat.id; const button = document.createElement("button"); button.className = "conversation"; button.type = "button"; button.dataset.chatId = chat.id; button.textContent = chat.title; const more = document.createElement("button"); more.className = "conversation-more"; more.type = "button"; more.dataset.chatMenu = chat.id; more.setAttribute("aria-label", `Options for ${chat.title}`); more.title = "Chat options"; more.textContent = "•••"; const menu = document.createElement("div"); menu.className = "conversation-menu"; menu.innerHTML = `<button type="button" data-chat-action="pin">${chat.pinned ? "Unpin" : "Pin"} chat</button><button type="button" data-chat-action="share">Share</button><button type="button" data-chat-action="delete">Delete</button>`; row.append(button, more, menu); recent.append(row); }); };
  const loadChat = (chatId) => { const chat = readChats().find((item) => item.id === chatId); if (!chat) return; list.replaceChildren(); empty.hidden = true; currentChatId = chat.id; chat.messages.forEach((message) => addMessage(message.text, message.type, { animate: false, persist: false })); };
  const localAnswer = (question) => {
    const q = question.toLowerCase();
    if (/^(hi|hello|hey)\b/.test(q)) return "Hello. I am Xmanius, ready to help.";
    if (/what can you do|help me/.test(q)) return "I can explain ideas, help with coding, plan tasks, summarize information, brainstorm, and answer everyday safe questions.";
    if (/productivity|focus/.test(q)) return "Choose one outcome, work in a short focused block, and remove the next distraction before you begin.";
    const math = question.match(/^\s*(\d+(?:\.\d+)?)\s*([+\-*/])\s*(\d+(?:\.\d+)?)\s*[?!.,]*\s*$/);
    if (math) { const a = Number(math[1]), b = Number(math[3]); return `The answer is ${math[2] === "+" ? a + b : math[2] === "-" ? a - b : math[2] === "*" ? a * b : b ? a / b : "undefined"}.`; }
    return null;
  };
  const speak = (text) => { if (!("speechSynthesis" in window)) return; window.speechSynthesis.cancel(); const utterance = new SpeechSynthesisUtterance(text); utterance.lang = navigator.language || "en-US"; utterance.rate = .88; utterance.pitch = .82; window.speechSynthesis.speak(utterance); };
  const escapeHtml = (value) => value.replace(/[&<>'"]/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" }[character]));
  const cleanMath = (value) => value.replace(/\\frac\{([^{}]+)\}\{([^{}]+)\}/g, "($1)/($2)").replace(/\\left|\\right/g, "").replace(/\\cdot|\\times/g, "×").replace(/\\pm/g, "±").replace(/\\,|\\;/g, " ").replace(/\$\$?([^$]+)\$\$?/g, "$1").replace(/\\([a-zA-Z]+)/g, "$1");
  const inlineMarkdown = (value) => escapeHtml(cleanMath(value)).replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>").replace(/`(.+?)`/g, "<code>$1</code>").replace(/\[([^\]]+)\]\((https?:\/\/[^)]+)\)/g, '<a href="$2" target="_blank" rel="noopener">$1</a>');
  const renderMarkdown = (element, text) => {
    const lines = text.split(/\r?\n/);
    const output = [];
    let bullets = [];
    const flushBullets = () => { if (!bullets.length) return; output.push(`<ul>${bullets.map((item) => `<li>${inlineMarkdown(item)}</li>`).join("")}</ul>`); bullets = []; };
    lines.forEach((line) => {
      const trimmed = line.trim();
      if (!trimmed) { flushBullets(); return; }
      const bullet = trimmed.match(/^[-*•]\s+(.+)$/);
      if (bullet) { bullets.push(bullet[1]); return; }
      flushBullets();
      const heading = trimmed.match(/^(#{1,4})\s+(.+)$/) || trimmed.match(/^(\d+\.)\s+(.+)$/);
      if (heading) { output.push(`<h3>${inlineMarkdown(heading[2])}</h3>`); return; }
      if (trimmed.includes("|") && /^\|?\s*:?-{3,}/.test(lines[lines.indexOf(line) + 1] || "")) return;
      output.push(`<p>${inlineMarkdown(trimmed)}</p>`);
    });
    flushBullets();
    element.innerHTML = output.join("");
  };
  const addMessage = (text, type, { animate = false, persist = true } = {}) => {
    empty.hidden = true;
    const item = document.createElement("article");
    item.className = `message ${type}`;
    const body = document.createElement("div");
    body.className = "message-body";
    if (type === "assistant") renderMarkdown(body, text); else body.textContent = text;
    item.append(body);
    if (type === "assistant") {
      const actions = document.createElement("div");
      actions.className = "message-actions";
      actions.innerHTML = '<button type="button" data-copy-message aria-label="Copy response" title="Copy"><svg viewBox="0 0 24 24" aria-hidden="true"><rect x="8" y="8" width="11" height="11" rx="2"></rect><path d="M16 8V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h2"></path></svg></button><button type="button" data-read-message aria-label="Read response aloud" title="Read aloud"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 9v6h4l5 4V5L8 9H4Z"></path><path d="M16 9.5a4 4 0 0 1 0 5M18.5 7a7 7 0 0 1 0 10"></path></svg></button>';
      actions.querySelector("[data-copy-message]").addEventListener("click", async () => {
        try { await navigator.clipboard.writeText(text); actions.querySelector("[data-copy-message]").textContent = "✓"; } catch { /* Clipboard may be unavailable on file:// pages. */ }
      });
      const shareButton = document.createElement("button");
      shareButton.type = "button";
      shareButton.dataset.shareMessage = "true";
      shareButton.setAttribute("aria-label", "Share response");
      shareButton.title = "Share";
      shareButton.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 16V4M7 9l5-5 5 5"></path><path d="M5 13v5a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-5"></path></svg>';
      actions.append(shareButton);
      actions.querySelector("[data-read-message]").addEventListener("click", () => speak(text));
      shareButton.addEventListener("click", async () => { if (navigator.share) await navigator.share({ title: "Xmanius response", text }).catch(() => {}); else await navigator.clipboard?.writeText(text); });
      if (thinkMode) { const summary = document.createElement("details"); summary.className = "thinking-summary"; summary.innerHTML = "<summary>How I approached this</summary><p>I checked the question, considered the relevant factors, and organized the answer for clarity. Private chain-of-thought is not displayed.</p>"; item.append(summary); }
      item.append(actions);
    }
    list.append(item);
    if (persist) saveCurrentChat();
    if (animate && type === "assistant") { item.classList.add("message-entering"); body.querySelectorAll(":scope > *").forEach((node, index) => node.style.setProperty("--line-delay", `${index * 42}ms`)); window.setTimeout(() => item.classList.remove("message-entering"), Math.min(1800, 300 + body.children.length * 50)); }
    document.querySelector(".chat-content").scrollTop = document.querySelector(".chat-content").scrollHeight;
  };
  const setSendingState = (active) => { sendButton?.classList.toggle("is-stop", active); if (sendButton) { sendButton.setAttribute("aria-label", active ? "Stop response" : "Send message"); sendButton.title = active ? "Stop response" : "Send message"; sendButton.innerHTML = active ? '<span class="send-stop-icon" aria-hidden="true"></span>' : '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12h13M13 6l6 6-6 6"></path></svg>'; } };
  const conversationHistory = () => [...list.querySelectorAll(".message")].slice(-12).map((item) => ({ role: item.classList.contains("user") ? "user" : "model", text: item.querySelector(".message-body")?.textContent?.trim() || "" })).filter((item) => item.text);
  const ask = async (question) => { const q = question.trim(); if (!q || activeRequestController) return; if (!updateUsage()) return; const history = conversationHistory(); addMessage(q, "user"); input.value = ""; updateUsage(true); const local = localAnswer(q); if (local && !thinkMode && !webSearch && selectedModel === "xmanius-1") { addMessage(local, "assistant", { animate: true }); return; } const thinking = document.createElement("article"); thinking.className = "message assistant thinking ai-message--thinking"; thinking.setAttribute("role", "status"); thinking.innerHTML = `<span>${thinkMode ? "Thinking carefully" : webSearch ? "Searching the web" : "Thinking"}</span><i></i><i></i><i></i>`; list.append(thinking); document.querySelector(".chat-content").scrollTop = document.querySelector(".chat-content").scrollHeight; activeRequestController = new AbortController(); const timeout = window.setTimeout(() => activeRequestController?.abort(), 30000); setSendingState(true); try { const response = await fetch("/api/xmanius-chat", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ message: q, model: selectedModel, thinkMode, webSearch, history }), signal: activeRequestController.signal }); const data = await response.json().catch(() => ({})); thinking.remove(); addMessage(response.ok ? data.reply : (data.error || `The AI request failed (${response.status}).`), "assistant", { animate: true }); } catch (error) { thinking.remove(); if (error.name === "AbortError") addMessage("The response was stopped by you.", "assistant", { animate: true }); else addMessage(`The AI service could not be reached. ${error?.message || "Please check the deployment and API configuration."}`, "assistant", { animate: true }); } finally { window.clearTimeout(timeout); activeRequestController = null; setSendingState(false); } };
  const stopAudioMeter = () => { cancelAnimationFrame(audioFrame); audioSource?.disconnect(); audioAnalyser = null; audioSource = null; audioStream?.getTracks().forEach((track) => track.stop()); audioStream = null; audioContext?.close(); audioContext = null; };
  const startAudioMeter = async () => { if (!navigator.mediaDevices?.getUserMedia) return; try { audioStream = await navigator.mediaDevices.getUserMedia({ audio: true }); audioContext = new (window.AudioContext || window.webkitAudioContext)(); audioAnalyser = audioContext.createAnalyser(); audioAnalyser.fftSize = 256; audioAnalyser.smoothingTimeConstant = .72; audioSource = audioContext.createMediaStreamSource(audioStream); audioSource.connect(audioAnalyser); const waveform = document.querySelector(".dictation-waveform"); if (waveform && waveform.children.length < 80) { waveform.replaceChildren(); for (let index = 0; index < 96; index += 1) waveform.append(document.createElement("i")); } const bars = [...document.querySelectorAll(".dictation-waveform i")]; const frequencies = new Uint8Array(audioAnalyser.frequencyBinCount); const meter = () => { if (!audioAnalyser) return; audioAnalyser.getByteFrequencyData(frequencies); const groupSize = Math.max(1, Math.floor(frequencies.length / bars.length)); bars.forEach((bar, index) => { let total = 0; for (let offset = 0; offset < groupSize; offset += 1) total += frequencies[index * groupSize + offset] || 0; const level = total / groupSize / 255; bar.style.height = `${Math.max(2, 3 + level * 28)}px`; bar.style.opacity = `${Math.max(.35, .35 + level)}`; }); audioFrame = requestAnimationFrame(meter); }; meter(); } catch { /* Speech recognition can still work when audio metering is unavailable. */ } };
  const setDictation = (active) => { form.classList.toggle("is-listening", active); dictationBar?.setAttribute("aria-hidden", String(!active)); dictationBar?.style.setProperty("display", active ? "flex" : "none", "important"); if (active) { const waveform = document.querySelector(".dictation-waveform"); if (waveform && waveform.children.length < 80) { waveform.replaceChildren(); for (let index = 0; index < 96; index += 1) waveform.append(document.createElement("i")); } } else { input.placeholder = "Ask anything"; document.querySelector("[data-chat-mic]")?.classList.remove("active"); stopAudioMeter(); } };
  const startVoice = () => { const Recognition = window.SpeechRecognition || window.webkitSpeechRecognition; if (!Recognition) { setDictation(true); input.placeholder = ""; return; } if (listening) { recognition.abort(); return; } setDictation(true); input.placeholder = ""; document.querySelector("[data-chat-mic]")?.classList.add("active"); recognition = new Recognition(); recognition.lang = navigator.language || "en-US"; recognition.interimResults = true; recognition.continuous = false; let finalText = ""; recognition.onstart = () => { listening = true; startAudioMeter(); }; recognition.onresult = (event) => { let interim = ""; for (let i = event.resultIndex; i < event.results.length; i++) event.results[i].isFinal ? finalText += event.results[i][0].transcript : interim += event.results[i][0].transcript; input.value = `${finalText}${interim}`.trim(); }; recognition.onerror = () => { listening = false; stopAudioMeter(); document.querySelector("[data-chat-mic]")?.classList.remove("active"); input.placeholder = ""; }; recognition.onend = () => { listening = false; stopAudioMeter(); document.querySelector("[data-chat-mic]")?.classList.remove("active"); input.placeholder = ""; }; try { recognition.start(); } catch { listening = false; input.placeholder = ""; } };
  form.addEventListener("submit", (event) => { event.preventDefault(); ask(input.value); });
  sendButton?.addEventListener("click", (event) => { if (!activeRequestController) return; event.preventDefault(); activeRequestController.abort(); });
  document.querySelector("[data-chat-mic]").addEventListener("click", startVoice);
  dictationCancel?.addEventListener("click", () => { recognition?.abort(); input.value = ""; setDictation(false); input.focus(); });
  dictationStop?.addEventListener("click", () => { if (listening) recognition?.stop(); else startVoice(); });
  dictationSend?.addEventListener("click", () => { recognition?.abort(); setDictation(false); ask(input.value); });
  const setModelPicker = (open) => { modelPicker?.classList.toggle("is-open", open); modelToggle?.setAttribute("aria-expanded", String(open)); };
  modelToggle?.addEventListener("click", () => setModelPicker(!modelPicker.classList.contains("is-open")));
  modelPicker?.addEventListener("click", (event) => { if (event.target.closest("[data-voice-chat]")) { setModelPicker(false); input.placeholder = "Voice chat is ready"; return; } const option = event.target.closest("[data-model]"); if (option) { selectedModel = option.dataset.model || "xmanius-1"; modelPicker.querySelectorAll("[data-model]").forEach((item) => { const active = item === option; item.classList.toggle("is-selected", active); item.setAttribute("aria-pressed", String(active)); item.querySelector("b").textContent = active ? "✓" : ""; }); if (modelName) modelName.innerHTML = `${selectedModel === "xmanius-2" ? "Xmanius 2" : "Xmanius 1"} <span>⌄</span>`; setModelPicker(false); } });
  document.addEventListener("click", (event) => { if (modelPicker?.classList.contains("is-open") && !event.target.closest(".chat-composer")) setModelPicker(false); });
  const reset = () => { saveCurrentChat(); currentChatId = crypto.randomUUID?.() || String(Date.now()); list.replaceChildren(); empty.hidden = false; input.value = ""; input.focus(); };
  document.querySelectorAll("[data-new-chat]").forEach((button) => button.addEventListener("click", reset));
  recent?.addEventListener("click", async (event) => { const menuButton = event.target.closest("[data-chat-menu]"); if (menuButton) { recent.querySelectorAll(".conversation-row.is-menu-open").forEach((row) => row.classList.remove("is-menu-open")); menuButton.closest(".conversation-row").classList.toggle("is-menu-open"); return; } const action = event.target.closest("[data-chat-action]"); if (action) { const row = action.closest(".conversation-row"); const chats = readChats(); const chat = chats.find((item) => item.id === row.dataset.chatId); if (!chat) return; if (action.dataset.chatAction === "pin") chat.pinned = !chat.pinned; if (action.dataset.chatAction === "delete") { saveChats(chats.filter((item) => item.id !== chat.id)); if (chat.id === currentChatId) { currentChatId = crypto.randomUUID?.() || String(Date.now()); list.replaceChildren(); empty.hidden = false; input.value = ""; } renderRecents(); return; } if (action.dataset.chatAction === "share") { const shareText = `${chat.title}\n\n${chat.messages.map((item) => `${item.type === "user" ? "You" : "Xmanius"}: ${item.text}`).join("\n\n")}`; if (navigator.share) await navigator.share({ title: chat.title, text: shareText }).catch(() => {}); else await navigator.clipboard?.writeText(shareText); } saveChats(chats); renderRecents(); return; } const button = event.target.closest("button[data-chat-id]"); if (button) { loadChat(button.dataset.chatId); recent.querySelectorAll(".is-menu-open").forEach((row) => row.classList.remove("is-menu-open")); } });
  document.addEventListener("click", (event) => { if (!event.target.closest(".conversation-row")) recent?.querySelectorAll(".is-menu-open").forEach((row) => row.classList.remove("is-menu-open")); });
  document.querySelector("[data-open-sidebar]")?.addEventListener("click", () => app.classList.add("sidebar-visible"));
  document.querySelector("[data-close-sidebar]")?.addEventListener("click", () => { if (window.matchMedia("(max-width: 720px)").matches) app.classList.remove("sidebar-visible"); else app.classList.toggle("sidebar-collapsed"); });
  thinkToggle?.addEventListener("click", () => { thinkMode = !thinkMode; thinkToggle.classList.toggle("active", thinkMode); thinkToggle.setAttribute("aria-pressed", String(thinkMode)); });
  webSearchToggle?.addEventListener("click", () => { webSearch = !webSearch; webSearchToggle.classList.toggle("active", webSearch); webSearchToggle.setAttribute("aria-pressed", String(webSearch)); });
  usageIndicator?.addEventListener("click", () => { updateUsage(); usageNotice?.classList.toggle("is-visible"); });
  accountButton?.addEventListener("click", () => { const connected = localStorage.getItem("xmanius-google-connected") === "true"; if (!connected) { const proceed = window.confirm("Google account connection needs OAuth setup for this deployment. Use this browser as a local account for now?"); if (proceed) { localStorage.setItem("xmanius-google-connected", "true"); accountName.textContent = "Local user"; accountStatus.textContent = "Browser account"; } } else { accountName.textContent = "Local user"; accountStatus.textContent = "Browser account"; } });
  updateUsage();
  renderRecents();

  const createGeneralAssistant = () => {
    const panel = document.createElement("section");
    panel.className = "ai-guide xmanius-general-assistant";
    panel.setAttribute("aria-hidden", "true");
    panel.innerHTML = `<div class="ai-guide__dialog" role="dialog" aria-modal="true" aria-label="Xmanius voice assistant">
      <button class="ai-guide__compact-close" type="button" data-general-close aria-label="Close voice assistant"><svg viewBox="0 0 24 24"><path d="m6 6 12 12M18 6 6 18"></path></svg></button>
      <div class="ai-guide__orb-stage"><canvas class="ai-guide__orb" width="600" height="600" aria-hidden="true"></canvas><span class="ai-guide__orb-state">Ready</span></div>
      <p class="ai-guide__voice-greeting">Hi, I’m Xmanius. Ask me anything.</p>
      <div class="ai-guide__messages ai-guide__subtitle" aria-live="polite"></div>
      <div class="ai-guide__voice-controls"><button class="ai-guide__voice-control" type="button" data-general-close aria-label="Close voice assistant"><svg viewBox="0 0 24 24"><path d="m6 6 12 12M18 6 6 18"></path></svg></button><button class="ai-guide__voice-control ai-guide__voice-control--mic" type="button" data-general-mic aria-label="Start live voice conversation"><svg viewBox="0 0 24 24"><rect x="9" y="3" width="6" height="11" rx="3"></rect><path d="M5 11a7 7 0 0 0 14 0M12 18v3M9 21h6"></path></svg></button></div>
    </div>`;
    document.body.append(panel);
    return panel;
  };

  const openGeneralVoice = () => {
    if (!generalAssistant) generalAssistant = createGeneralAssistant();
    generalAssistant.classList.add("is-open", "is-voice-mode");
    generalAssistant.setAttribute("aria-hidden", "false");
    const canvas = generalAssistant.querySelector("canvas");
    if (!canvas.dataset.started) { canvas.dataset.started = "true"; const ctx = canvas.getContext("2d"); const draw = (time) => { if (!generalAssistant?.classList.contains("is-open")) return; const dpr = Math.min(2, devicePixelRatio || 1); const size = Math.min(canvas.clientWidth || 420, canvas.clientHeight || 420); canvas.width = size * dpr; canvas.height = size * dpr; ctx.setTransform(dpr, 0, 0, dpr, 0, 0); ctx.clearRect(0, 0, size, size); const cx = size / 2, cy = size / 2, radius = size * (.27 + Math.sin(time / 900) * .015); const glow = ctx.createRadialGradient(cx, cy, radius * .1, cx, cy, radius * 1.25); glow.addColorStop(0, "rgba(255,255,255,.98)"); glow.addColorStop(.2, "rgba(109,229,255,.92)"); glow.addColorStop(.58, "rgba(78,142,255,.72)"); glow.addColorStop(1, "rgba(125,72,201,0)"); ctx.fillStyle = glow; ctx.beginPath(); ctx.arc(cx, cy, radius * 1.25, 0, Math.PI * 2); ctx.fill(); ctx.strokeStyle = "rgba(160,225,255,.7)"; ctx.lineWidth = 1.2; for (let i = 0; i < 90; i++) { const a = i * 2.399 + time / 5200; const r = radius * (.72 + (i % 7) / 25); ctx.fillStyle = `rgba(210,245,255,${.35 + (i % 5) / 10})`; ctx.fillRect(cx + Math.cos(a) * r, cy + Math.sin(a) * r, 1.5, 1.5); } requestAnimationFrame(draw); }; requestAnimationFrame(draw); }
    const micButton = generalAssistant.querySelector("[data-general-mic]");
    if (!micButton.dataset.bound) { micButton.dataset.bound = "true"; micButton.addEventListener("click", () => startGeneralRecognition(generalAssistant)); }
    generalAssistant.querySelectorAll("[data-general-close]").forEach((button) => { if (button.dataset.bound) return; button.dataset.bound = "true"; button.addEventListener("click", () => { generalAssistant.classList.remove("is-open", "is-voice-mode"); generalAssistant.setAttribute("aria-hidden", "true"); }); });
  };

  const startGeneralRecognition = (panel) => {
    const Recognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!Recognition) { panel.querySelector(".ai-guide__voice-greeting").textContent = "Voice input needs Chrome or Edge over HTTPS or localhost."; return; }
    const recognitionInstance = new Recognition(); recognitionInstance.lang = navigator.language || "en-US"; recognitionInstance.interimResults = false; recognitionInstance.continuous = false;
    const mic = panel.querySelector("[data-general-mic]"); recognitionInstance.onstart = () => { panel.dataset.voiceState = "listening"; mic.classList.add("is-active"); panel.querySelector(".ai-guide__voice-greeting").textContent = "Listening…"; }; recognitionInstance.onresult = async (event) => { const question = event.results[0][0].transcript.trim(); panel.dataset.voiceState = "thinking"; panel.querySelector(".ai-guide__voice-greeting").textContent = "Thinking…"; const response = await fetch("api/xmanius-chat", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ message: question }) }); const data = await response.json(); const answer = data.reply || data.error || "I could not answer that right now."; panel.querySelector(".ai-guide__voice-greeting").textContent = answer; if ("speechSynthesis" in window) window.speechSynthesis.speak(new SpeechSynthesisUtterance(answer)); panel.dataset.voiceState = "speaking"; }; recognitionInstance.onend = () => { mic.classList.remove("is-active"); }; recognitionInstance.start();
  };
  window.__openXmaniusVoice = openGeneralVoice;
  document.addEventListener("click", (event) => { if (event.target.closest("[data-voice-chat]")) openGeneralVoice(); });
})();
