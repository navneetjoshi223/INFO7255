import express from "express";
import {
  savePlan,
  getPlan,
  deletePlan,
  getAllPlans,
  updatePlan
} from "../controllers/plan.controller.js";
import authMiddleware from "../middlewares/auth.middleware.js";
//import authMiddleware from "../middlewares/localtokenauth.middleware.js";

const router = express.Router();

router.post("/v1/plan", authMiddleware, savePlan);
router.get("/v1/plan/:planId", authMiddleware, getPlan);
router.get("/v1/plan", authMiddleware, getAllPlans);
router.delete("/v1/plan/:planId", authMiddleware, deletePlan);
router.patch("/v1/plan/:planId", authMiddleware, updatePlan);

export { router as planRoute };
