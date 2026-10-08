import type { Channel, ConsumeMessage } from "amqplib";
import { Publisher } from "./publisher.js";
import { CRAWL_QUEUE } from "./topology.js";
import { computeBackoffDelay, isRetryableError } from "./retry.js";

export type HandleResult =
  | { action: "ack" }
  | { action: "retry"; delayMs?: number; error: Error }
  | { action: "dead"; error: Error };

export type MessageHandler<T> = (
  message: T,
  meta: { attempt: number; raw: ConsumeMessage },
) => Promise<HandleResult | void>;

export class Consumer {
  private channel: Channel;
  private consumerTag: string | null = null;

  constructor(channel: Channel) {
    this.channel = channel;
  }

  async consume<T>(
    queue: string,
    handler: MessageHandler<T>,
    prefetchCount = 1,
  ): Promise<void> {
    await this.channel.prefetch(prefetchCount);

    const { consumerTag } = await this.channel.consume(
      queue,
      async (raw: ConsumeMessage | null) => {
        if (!raw) return;

        try {
          const content = raw.content.toString();
          const parsed = JSON.parse(content) as T & { attempt?: number };
          const attempt = parsed.attempt ?? 1;

          const result = await handler(parsed, { attempt, raw });

          if (!result || result.action === "ack") {
            this.channel.ack(raw);
            return;
          }

          if (result.action === "retry") {
            this.channel.ack(raw);
            const delayMs = result.delayMs ?? computeBackoffDelay(attempt);
            console.log(
              `[Consumer] Retrying message (attempt ${attempt}) in ${delayMs}ms: ${result.error.message}`,
            );
            await new Promise((resolve) => setTimeout(resolve, delayMs));
            const publisher = new Publisher(this.channel);
            await publisher.publish(queue, {
              ...parsed,
              attempt: attempt + 1,
              lastError: result.error.message,
            });
            return;
          }

          if (result.action === "dead") {
            console.error(
              `[Consumer] Routing to DLQ: ${result.error.message}`,
            );
            this.channel.nack(raw, false, false);
            return;
          }
        } catch (err) {
          console.error("[Consumer] Handler error:", (err as Error).message);
          const parsed = safeParse(raw);
          const attempt = parsed?.attempt ?? 1;
          const maxAttempts = parsed?.maxAttempts ?? 5;

          if (isRetryableError(err) && attempt < maxAttempts) {
            this.channel.ack(raw);
            const delayMs = computeBackoffDelay(attempt);
            console.log(
              `[Consumer] Retrying message (attempt ${attempt}) in ${delayMs}ms: ${(err as Error).message}`,
            );
            await new Promise((resolve) => setTimeout(resolve, delayMs));
            const publisher = new Publisher(this.channel);
            await publisher.publish(queue, {
              ...parsed!,
              attempt: attempt + 1,
              lastError: (err as Error).message,
            });
          } else {
            console.error("[Consumer] Routing to DLQ (unhandled error):", (err as Error).message);
            this.channel.nack(raw, false, false);
          }
        }
      },
      { noAck: false },
    );

    this.consumerTag = consumerTag;
  }

  async cancel(): Promise<void> {
    if (this.consumerTag) {
      await this.channel.cancel(this.consumerTag);
      this.consumerTag = null;
    }
  }

  async close(): Promise<void> {
    await this.cancel();
    await this.channel.close();
  }
}

interface ParsedMessage {
  attempt?: number;
  maxAttempts?: number;
  [key: string]: unknown;
}

function safeParse(raw: ConsumeMessage): ParsedMessage | null {
  try {
    return JSON.parse(raw.content.toString()) as ParsedMessage;
  } catch {
    return null;
  }
}
