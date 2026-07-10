import { Router, type IRouter } from "express";
import { eq } from "drizzle-orm";
import { db, appStateTable } from "@workspace/db";
import {
  GetConnectionResponse,
  ConnectAccountBody,
  ConnectAccountResponse,
  DisconnectAccountResponse,
} from "@workspace/api-zod";
import { getOrCreateAppState } from "../lib/appState";

const router: IRouter = Router();

router.get("/connection", async (_req, res): Promise<void> => {
  const state = await getOrCreateAppState();
  res.json(
    GetConnectionResponse.parse({
      connected: state.connected,
      username: state.username,
      connectedAt: state.connectedAt ? state.connectedAt.toISOString() : null,
    }),
  );
});

router.post("/connection/connect", async (req, res): Promise<void> => {
  const parsed = ConnectAccountBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  await getOrCreateAppState();
  const connectedAt = new Date();
  const [state] = await db
    .update(appStateTable)
    .set({
      connected: true,
      username: parsed.data.username,
      connectedAt,
    })
    .where(eq(appStateTable.id, 1))
    .returning();

  res.json(
    ConnectAccountResponse.parse({
      connected: true,
      username: state?.username ?? parsed.data.username,
      connectedAt: connectedAt.toISOString(),
    }),
  );
});

router.post("/connection/disconnect", async (_req, res): Promise<void> => {
  await getOrCreateAppState();
  await db
    .update(appStateTable)
    .set({
      connected: false,
      username: null,
      connectedAt: null,
    })
    .where(eq(appStateTable.id, 1));

  res.json(
    DisconnectAccountResponse.parse({
      connected: false,
      username: null,
      connectedAt: null,
    }),
  );
});

export default router;
