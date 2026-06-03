/**
 * Central role hierarchy — single source of truth for all RBAC checks.
 * Extend here; no other file should hardcode role relationships.
 */

// Numeric rank: higher = more authority
const ROLE_RANK = {
  owner:         4,
  sales_head:    3,
  sales_manager: 2,
  employee:      1,
  inside_sales:  1,
};

// Roles that are allowed to create targets
const CAN_CREATE_TARGET = ["owner", "sales_head", "sales_manager"];

// Roles that can view all targets (unrestricted)
const CAN_VIEW_ALL_TARGETS = ["owner", "sales_head"];

// Map: a role → the roles it is allowed to assign targets TO
// A user can never assign upward in the hierarchy.
const ASSIGNABLE_TO = {
  owner:         ["sales_head", "sales_manager", "employee", "inside_sales"],
  sales_head:    ["sales_manager", "employee", "inside_sales"],
  sales_manager: ["employee", "inside_sales"],
  employee:      [],
  inside_sales:  [],
};

/**
 * Returns true if `assigner` role is allowed to assign targets to `assignee` role.
 */
function canAssignTo(assignerRole, assigneeRole) {
  return (ASSIGNABLE_TO[assignerRole] || []).includes(assigneeRole);
}

/**
 * Returns true if roleA outranks roleB (strictly higher authority).
 */
function outranks(roleA, roleB) {
  return (ROLE_RANK[roleA] || 0) > (ROLE_RANK[roleB] || 0);
}

module.exports = { ROLE_RANK, CAN_CREATE_TARGET, CAN_VIEW_ALL_TARGETS, ASSIGNABLE_TO, canAssignTo, outranks };
