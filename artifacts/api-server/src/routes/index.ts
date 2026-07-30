import { Router, type IRouter } from "express";
import healthRouter from "./health";
import exportRouter from "./export";
import authRouter from "./auth";
import notifyRouter from "./notify";
import kekaRouter from "./keka";
import teamsAuthRouter from "./teams-auth";
import teamsChatRouter from "./teams-chat";

const router: IRouter = Router();

router.use(healthRouter);
router.use("/export", exportRouter);
router.use("/auth", authRouter);
router.use(notifyRouter);
router.use(kekaRouter);
router.use(teamsAuthRouter);
router.use(teamsChatRouter);

export default router;
