import { Router, type IRouter } from "express";
import { eq } from "drizzle-orm";
import { db, automationJobsTable } from "@workspace/db";
import {
  ListAutomationJobsResponse,
  CreateAutomationJobBody,
  CreateAutomationJobResponse,
  DeleteAutomationJobParams,
} from "@workspace/api-zod";
import { requireAuth } from "../middlewares/requireAuth";
import type { AutomationJob } from "@workspace/db";

// DB rows use a numeric `id`; the API contract exposes it as string `jobId`.
function toResponseShape(job: AutomationJob) {
  const { id, ...rest } = job;
  return { jobId: String(id), ...rest };
}

// This router only persists job *configuration*. There is no scheduler or
// worker anywhere in this codebase that reads automation_jobs and performs
// the described action against a third-party site - jobs are always
// created with status "paused" and stay that way. Any real execution
// would have to be built and triggered explicitly, the same way
// /settings/request-config/test requires an explicit manual call.
const router: IRouter = Router();

router.use(requireAuth);

router.get("/automation-jobs", async (_req, res): Promise<void> => {
  const rows = await db.select().from(automationJobsTable);
  res.json(ListAutomationJobsResponse.parse(rows.map(toResponseShape)));
});

router.post("/automation-jobs", async (req, res): Promise<void> => {
  const parsed = CreateAutomationJobBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const nextRunAt = new Date(
    Date.now() + parsed.data.frequencyMinutes * 60_000,
  );

  const [job] = await db
    .insert(automationJobsTable)
    .values({
      targetUsername: parsed.data.targetUsername,
      actionType: parsed.data.actionType,
      frequencyMinutes: parsed.data.frequencyMinutes,
      randomizeDelay: parsed.data.randomizeDelay,
      status: "paused",
      nextRunAt,
    })
    .returning();

  res.status(201).json(CreateAutomationJobResponse.parse(toResponseShape(job)));
});

router.delete("/automation-jobs/:jobId", async (req, res): Promise<void> => {
  const params = DeleteAutomationJobParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const [job] = await db
    .delete(automationJobsTable)
    .where(eq(automationJobsTable.id, Number(params.data.jobId)))
    .returning();

  if (!job) {
    res.status(404).json({ error: "Automation job not found" });
    return;
  }

  res.sendStatus(204);
});

export default router;
