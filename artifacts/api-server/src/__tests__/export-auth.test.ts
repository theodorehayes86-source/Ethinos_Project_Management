/**
 * Export API authorization tests.
 *
 * The /api/export/* endpoints serve reporting data for ALL clients, so they
 * must never be reachable without the admin API key. These tests prove that
 * every export route rejects unauthenticated requests — including attempts to
 * pull a specific client's data by supplying clientId directly.
 */
import { describe, it, expect, beforeAll, vi } from "vitest";
import express from "express";
import request from "supertest";

vi.mock("../lib/firebase-admin", () => ({
  readFirebasePath: vi.fn(async () => {
    throw new Error("Firebase must not be read for unauthenticated requests");
  }),
}));

process.env.PMT_EXPORT_API_KEY = "test-integrity-key";

describe("export API auth", () => {
  let app: express.Express;

  beforeAll(async () => {
    const { default: exportRouter } = await import("../routes/export");
    app = express();
    // Minimal req.log shim (production uses pino-http).
    app.use((req, _res, next) => {
      (req as unknown as { log: { info: () => void } }).log = { info: () => {} };
      next();
    });
    app.use("/api/export", exportRouter);
  });

  const routes = [
    "/api/export/hours",
    "/api/export/hours/by-client",
    "/api/export/hours/by-date",
    "/api/export/hours?clientId=tc-restricted",
    "/api/export/hours/by-client?clientId=tc-restricted&detail=true",
  ];

  for (const route of routes) {
    it(`rejects ${route} without an API key (401, no data)`, async () => {
      const res = await request(app).get(route);
      expect(res.status).toBe(401);
      expect(JSON.stringify(res.body)).not.toContain("byCategory");
      expect(JSON.stringify(res.body)).not.toContain("byClient");
    });

    it(`rejects ${route} with a wrong API key`, async () => {
      const res = await request(app).get(route).set("x-admin-api-key", "wrong-key");
      expect(res.status).toBe(401);
    });
  }
});
