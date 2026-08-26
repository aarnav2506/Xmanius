"use strict";

/*
 * Browser-side SSE client for the Xmanius streaming endpoint.
 *
 * The server should emit named SSE events:
 * activity, text_delta, citation, approach, usage, error, done.
 */

const streamXmanius = async ({
  message,
  history = [],
  mode = "fast",
  model = "xmanius-fast",
  conversationId = "",
  signal,
  onActivity = () => {},
  onText = () => {},
  onCitation = () => {},
  onApproach = () => {},
  onUsage = () => {},
  onError = () => {},
  onDone = () => {},
} = {}) => {
  const response = await fetch("/api/xmanius-chat", {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "text/event-stream" },
    body: JSON.stringify({ message, history, mode, model, conversationId }),
    signal,
  });

  if (!response.ok || !response.body) {
    let payload = {};
    try {
      payload = await response.json();
    } catch {
      // Keep the normalized fallback below.
    }
    const error = new Error(payload.error || `Request failed (${response.status}).`);
    error.status = response.status;
    error.code = payload.code || "REQUEST_FAILED";
    throw error;
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let eventName = "message";
  let dataLines = [];

  const dispatch = () => {
    if (!dataLines.length) return;
    const raw = dataLines.join("\n");
    dataLines = [];

    if (raw === "[DONE]") {
      onDone({});
      return;
    }

    let payload;
    try {
      payload = JSON.parse(raw);
    } catch {
      onError({ code: "MALFORMED_EVENT", message: "The server sent an invalid streaming event." });
      eventName = "message";
      return;
    }

    if (eventName === "activity") onActivity(payload);
    else if (eventName === "text_delta") onText(payload.text || "");
    else if (eventName === "citation") onCitation(payload);
    else if (eventName === "approach") onApproach(payload);
    else if (eventName === "usage") onUsage(payload);
    else if (eventName === "error") onError(payload);
    else if (eventName === "done") onDone(payload);

    eventName = "message";
  };

  const consume = (text) => {
    buffer += text;
    const lines = buffer.split(/\r?\n/);
    buffer = lines.pop() || "";

    for (const line of lines) {
      if (!line) {
        dispatch();
        continue;
      }
      if (line.startsWith("event:")) eventName = line.slice(6).trim();
      else if (line.startsWith("data:")) dataLines.push(line.slice(5).trimStart());
    }
  };

  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      consume(decoder.decode(value, { stream: true }));
    }
    consume(decoder.decode());
    if (dataLines.length) dispatch();
  } finally {
    reader.releaseLock();
  }
};

// Example integration with an existing composer and message list:
//
// let activeController = null;
//
// const sendWithStreaming = async (question) => {
//   activeController = new AbortController();
//   const assistant = createAssistantMessage();
//   try {
//     await streamXmanius({
//       message: question,
//       mode: webSearch ? "research" : thinkMode ? "deep_research" : "fast",
//       signal: activeController.signal,
//       onActivity: (item) => renderActivity(assistant, item),
//       onText: (delta) => appendAssistantText(assistant, delta),
//       onCitation: (source) => appendCitation(assistant, source),
//       onApproach: (summary) => renderApproachSummary(assistant, summary),
//       onError: (error) => renderAssistantError(assistant, error),
//       onDone: () => finalizeAssistantMessage(assistant),
//     });
//   } catch (error) {
//     if (error.name !== "AbortError") renderAssistantError(assistant, error);
//   } finally {
//     activeController = null;
//   }
// };
//
// stopButton.addEventListener("click", () => activeController?.abort());

if (typeof module !== "undefined") module.exports = { streamXmanius };
