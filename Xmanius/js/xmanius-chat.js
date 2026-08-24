(() => {
  "use strict";
  const app = document.querySelector(".chat-app");
  const form = document.querySelector("[data-chat-form]");
  const input = document.querySelector("[data-chat-input]");
  const list = document.querySelector("[data-message-list]");
  const empty = document.querySelector("[data-empty-state]");
  const recent = document.querySelector("[data-recent-list]");
  const modelToggle = document.querySelector("[data-model-toggle]");
  const modelPicker = document.querySelector("[data-model-picker]");
  let recognition = null;
  let listening = false;
  const localAnswer = (question) => {
    const q = question.toLowerCase();
    if (/^(hi|hello|hey)\b/.test(q)) return "Hello. I am Xmanius, ready to help.";
    if (/what can you do|help me/.test(q)) return "I can explain ideas, help with coding, plan tasks, summarize information, brainstorm, and answer everyday safe questions.";
    if (/productivity|focus/.test(q)) return "Choose one outcome, work in a short focused block, and remove the next distraction before you begin.";
    const math = question.match(/^\s*(\d+(?:\.\d+)?)\s*([+\-*/])\s*(\d+(?:\.\d+)?)\s*[?!.,]*\s*$/);
    if (math) { const a = Number(math[1]), b = Number(math[3]); return `The answer is ${math[2] === "+" ? a + b : math[2] === "-" ? a - b : math[2] === "*" ? a * b : b ? a / b : "undefined"}.`; }
    return null;
  };
  const addMessage = (text, type) => { empty.hidden = true; const item = document.createElement("article"); item.className = `message ${type}`; item.textContent = text; list.append(item); document.querySelector(".chat-content").scrollTop = document.querySelector(".chat-content").scrollHeight; };
  const ask = async (question) => { const q = question.trim(); if (!q) return; addMessage(q, "user"); input.value = ""; const local = localAnswer(q); if (local) { addMessage(local, "assistant"); speak(local); return; } const thinking = document.createElement("article"); thinking.className = "message assistant thinking"; thinking.textContent = "Thinking…"; list.append(thinking); try { const response = await fetch("api/xmanius-chat", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ message: q }) }); const data = await response.json(); thinking.remove(); addMessage(response.ok ? data.reply : "The online AI service is unavailable right now. Please try again shortly.", "assistant"); } catch { thinking.remove(); addMessage("The online AI service is unavailable right now. Please try again shortly.", "assistant"); } };
  const speak = (text) => { if (!("speechSynthesis" in window)) return; window.speechSynthesis.cancel(); const utterance = new SpeechSynthesisUtterance(text); utterance.lang = navigator.language || "en-US"; utterance.rate = .88; utterance.pitch = .82; window.speechSynthesis.speak(utterance); };
  const startVoice = () => { const Recognition = window.SpeechRecognition || window.webkitSpeechRecognition; if (!Recognition) { input.placeholder = "Voice needs Chrome or Edge over HTTPS or localhost"; return; } if (listening) { recognition.abort(); return; } recognition = new Recognition(); recognition.lang = navigator.language || "en-US"; recognition.interimResults = true; recognition.continuous = false; let finalText = ""; recognition.onstart = () => { listening = true; input.placeholder = "Listening…"; document.querySelector("[data-chat-mic]").classList.add("active"); }; recognition.onresult = (event) => { let interim = ""; for (let i = event.resultIndex; i < event.results.length; i++) event.results[i].isFinal ? finalText += event.results[i][0].transcript : interim += event.results[i][0].transcript; input.value = `${finalText}${interim}`.trim(); }; recognition.onerror = () => { input.placeholder = "Ask anything"; }; recognition.onend = () => { listening = false; document.querySelector("[data-chat-mic]").classList.remove("active"); input.placeholder = "Ask anything"; if (finalText.trim()) ask(finalText); }; recognition.start(); };
  form.addEventListener("submit", (event) => { event.preventDefault(); ask(input.value); });
  document.querySelector("[data-chat-mic]").addEventListener("click", startVoice);
  const setModelPicker = (open) => { modelPicker?.classList.toggle("is-open", open); modelToggle?.setAttribute("aria-expanded", String(open)); };
  modelToggle?.addEventListener("click", () => setModelPicker(!modelPicker.classList.contains("is-open")));
  modelPicker?.addEventListener("click", (event) => { if (event.target.closest("[data-voice-chat]")) { setModelPicker(false); input.placeholder = "Voice chat is ready"; return; } if (event.target.closest("[data-model]")) setModelPicker(false); });
  document.addEventListener("click", (event) => { if (modelPicker?.classList.contains("is-open") && !event.target.closest(".chat-composer")) setModelPicker(false); });
  const reset = () => { list.replaceChildren(); empty.hidden = false; input.value = ""; input.focus(); };
  document.querySelectorAll("[data-new-chat]").forEach((button) => button.addEventListener("click", reset));
  recent?.addEventListener("click", (event) => { if (event.target.matches("button")) { reset(); input.value = event.target.textContent.trim(); input.focus(); } });
  document.querySelector("[data-open-sidebar]")?.addEventListener("click", () => app.classList.add("sidebar-visible"));
  document.querySelector("[data-close-sidebar]")?.addEventListener("click", () => app.classList.remove("sidebar-visible"));
})();
