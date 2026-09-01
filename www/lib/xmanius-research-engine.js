"use strict";

/**
 * XManius Research Engine
 * Performs parallel multi-query search, page extraction, fact normalization,
 * and feeds the Evidence Ledger with structured source records.
 */

const { EvidenceLedger } = require("./xmanius-evidence-ledger");

class ResearchEngine {
  constructor(opts) {
    const options = opts || {};
    this.timeoutMs = options.timeoutMs || 8000;
  }

  /**
   * Run structured research workflow
   */
  conductResearch(opts) {
    const options = opts || {};
    const queries = options.queries || [];
    const task = options.task || null;
    const onProgress = options.onProgress || function () {};
    const fetcher = options.fetcher || global.fetch || function () { return Promise.resolve({ ok: false }); };

    const ledger = new EvidenceLedger({ taskId: task ? task.id : null });
    const searchStep = task ? task.addStep({
      type: "search",
      label: "Searching sources (" + queries.length + " query plan)",
      status: "running",
    }) : null;
    onProgress({ step: "search", queries: queries, status: "running" });

    const rawResults = [];
    const apiKey = process.env.XMANIUS_GOOGLE_SEARCH_API_KEY;
    const cx = process.env.XMANIUS_GOOGLE_SEARCH_CX;

    const promises = [];

    for (let i = 0; i < queries.length; i++) {
      const query = queries[i];
      const qText = typeof query === "string" ? query : (query && query.text) || "";
      if (!qText) continue;

      if (apiKey && cx) {
        const searchUrl = "https://www.googleapis.com/customsearch/v1?key=" + encodeURIComponent(apiKey) + "&cx=" + encodeURIComponent(cx) + "&q=" + encodeURIComponent(qText) + "&num=5";
        const p = fetcher(searchUrl).then(function (res) {
          if (res.ok) {
            return res.json().then(function (data) {
              const items = data.items || [];
              for (let j = 0; j < items.length; j++) {
                rawResults.push({
                  url: items[j].link,
                  title: items[j].title,
                  snippet: items[j].snippet,
                  publisher: items[j].displayLink,
                });
              }
            });
          }
        }).catch(function (err) {
          console.warn("Research search error for '" + qText + "':", err.message);
        });
        promises.push(p);
      }
    }

    return Promise.all(promises).then(function () {
      rawResults.forEach(function (res) {
        const source = ledger.addSource(res);
        if (task && source) {
          task.attachSource(source);
        }
      });

      if (searchStep) {
        task.updateStep(searchStep.id, {
          status: "completed",
          output: "Retrieved " + ledger.sources.length + " evidence sources across " + queries.length + " queries.",
        });
      }
      onProgress({ step: "search", status: "completed", sources: ledger.sources });

      return ledger;
    });
  }

  formatResearchContext(ledger) {
    if (!ledger || !ledger.sources.length) return "";
    return ledger.sources
      .map(function (s, idx) {
        return "[S" + (idx + 1) + "] " + s.title + "\nDomain: " + s.domain + "\nURL: " + s.url + "\nExcerpt: " + s.snippet;
      })
      .join("\n\n");
  }
}

module.exports = { ResearchEngine: ResearchEngine };
