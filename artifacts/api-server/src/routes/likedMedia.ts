import { Router, type IRouter } from "express";
import { eq } from "drizzle-orm";
import { db, trackedUsersTable, likedMediaTable } from "@workspace/db";
import { requireAuth } from "../middlewares/requireAuth";

const router: IRouter = Router();
router.use(requireAuth);

router.get("/tracked-users/:id/media", async (req, res): Promise<void> => {
  const id = parseInt(req.params.id ?? "", 10);
  if (isNaN(id) || id <= 0) {
    res.status(400).json({ error: "Invalid id" });
    return;
  }

  const [user] = await db
    .select()
    .from(trackedUsersTable)
    .where(eq(trackedUsersTable.id, id));

  if (!user) {
    res.status(404).json({ error: "Tracked user not found" });
    return;
  }

  const media = await db
    .select()
    .from(likedMediaTable)
    .where(eq(likedMediaTable.trackedUserId, id))
    .orderBy(likedMediaTable.likedAt);

  res.json(media);
});

export default router;
