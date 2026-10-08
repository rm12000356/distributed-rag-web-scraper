interface StatusBadgeProps {
  status: string;
}

export default function StatusBadge({ status }: StatusBadgeProps) {
  const cls = status.toLowerCase();
  return <span className={`status-badge ${cls}`}>{status}</span>;
}
