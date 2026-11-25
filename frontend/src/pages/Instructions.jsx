import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { createAttempt, getPaper } from '../services/paperApi.js';

export default function Instructions() {
  const { paperId } = useParams();
  const navigate = useNavigate();
  const [paper, setPaper] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [violationLimit, setViolationLimit] = useState(3);
  const [acknowledged, setAcknowledged] = useState(false);
  const [starting, setStarting] = useState(false);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      setError(null);
      try {
        const res = await getPaper(paperId);
        if (!cancelled) setPaper(res.paper);
      } catch (err) {
        if (!cancelled) setError(err.message || 'Paper not found.');
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => {
      cancelled = true;
    };
  }, [paperId]);

  async function handleStartExam() {
    if (!acknowledged || !paper) return;
    setStarting(true);
    setError(null);
    try {
      const res = await createAttempt({
        paperId: paper.id,
        violationLimit,
      });
      navigate(`/exam/${encodeURIComponent(res.attempt.id)}`);
    } catch (err) {
      setError(err.message || 'Could not start exam attempt.');
      setStarting(false);
    }
  }

  return (
    <div className="academic-shell">
      <header className="site-header">
        <div>
          <h1 className="site-title">Examination Instructions</h1>
          <p className="site-subtitle">
            {paper ? `${paper.title} (${paper.paperId})` : `Paper: ${paperId}`}
          </p>
        </div>
        <button type="button" className="btn btn-secondary" onClick={() => navigate('/')}>
          Back to Home
        </button>
      </header>

      {loading && <p className="muted-text">Loading paper details...</p>}

      {error && (
        <div className="alert alert-error" role="alert">
          {error}
        </div>
      )}

      {paper && (
        <main className="panel">
          <h2>Exam Structure &amp; Rules</h2>
          <table className="data-table">
            <thead>
              <tr>
                <th>Section</th>
                <th>Contents</th>
                <th>Questions</th>
                <th>Marks</th>
                <th>Duration</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td>Section 1 — Common to All</td>
                <td>Aptitude (15), Reasoning (15), Verbal (10)</td>
                <td>40</td>
                <td>40</td>
                <td>50 min</td>
              </tr>
              <tr>
                <td>Section 2 — Software Only</td>
                <td>CC01–CC05 MCQs (20) + Code Snippets (5)</td>
                <td>25</td>
                <td>40</td>
                <td>50 min</td>
              </tr>
              <tr>
                <td>Section 2a — Coding</td>
                <td>1 Medium + 1 Hard Problem (C, C++, Java, Python)</td>
                <td>2</td>
                <td>20</td>
                <td>50 min</td>
              </tr>
            </tbody>
          </table>

          <ul className="rules-list">
            <li>
              <strong>Forward-only navigation:</strong> You cannot go back to previous questions,
              jump via a palette, or reopen a submitted section.
            </li>
            <li>
              <strong>Server-authoritative timers:</strong> Each 50-minute section timer is tracked
              on the server. Refreshing the page does not reset or extend your remaining time.
            </li>
            <li>
              <strong>Fullscreen requirement:</strong> The exam requires fullscreen mode. Exiting
              fullscreen or switching tabs counts as a browser violation.
            </li>
            <li>
              <strong>Browser-monitoring limits (honest notice):</strong> Monitoring detects
              browser-visible events only (tab switches, fullscreen exits, and window focus loss).
              It cannot prevent OS-level app switching, second devices, or external assistance.
            </li>
          </ul>

          <div className="form-row">
            <label htmlFor="violation-limit">
              <strong>Maximum violation warnings before auto-termination:</strong>
            </label>
            <select
              id="violation-limit"
              value={violationLimit}
              onChange={(e) => setViolationLimit(Number(e.target.value))}
            >
              <option value={3}>3 warnings (4th terminates — default)</option>
              <option value={5}>5 warnings (6th terminates)</option>
            </select>
          </div>

          <div className="form-row checkbox-row">
            <label>
              <input
                type="checkbox"
                checked={acknowledged}
                onChange={(e) => setAcknowledged(e.target.checked)}
              />{' '}
              I have read and understood the examination rules, forward-only policy, and
              browser-monitoring limits.
            </label>
          </div>

          <div className="uploader-actions">
            <button
              type="button"
              className="btn btn-primary"
              disabled={!acknowledged || starting}
              onClick={handleStartExam}
            >
              {starting ? 'Starting Attempt...' : 'Start Exam'}
            </button>
          </div>
        </main>
      )}
    </div>
  );
}
