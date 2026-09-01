"use strict";

/**
 * XManius Security & Approval Gateway
 * Manages Permission Tiers (L0-L6), human confirmation requests, expiring tokens,
 * and security audit logs for high-impact tool execution.
 */

const PERMISSION_TIERS = Object.freeze({
  L0_PUBLIC_WEB: { level: 0, label: "Read-only public web", autoApprove: true },
  L1_READ_FILES: { level: 1, label: "Read-only project files", autoApprove: true },
  L2_WRITE_FILES: { level: 2, label: "Write project files in sandbox", autoApprove: true },
  L3_RUN_SANDBOX: { level: 3, label: "Run code in sandbox", autoApprove: true },
  L4_PERSISTENT_VM: { level: 4, label: "Persistent compute access", autoApprove: false },
  L5_EXTERNAL_SERVICE: { level: 5, label: "Authenticated external service", autoApprove: false },
  L6_SIDE_EFFECT: { level: 6, label: "External destructive or financial side-effects", autoApprove: false },
});

const HIGH_IMPACT_ACTIONS = new Set([
  "delete_file",
  "delete_workspace",
  "send_email",
  "send_message",
  "publish_deployment",
  "execute_host_command",
  "access_user_credentials",
  "make_payment",
]);

class ApprovalGateway {
  constructor(opts) {
    const options = opts || {};
    this.defaultExpiryMs = options.defaultExpiryMs || 10 * 60 * 1000;
    this.pendingApprovals = new Map();
    this.auditLog = [];
  }

  isApprovalRequired(action, tier) {
    if (HIGH_IMPACT_ACTIONS.has(action)) return true;
    if (tier && tier.level >= 4) return true;
    return false;
  }

  createApprovalRequest(opts) {
    const options = opts || {};
    const tier = options.tier || PERMISSION_TIERS.L6_SIDE_EFFECT;
    const id = "appr_" + Date.now() + "_" + Math.random().toString(36).slice(2, 7);
    const expiresAt = new Date(Date.now() + this.defaultExpiryMs).toISOString();

    const request = {
      id: id,
      taskId: options.taskId || "global",
      action: options.action,
      summary: options.summary || ("Confirmation required for: " + options.action),
      tier: tier.label || "High Impact Action",
      tierLevel: tier.level || 6,
      parameters: Object.assign({}, options.parameters),
      status: "pending",
      createdAt: new Date().toISOString(),
      expiresAt: expiresAt,
      decidedAt: null,
      decision: null,
    };

    this.pendingApprovals.set(id, request);
    this.logAudit("approval_created", request);
    return request;
  }

  getApproval(approvalId) {
    return this.pendingApprovals.get(approvalId) || null;
  }

  resolveApproval(approvalId, decision, userMetadata) {
    const request = this.pendingApprovals.get(approvalId);
    if (!request) {
      throw new Error("Approval request '" + approvalId + "' not found.");
    }

    if (new Date() > new Date(request.expiresAt)) {
      request.status = "expired";
      this.logAudit("approval_expired", request);
      throw new Error("Approval request '" + approvalId + "' has expired.");
    }

    const dec = decision === "approved" ? "approved" : "rejected";
    request.status = dec;
    request.decision = dec;
    request.decidedAt = new Date().toISOString();
    request.userMetadata = Object.assign({}, userMetadata);

    this.logAudit("approval_" + dec, request);
    return request;
  }

  assertAuthorized(action, approval) {
    if (!this.isApprovalRequired(action)) {
      return true;
    }

    if (!approval || approval.status !== "approved" || approval.action !== action) {
      const err = new Error("Action '" + action + "' requires explicit user confirmation.");
      err.code = "APPROVAL_REQUIRED";
      err.approval = this.createApprovalRequest({
        action: action,
        summary: "Approval needed to execute '" + action + "'",
      });
      throw err;
    }

    return true;
  }

  logAudit(event, payload) {
    this.auditLog.push({
      event: event,
      timestamp: new Date().toISOString(),
      payload: Object.assign({}, payload),
    });
    if (this.auditLog.length > 2000) {
      this.auditLog.shift();
    }
  }

  getAuditLog(limit) {
    const max = limit || 50;
    return this.auditLog.slice(-max).reverse();
  }
}

const globalApprovalGateway = new ApprovalGateway();

module.exports = {
  PERMISSION_TIERS: PERMISSION_TIERS,
  HIGH_IMPACT_ACTIONS: HIGH_IMPACT_ACTIONS,
  ApprovalGateway: ApprovalGateway,
  globalApprovalGateway: globalApprovalGateway,
};
