import { Router, type IRouter } from "express";
import healthRouter from "./health";
import authRouter from "./auth";
import dashboardRouter from "./dashboard";
import inventoryRouter from "./inventory";
import packagingRouter from "./packaging";
import notesRouter from "./notes";
import auditRouter from "./audit";
import exceptionsRouter from "./exceptions";
import integrationsRouter from "./integrations";
import directoryRouter from "./directory";
import exportRouter from "./export";
import capacityRouter from "./capacity";
import shipmentsRouter from "./shipments";

const router: IRouter = Router();

router.use(healthRouter);
router.use(authRouter);
router.use(dashboardRouter);
router.use(inventoryRouter);
router.use(packagingRouter);
router.use(notesRouter);
router.use(auditRouter);
router.use(exceptionsRouter);
router.use(integrationsRouter);
router.use(directoryRouter);
router.use(exportRouter);
router.use(capacityRouter);
router.use(shipmentsRouter);

export default router;
