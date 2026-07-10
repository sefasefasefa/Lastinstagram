import { Router, type IRouter } from "express";
import healthRouter from "./health";
import connectionRouter from "./connection";
import monitoringRouter from "./monitoring";
import trackedUsersRouter from "./trackedUsers";
import dashboardRouter from "./dashboard";

const router: IRouter = Router();

router.use(healthRouter);
router.use(connectionRouter);
router.use(monitoringRouter);
router.use(trackedUsersRouter);
router.use(dashboardRouter);

export default router;
