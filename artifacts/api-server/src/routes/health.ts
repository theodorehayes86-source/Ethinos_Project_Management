import { Router, type IRouter } from "express";
import { HealthCheckResponse } from "@workspace/api-zod";
import { GIT_SHA } from "../lib/version";

const router: IRouter = Router();

router.get("/healthz", (_req, res) => {
  const data = HealthCheckResponse.parse({ status: "ok" });
  res.json({ ...data, build: GIT_SHA });
});

export default router;
