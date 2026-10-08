import { Router } from "express";
import { createLocalEmbedder, createOpenAILLM, RAGPipeline } from "@rag/rag";
import { createQdrantStore } from "@rag/vector";
import { validate } from "../middleware/validate.js";
import { sendOk, sendError } from "../lib/response.js";
import { askBodySchema } from "@rag/shared/api.js";

const router = Router();

router.post("/", validate({ body: askBodySchema }), async (req, res) => {
  try {
    const { question, topK } = req.body as { question: string; topK?: number };

    const embedder = createLocalEmbedder();
    const store = createQdrantStore();
    const llm = createOpenAILLM();
    const pipeline = new RAGPipeline(embedder, store, llm);
    const answer = await pipeline.ask(question, topK ?? 25);

    sendOk(res, answer);
  } catch (err) {
    sendError(res, (err as Error).message, 500);
  }
});

export default router;
