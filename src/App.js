import express from "express";
import { errorHandler } from "./api/middlewares/errorHandler.js";
import { healthRoute } from "./api/routes/health.route.js";
import { planRoute } from "./api/routes/plan.route.js";

const app = express();

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.set("etag", "strong");
app.use("/", healthRoute, planRoute);
app.use(errorHandler);

export default app;
