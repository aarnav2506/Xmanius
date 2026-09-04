"use strict";

/**
 * XManius Model Provider Abstraction & Secrets Vault
 * Unified client for Gemini, Antigravity, and OpenAI inference models.
 * Ensures strict credential isolation (keys never appear in model prompts or logs).
 */

const DEFAULT_MODELS = Object.freeze({
  FAST: "gemini-3.5-flash-lite",
  PRO: "gemini-3.8-flash",
  FLASH: "gemini-3.1-flash-lite",
  REASONING: "gemini-3.8-flash",
  CORTEX: "anti-gravity",
  ANTIGRAVITY: "anti-gravity",
});

const sanitizeSecretString = function (text, secrets) {
  let cleaned = String(text || "");
  const secList = secrets || [];
  for (let i = 0; i < secList.length; i++) {
    const secret = secList[i];
    if (typeof secret === "string" && secret.length > 5) {
      cleaned = cleaned.split(secret).join("[REDACTED_API_KEY]");
    }
  }
  return cleaned;
};

class ModelProvider {
  constructor(opts) {
    const options = opts || {};
    this.keys = (options.keys || []).filter(Boolean);
    this.defaultModel = options.defaultModel || DEFAULT_MODELS.FAST;
    this.fetchFn = options.fetcher || global.fetch || (function () { return Promise.resolve({ ok: false }); });
  }

  static getEnvironmentKeys(slotNumber) {
    const slot = slotNumber || 1;
    const keys = [];
    const suffixes = slot === 1 ? ["", "_1", "_4", "_2", "_3"] : ["_" + slot, "", "_4", "_1"];
    
    for (let i = 0; i < suffixes.length; i++) {
      const sfx = suffixes[i];
      const candidates = [
        process.env["XMANIUS_GEMINI_API_KEY" + sfx],
        process.env["XMANIUS_GEMINI_API_KEY_" + slot],
        process.env["XMANIUS_DEMO_API_KEY" + sfx],
        process.env["XMANTIUS_GEMINI_API_KEY" + sfx],
      ];
      for (let j = 0; j < candidates.length; j++) {
        const k = candidates[j];
        if (k && typeof k === "string" && k.trim() && keys.indexOf(k.trim()) === -1) {
          keys.push(k.trim());
        }
      }
    }

    const defaultKey = process.env.XMANIUS_GEMINI_API_KEY || process.env.XMANIUS_DEMO_API_KEY || process.env.GEMINI_API_KEY;
    if (defaultKey && keys.indexOf(defaultKey.trim()) === -1) {
      keys.push(defaultKey.trim());
    }

    return keys;
  }

  generateText(opts) {
    const options = opts || {};
    if (!this.keys.length) {
      this.keys = ModelProvider.getEnvironmentKeys(1);
    }

    if (!this.keys.length) {
      return Promise.reject(new Error("No Gemini API keys are configured in the environment."));
    }

    const model = options.model || this.defaultModel;
    const prompt = options.prompt || "";
    const systemInstruction = options.systemInstruction || "";
    const history = options.history || [];
    const temperature = options.temperature !== undefined ? options.temperature : 0.4;
    const maxTokens = options.maxTokens || 8192;
    const thinkingBudget = options.thinkingBudget || 0;
    const tools = options.tools || [];
    const timeoutMs = options.timeoutMs || 15000;

    const contents = [];
    if (Array.isArray(history)) {
      for (let i = 0; i < history.length; i++) {
        const item = history[i];
        if (item && item.role && item.text) {
          contents.push({
            role: item.role === "assistant" || item.role === "model" ? "model" : "user",
            parts: [{ text: item.text }],
          });
        }
      }
    }

    contents.push({
      role: "user",
      parts: [{ text: prompt }],
    });

    const generationConfig = {
      temperature: temperature,
      maxOutputTokens: maxTokens,
    };

    if (thinkingBudget > 0 && (/^gemini-2\.[05]/i.test(model) || /^gemini-3/i.test(model))) {
      generationConfig.thinkingConfig = { thinkingBudget: thinkingBudget };
    }

    const requestBody = {
      contents: contents,
      generationConfig: generationConfig,
    };

    if (systemInstruction) {
      requestBody.systemInstruction = { parts: [{ text: systemInstruction }] };
    }

    if (tools && tools.length) {
      requestBody.tools = tools;
    }

    const self = this;
    let currentKeyIndex = 0;

    function tryKey() {
      if (currentKeyIndex >= self.keys.length) {
        return Promise.reject(new Error("Failed to generate response from ModelProvider"));
      }

      const key = self.keys[currentKeyIndex];
      currentKeyIndex += 1;

      const endpoint = "https://generativelanguage.googleapis.com/v1beta/models/" + encodeURIComponent(model) + ":generateContent?key=" + encodeURIComponent(key);

      return self.fetchFn(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(requestBody),
      }).then(function (res) {
        if (res.ok) {
          return res.json().then(function (data) {
            const candidate = data.candidates && data.candidates[0];
            const text = candidate && candidate.content && candidate.content.parts ? candidate.content.parts.map(function(p){ return p.text || ""; }).join("").trim() : "";
            return {
              text: text,
              model: model,
              finishReason: (candidate && candidate.finishReason) || "STOP",
              groundingMetadata: (candidate && candidate.groundingMetadata) || null,
              usage: data.usageMetadata || null,
            };
          });
        } else if (res.status === 429 || res.status === 401 || res.status === 403) {
          return tryKey();
        } else {
          return Promise.reject(new Error("Upstream model error: HTTP " + res.status));
        }
      }).catch(function () {
        return tryKey();
      });
    }

    return tryKey();
  }
}

module.exports = {
  DEFAULT_MODELS: DEFAULT_MODELS,
  ModelProvider: ModelProvider,
  sanitizeSecretString: sanitizeSecretString,
};
