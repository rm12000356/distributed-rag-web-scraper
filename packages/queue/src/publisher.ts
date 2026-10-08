import type { Channel, Options } from "amqplib";

export class Publisher {
  private channel: Channel;

  constructor(channel: Channel) {
    this.channel = channel;
  }

  async publish<T>(
    queue: string,
    message: T,
    options?: Options.Publish,
  ): Promise<void> {
    const buffer = Buffer.from(JSON.stringify(message));
    this.channel.sendToQueue(queue, buffer, {
      persistent: true,
      contentType: "application/json",
      ...options,
    });
  }
}
