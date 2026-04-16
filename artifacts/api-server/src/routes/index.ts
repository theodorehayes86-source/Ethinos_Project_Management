import { Router, type IRouter } from "express";
import healthRouter from "./health";
import exportRouter from "./export";
import authRouter from "./auth";
import notifyRouter from "./notify";

const router: IRouter = Router();

router.use(healthRouter);
router.use("/export", exportRouter);
router.use("/auth", authRouter);
router.use(notifyRouter);

export default router;
