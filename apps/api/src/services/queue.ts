import { ConnectionManager, Publisher, setupCrawlTopology, purgeQueues } from "@rag/queue";

let cm: ConnectionManager | null = null;
let publisher: Publisher | null = null;

export async function initQueue(url: string): Promise<Publisher> {
  cm = new ConnectionManager(url);
  const channel = await cm.connect();
  await setupCrawlTopology(channel);
  publisher = new Publisher(channel);
  return publisher;
}

export function getPublisher(): Publisher {
  if (!publisher) {
    throw new Error("Queue not initialized. Call initQueue() first.");
  }
  return publisher;
}

export function isQueueHealthy(): boolean {
  return publisher !== null;
}

export async function closeQueue(): Promise<void> {
  if (cm) {
    await cm.close();
    cm = null;
    publisher = null;
  }
}

export async function purgeResetQueues(): Promise<{ crawl: number; dlq: number }> {
  if (!cm) throw new Error("Queue not initialized. Call initQueue() first.");
  const channel = cm.getChannel();
  const result = await purgeQueues(channel);
  await setupCrawlTopology(channel);
  return result;
}
