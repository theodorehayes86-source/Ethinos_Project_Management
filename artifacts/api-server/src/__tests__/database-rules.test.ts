import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

// These are source-policy checks, NOT a Firebase rules interpreter or emulator.
const workspace = new URL("../../../../", import.meta.url);
const { rules } = JSON.parse(readFileSync(new URL("database.rules.json", workspace), "utf8"));
const staffGrant = "auth != null && auth.token.email != null && auth.token.email.matches(/^[^@]+@ethinos[.]com$/) && !root.child('clientPortalUsers').child(auth.uid).exists()";
const writablePaths = [
  "users", "clients", "clientLogs", "taskCategories", "departments", "regions",
  "taskTemplates", "checklistTemplates", "taskGroups", "controlCenterTabAccess",
  "userManagementAccessRoles", "employeeViewAccessRoles", "teamViewAccessRoles",
  "metricsAccessRoles", "reportsAccessRoles", "metricsAllDataRoles",
  "reportsAllDataRoles", "feedbackItems", "settings/hierarchyOrder",
  "settings/conditions/checklistAccess", "settings/notifications",
];
const readOnlyPaths = [
  "leaveData", "publicHolidays", "attendanceData", "teamsDMs/chats/$chatKey/messages",
];
const serverOnlyPaths = [
  "userRoles", "creativeStudio", "clientTaskCollaboration",
  "clientTaskUpdateEmailDeliveries", "clientTaskUpdateTeamsDeliveries",
  "clientPortalUsers", "clientPortalInvitationHashes", "schedulerLocks", "rateLimits",
  "config", "settings/integrations",
];
const nodeAt = (path: string) => path.split("/").reduce((node, key) => node?.[key], rules);

function collectGrants(node: Record<string, any>, path = ""): string[] {
  return Object.entries(node).flatMap(([key, value]) => {
    if (key === ".read" || key === ".write") {
      expect(value, `${path}/${key}: no unconditional grants`).not.toBe(true);
      if (value === false) return [];
      // Every single grant includes both checks, without role-map provisioning.
      expect(value, `${path}/${key}`).toBe(staffGrant);
      return [`${path}/${key}`];
    }
    return value && typeof value === "object" && !key.startsWith(".")
      ? collectGrants(value, path ? `${path}/${key}` : key)
      : [];
  });
}

describe("local Firebase compatibility rules (static policy)", () => {
  it("denies root reads/replacements and grants only the explicit audited paths", () => {
    expect(rules[".read"]).toBe(false);
    expect(rules[".write"]).toBe(false);
    expect(Object.keys(rules).filter(key => key.startsWith("$"))).toEqual([]);
    const expected = [
      ...writablePaths.flatMap(path => [`${path}/.read`, `${path}/.write`]),
      ...readOnlyPaths.map(path => `${path}/.read`),
    ];
    expect(collectGrants(rules).sort()).toEqual(expected.sort());
  });

  it.each(writablePaths)("preserves role-map-free staff read/write at %s", path => {
    expect(nodeAt(path)[".read"]).toBe(staffGrant);
    expect(nodeAt(path)[".write"]).toBe(staffGrant);
    expect(JSON.stringify(nodeAt(path))).not.toContain("root.child('userRoles')");
  });

  it.each(serverOnlyPaths)("keeps %s denied, with no granting ancestor or descendant", path => {
    const segments = path.split("/");
    for (let length = 1; length <= segments.length; length++) {
      const ancestor = nodeAt(segments.slice(0, length).join("/"));
      expect(ancestor?.[".read"]).toBe(false);
      expect(ancestor?.[".write"]).toBe(false);
    }
    expect(collectGrants(nodeAt(path), path)).toEqual([]);
  });

  it("keeps server-written leave/holiday/attendance and chat writes denied", () => {
    for (const path of ["leaveData", "publicHolidays", "attendanceData"]) {
      expect(nodeAt(path)).toEqual({ ".read": staffGrant, ".write": false });
    }
    expect(rules.teamsDMs[".read"]).toBe(false);
    expect(rules.teamsDMs[".write"]).toBe(false);
    expect(collectGrants(rules.teamsDMs, "teamsDMs")).toEqual([
      "teamsDMs/chats/$chatKey/messages/.read",
    ]);
    // Browser chat sends go through the API; lookup/subscription/bot metadata stay private.
    expect(Object.keys(rules.teamsDMs).sort()).toEqual([".read", ".write", "chats"]);
  });

  it("retains query indexes", () => {
    expect(rules.users[".indexOn"]).toEqual(["email", "managerId"]);
    expect(rules.clientPortalInvitationHashes[".indexOn"]).toBe(".value");
  });

  it("uses an anchored exact domain expression, not a suffix or embedded-address match", () => {
    // JS regex examples protect the literal pattern; only Firebase can validate its evaluation.
    const pattern = /^[^@]+@ethinos[.]com$/;
    expect(staffGrant).toContain(`email.matches(${pattern.toString()})`);
    expect(pattern.test("staff@ethinos.com")).toBe(true);
    for (const email of ["", "@ethinos.com", "staff@example.com", "staff@ethinos.com.evil",
      "staff@sub.ethinos.com", "staff@evil@ethinos.com", "staff@ethinosXcom"]) {
      expect(pattern.test(email), email).toBe(false);
    }
    expect(staffGrant).toContain("auth != null && auth.token.email != null");
    // No enabled/email/role condition: even disabled or email-changed portal UID markers exclude.
    expect(staffGrant).toContain("!root.child('clientPortalUsers').child(auth.uid).exists()");
    expect(staffGrant).not.toContain("enabled");
    expect(staffGrant).not.toContain("userRoles");
  });

  it("covers literal browser Firebase refs and desktop syncRef subscriptions", () => {
    const paths = new Set<string>();
    function scan(directory: string) {
      for (const entry of readdirSync(directory, { withFileTypes: true })) {
        const file = join(directory, entry.name);
        if (entry.isDirectory()) {
          if (entry.name !== "__tests__") scan(file);
        } else if (/\.[jt]sx?$/.test(entry.name)) {
          const source = readFileSync(file, "utf8");
          for (const match of source.matchAll(/\b(?:ref\s*\(\s*db\s*,\s*|syncRef\s*\(\s*)['"`]([^'"`]+)['"`]/g)) {
            paths.add(match[1].replace(/\$\{[^}]+\}/g, "$chatKey"));
          }
        }
      }
    }
    for (const artifact of ["pmt-app", "pmt-mobile", "pmt-timer-widget"]) {
      scan(new URL(`artifacts/${artifact}/src`, workspace).pathname);
    }
    expect(paths.size).toBeGreaterThan(25);
    for (const path of paths) {
      if (path === ".info/connected") continue; // Firebase's built-in connection state.
      const permitted = [...writablePaths, ...readOnlyPaths].some(grant =>
        path === grant || path.startsWith(`${grant}/`));
      expect(permitted, `Uncovered browser path: ${path}`).toBe(true);
    }
    // Dynamic ref(db, path) is the syncRef helper audited above. Root update(ref(db), ...)
    // calls were manually audited: clientLogs diffs and users Teams-notification preferences.
    // This scan does not claim to detect arbitrary computed references or evaluate RTDB rules.
  });
});
