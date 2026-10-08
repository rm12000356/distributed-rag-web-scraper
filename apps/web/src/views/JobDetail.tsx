import { useState, useEffect, useCallback } from "react";
import { fetchJob } from "../lib/api.js";
import type { PageListItem } from "@rag/shared";
import LoadingSpinner from "../components/LoadingSpinner.js";
import ErrorDisplay from "../components/ErrorDisplay.js";
import StatusBadge from "../components/StatusBadge.js";

interface ViewState {
  name: string;
  params?: Record<string, string>;
}

interface JobDetailProps {
  jobId: string;
  onBack: () => void;
  onNavigate: (view: ViewState) => void;
}

export default function JobDetail({ jobId, onBack, onNavigate }: JobDetailProps) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [job, setJob] = useState<{
    id: string;
    status: string;
    depth: number;
    attempts: number;
    lastError: string | null;
    website: { id: string; url: string };
    pages: PageListItem[];
    createdAt: string;
    updatedAt: string;
  } | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await fetchJob(jobId);
      setJob(result.data ?? null);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }, [jobId]);

  useEffect(() => { load(); }, [load]);

  if (loading) return <LoadingSpinner />;
  if (error) return <ErrorDisplay message={error} onRetry={load} />;
  if (!job) return <p className="no-data">Job not found.</p>;

  return (
    <div>
      <button className="back-link" onClick={onBack}>&larr; Back to Jobs</button>

      <div className="view-header"><h2>Job Detail</h2></div>

      <div className="detail-header">
        <div className="detail-field"><strong>Status:</strong> <StatusBadge status={job.status} /></div>
        <div className="detail-field">
          <strong>URL:</strong> <a href={job.website.url} target="_blank" rel="noreferrer">{job.website.url}</a>
        </div>
        <div className="detail-field"><strong>Depth:</strong> {job.depth}</div>
        <div className="detail-field"><strong>Attempts:</strong> {job.attempts}</div>
        {job.lastError && (
          <div className="detail-field" style={{ color: "#b91c1c" }}><strong>Last Error:</strong> {job.lastError}</div>
        )}
      </div>

      <h3 style={{ marginBottom: 12, fontSize: 16 }}>Pages ({job.pages.length})</h3>
      {job.pages.length === 0 ? (
        <p className="no-data">No pages associated with this job.</p>
      ) : (
        <table>
          <thead>
            <tr>
              <th>URL</th>
              <th>Status</th>
              <th>Created</th>
            </tr>
          </thead>
          <tbody>
            {job.pages.map((p) => (
              <tr
                key={p.id}
                className="clickable"
                onClick={() => onNavigate({ name: "page-detail", params: { pageId: p.id } })}
              >
                <td>{p.url.length > 60 ? p.url.slice(0, 60) + "..." : p.url}</td>
                <td><StatusBadge status={p.status} /></td>
                <td>{new Date(p.createdAt).toLocaleDateString()}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
