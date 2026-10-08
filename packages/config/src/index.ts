export interface AppConfig {
  port: number;
  databaseUrl: string;
  rabbitmqUrl: string;
  qdrantUrl: string;
  nodeEnv: string;
}

export type DeepPartial<T> = T extends object
  ? { [P in keyof T]?: DeepPartial<T[P]> }
  : T;
