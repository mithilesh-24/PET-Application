import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { formatHHMMSS } from '../services/timeFormat.js';
import {
  compareAttempts,
  deleteAttempt,
  downloadAttemptExport,
  getHistoryAnalytics,
  listHistory,
} from '../services/historyApi.js';

function formatDurationMs(ms) {
  return formatHHMMSS(Math.round((ms || 0) / 1000));
}

function formatDate(ts) {
  if (!ts) return '—';
  return new Date(ts).toLocaleString();
}

function formatScore(val, max) {
  if (val === null || val === undefined) return '—';
  return `${val} / ${max}`;
}

function StatusBadge({ status }) {
  const colors = {
    completed: { bg: '#e6f4ea', color: '#137333', border: '#1e8e3e' },
    terminated: { bg: '#fce8e6', color: '#a50e0e', border: '#d93025' },
    abandoned: { bg: '#fef7e0', color: '#b06000', border: '#f9ab00' },
  };
  const style = colors[status] || { bg: '#f1f3f4', color: '#3c4043', border: '#c5c5c5' };
  return (
    <span
      style={{
        display: 'inline-block',
        padding: '2px 8px',
        borderRadius: 4,
        fontSize: 12,
        fontWeight: 600,
        textTransform: 'capitalize',
        background: style.bg,
        color: style.color,
        border: `1px solid ${style.border}`,
      }}
    >
      {status}
    </span>
  );
}

function ScoreTrendChart({ attempts }) {
  if (!attempts || attempts.length < 2) return null;

  const width = 680;
  const height = 220;
  const padLeft = 48;
  const padRight = 24;
  const padTop = 24;
  const padBottom = 42;
  const plotW = width - padLeft - padRight;
  const plotH = height - padTop - padBottom;

  const points = attempts.map((a, idx) => {
    const x =
      attempts.length === 1 ? padLeft + plotW / 2 : padLeft + (idx / (attempts.length - 1)) * plotW;
    const clamped = Math.max(0, Math.min(100, Number(a.total) || 0));
    const y = padTop + plotH - (clamped / 100) * plotH;
    return { x, y, total: a.total, label: `#${idx + 1}`, title: a.paperTitle };
  });

  const polylinePoints = points.map((p) => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ');

  return (
    <div style={{ marginTop: 16, overflowX: 'auto' }}>
      <h3 style={{ margin: '0 0 8px', fontSize: 15 }}>Total Score Over Selected Attempts</h3>
      <svg
        width={width}
        height={height}
        viewBox={`0 0 ${width} ${height}`}
        role="img"
        aria-label="Total score trend chart"
        style={{ background: '#fafafa', border: '1px solid #dcdcdc', borderRadius: 4, maxWidth: '100%' }}
      >
        {[0, 25, 50, 75, 100].map((tick) => {
          const y = padTop + plotH - (tick / 100) * plotH;
          return (
            <g key={tick}>
              <line x1={padLeft} y1={y} x2={width - padRight} y2={y} stroke="#e0e0e0" strokeWidth="1" />
              <text x={padLeft - 8} y={y + 4} textAnchor="end" fontSize="11" fill="#555">
                {tick}
              </text>
            </g>
          );
        })}

        <line x1={padLeft} y1={padTop} x2={padLeft} y2={padTop + plotH} stroke="#999" strokeWidth="1" />
        <line
          x1={padLeft}
          y1={padTop + plotH}
          x2={width - padRight}
          y2={padTop + plotH}
          stroke="#999"
          strokeWidth="1"
        />

        <polyline fill="none" stroke="#1a73e8" strokeWidth="2.5" points={polylinePoints} />

        {points.map((p) => (
          <g key={p.label}>
            <circle cx={p.x} cy={p.y} r="5" fill="#1a73e8" stroke="#fff" strokeWidth="1.5" />
            <text x={p.x} y={p.y - 10} textAnchor="middle" fontSize="12" fontWeight="600" fill="#174ea6">
              {p.total}
            </text>
            <text x={p.x} y={padTop + plotH + 18} textAnchor="middle" fontSize="12" fill="#333">
              {p.label}
            </text>
          </g>
        ))}
      </svg>
    </div>
  );
}

const SUBJECT_CODES = ['CC01', 'CC02', 'CC03', 'CC04', 'CC05'];

export default function History() {
  const navigate = useNavigate();
  const [attempts, setAttempts] = useState([]);
  const [analytics, setAnalytics] = useState({ totalAttempts: 0, topics: [], recommendations: [] });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [selectedIds, setSelectedIds] = useState([]);
  const [comparison, setComparison] = useState(null);
  const [comparing, setComparing] = useState(false);
  const [busyMessage, setBusyMessage] = useState(null);

  async function loadAll() {
    setLoading(true);
    setError(null);
    try {
      const [histRes, analyticsRes] = await Promise.all([listHistory(), getHistoryAnalytics()]);
      setAttempts(histRes.attempts || []);
      setAnalytics(analyticsRes || { totalAttempts: 0, topics: [], recommendations: [] });
    } catch (err) {
      setError(err.message || 'Could not load past test history.');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadAll();
  }, []);

  function toggleSelected(attemptId) {
    setError(null);
    setSelectedIds((prev) => {
      if (prev.includes(attemptId)) {
        return prev.filter((id) => id !== attemptId);
      }
      if (prev.length >= 4) {
        setError('You can compare up to 4 attempts at a time.');
        return prev;
      }
      return [...prev, attemptId];
    });
  }

  async function handleCompare() {
    if (selectedIds.length < 2 || selectedIds.length > 4) {
      setError('Select 2 to 4 completed or terminated attempts to compare.');
      return;
    }
    setComparing(true);
    setError(null);
    try {
      const data = await compareAttempts(selectedIds);
      setComparison(data.attempts || []);
    } catch (err) {
      setError(err.message || 'Could not compare selected attempts.');
    } finally {
      setComparing(false);
    }
  }

  async function handleExport(attemptId, format) {
    setError(null);
    setBusyMessage(`Exporting ${format.toUpperCase()}...`);
    try {
      const res = await downloadAttemptExport(attemptId, format);
      setBusyMessage(`Downloaded ${res.filename}`);
      setTimeout(() => setBusyMessage(null), 3000);
    } catch (err) {
      setBusyMessage(null);
      setError(err.message || 'Export failed.');
    }
  }

  async function handleDelete(item) {
    if (
      !window.confirm(
        `Delete attempt for "${item.paperTitle}"? This removes the attempt record and results only; the question paper will be kept.`
      )
    ) {
      return;
    }
    setError(null);
    try {
      await deleteAttempt(item.attemptId);
      setSelectedIds((prev) => prev.filter((id) => id !== item.attemptId));
      setComparison((prev) =>
        prev ? prev.filter((c) => c.attemptId !== item.attemptId) : null
      );
      await loadAll();
    } catch (err) {
      setError(err.message || 'Could not delete attempt.');
    }
  }

  return (
    <div className="academic-shell">
      <header className="site-header">
        <div>
          <h1 className="site-title">Past Tests</h1>
          <p className="site-subtitle">
            Attempt history, score comparison, topic analytics, and result exports
          </p>
        </div>
        <div className="header-nav">
          <button type="button" className="btn btn-secondary" onClick={() => navigate('/')}>
            Back to Home
          </button>
        </div>
      </header>

      {busyMessage && (
        <div className="toast-banner" role="status">
          {busyMessage}
        </div>
      )}

      {error && (
        <div className="alert alert-error" role="alert" style={{ marginBottom: 16 }}>
          {error}
        </div>
      )}

      <div className="home-grid">
        <section className="panel">
          <div className="panel-header-row">
            <h2>Attempt History</h2>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <span className="muted-text" style={{ fontSize: 13 }}>
                Selected for compare: {selectedIds.length} (choose 2–4)
              </span>
              <button
                type="button"
                className="btn btn-primary btn-sm"
                disabled={selectedIds.length < 2 || selectedIds.length > 4 || comparing}
                onClick={handleCompare}
              >
                {comparing ? 'Comparing...' : `Compare Attempts (${selectedIds.length})`}
              </button>
              {comparison && (
                <button
                  type="button"
                  className="btn btn-secondary btn-sm"
                  onClick={() => setComparison(null)}
                >
                  Clear Compare
                </button>
              )}
            </div>
          </div>

          {loading ? (
            <p className="muted-text">Loading past tests...</p>
          ) : attempts.length === 0 ? (
            <div className="empty-state">
              <p>No past examination attempts yet.</p>
              <p className="muted-text">
                Start an exam from an imported question paper on Home to see your scores here.
              </p>
            </div>
          ) : (
            <div style={{ overflowX: 'auto' }}>
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Compare</th>
                    <th>Title</th>
                    <th>Date</th>
                    <th>Status</th>
                    <th>Score /100</th>
                    <th>Duration</th>
                    <th>S1</th>
                    <th>S2</th>
                    <th>S2A</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {attempts.map((item) => {
                    const canCompare =
                      item.status === 'completed' || item.status === 'terminated';
                    const isChecked = selectedIds.includes(item.attemptId);
                    return (
                      <tr key={item.attemptId}>
                        <td>
                          <input
                            type="checkbox"
                            aria-label={`Select ${item.paperTitle} (${item.attemptId}) for comparison`}
                            checked={isChecked}
                            disabled={!canCompare}
                            onChange={() => toggleSelected(item.attemptId)}
                          />
                        </td>
                        <td>
                          <strong>{item.paperTitle}</strong>
                          <div className="muted-text" style={{ fontSize: 12 }}>
                            <code>{item.paperId}</code>
                          </div>
                        </td>
                        <td>{formatDate(item.date)}</td>
                        <td>
                          <StatusBadge status={item.status} />
                        </td>
                        <td>{formatScore(item.total, 100)}</td>
                        <td>{formatDurationMs(item.durationMs)}</td>
                        <td>{formatScore(item.section1, 40)}</td>
                        <td>{formatScore(item.section2, 40)}</td>
                        <td>{formatScore(item.section2a, 20)}</td>
                        <td>
                          <div className="table-actions" style={{ flexWrap: 'wrap' }}>
                            {item.hasResult && (
                              <>
                                <button
                                  type="button"
                                  className="btn btn-primary btn-sm"
                                  onClick={() => navigate(`/results/${item.attemptId}`)}
                                >
                                  View Result
                                </button>
                                <button
                                  type="button"
                                  className="btn btn-secondary btn-sm"
                                  onClick={() => navigate(`/results/${item.attemptId}?tab=review`)}
                                >
                                  Review Answers
                                </button>
                                <button
                                  type="button"
                                  className="btn btn-secondary btn-sm"
                                  onClick={() => handleExport(item.attemptId, 'json')}
                                >
                                  Export JSON
                                </button>
                                <button
                                  type="button"
                                  className="btn btn-secondary btn-sm"
                                  onClick={() => handleExport(item.attemptId, 'csv')}
                                >
                                  Export CSV
                                </button>
                              </>
                            )}
                            <button
                              type="button"
                              className="btn btn-secondary btn-sm"
                              onClick={() => handleDelete(item)}
                            >
                              Delete
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </section>

        {comparison && comparison.length >= 2 && (
          <section className="panel" aria-label="Attempt comparison">
            <h2>Attempt Comparison ({comparison.length} Attempts)</h2>
            <div style={{ overflowX: 'auto' }}>
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Metric</th>
                    {comparison.map((c, idx) => (
                      <th key={c.attemptId}>
                        #{idx + 1}: {c.paperTitle}
                        <div className="muted-text" style={{ fontSize: 12, fontWeight: 400 }}>
                          {formatDate(c.endedAt || c.startedAt)}
                        </div>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <td>Status</td>
                    {comparison.map((c) => (
                      <td key={c.attemptId}>
                        <StatusBadge status={c.status} />
                      </td>
                    ))}
                  </tr>
                  <tr>
                    <td>Total Score (/ 100)</td>
                    {comparison.map((c) => (
                      <td key={c.attemptId}>
                        <strong>{c.total}</strong> ({c.percentage}%)
                      </td>
                    ))}
                  </tr>
                  <tr>
                    <td>Duration</td>
                    {comparison.map((c) => (
                      <td key={c.attemptId}>{formatDurationMs(c.durationMs)}</td>
                    ))}
                  </tr>
                  <tr>
                    <td>Section 1 (/ 40)</td>
                    {comparison.map((c) => (
                      <td key={c.attemptId}>{c.section1} / 40</td>
                    ))}
                  </tr>
                  <tr>
                    <td>Aptitude (/ 15)</td>
                    {comparison.map((c) => (
                      <td key={c.attemptId}>
                        {c.categories?.aptitude?.obtained ?? 0} /{' '}
                        {c.categories?.aptitude?.possible ?? 15}
                      </td>
                    ))}
                  </tr>
                  <tr>
                    <td>Reasoning (/ 15)</td>
                    {comparison.map((c) => (
                      <td key={c.attemptId}>
                        {c.categories?.reasoning?.obtained ?? 0} /{' '}
                        {c.categories?.reasoning?.possible ?? 15}
                      </td>
                    ))}
                  </tr>
                  <tr>
                    <td>Verbal (/ 10)</td>
                    {comparison.map((c) => (
                      <td key={c.attemptId}>
                        {c.categories?.verbal?.obtained ?? 0} /{' '}
                        {c.categories?.verbal?.possible ?? 10}
                      </td>
                    ))}
                  </tr>
                  <tr>
                    <td>Section 2 (/ 40)</td>
                    {comparison.map((c) => (
                      <td key={c.attemptId}>{c.section2} / 40</td>
                    ))}
                  </tr>
                  {SUBJECT_CODES.map((code) => (
                    <tr key={code}>
                      <td>{comparison[0]?.subjects?.[code]?.name || code} (/ 6)</td>
                      {comparison.map((c) => (
                        <td key={c.attemptId}>
                          {c.subjects?.[code]?.obtained ?? 0} / {c.subjects?.[code]?.possible ?? 6}
                        </td>
                      ))}
                    </tr>
                  ))}
                  <tr>
                    <td>Code Snippets (/ 10)</td>
                    {comparison.map((c) => (
                      <td key={c.attemptId}>
                        {c.snippets?.obtained ?? 0} / {c.snippets?.possible ?? 10}
                      </td>
                    ))}
                  </tr>
                  <tr>
                    <td>Section 2a Coding (/ 20)</td>
                    {comparison.map((c) => (
                      <td key={c.attemptId}>
                        {c.section2a} / 20 ({c.coding?.testsPassed ?? 0}/
                        {c.coding?.testsTotal ?? 0} tests)
                      </td>
                    ))}
                  </tr>
                  <tr>
                    <td>Correct / Incorrect / Unanswered</td>
                    {comparison.map((c) => (
                      <td key={c.attemptId}>
                        {c.counts?.correct ?? 0} / {c.counts?.incorrect ?? 0} /{' '}
                        {c.counts?.unanswered ?? 0}
                      </td>
                    ))}
                  </tr>
                  <tr>
                    <td>Violations</td>
                    {comparison.map((c) => (
                      <td key={c.attemptId}>{c.violationCount}</td>
                    ))}
                  </tr>
                </tbody>
              </table>
            </div>
            <ScoreTrendChart attempts={comparison} />
          </section>
        )}

        <section className="panel" aria-label="Weak-topic analytics">
          <h2>Weak-Topic Analytics</h2>
          {analytics.totalAttempts === 0 ? (
            <div className="empty-state">
              <p>No completed attempt data available for topic analytics yet.</p>
            </div>
          ) : (
            <>
              {analytics.recommendations.length > 0 && (
                <div style={{ marginBottom: 16 }}>
                  <h3 style={{ margin: '0 0 8px', fontSize: 15 }}>Recommendations</h3>
                  <ul style={{ margin: 0, paddingLeft: 20 }}>
                    {analytics.recommendations.map((rec) => (
                      <li key={rec}>{rec}</li>
                    ))}
                  </ul>
                </div>
              )}

              <table className="data-table">
                <thead>
                  <tr>
                    <th>Topic</th>
                    <th>Accuracy</th>
                    <th>Attempted Questions</th>
                    <th>Attempts With Topic</th>
                  </tr>
                </thead>
                <tbody>
                  {analytics.topics.map((t) => (
                    <tr key={t.topic}>
                      <td>{t.topic}</td>
                      <td>
                        {t.topic}: {t.statusText}
                      </td>
                      <td>{t.attempted}</td>
                      <td>{t.attemptsCount}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </>
          )}
        </section>
      </div>
    </div>
  );
}
