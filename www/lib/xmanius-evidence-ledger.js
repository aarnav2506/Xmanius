"use strict";

/**
 * XManius Evidence Ledger & Source Citation Engine
 * Replaces generic link lists with a verifiable Evidence Graph:
 * [S1], [S2] badges, freshness scores, claim-to-source mappings, and domain grouping.
 */

const crypto = require("crypto");

const CLAIM_STATUS = Object.freeze({
  SUPPORTED: "supported",
  PARTIAL: "partially_supported",
  UNVERIFIED: "unverified",
  CONFLICTING: "conflicting",
});

const hostOf = function (url) {
  try {
    const parsed = new (require("url").URL)(url);
    return parsed.hostname.replace(/^www\./, "");
  } catch (e) {
    try {
      const match = String(url).match(/^https?:\/\/([^/?#]+)(?:[/?#]|$)/i);
      return match ? match[1].replace(/^www\./, "") : "unknown";
    } catch (err) {
      return "unknown";
    }
  }
};

const hashContent = function (text) {
  return crypto.createHash("sha256").update(String(text || "")).digest("hex").slice(0, 12);
};

const tokenize = function (value) {
  const words = String(value || "")
    .toLowerCase()
    .replace(/[^a-zA-Z0-9\s]/g, " ")
    .split(/\s+/)
    .filter(function (token) { return token.length > 2; });
  const set = new Set();
  for (let i = 0; i < words.length; i++) set.add(words[i]);
  return set;
};

const overlap = function (left, right) {
  const a = tokenize(left);
  const b = tokenize(right);
  if (!a.size || !b.size) return 0;
  let shared = 0;
  a.forEach(function (token) {
    if (b.has(token)) shared += 1;
  });
  return shared / Math.max(1, a.size);
};

const freshness = function (publishedAt, nowTime) {
  const now = nowTime || Date.now();
  if (!publishedAt) return { label: "unknown", ageDays: null };
  const timestamp = Date.parse(publishedAt);
  if (!Number.isFinite(timestamp)) return { label: "unknown", ageDays: null };
  const ageDays = Math.max(0, (now - timestamp) / 86400000);
  return {
    ageDays: Math.round(ageDays * 10) / 10,
    label: ageDays <= 7 ? "fresh" : ageDays <= 30 ? "recent" : ageDays <= 365 ? "older" : "stale",
  };
};

class EvidenceLedger {
  constructor(opts) {
    const options = opts || {};
    this.taskId = options.taskId;
    this.sources = [];
    this.claims = [];
    this.createdAt = new Date().toISOString();
  }

  addSource(opts) {
    const options = opts || {};
    const url = options.url;
    if (!url) return null;
    const existing = this.sources.find(function (s) { return s.url === url; });
    if (existing) return existing;

    const sourceId = options.id || ("S" + (this.sources.length + 1));
    const domain = hostOf(url);
    const resolvedTitle = options.title || domain;
    const snippet = options.snippet || "";
    const contentHash = hashContent(options.content || snippet || url);

    const source = {
      id: sourceId,
      url: url,
      title: resolvedTitle,
      domain: domain,
      publisher: options.publisher || domain,
      publishedAt: options.publishedAt || null,
      retrievedAt: new Date().toISOString(),
      snippet: snippet,
      contentHash: contentHash,
      freshness: freshness(options.publishedAt),
      claimsSupported: [],
    };

    this.sources.push(source);
    return source;
  }

  mapClaims(claimsList) {
    const claims = claimsList || [];
    const self = this;
    const entries = claims.map(function (claim, index) {
      const claimText = typeof claim === "string" ? claim : claim.text || "";
      const claimId = (typeof claim === "object" && claim.id) ? claim.id : ("C" + (index + 1));

      const linked = self.sources
        .map(function (source) {
          return {
            source: source,
            score: overlap(claimText, source.title + " " + source.snippet),
          };
        })
        .filter(function (item) { return item.score >= 0.15; })
        .sort(function (a, b) { return b.score - a.score; })
        .slice(0, 4);

      const sourceIds = linked.map(function (item) { return item.source.id; });
      
      sourceIds.forEach(function (sid) {
        const src = self.sources.find(function (s) { return s.id === sid; });
        if (src && src.claimsSupported.indexOf(claimId) === -1) {
          src.claimsSupported.push(claimId);
        }
      });

      const status =
        sourceIds.length >= 2
          ? CLAIM_STATUS.SUPPORTED
          : sourceIds.length === 1
          ? CLAIM_STATUS.PARTIAL
          : CLAIM_STATUS.UNVERIFIED;

      return {
        id: claimId,
        text: claimText,
        status: status,
        confidence: status === CLAIM_STATUS.SUPPORTED ? "high" : status === CLAIM_STATUS.PARTIAL ? "medium" : "low",
        sourceIds: sourceIds,
        note:
          status === CLAIM_STATUS.UNVERIFIED
            ? "No attached source strongly supports this claim. Verify before relying on it."
            : status === CLAIM_STATUS.PARTIAL
            ? "One attached source is relevant; corroboration is recommended."
            : "Multiple attached sources support this claim.",
      };
    });

    this.claims = entries;
    return entries;
  }

  toSidebarSummary() {
    const self = this;
    return {
      taskId: this.taskId,
      totalSources: this.sources.length,
      sources: this.sources.map(function (s) {
        return {
          id: s.id,
          title: s.title,
          url: s.url,
          domain: s.domain,
          retrievedAt: s.retrievedAt,
          snippet: s.snippet,
          freshness: s.freshness.label,
          claimsCount: s.claimsSupported.length,
        };
      }),
      totalClaims: this.claims.length,
      claims: this.claims,
      metrics: {
        supported: this.claims.filter(function (c) { return c.status === CLAIM_STATUS.SUPPORTED; }).length,
        partial: this.claims.filter(function (c) { return c.status === CLAIM_STATUS.PARTIAL; }).length,
        unverified: this.claims.filter(function (c) { return c.status === CLAIM_STATUS.UNVERIFIED; }).length,
      },
    };
  }
}

const buildEvidenceLedger = function (opts) {
  const options = opts || {};
  const ledger = new EvidenceLedger({ taskId: options.taskId });
  (options.sources || []).forEach(function (s) { ledger.addSource(s); });
  ledger.mapClaims(options.claims || []);
  return ledger.toSidebarSummary();
};

module.exports = {
  CLAIM_STATUS: CLAIM_STATUS,
  EvidenceLedger: EvidenceLedger,
  buildEvidenceLedger: buildEvidenceLedger,
  freshness: freshness,
  hostOf: hostOf,
  hashContent: hashContent,
};
