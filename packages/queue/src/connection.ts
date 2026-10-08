import amqp, { type ChannelModel, type Channel } from "amqplib";

const MAX_RETRY_DELAY = 30_000;
const INITIAL_RETRY_DELAY = 1_000;
const BACKOFF_FACTOR = 2;

export class ConnectionManager {
  private url: string;
  private model: ChannelModel | null = null;
  private channel: Channel | null = null;
  private isClosing = false;
  private retryTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(url: string) {
    this.url = url;
  }

  getChannel(): Channel {
    if (!this.channel) {
      throw new Error("Channel not initialized. Call connect() first.");
    }
    return this.channel;
  }

  async connect(): Promise<Channel> {
    if (this.model && this.channel) {
      return this.channel;
    }

    let delay = INITIAL_RETRY_DELAY;

    while (!this.isClosing) {
      try {
        this.model = await amqp.connect(this.url);
        this.channel = await this.model.createChannel();

        this.model.connection.on("close", () => {
          if (!this.isClosing) {
            console.warn("RabbitMQ connection closed — reconnecting...");
            this.model = null;
            this.channel = null;
            this.connect();
          }
        });

        this.model.connection.on("error", (err: Error) => {
          console.error("RabbitMQ connection error:", err.message);
        });

        this.channel.on("error", (err: Error) => {
          console.error("RabbitMQ channel error:", err.message);
        });

        console.log("Connected to RabbitMQ");
        return this.channel;
      } catch (err) {
        console.error("Failed to connect to RabbitMQ:", (err as Error).message);
        console.log(`Retrying in ${delay}ms...`);
        await this.wait(delay);
        delay = Math.min(delay * BACKOFF_FACTOR, MAX_RETRY_DELAY);
      }
    }

    throw new Error("Connection manager is closing — aborting connect");
  }

  async close(): Promise<void> {
    this.isClosing = true;
    if (this.retryTimer) {
      clearTimeout(this.retryTimer);
      this.retryTimer = null;
    }
    try {
      if (this.channel) {
        await this.channel.close();
        this.channel = null;
      }
      if (this.model) {
        await this.model.close();
        this.model = null;
      }
    } catch (err) {
      console.error("Error closing RabbitMQ connection:", (err as Error).message);
    }
  }

  private wait(ms: number): Promise<void> {
    return new Promise((resolve) => {
      this.retryTimer = setTimeout(resolve, ms);
    });
  }
}
