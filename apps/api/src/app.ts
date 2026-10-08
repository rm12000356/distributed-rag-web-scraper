import express, { type Request, type Response, type NextFunction } from "express";
import cors from "cors";
import healthRouter from "./routes/health.js";
import crawlRouter from "./routes/crawl.js";
import askRouter from "./routes/ask.js";
import pagesRouter from "./routes/pages.js";
import searchRouter from "./routes/search.js";
import workersRouter from "./routes/workers.js";
import websitesRouter from "./routes/websites.js";
import jobsRouter from "./routes/jobs.js";
import resetRouter from "./routes/reset.js";

const app = express();

app.use(cors({ origin: process.env["CORS_ORIGIN"] || "*" }));
app.use(express.json());

app.use("/health", healthRouter);
app.use("/api/crawl", crawlRouter);
app.use("/api/ask", askRouter);
app.use("/api/pages", pagesRouter);
app.use("/api/search", searchRouter);
app.use("/api/workers", workersRouter);
app.use("/api/websites", websitesRouter);
app.use("/api/jobs", jobsRouter);
app.use("/api/reset", resetRouter);

app.use((err: Error, _req: Request, res: Response, _next: NextFunction) => {
  console.error("Unhandled error:", err);
  res.status(500).json({
    status: "error",
    message: process.env["NODE_ENV"] === "production" ? "Internal server error" : err.message,
  });
});

export default app;
