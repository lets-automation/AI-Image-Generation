/**
 * Granular permission system for custom admin roles.
 *
 * Permissions follow the pattern: "resource.action"
 * Resources map to admin sections. Actions are read/write/delete.
 */

export const Permission = {
  // Dashboard
  DASHBOARD_READ: "dashboard.read",

  // Users
  USERS_READ: "users.read",
  USERS_WRITE: "users.write",
  USERS_ROLES: "users.roles",

  // Moderation
  MODERATION_READ: "moderation.read",
  MODERATION_WRITE: "moderation.write",

  // Categories
  CATEGORIES_READ: "categories.read",
  CATEGORIES_WRITE: "categories.write",

  // Templates
  TEMPLATES_READ: "templates.read",
  TEMPLATES_WRITE: "templates.write",

  // Festivals
  FESTIVALS_READ: "festivals.read",
  FESTIVALS_WRITE: "festivals.write",

  // Models / Pricing
  MODELS_READ: "models.read",
  MODELS_WRITE: "models.write",

  // Subscriptions
  SUBSCRIPTIONS_READ: "subscriptions.read",
  SUBSCRIPTIONS_WRITE: "subscriptions.write",

  // Analytics
  ANALYTICS_READ: "analytics.read",

  // Generations (admin view)
  GENERATIONS_READ: "generations.read",

  // Audit Logs
  AUDIT_READ: "audit.read",

  // System Config
  SYSTEM_CONFIG: "system.config",
} as const;

export type Permission = (typeof Permission)[keyof typeof Permission];

export const ALL_PERMISSIONS = Object.values(Permission);

export const PERMISSION_GROUPS: Array<{
  label: string;
  description: string;
  permissions: Array<{ code: Permission; label: string }>;
}> = [
  {
    label: "Dashboard",
    description: "View main admin dashboard",
    permissions: [
      { code: "dashboard.read", label: "View dashboard overview" },
    ],
  },
  {
    label: "Users",
    description: "Manage user accounts and roles",
    permissions: [
      { code: "users.read", label: "View users" },
      { code: "users.write", label: "Edit users (activate/deactivate)" },
      { code: "users.roles", label: "Assign roles" },
    ],
  },
  {
    label: "Moderation",
    description: "Manage content moderation",
    permissions: [
      { code: "moderation.read", label: "View moderation queue" },
      { code: "moderation.write", label: "Approve/reject content" },
    ],
  },
  {
    label: "Categories",
    description: "Manage categories and field schemas",
    permissions: [
      { code: "categories.read", label: "View categories" },
      { code: "categories.write", label: "Create/edit/delete categories" },
    ],
  },
  {
    label: "Templates",
    description: "Manage poster/event templates",
    permissions: [
      { code: "templates.read", label: "View templates" },
      { code: "templates.write", label: "Create/edit/delete templates" },
    ],
  },
  {
    label: "Festivals",
    description: "Manage festival calendar",
    permissions: [
      { code: "festivals.read", label: "View festivals" },
      { code: "festivals.write", label: "Create/edit/delete festivals" },
    ],
  },
  {
    label: "AI Models",
    description: "Manage AI model pricing and configuration",
    permissions: [
      { code: "models.read", label: "View model configs" },
      { code: "models.write", label: "Create/edit/delete model configs" },
    ],
  },
  {
    label: "Subscriptions",
    description: "Manage subscription plans",
    permissions: [
      { code: "subscriptions.read", label: "View plans" },
      { code: "subscriptions.write", label: "Create/edit/delete plans" },
    ],
  },
  {
    label: "Analytics & Monitoring",
    description: "View dashboards, generation history, and audit logs",
    permissions: [
      { code: "analytics.read", label: "View analytics dashboard" },
      { code: "generations.read", label: "View generation history" },
      { code: "audit.read", label: "View audit logs" },
    ],
  },
  {
    label: "System",
    description: "System-level configuration",
    permissions: [
      { code: "system.config", label: "Modify system config" },
    ],
  },
];
