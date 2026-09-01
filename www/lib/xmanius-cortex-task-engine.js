"use strict";

/**
 * XManius Cortex Task Engine - Agent Runtime v1
 * Manages task lifecycle, state machine transitions, event streams, and execution controllers.
 */

const TASK_STATES = Object.freeze({
  QUEUED: "queued",
  PLANNING: "planning",
  EXECUTING: "executing",
  WAITING_FOR_APPROVAL: "waiting_for_approval",
  VERIFYING: "verifying",
  COMPLETED: "completed",
  FAILED: "failed",
  STOPPED: "stopped",
});

const VALID_TRANSITIONS = Object.freeze({
  [TASK_STATES.QUEUED]: [TASK_STATES.PLANNING, TASK_STATES.EXECUTING, TASK_STATES.STOPPED, TASK_STATES.FAILED],
  [TASK_STATES.PLANNING]: [TASK_STATES.EXECUTING, TASK_STATES.WAITING_FOR_APPROVAL, TASK_STATES.VERIFYING, TASK_STATES.COMPLETED, TASK_STATES.FAILED, TASK_STATES.STOPPED],
  [TASK_STATES.EXECUTING]: [TASK_STATES.WAITING_FOR_APPROVAL, TASK_STATES.VERIFYING, TASK_STATES.COMPLETED, TASK_STATES.FAILED, TASK_STATES.STOPPED],
  [TASK_STATES.WAITING_FOR_APPROVAL]: [TASK_STATES.EXECUTING, TASK_STATES.PLANNING, TASK_STATES.COMPLETED, TASK_STATES.FAILED, TASK_STATES.STOPPED],
  [TASK_STATES.VERIFYING]: [TASK_STATES.EXECUTING, TASK_STATES.COMPLETED, TASK_STATES.FAILED, TASK_STATES.STOPPED],
  [TASK_STATES.COMPLETED]: [],
  [TASK_STATES.FAILED]: [],
  [TASK_STATES.STOPPED]: [],
});

class CortexTask {
  constructor(opts) {
    const options = opts || {};
    this.id = options.id || "task_" + Date.now() + "_" + Math.random().toString(36).slice(2, 8);
    this.objective = options.objective || "";
    this.mode = options.mode || "task";
    this.state = TASK_STATES.QUEUED;
    this.createdAt = new Date().toISOString();
    this.updatedAt = this.createdAt;
    this.completedAt = null;
    this.steps = [];
    this.artifacts = [];
    this.sources = [];
    this.approvals = [];
    this.events = [];
    this.metadata = Object.assign({}, options.metadata);
    this.error = null;
    this.abortController = typeof AbortController !== "undefined" ? new AbortController() : { abort: function(){ this.signal.aborted = true; }, signal: { aborted: false } };
    this.listeners = new Set();
  }

  get isTerminal() {
    return [TASK_STATES.COMPLETED, TASK_STATES.FAILED, TASK_STATES.STOPPED].indexOf(this.state) !== -1;
  }

  get signal() {
    return this.abortController.signal;
  }

  transitionTo(nextState, reason) {
    if (this.state === nextState) return this.state;
    const allowed = VALID_TRANSITIONS[this.state] || [];
    if (allowed.indexOf(nextState) === -1) {
      throw new Error("Invalid state transition from '" + this.state + "' to '" + nextState + "'.");
    }

    const previousState = this.state;
    this.state = nextState;
    this.updatedAt = new Date().toISOString();
    if (this.isTerminal) {
      this.completedAt = this.updatedAt;
    }

    const event = {
      type: "state_transition",
      taskId: this.id,
      from: previousState,
      to: nextState,
      reason: reason || "",
      timestamp: this.updatedAt,
    };
    this.emitEvent(event);
    return this.state;
  }

  addStep(opts) {
    const options = opts || {};
    const step = {
      id: "step_" + (this.steps.length + 1) + "_" + Math.random().toString(36).slice(2, 6),
      type: options.type || "action",
      label: options.label || ("Step " + (this.steps.length + 1)),
      status: options.status || "running",
      detail: options.detail || null,
      tool: options.tool || null,
      startedAt: new Date().toISOString(),
      completedAt: null,
      output: null,
      error: null,
    };
    this.steps.push(step);
    this.emitEvent({ type: "step_added", taskId: this.id, step: step });
    return step;
  }

  updateStep(stepId, updates) {
    const opts = updates || {};
    const step = this.steps.find(function (s) { return s.id === stepId; });
    if (!step) return null;
    if (opts.status) step.status = opts.status;
    if (opts.output !== undefined) step.output = opts.output;
    if (opts.error !== undefined) step.error = opts.error;
    if (opts.detail !== undefined) step.detail = opts.detail;
    if (opts.label !== undefined) step.label = opts.label;
    if (["completed", "failed", "cancelled"].indexOf(step.status) !== -1) {
      step.completedAt = new Date().toISOString();
    }
    this.emitEvent({ type: "step_updated", taskId: this.id, step: step });
    return step;
  }

  attachArtifact(artifact) {
    if (!artifact) return;
    this.artifacts.push(artifact);
    this.emitEvent({ type: "artifact_created", taskId: this.id, artifact: artifact });
  }

  attachSource(source) {
    if (!source) return;
    if (!this.sources.some(function (s) { return s.url === source.url || (s.id && s.id === source.id); })) {
      this.sources.push(source);
      this.emitEvent({ type: "source_attached", taskId: this.id, source: source });
    }
  }

  requestApproval(approvalRequest) {
    this.approvals.push(approvalRequest);
    this.transitionTo(TASK_STATES.WAITING_FOR_APPROVAL, "Approval required for " + approvalRequest.action);
    this.emitEvent({ type: "approval_requested", taskId: this.id, approval: approvalRequest });
  }

  stop(reason) {
    if (this.isTerminal) return;
    const res = reason || "Task stopped by user";
    try { this.abortController.abort(new Error(res)); } catch(e) {}
    this.steps.forEach(function (step) {
      if (step.status === "running") {
        step.status = "cancelled";
        step.completedAt = new Date().toISOString();
        step.detail = res;
      }
    });
    this.transitionTo(TASK_STATES.STOPPED, res);
  }

  fail(error) {
    if (this.isTerminal) return;
    this.error = typeof error === "string" ? error : (error && error.message) || "Task failed";
    this.steps.forEach((step) => {
      if (step.status === "running") {
        step.status = "failed";
        step.completedAt = new Date().toISOString();
        step.error = this.error;
      }
    });
    this.transitionTo(TASK_STATES.FAILED, this.error);
  }

  complete(finalOutput) {
    if (this.isTerminal) return;
    this.output = finalOutput || "";
    this.steps.forEach(function (step) {
      if (step.status === "running") {
        step.status = "completed";
        step.completedAt = new Date().toISOString();
      }
    });
    this.transitionTo(TASK_STATES.COMPLETED, "Execution complete");
  }

  subscribe(listener) {
    if (typeof listener === "function") {
      this.listeners.add(listener);
      return () => this.listeners.delete(listener);
    }
    return function () {};
  }

  emitEvent(event) {
    this.events.push(event);
    this.listeners.forEach(function (listener) {
      try {
        listener(event);
      } catch (err) {
        console.error("Listener error in CortexTask:", err);
      }
    });
  }

  toJSON() {
    return {
      id: this.id,
      objective: this.objective,
      mode: this.mode,
      state: this.state,
      createdAt: this.createdAt,
      updatedAt: this.updatedAt,
      completedAt: this.completedAt,
      steps: this.steps,
      artifacts: this.artifacts,
      sources: this.sources,
      approvals: this.approvals,
      output: this.output || "",
      error: this.error,
      metadata: this.metadata,
    };
  }
}

class CortexTaskManager {
  constructor() {
    this.tasks = new Map();
  }

  createTask(opts) {
    const task = new CortexTask(opts);
    this.tasks.set(task.id, task);
    return task;
  }

  getTask(id) {
    return this.tasks.get(id) || null;
  }

  stopTask(id, reason) {
    const task = this.getTask(id);
    if (task) {
      task.stop(reason || "Stopped via Task Manager");
      return true;
    }
    return false;
  }

  listTasks(limit) {
    const max = limit || 20;
    return Array.from(this.tasks.values())
      .slice(-max)
      .reverse()
      .map(function (t) { return t.toJSON(); });
  }

  cleanup(maxAgeMs) {
    const max = maxAgeMs || 24 * 60 * 60 * 1000;
    const now = Date.now();
    for (const entry of this.tasks.entries()) {
      const id = entry[0];
      const task = entry[1];
      if (task.isTerminal && now - new Date(task.updatedAt).getTime() > max) {
        this.tasks.delete(id);
      }
    }
  }
}

const globalTaskManager = new CortexTaskManager();

module.exports = {
  TASK_STATES: TASK_STATES,
  VALID_TRANSITIONS: VALID_TRANSITIONS,
  CortexTask: CortexTask,
  CortexTaskManager: CortexTaskManager,
  globalTaskManager: globalTaskManager,
};
