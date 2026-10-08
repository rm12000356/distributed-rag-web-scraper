import type {
  ApiResponse,
  PaginatedResponse,
  PageListItem,
  PageDetail,
  WorkerData,
  JobData,
  WebsiteData,
  SubmitCrawlResult,
  RAGAnswer,
  SemanticSearchChunk,
} from "@rag/shared";

const BASE = import.meta.env.VITE_API_URL ?? "";

async function get<T>(url: string): Promise<T> {
  const res = await fetch(`${BASE}${url}`);
  const text = await res.text();
  let body: Record<string, unknown>;
  try {
    body = JSON.parse(text);
  } catch {
    throw new Error(
      `API server returned non-JSON for ${url}. Is the backend running on ${BASE}?`,
    );
  }
  if (!res.ok) throw new Error((body.error as string) ?? `HTTP ${res.status}`);
  return body as T;
}

async function post<T>(url: string, data: unknown): Promise<T> {
  const res = await fetch(`${BASE}${url}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
  const text = await res.text();
  let body: Record<string, unknown>;
  try {
    body = JSON.parse(text);
  } catch {
    throw new Error(
      `API server returned non-JSON for ${url}. Is the backend running on ${BASE}?`,
    );
  }
  if (!res.ok) throw new Error((body.error as string) ?? `HTTP ${res.status}`);
  return body as T;
}

export function fetchHealth(): Promise<ApiResponse<{ service: string; checks: Record<string, string>; uptime: number }>> {
  return get("/health");
}

export function submitCrawl(url: string, depth: number): Promise<ApiResponse<SubmitCrawlResult>> {
  return post("/api/crawl", { url, depth });
}

export function askQuestion(question: string, topK?: number): Promise<ApiResponse<RAGAnswer>> {
  return post("/api/ask", { question, topK });
}

export function fetchPages(params?: {
  page?: number;
  pageSize?: number;
  websiteId?: string;
  status?: string;
  search?: string;
}): Promise<PaginatedResponse<PageListItem>> {
  const qs = new URLSearchParams();
  if (params?.page) qs.set("page", String(params.page));
  if (params?.pageSize) qs.set("pageSize", String(params.pageSize));
  if (params?.websiteId) qs.set("websiteId", params.websiteId);
  if (params?.status) qs.set("status", params.status);
  if (params?.search) qs.set("search", params.search);
  const query = qs.toString();
  return get(`/api/pages${query ? `?${query}` : ""}`);
}

export function fetchPage(id: string): Promise<ApiResponse<PageDetail>> {
  return get(`/api/pages/${id}`);
}

export function searchPages(q: string, page = 1, pageSize = 20): Promise<PaginatedResponse<PageListItem>> {
  return get(`/api/search?q=${encodeURIComponent(q)}&page=${page}&pageSize=${pageSize}&mode=fulltext`);
}

export function searchSemantic(q: string, page = 1, pageSize = 20): Promise<PaginatedResponse<SemanticSearchChunk>> {
  return get(`/api/search?q=${encodeURIComponent(q)}&page=${page}&pageSize=${pageSize}&mode=semantic`);
}

export function fetchWorkers(): Promise<ApiResponse<WorkerData[]>> {
  return get("/api/workers");
}

export function fetchWebsites(): Promise<ApiResponse<WebsiteData[]>> {
  return get("/api/websites");
}

export function fetchJobs(params?: {
  page?: number;
  pageSize?: number;
  status?: string;
}): Promise<PaginatedResponse<JobData>> {
  const qs = new URLSearchParams();
  if (params?.page) qs.set("page", String(params.page));
  if (params?.pageSize) qs.set("pageSize", String(params.pageSize));
  if (params?.status) qs.set("status", params.status);
  const query = qs.toString();
  return get(`/api/jobs${query ? `?${query}` : ""}`);
}

export function fetchJob(id: string): Promise<ApiResponse<JobData & { website: { id: string; url: string }; pages: PageListItem[] }>> {
  return get(`/api/jobs/${id}`);
}

interface ResetResult {
  message: string;
  database: "ok" | "error";
  vectorDb: "ok" | "error";
  queue: "ok" | "error";
  messagesPurged: number;
  collectionsDeleted: string[];
  errors: string[];
}

export async function resetData(): Promise<ResetResult> {
  const envelope = await post<{ data: ResetResult }>("/api/reset", {});
  return envelope.data;
}
