import { Router, type IRouter } from "express";
import { eq } from "drizzle-orm";
import { db, appStateTable } from "@workspace/db";
import {
  GetMonitoringStatusResponse,
  UpdateMonitoringStatusBody,
  UpdateMonitoringStatusResponse,
} from "@workspace/api-zod";
import { getOrCreateAppState } from "../lib/appState";

const router: IRouter = Router();

router.get("/monitoring", async (_req, res): Promise<void> => {
  const state = await getOrCreateAppState();
  res.json(
    GetMonitoringStatusResponse.parse({ enabled: state.monitoringEnabled }),
  );
});

router.patch("/monitoring", async (req, res): Promise<void> => {
  const parsed = UpdateMonitoringStatusBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  await getOrCreateAppState();
  const [state] = await db
    .update(appStateTable)
    .set({ monitoringEnabled: parsed.data.enabled })
    .where(eq(appStateTable.id, 1))
    .returning();

  res.json(
    UpdateMonitoringStatusResponse.parse({
      enabled: state?.monitoringEnabled ?? parsed.data.enabled,
    }),
  );
});

export default router;
