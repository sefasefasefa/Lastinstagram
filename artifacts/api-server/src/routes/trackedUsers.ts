import { Router, type IRouter } from "express";
import { eq, desc } from "drizzle-orm";
import { db, trackedUsersTable } from "@workspace/db";
import {
  ListTrackedUsersQueryParams,
  ListTrackedUsersResponse,
  CreateTrackedUserBody,
  CreateTrackedUserResponse,
  DeleteTrackedUserParams,
} from "@workspace/api-zod";
import { requireAuth } from "../middlewares/requireAuth";

const router: IRouter = Router();

router.use(requireAuth);

router.get("/tracked-users", async (req, res): Promise<void> => {
  const query = ListTrackedUsersQueryParams.safeParse(req.query);
  if (!query.success) {
    res.status(400).json({ error: query.error.message });
    return;
  }

  const rows = query.data.category
    ? await db
        .select()
        .from(trackedUsersTable)
        .where(eq(trackedUsersTable.category, query.data.category))
        .orderBy(desc(trackedUsersTable.addedAt))
    : await db
        .select()
        .from(trackedUsersTable)
        .orderBy(desc(trackedUsersTable.addedAt));

  res.json(ListTrackedUsersResponse.parse(rows));
});

router.post("/tracked-users", async (req, res): Promise<void> => {
  const parsed = CreateTrackedUserBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const [user] = await db
    .insert(trackedUsersTable)
    .values({
      ...parsed.data,
      autoLikeEnabled: parsed.data.autoLikeEnabled ?? false,
    })
    .returning();

  res.status(201).json(CreateTrackedUserResponse.parse(user));
});

router.delete("/tracked-users/:id", async (req, res): Promise<void> => {
  const params = DeleteTrackedUserParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const [user] = await db
    .delete(trackedUsersTable)
    .where(eq(trackedUsersTable.id, params.data.id))
    .returning();

  if (!user) {
    res.status(404).json({ error: "Tracked user not found" });
    return;
  }

  res.sendStatus(204);
});

export default router;
