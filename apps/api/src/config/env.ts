
import { z } from "zod";

const envSchema = z.object({
  PORT: z.coerce.number().default(3000),
  DATABASE_URL: z.string().min(1, "DATABASE_URL is required"),
  RABBITMQ_URL: z.string().default("amqp://guest:guest@localhost:5672"),
  QDRANT_URL: z.string().default("http://localhost:6333"),
});

export const env = envSchema.parse(process.env);
