export interface Embedder {
  embed(texts: string[]): Promise<number[][]>;
  embedSingle(text: string): Promise<number[]>;
  readonly dimensions: number;
}
