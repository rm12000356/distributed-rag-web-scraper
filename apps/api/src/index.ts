import "./load-env.js";

import app from "./app.js";
import { env } from "./config/env.js";
import { prisma } from "@rag/database";
import { initQueue, closeQueue } from "./services/queue.js";
import { startWorkerMonitor } from "./services/worker-monitor.js";

const server = app.listen(env.PORT, async () => {
  try {
    await initQueue(env.RABBITMQ_URL);
    console.log("RabbitMQ publisher initialized");
  } catch (err) {
    console.error("Failed to initialize RabbitMQ:", (err as Error).message);
  }
  startWorkerMonitor(env.RABBITMQ_URL);
  console.log(`API running on port ${env.PORT}`);
});

const shutdown = async () => {
  console.log("Shutting down gracefully...");
  server.close();
  await closeQueue();
  await prisma.$disconnect();
  process.exit(0);
};

process.on("SIGTERM", shutdown);
process.on("SIGINT", shutdown);
