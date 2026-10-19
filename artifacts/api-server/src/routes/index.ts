import { Router, type IRouter } from "express";
import healthRouter from "./health";
import exportRouter from "./export";
import authRouter from "./auth";
import notifyRouter from "./notify";
import kekaRouter from "./keka";
import teamsAuthRouter from "./teams-auth";
import teamsChatRouter from "./teams-chat";
import adminAttendanceRouter from "./admin-attendance";
import clientPortalRouter from "./client-portal";
import creativeStudioRouter from "./creative-studio";
import { staffApiBoundary } from "../lib/staff-api-boundary";

const router: IRouter = Router();

router.use(healthRouter);
router.use("/client-portal", clientPortalRouter);
router.use("/creative-studio", creativeStudioRouter);
router.use(staffApiBoundary);
router.use("/export", exportRouter);
router.use("/auth", authRouter);
router.use(notifyRouter);
router.use(kekaRouter);
router.use(teamsAuthRouter);
router.use(teamsChatRouter);
router.use(adminAttendanceRouter);

export default router;
