import { useState, useRef } from "react";
import { askQuestion } from "../lib/api.js";
import type { RAGAnswer } from "@rag/shared";
import LoadingSpinner from "../components/LoadingSpinner.js";

export default function Ask() {
  const [question, setQuestion] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [answer, setAnswer] = useState<RAGAnswer | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!question.trim()) return;
    setLoading(true);
    setError(null);
    setAnswer(null);
    try {
      const result = await askQuestion(question);
      setAnswer(result.data ?? null);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div>
      <div className="view-header"><h2>Ask a Question</h2></div>

      <form className="ask-form" onSubmit={handleSubmit}>
        <textarea
          ref={textareaRef}
          rows={4}
          placeholder="Type your question about the scraped content..."
          value={question}
          onChange={(e) => setQuestion(e.target.value)}
        />
        <button type="submit" disabled={loading || !question.trim()}>
          {loading ? "Asking..." : "Ask"}
        </button>
      </form>

      {error && <p style={{ color: "#b91c1c" }}>{error}</p>}

      {loading && <LoadingSpinner />}

      {answer && (
        <div>
          <div className="answer-text">{answer.answer}</div>

          <div style={{ fontWeight: 600, marginBottom: 8 }}>Sources</div>
          {answer.citations.length === 0 ? (
            <p style={{ color: "#888", fontSize: 14 }}>No sources cited.</p>
          ) : (
            <ol className="citations-list">
              {answer.citations.map((c, i) => (
                <li key={i}>
                  <a href={c.url} target="_blank" rel="noreferrer">{c.title}</a>
                  <span className="citation-excerpt">
                    {c.text.length > 200 ? c.text.slice(0, 200) + "..." : c.text}
                  </span>
                </li>
              ))}
            </ol>
          )}

          <p className="timing-info">
            Retrieved in {answer.retrievalTimeMs}ms, generated in {answer.generationTimeMs}ms
          </p>
        </div>
      )}
    </div>
  );
}
