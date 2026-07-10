import { Router, type IRouter } from "express";
import { sql } from "drizzle-orm";
import { db, trackedUsersTable } from "@workspace/db";
import { GetDashboardSummaryResponse } from "@workspace/api-zod";
import { getOrCreateAppState } from "../lib/appState";
import { requireAuth } from "../middlewares/requireAuth";

const router: IRouter = Router();

router.use(requireAuth);

router.get("/dashboard/summary", async (_req, res): Promise<void> => {
  const state = await getOrCreateAppState();

  const rows = await db
    .select({
      category: trackedUsersTable.category,
      count: sql<number>`count(*)`.mapWith(Number),
    })
    .from(trackedUsersTable)
    .groupBy(trackedUsersTable.category);

  const counts = {
    follower: 0,
    liked_post: 0,
    liked_story: 0,
  };
  for (const row of rows) {
    counts[row.category as keyof typeof counts] = row.count;
  }

  res.json(
    GetDashboardSummaryResponse.parse({
      followerCount: counts.follower,
      likedPostCount: counts.liked_post,
      likedStoryCount: counts.liked_story,
      monitoringEnabled: state.monitoringEnabled,
    }),
  );
});

export default router;
