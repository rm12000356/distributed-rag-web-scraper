import { useState, useEffect, useCallback } from "react";
import { fetchWorkers } from "../lib/api.js";
import type { WorkerData } from "@rag/shared";
import LoadingSpinner from "../components/LoadingSpinner.js";
import ErrorDisplay from "../components/ErrorDisplay.js";
import StatusBadge from "../components/StatusBadge.js";

function timeAgo(dateStr: string | null): string {
  if (!dateStr) return "Never";
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "Just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

export default function Workers() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [workers, setWorkers] = useState<WorkerData[]>([]);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await fetchWorkers();
      setWorkers(result.data ?? []);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  if (loading) return <LoadingSpinner />;
  if (error) return <ErrorDisplay message={error} onRetry={load} />;

  return (
    <div>
      <div className="view-header"><h2>Workers</h2></div>
      {workers.length === 0 ? (
        <p className="no-data">No workers registered.</p>
      ) : (
        <table>
          <thead>
            <tr>
              <th>Name</th>
              <th>Status</th>
              <th>Last Heartbeat</th>
              <th>Created</th>
            </tr>
          </thead>
          <tbody>
            {workers.map((w) => (
              <tr key={w.id}>
                <td>{w.name}</td>
                <td><StatusBadge status={w.status} /></td>
                <td className="worker-last-seen">{timeAgo(w.lastHeartbeat)}</td>
                <td>{new Date(w.createdAt).toLocaleDateString()}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
