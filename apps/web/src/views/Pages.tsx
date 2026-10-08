import { useState, useEffect, useCallback } from "react";
import { fetchPages, fetchWebsites } from "../lib/api.js";
import type { PageListItem, WebsiteData } from "@rag/shared";
import LoadingSpinner from "../components/LoadingSpinner.js";
import ErrorDisplay from "../components/ErrorDisplay.js";
import StatusBadge from "../components/StatusBadge.js";
import Pagination from "../components/Pagination.js";

interface ViewState {
  name: string;
  params?: Record<string, string>;
}

interface PagesProps {
  onNavigate: (view: ViewState) => void;
}

export default function Pages({ onNavigate }: PagesProps) {
  const [page, setPage] = useState(1);
  const [websiteId, setWebsiteId] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [pages, setPages] = useState<PageListItem[]>([]);
  const [total, setTotal] = useState(0);
  const [websites, setWebsites] = useState<WebsiteData[]>([]);

  const pageSize = 20;

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [pagesResult, websitesResult] = await Promise.all([
        fetchPages({
          page,
          pageSize,
          websiteId: websiteId || undefined,
          status: statusFilter || undefined,
          search: search || undefined,
        }),
        fetchWebsites(),
      ]);
      setPages(pagesResult.data ?? []);
      setTotal(pagesResult.total ?? 0);
      setWebsites(websitesResult.data ?? []);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }, [page, websiteId, statusFilter, search]);

  useEffect(() => { load(); }, [load]);

  const totalPages = Math.ceil(total / pageSize);

  return (
    <div>
      <div className="view-header"><h2>Pages</h2></div>

      <div className="filter-row">
        <select
          value={websiteId}
          onChange={(e) => { setWebsiteId(e.target.value); setPage(1); }}
        >
          <option value="">All Websites</option>
          {websites.map((w) => (
            <option key={w.id} value={w.id}>{w.url}</option>
          ))}
        </select>
        <select
          value={statusFilter}
          onChange={(e) => { setStatusFilter(e.target.value); setPage(1); }}
        >
          <option value="">All</option>
          <option value="QUEUED">QUEUED</option>
          <option value="SCRAPED">SCRAPED</option>
          <option value="PROCESSING">PROCESSING</option>
          <option value="PROCESSED">PROCESSED</option>
          <option value="FAILED">FAILED</option>
        </select>
        <input
          type="text"
          placeholder="Search by URL..."
          value={search}
          onChange={(e) => { setSearch(e.target.value); setPage(1); }}
        />
      </div>

      {error && <ErrorDisplay message={error} onRetry={load} />}

      {loading ? (
        <LoadingSpinner />
      ) : pages.length === 0 ? (
        <p className="no-data">No pages found.</p>
      ) : (
        <>
          <table>
            <thead>
              <tr>
                <th>URL</th>
                <th>Status</th>
                <th>Website</th>
                <th>Created</th>
              </tr>
            </thead>
            <tbody>
              {pages.map((p) => (
                <tr
                  key={p.id}
                  className="clickable"
                  onClick={() => onNavigate({ name: "page-detail", params: { pageId: p.id } })}
                >
                  <td>{p.url.length > 60 ? p.url.slice(0, 60) + "..." : p.url}</td>
                  <td><StatusBadge status={p.status} /></td>
                  <td>{new URL(p.url).hostname}</td>
                  <td>{new Date(p.createdAt).toLocaleDateString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <Pagination page={page} totalPages={totalPages} onPageChange={setPage} />
        </>
      )}
    </div>
  );
}
