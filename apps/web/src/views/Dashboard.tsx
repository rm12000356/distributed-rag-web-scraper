import { useState, useEffect, useCallback } from "react";
import { fetchHealth, fetchWebsites, fetchPages, fetchJobs, fetchWorkers, resetData } from "../lib/api.js";
import LoadingSpinner from "../components/LoadingSpinner.js";
import ErrorDisplay from "../components/ErrorDisplay.js";

interface DashboardProps {
  onNavigate: (view: string) => void;
}

export default function Dashboard({ onNavigate }: DashboardProps) {
  const [loading, setLoading] = useState(true);
  const [healthData, setHealthData] = useState<{ checks: Record<string, string> } | null>(null);
  const [healthError, setHealthError] = useState(false);
  const [websiteCount, setWebsiteCount] = useState<number | null>(null);
  const [pageTotal, setPageTotal] = useState<number | null>(null);
  const [jobTotal, setJobTotal] = useState<number | null>(null);
  const [activeWorkers, setActiveWorkers] = useState(0);
  const [totalWorkers, setTotalWorkers] = useState(0);
  const [resetting, setResetting] = useState(false);
  const [resetMessage, setResetMessage] = useState<string | null>(null);
  const [resetError, setResetError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const results = await Promise.allSettled([
      fetchHealth(),
      fetchWebsites(),
      fetchPages({ pageSize: 1 }),
      fetchJobs({ pageSize: 1 }),
      fetchWorkers(),
    ]);

    const healthResult = results[0];
    if (healthResult.status === "fulfilled") {
      setHealthData(healthResult.value.data ?? null);
      setHealthError(false);
    } else {
      setHealthData(null);
      setHealthError(true);
    }

    if (results[1].status === "fulfilled") {
      setWebsiteCount(results[1].value.data?.length ?? 0);
    } else {
      setWebsiteCount(null);
    }

    if (results[2].status === "fulfilled") {
      setPageTotal(results[2].value.total ?? 0);
    } else {
      setPageTotal(null);
    }

    if (results[3].status === "fulfilled") {
      setJobTotal(results[3].value.total ?? 0);
    } else {
      setJobTotal(null);
    }

    if (results[4].status === "fulfilled") {
      const ws = results[4].value.data ?? [];
      setTotalWorkers(ws.length);
      setActiveWorkers(ws.filter((w) => w.status === "ACTIVE").length);
    } else {
      setTotalWorkers(0);
      setActiveWorkers(0);
    }

    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const handleReset = async () => {
    if (!window.confirm("Reset everything?\n\nThis will:\n\u2022 Purge all pending crawl jobs from the queue\n\u2022 Delete all pages, chunks, and versions\n\u2022 Clear the vector database\n\nStop workers first! This cannot be undone.")) {
      return;
    }
    setResetting(true);
    setResetError(null);
    try {
      const result = await resetData();
      const hasError = result.database === "error" || result.vectorDb === "error" || result.queue === "error";
      if (hasError) {
        setResetError(result.errors.join("; "));
      } else {
        setResetMessage(`${result.message}. Purged ${result.messagesPurged} queued messages.`);
        setTimeout(() => setResetMessage(null), 4000);
      }
      await load();
    } catch (err) {
      setResetError((err as Error).message);
    } finally {
      setResetting(false);
    }
  };

  if (loading) return <LoadingSpinner />;

  const checks = healthData?.checks ?? {};
  const services = ["database", "queue", "vectorDb"] as const;

  return (
    <div>
      <div className="view-header"><h2>Dashboard</h2></div>

      <div className="stat-grid">
        <div className="stat-card">
          <div className="stat-value">{websiteCount ?? "\u2014"}</div>
          <div className="stat-label">Websites</div>
        </div>
        <div className="stat-card">
          <div className="stat-value">{pageTotal ?? "\u2014"}</div>
          <div className="stat-label">Pages</div>
        </div>
        <div className="stat-card">
          <div className="stat-value">{jobTotal ?? "\u2014"}</div>
          <div className="stat-label">Jobs</div>
        </div>
        <div className="stat-card">
          <div className="stat-value">
            {totalWorkers > 0 ? `${activeWorkers}/${totalWorkers}` : "\u2014"}
          </div>
          <div className="stat-label">Workers Online</div>
        </div>
      </div>

      <div className="health-panel">
        {services.map((s) => {
          let cls = "unknown";
          if (!healthError && checks[s]) {
            cls = checks[s] === "ok" ? "ok" : "error";
          }
          return (
            <div className="health-item" key={s}>
              <span className={`health-dot ${cls}`} />
              <span>{s === "vectorDb" ? "Vector DB" : s.charAt(0).toUpperCase() + s.slice(1)}</span>
            </div>
          );
        })}
      </div>

      <div className="quick-actions">
        <button onClick={() => onNavigate("crawl")}>Submit Crawl Job</button>
        <button onClick={() => onNavigate("ask")}>Ask a Question</button>
        <button className="danger" onClick={handleReset} disabled={resetting}>
          {resetting ? "Resetting..." : "Reset Data"}
        </button>
      </div>

      {resetMessage && <div className="success-banner">{resetMessage}</div>}
      {resetError && <ErrorDisplay message={resetError} onRetry={() => setResetError(null)} />}
    </div>
  );
}
