import { useState, useEffect, useCallback } from "react";
import { fetchJobs, submitCrawl } from "../lib/api.js";
import type { JobData } from "@rag/shared";
import LoadingSpinner from "../components/LoadingSpinner.js";
import ErrorDisplay from "../components/ErrorDisplay.js";
import StatusBadge from "../components/StatusBadge.js";
import Pagination from "../components/Pagination.js";

interface ViewState {
  name: string;
  params?: Record<string, string>;
}

interface CrawlJobsProps {
  onNavigate: (view: ViewState) => void;
}

export default function CrawlJobs({ onNavigate }: CrawlJobsProps) {
  const [page, setPage] = useState(1);
  const [statusFilter, setStatusFilter] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [jobs, setJobs] = useState<JobData[]>([]);
  const [total, setTotal] = useState(0);
  const [submitting, setSubmitting] = useState(false);
  const [url, setUrl] = useState("");
  const [depth, setDepth] = useState(1);

  const pageSize = 20;

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await fetchJobs({
        page,
        pageSize,
        status: statusFilter || undefined,
      });
      setJobs(result.data ?? []);
      setTotal(result.total ?? 0);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }, [page, statusFilter]);

  useEffect(() => { load(); }, [load]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!url) return;
    setSubmitting(true);
    setError(null);
    try {
      await submitCrawl(url, depth);
      setUrl("");
      setDepth(1);
      setPage(1);
      await load();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSubmitting(false);
    }
  };

  const totalPages = Math.ceil(total / pageSize);

  return (
    <div>
      <div className="view-header"><h2>Crawl Jobs</h2></div>

      <form className="form-inline" onSubmit={handleSubmit}>
        <input
          type="url"
          placeholder="https://example.com"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          required
        />
        <select value={depth} onChange={(e) => setDepth(Number(e.target.value))}>
          {[1, 2, 3, 4, 5].map((d) => (
            <option key={d} value={d}>Depth {d}</option>
          ))}
        </select>
        <button type="submit" disabled={submitting || !url}>
          {submitting ? "Submitting..." : "Submit"}
        </button>
      </form>

      {error && <ErrorDisplay message={error} onRetry={load} />}

      {loading ? (
        <LoadingSpinner />
      ) : (
        <>
          <div className="filter-row">
            <select
              value={statusFilter}
              onChange={(e) => { setStatusFilter(e.target.value); setPage(1); }}
            >
              <option value="">All</option>
              <option value="PENDING">PENDING</option>
              <option value="RUNNING">RUNNING</option>
              <option value="COMPLETED">COMPLETED</option>
              <option value="FAILED">FAILED</option>
            </select>
          </div>

          {jobs.length === 0 ? (
            <p className="no-data">No crawl jobs yet. Submit one above.</p>
          ) : (
            <>
              <table>
                <thead>
                  <tr>
                    <th>Status</th>
                    <th>URL</th>
                    <th>Depth</th>
                    <th>Attempts</th>
                    <th>Created</th>
                  </tr>
                </thead>
                <tbody>
                  {jobs.map((j) => (
                    <tr
                      key={j.id}
                      className="clickable"
                      onClick={() => onNavigate({ name: "job-detail", params: { jobId: j.id } })}
                    >
                      <td><StatusBadge status={j.status} /></td>
                      <td>{j.websiteUrl.length > 60 ? j.websiteUrl.slice(0, 60) + "..." : j.websiteUrl}</td>
                      <td>{j.depth}</td>
                      <td>{j.attempts}</td>
                      <td>{new Date(j.createdAt).toLocaleDateString()}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <Pagination page={page} totalPages={totalPages} onPageChange={setPage} />
            </>
          )}
        </>
      )}
    </div>
  );
}
