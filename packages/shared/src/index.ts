export { createLogger, type Logger } from "./logger.js";

export type CrawlJobStatus = "PENDING" | "RUNNING" | "COMPLETED" | "FAILED";
export type WorkerStatus = "ACTIVE" | "IDLE" | "OFFLINE";
export type PageStatus = "QUEUED" | "SCRAPED" | "PROCESSING" | "PROCESSED" | "FAILED";

export interface CrawlJobMessage {
  jobId: string;
  websiteId: string;
  url: string;
  depth: number;
  attempt?: number;
  maxAttempts?: number;
  lastError?: string;
  enqueuedAt?: string;
  traceId?: string;
}

export interface ProcessJobMessage {
  pageVersionId: string;
  attempt?: number;
  maxAttempts?: number;
  lastError?: string;
  traceId?: string;
}

export interface WorkerHeartbeatMessage {
  workerId: string;
  workerName: string;
  status: WorkerStatus;
  timestamp: string;
}

export interface WorkerHeartbeat {
  workerId: string;
  workerName: string;
  status: WorkerStatus;
  timestamp: Date;
}

export interface ScrapeResult {
  url: string;
  title: string;
  content: string;
  links: string[];
  metadata: Record<string, string>;
}

export interface ApiResponse<T = unknown> {
  status: "ok" | "error";
  data?: T;
  error?: string;
  timestamp: string;
}

export interface PaginatedResponse<T> extends ApiResponse<T[]> {
  total: number;
  page: number;
  pageSize: number;
}

export interface EnhancedMetadataData {
  language: string | null;
  author: string | null;
  publishedDate: string | null;
  modifiedDate: string | null;
  siteName: string | null;
  type: string | null;
  canonicalUrl: string | null;
  keywords: string[];
  robots: string | null;
  estimatedReadingTime: number | null;
}

export interface PageVersionData {
  id: string;
  pageId: string;
  contentHash: string;
  plainText: string;
  normalizedJson: string | null;
  metadataJson: string | null;
  versionNumber: number;
  createdAt: string;
}

export interface PageListItem {
  id: string;
  url: string;
  status: PageStatus;
  contentHash: string | null;
  websiteId: string;
  createdAt: string;
  updatedAt: string;
}

export interface PageDetail extends PageListItem {
  content: string | null;
  website: { id: string; url: string };
  versions: PageVersionData[];
}

export interface WorkerData {
  id: string;
  name: string;
  status: WorkerStatus;
  lastHeartbeat: string | null;
  createdAt: string;
}

export interface JobData {
  id: string;
  status: CrawlJobStatus;
  depth: number;
  attempts: number;
  lastError: string | null;
  websiteId: string;
  websiteUrl: string;
  pageCount: number;
  createdAt: string;
  updatedAt: string;
}

export interface WebsiteData {
  id: string;
  url: string;
  pageCount: number;
  jobCount: number;
  createdAt: string;
}

export interface SubmitCrawlResult {
  jobId: string;
  url: string;
  depth: number;
}

export interface RAGAnswer {
  answer: string;
  citations: Array<{
    text: string;
    url: string;
    title: string;
    score: number;
  }>;
  retrievalTimeMs: number;
  generationTimeMs: number;
}

export interface SemanticSearchChunk {
  text: string;
  pageUrl: string;
  pageTitle: string;
  heading: string | null;
  score: number;
  chunkIndex: number;
}

export interface ResetResult {
  message: string;
  database: "ok" | "error";
  vectorDb: "ok" | "error";
  queue: "ok" | "error";
  messagesPurged: number;
  collectionsDeleted: string[];
  errors: string[];
}
