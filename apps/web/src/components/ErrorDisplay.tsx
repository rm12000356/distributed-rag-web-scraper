interface ErrorDisplayProps {
  message: string;
  onRetry?: () => void;
}

export default function ErrorDisplay({ message, onRetry }: ErrorDisplayProps) {
  return (
    <div className="error-box">
      <p className="error-text">{message}</p>
      {onRetry && <button onClick={onRetry}>Retry</button>}
    </div>
  );
}
