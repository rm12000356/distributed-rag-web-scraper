export interface Logger {
  info(msg: string, meta?: Record<string, unknown>): void;
  warn(msg: string, meta?: Record<string, unknown>): void;
  error(msg: string, meta?: Record<string, unknown>): void;
  debug(msg: string, meta?: Record<string, unknown>): void;
  child(bindings: Record<string, unknown>): Logger;
}

function formatLine(level: string, name: string, msg: string, meta?: Record<string, unknown>): string {
  const ts = new Date().toISOString();
  const metaStr = meta && Object.keys(meta).length > 0 ? " " + JSON.stringify(meta) : "";
  return `${ts} [${level.toUpperCase()}] [${name}] ${msg}${metaStr}`;
}

class ConsoleLogger implements Logger {
  constructor(
    private name: string,
    private bindings: Record<string, unknown> = {},
  ) {}

  private merge(meta?: Record<string, unknown>): Record<string, unknown> {
    return { ...this.bindings, ...meta };
  }

  info(msg: string, meta?: Record<string, unknown>): void {
    console.log(formatLine("info", this.name, msg, this.merge(meta)));
  }

  warn(msg: string, meta?: Record<string, unknown>): void {
    console.warn(formatLine("warn", this.name, msg, this.merge(meta)));
  }

  error(msg: string, meta?: Record<string, unknown>): void {
    console.error(formatLine("error", this.name, msg, this.merge(meta)));
  }

  debug(msg: string, meta?: Record<string, unknown>): void {
    console.debug(formatLine("debug", this.name, msg, this.merge(meta)));
  }

  child(bindings: Record<string, unknown>): Logger {
    return new ConsoleLogger(this.name, { ...this.bindings, ...bindings });
  }
}

export function createLogger(name: string, bindings?: Record<string, unknown>): Logger {
  return new ConsoleLogger(name, bindings);
}
