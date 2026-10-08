import type { Channel } from "amqplib";

export const CRAWL_QUEUE = "crawl";
export const DLX_EXCHANGE = "crawl.dlx";
export const DLQ_QUEUE = "crawl.dlq";

export const PROCESSING_QUEUE = "processing";
export const PROCESSING_DLX_EXCHANGE = "processing.dlx";
export const PROCESSING_DLQ_QUEUE = "processing.dlq";

/**
 * Assert the crawl queue topology:
 *
 *   crawl queue (with DLX)
 *     x-dead-letter-exchange: crawl.dlx
 *     x-dead-letter-routing-key: crawl.dlq
 *
 *   crawl.dlx (direct exchange)
 *     └─→ crawl.dlq (durable queue)
 *
 * Important: RabbitMQ queue arguments are immutable once the queue exists.
 * If you have an existing `crawl` queue without DLX, you must delete it first:
 *
 *   rabbitmqctl delete_queue crawl
 *
 * or via the Management UI at http://localhost:15672.
 */
export async function setupCrawlTopology(channel: Channel): Promise<void> {
  await channel.assertExchange(DLX_EXCHANGE, "direct", { durable: true });

  await channel.assertQueue(DLQ_QUEUE, { durable: true });

  await channel.bindQueue(DLQ_QUEUE, DLX_EXCHANGE, DLQ_QUEUE);

  await channel.assertQueue(CRAWL_QUEUE, {
    durable: true,
    arguments: {
      "x-dead-letter-exchange": DLX_EXCHANGE,
      "x-dead-letter-routing-key": DLQ_QUEUE,
    },
  });
}

export async function setupProcessingTopology(channel: Channel): Promise<void> {
  await channel.assertExchange(PROCESSING_DLX_EXCHANGE, "direct", { durable: true });

  await channel.assertQueue(PROCESSING_DLQ_QUEUE, { durable: true });

  await channel.bindQueue(PROCESSING_DLQ_QUEUE, PROCESSING_DLX_EXCHANGE, PROCESSING_DLQ_QUEUE);

  await channel.assertQueue(PROCESSING_QUEUE, {
    durable: true,
    arguments: {
      "x-dead-letter-exchange": PROCESSING_DLX_EXCHANGE,
      "x-dead-letter-routing-key": PROCESSING_DLQ_QUEUE,
    },
  });
}
