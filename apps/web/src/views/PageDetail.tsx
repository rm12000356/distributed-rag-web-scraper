import { useState, useEffect, useCallback } from "react";
import { fetchPage } from "../lib/api.js";
import type { PageDetail as PageDetailType } from "@rag/shared";
import LoadingSpinner from "../components/LoadingSpinner.js";
import ErrorDisplay from "../components/ErrorDisplay.js";
import StatusBadge from "../components/StatusBadge.js";

interface PageDetailProps {
  pageId: string;
  onBack: () => void;
}

export default function PageDetail({ pageId, onBack }: PageDetailProps) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [page, setPage] = useState<PageDetailType | null>(null);
  const [tab, setTab] = useState<"content" | "versions">("content");

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await fetchPage(pageId);
      setPage(result.data ?? null);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }, [pageId]);

  useEffect(() => { load(); }, [load]);

  if (loading) return <LoadingSpinner />;
  if (error) return <ErrorDisplay message={error} onRetry={load} />;
  if (!page) return <p className="no-data">Page not found.</p>;

  return (
    <div>
      <button className="back-link" onClick={onBack}>&larr; Back to Pages</button>

      <div className="view-header"><h2>Page Detail</h2></div>

      <div className="detail-header">
        <div className="detail-field">
          <strong>URL:</strong> <a href={page.url} target="_blank" rel="noreferrer">{page.url}</a>
        </div>
        <div className="detail-field"><strong>Status:</strong> <StatusBadge status={page.status} /></div>
        <div className="detail-field"><strong>Website:</strong> {page.website.url}</div>
        <div className="detail-field"><strong>Created:</strong> {new Date(page.createdAt).toLocaleString()}</div>
        <div className="detail-field"><strong>Updated:</strong> {new Date(page.updatedAt).toLocaleString()}</div>
      </div>

      <div className="tab-bar">
        <button className={tab === "content" ? "active" : ""} onClick={() => setTab("content")}>
          Content
        </button>
        <button className={tab === "versions" ? "active" : ""} onClick={() => setTab("versions")}>
          Versions ({page.versions.length})
        </button>
      </div>

      {tab === "content" ? (
        page.content ? (
          <div className="content-block">{page.content}</div>
        ) : (
          <p className="no-data">No content available.</p>
        )
      ) : (
        <>
          {page.versions.length === 0 ? (
            <p className="no-data">No versions available.</p>
          ) : (
            <table>
              <thead>
                <tr>
                  <th>Version</th>
                  <th>Content Hash</th>
                  <th>Created</th>
                </tr>
              </thead>
              <tbody>
                {page.versions.map((v) => (
                  <tr key={v.id}>
                    <td>{v.versionNumber}</td>
                    <td><code>{v.contentHash.slice(0, 12)}...</code></td>
                    <td>{new Date(v.createdAt).toLocaleString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </>
      )}
    </div>
  );
}
