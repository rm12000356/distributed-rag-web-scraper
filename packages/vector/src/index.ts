export interface VectorPoint {
  id: string;
  vector: number[];
  payload: Record<string, unknown>;
}

export interface SearchResult {
  id: string;
  score: number;
  payload: Record<string, unknown>;
}

export interface VectorStore {
  upsert(collection: string, points: VectorPoint[]): Promise<void>;
  search(collection: string, vector: number[], limit?: number): Promise<SearchResult[]>;
  deleteCollection(collection: string): Promise<void>;
  listCollections(): Promise<string[]>;
  healthCheck(): Promise<boolean>;
  countByFilter(collection: string, filter: Record<string, unknown>): Promise<number>;
  deleteByFilter(collection: string, filter: Record<string, unknown>): Promise<void>;
}

export { createQdrantStore } from "./client.js";
