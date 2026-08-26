"use strict";

/* Safe deterministic tools for Xmanius.
 * Keep side effects behind an explicit approval token.
 */

const calculate = (expression) => {
  const input = String(expression || "").trim();
  if (!input || input.length > 200) throw new Error("Expression is empty or too long.");

  // Deliberately permit only numbers, decimal points, whitespace, and operators.
  if (!/^[0-9+\-*/().%\s]+$/.test(input)) {
    throw new Error("Only arithmetic expressions are allowed.");
  }

  // Avoid eval in production. Replace this implementation with a real parser
  // such as a shunting-yard evaluator or a vetted math-expression package.
  const tokens = input.match(/\d+(?:\.\d+)?|[+\-*/()%]/g) || [];
  if (tokens.join("") !== input.replace(/\s+/g, "")) {
    throw new Error("Invalid arithmetic expression.");
  }

  // This demo evaluator supports basic binary operations and parentheses only.
  // It is intentionally limited and should be replaced with a tested parser.
  const values = [];
  const operators = [];
  const precedence = { "+": 1, "-": 1, "*": 2, "/": 2, "%": 2 };
  const apply = () => {
    const operator = operators.pop();
    const right = values.pop();
    const left = values.pop();
    if (left === undefined || right === undefined) throw new Error("Invalid expression.");
    if (operator === "+") values.push(left + right);
    if (operator === "-") values.push(left - right);
    if (operator === "*") values.push(left * right);
    if (operator === "/") {
      if (right === 0) throw new Error("Division by zero.");
      values.push(left / right);
    }
    if (operator === "%") values.push(left % right);
  };

  for (const token of tokens) {
    if (/^\d/.test(token)) values.push(Number(token));
    else if (token === "(") operators.push(token);
    else if (token === ")") {
      while (operators.length && operators.at(-1) !== "(") apply();
      if (operators.pop() !== "(") throw new Error("Mismatched parentheses.");
    } else {
      while (
        operators.length &&
        operators.at(-1) !== "(" &&
        precedence[operators.at(-1)] >= precedence[token]
      ) apply();
      operators.push(token);
    }
  }

  while (operators.length) {
    if (operators.at(-1) === "(") throw new Error("Mismatched parentheses.");
    apply();
  }

  if (values.length !== 1 || !Number.isFinite(values[0])) throw new Error("Invalid result.");
  return { expression: input, value: values[0] };
};

const ACTIONS_REQUIRING_APPROVAL = new Set([
  "send_email",
  "send_message",
  "delete_data",
  "purchase",
  "book",
  "publish",
  "modify_calendar",
  "run_code_with_network",
]);

const requiresApproval = (action) => ACTIONS_REQUIRING_APPROVAL.has(action);

const createApprovalRequest = ({ action, summary, parameters = {} }) => ({
  id: `approval_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
  action,
  summary,
  parameters,
  status: "awaiting_user_approval",
  expiresAt: new Date(Date.now() + 10 * 60 * 1000).toISOString(),
});

const assertApproval = (approval, expectedAction) => {
  if (!approval || approval.status !== "approved" || approval.action !== expectedAction) {
    const error = new Error("This action requires explicit user approval.");
    error.code = "APPROVAL_REQUIRED";
    error.approval = createApprovalRequest({
      action: expectedAction,
      summary: `Xmanius is ready to perform: ${expectedAction}`,
    });
    throw error;
  }
};

module.exports = {
  ACTIONS_REQUIRING_APPROVAL,
  assertApproval,
  calculate,
  createApprovalRequest,
  requiresApproval,
};
