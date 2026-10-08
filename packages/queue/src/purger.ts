import type { Channel } from "amqplib";
import { CRAWL_QUEUE, DLQ_QUEUE } from "./topology.js";

export async function purgeQueues(channel: Channel): Promise<{ crawl: number; dlq: number }> {
  const crawlPurge = await channel.purgeQueue(CRAWL_QUEUE);
  const dlqPurge = await channel.purgeQueue(DLQ_QUEUE);
  return { crawl: crawlPurge.messageCount, dlq: dlqPurge.messageCount };
}
