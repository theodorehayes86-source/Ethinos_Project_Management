import { Router, type IRouter } from "express";
import healthRouter from "./health";
import exportRouter from "./export";
import authRouter from "./auth";
import notifyRouter from "./notify";
import kekaRouter from "./keka";

const router: IRouter = Router();

router.use(healthRouter);
router.use("/export", exportRouter);
router.use("/auth", authRouter);
router.use(notifyRouter);
router.use(kekaRouter);

export default router;
