import { useState, useCallback } from "react";
import { searchPages, searchSemantic } from "../lib/api.js";
import type { PageListItem, SemanticSearchChunk } from "@rag/shared";
import LoadingSpinner from "../components/LoadingSpinner.js";
import ErrorDisplay from "../components/ErrorDisplay.js";
import StatusBadge from "../components/StatusBadge.js";
import Pagination from "../components/Pagination.js";

type SearchMode = "fulltext" | "semantic";

interface ViewState {
  name: string;
  params?: Record<string, string>;
}

interface SearchProps {
  onNavigate: (view: ViewState) => void;
}

export default function Search({ onNavigate }: SearchProps) {
  const [q, setQ] = useState("");
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [results, setResults] = useState<(PageListItem | SemanticSearchChunk)[]>([]);
  const [total, setTotal] = useState(0);
  const [searched, setSearched] = useState(false);
  const [mode, setMode] = useState<SearchMode>("fulltext");

  const pageSize = 20;

  const handleSearch = useCallback(async (searchQ: string, pageNum: number, searchMode: SearchMode) => {
    if (!searchQ.trim()) return;
    setLoading(true);
    setError(null);
    setSearched(true);
    try {
      const result = searchMode === "fulltext"
        ? await searchPages(searchQ, pageNum, pageSize)
        : await searchSemantic(searchQ, pageNum, pageSize);
      setResults(result.data ?? []);
      setTotal(result.total ?? 0);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }, []);

  const onSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setPage(1);
    handleSearch(q, 1, mode);
  };

  const onPageChange = (newPage: number) => {
    setPage(newPage);
    handleSearch(q, newPage, mode);
  };

  const onModeChange = (newMode: SearchMode) => {
    setMode(newMode);
    setPage(1);
    if (q.trim()) {
      handleSearch(q, 1, newMode);
    }
  };

  const totalPages = Math.ceil(total / pageSize);
  const isFulltext = mode === "fulltext";

  return (
    <div>
      <div className="view-header"><h2>Search</h2></div>

      <div className="tab-bar">
        <button className={mode === "fulltext" ? "active" : ""} onClick={() => onModeChange("fulltext")}>
          Fulltext
        </button>
        <button className={mode === "semantic" ? "active" : ""} onClick={() => onModeChange("semantic")}>
          Semantic
        </button>
      </div>

      <form className="form-inline" onSubmit={onSubmit}>
        <input
          type="text"
          placeholder="Search page content..."
          value={q}
          onChange={(e) => setQ(e.target.value)}
          style={{ flex: 1, minWidth: 200 }}
        />
        <button type="submit" disabled={!q.trim()}>Search</button>
      </form>

      {error && <ErrorDisplay message={error} onRetry={() => handleSearch(q, page, mode)} />}

      {loading ? (
        <LoadingSpinner />
      ) : !searched ? (
        <p className="no-data">Enter a search query above.</p>
      ) : results.length === 0 ? (
        <p className="no-data">No {mode} results found for &lsquo;{q}&rsquo;.</p>
      ) : (
        <>
          <table>
            <thead>
              <tr>
                <th>URL</th>
                <th>{isFulltext ? "Status" : "Score"}</th>
                <th>{isFulltext ? "Website" : "Source"}</th>
                <th>{isFulltext ? "Created" : "Heading"}</th>
              </tr>
            </thead>
            <tbody>
              {results.map((r, i) => {
                if (isFulltext) {
                  const p = r as PageListItem;
                  return (
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
                  );
                }
                const c = r as SemanticSearchChunk;
                return (
                  <tr
                    key={`chunk-${i}`}
                    className="clickable"
                    onClick={() => window.open(c.pageUrl, "_blank")}
                  >
                    <td>{c.pageUrl.length > 60 ? c.pageUrl.slice(0, 60) + "..." : c.pageUrl}</td>
                    <td>{c.score.toFixed(3)}</td>
                    <td>{c.pageTitle || new URL(c.pageUrl).hostname}</td>
                    <td>{c.heading ?? "—"}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          <Pagination page={page} totalPages={totalPages} onPageChange={onPageChange} />
        </>
      )}
    </div>
  );
}
