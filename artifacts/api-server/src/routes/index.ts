import { Router, type IRouter } from "express";
import healthRouter from "./health";
import visitorsRouter from "./visitors";

const router: IRouter = Router();

router.use(healthRouter);
router.use(visitorsRouter);

export default router;
