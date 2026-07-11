import { Router, type IRouter } from "express";
import { HealthCheckResponse } from "@workspace/api-zod";

const router: IRouter = Router();

// Captured once at module load, i.e. when this process started.
const serverStartedAt = new Date();

router.get("/healthz", (_req, res) => {
  const data = HealthCheckResponse.parse({
    status: "ok",
    lastRestart: serverStartedAt,
  });
  res.json(data);
});

export default router;
