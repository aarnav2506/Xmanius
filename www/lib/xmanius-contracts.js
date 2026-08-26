"use strict";

const MODES = Object.freeze([
  "fast",
  "research",
  "deep_research",
  "study",
  "code",
  "voice",
]);

const MAX_MESSAGE_CHARS = 12000;
const MAX_HISTORY_ITEMS = 24;

const isNonEmptyString = (value) => typeof value === "string" && value.trim().length > 0;

const clampText = (value, max = MAX_MESSAGE_CHARS) => String(value || "").trim().slice(0, max);

const normalizeHistory = (history) => {
  if (!Array.isArray(history)) return [];
  return history
    .slice(-MAX_HISTORY_ITEMS)
    .map((item) => ({
      role: item?.role === "assistant" || item?.role === "model" ? "assistant" : "user",
      text: clampText(item?.text, 6000),
    }))
    .filter((item) => item.text);
};

const chooseMode = ({ message, requestedMode, webSearch = false }) => {
  if (MODES.includes(requestedMode)) return requestedMode;

  const text = message.toLowerCase();
  if (webSearch || /\b(latest|today|current|recent|news|update|this week|this month)\b/.test(text)) {
    return "research";
  }
  if (/\b(study|quiz|flashcard|revise|nda|exam|explain like|teach me)\b/.test(text)) {
    return "study";
  }
  if (/```|\b(code|debug|refactor|function|api|javascript|python|react|css|sql)\b/.test(text)) {
    return "code";
  }
  return "fast";
};

const validateRequest = (body = {}) => {
  const message = clampText(body.message);
  if (!isNonEmptyString(message)) {
    const error = new Error("Message is required.");
    error.statusCode = 400;
    error.code = "INVALID_MESSAGE";
    throw error;
  }

  return {
    message,
    history: normalizeHistory(body.history),
    mode: chooseMode({
      message,
      requestedMode: body.mode,
      webSearch: Boolean(body.webSearch),
    }),
    model: clampText(body.model, 120) || "xmanius-fast",
    locale: clampText(body.locale, 40) || "en-US",
    conversationId: clampText(body.conversationId, 120),
    clientRequestId: clampText(body.clientRequestId, 120),
  };
};

const activity = (type, label, status = "completed", extra = {}) => ({
  id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
  type,
  label,
  status,
  ...extra,
});

const safeApproachSummary = ({ mode, message, activities, sources, assumptions = [] }) => {
  const completed = activities.filter((item) => item.status === "completed");
  const usedSearch = sources.length > 0 || completed.some((item) => item.type === "search");

  return {
    objective: `Answer the user's request in ${mode.replace("_", " ")} mode.`,
    approach: [
      mode === "fast" ? "Classified the request as suitable for a direct answer." : `Used the ${mode.replace("_", " ")} workflow.`,
      usedSearch ? "Checked external evidence and separated source-backed claims from general explanation." : "Organized the answer around the user’s stated goal and available context.",
      "Kept the public explanation concise; private hidden deliberation is not exposed.",
    ],
    assumptions,
    checks: [
      completed.length ? `Completed ${completed.length} visible workflow step${completed.length === 1 ? "" : "s"}.` : "No external workflow steps were required.",
      sources.length ? `Attached ${sources.length} source${sources.length === 1 ? "" : "s"} for inspection.` : "No external sources were attached.",
    ],
    uncertainty: sources.length ? "Source quality and freshness should still be checked for high-stakes decisions." : "This answer was not externally grounded.",
  };
};

module.exports = {
  MODES,
  MAX_MESSAGE_CHARS,
  MAX_HISTORY_ITEMS,
  activity,
  chooseMode,
  clampText,
  normalizeHistory,
  safeApproachSummary,
  validateRequest,
};
