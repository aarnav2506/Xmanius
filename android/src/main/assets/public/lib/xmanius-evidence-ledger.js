"use strict";

/*
 * Xmanius differentiator: Evidence Ledger
 *
 * Instead of showing a generic list of links, every important claim can carry
 * the source(s) that support it, a freshness check, and an uncertainty label.
 * Store the ledger with the response for inspection and future re-checking.
 */

const CLAIM_STATUS = Object.freeze({
  SUPPORTED: "supported",
  PARTIAL: "partially_supported",
  UNVERIFIED: "unverified",
  CONFLICTING: "conflicting",
});

const hostOf = (url) => {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return "unknown";
  }
};

const tokenize = (value) => new Set(
  String(value || "")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .split(/\s+/)
    .filter((token) => token.length > 2),
);

const overlap = (left, right) => {
  const a = tokenize(left);
  const b = tokenize(right);
  if (!a.size || !b.size) return 0;
  let shared = 0;
  for (const token of a) if (b.has(token)) shared += 1;
  return shared / Math.max(1, a.size);
};

const freshness = (publishedAt, now = Date.now()) => {
  if (!publishedAt) return { label: "unknown", ageDays: null };
  const timestamp = Date.parse(publishedAt);
  if (!Number.isFinite(timestamp)) return { label: "unknown", ageDays: null };
  const ageDays = Math.max(0, (now - timestamp) / 86400000);
  return {
    ageDays: Math.round(ageDays * 10) / 10,
    label: ageDays <= 7 ? "fresh" : ageDays <= 30 ? "recent" : ageDays <= 365 ? "older" : "stale",
  };
};

const buildEvidenceLedger = ({ claims = [], sources = [], now = Date.now() } = {}) => {
  const normalizedSources = sources
    .filter((source) => source?.url)
    .map((source, index) => ({
      id: source.id || `S${index + 1}`,
      title: source.title || hostOf(source.url),
      url: source.url,
      publisher: source.publisher || hostOf(source.url),
      publishedAt: source.publishedAt || null,
      snippet: source.snippet || "",
      freshness: freshness(source.publishedAt, now),
    }));

  const entries = claims.map((claim, index) => {
    const linked = normalizedSources
      .map((source) => ({ source, score: overlap(claim.text, `${source.title} ${source.snippet}`) }))
      .filter((item) => item.score >= 0.18)
      .sort((a, b) => b.score - a.score)
      .slice(0, 4);

    const sourceIds = linked.map((item) => item.source.id);
    const status = sourceIds.length >= 2
      ? CLAIM_STATUS.SUPPORTED
      : sourceIds.length === 1
        ? CLAIM_STATUS.PARTIAL
        : CLAIM_STATUS.UNVERIFIED;

    return {
      id: claim.id || `C${index + 1}`,
      text: claim.text,
      status,
      confidence: status === CLAIM_STATUS.SUPPORTED ? "high" : status === CLAIM_STATUS.PARTIAL ? "medium" : "low",
      sourceIds,
      note: status === CLAIM_STATUS.UNVERIFIED
        ? "No attached source strongly supports this claim. Verify before relying on it."
        : status === CLAIM_STATUS.PARTIAL
          ? "One attached source is relevant; corroboration is recommended."
          : "Multiple attached sources are relevant.",
    };
  });

  return {
    generatedAt: new Date(now).toISOString(),
    sources: normalizedSources,
    claims: entries,
    summary: {
      totalClaims: entries.length,
      supported: entries.filter((item) => item.status === CLAIM_STATUS.SUPPORTED).length,
      partial: entries.filter((item) => item.status === CLAIM_STATUS.PARTIAL).length,
      unverified: entries.filter((item) => item.status === CLAIM_STATUS.UNVERIFIED).length,
    },
  };
};

module.exports = { CLAIM_STATUS, buildEvidenceLedger, freshness, hostOf };
