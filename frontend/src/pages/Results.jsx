import { useEffect, useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import SafeQuestionText from '../components/SafeQuestionText.jsx';
import SnippetBlock from '../components/SnippetBlock.jsx';
import { formatHHMMSS } from '../services/timeFormat.js';
import { getAttemptResult, getAttemptReview } from '../services/resultApi.js';

const LETTERS = ['A', 'B', 'C', 'D'];

function formatDurationMs(ms) {
  return formatHHMMSS(Math.round((ms || 0) / 1000));
}

export default function Results() {
  const { attemptId } = useParams();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const initialTab = searchParams.get('tab') === 'review' ? 'review' : 'summary';

  const [tab, setTab] = useState(initialTab);
  const [resultData, setResultData] = useState(null);
  const [reviewData, setReviewData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [loadingReview, setLoadingReview] = useState(false);
  const [error, setError] = useState(null);
  const [sectionFilter, setSectionFilter] = useState('ALL');
  const [outcomeFilter, setOutcomeFilter] = useState('all');

  useEffect(() => {
    let cancelled = false;
    async function loadResult() {
      setLoading(true);
      setError(null);
      try {
        const res = await getAttemptResult(attemptId);
        if (!cancelled) setResultData(res);
      } catch (err) {
        if (!cancelled) setError(err.message || 'Results are not available.');
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    loadResult();
    return () => {
      cancelled = true;
    };
  }, [attemptId]);

  useEffect(() => {
    if (tab !== 'review' || reviewData || error) return;
    let cancelled = false;
    async function loadReview() {
      setLoadingReview(true);
      try {
        const rev = await getAttemptReview(attemptId);
        if (!cancelled) setReviewData(rev);
      } catch (err) {
        if (!cancelled) setError(err.message || 'Review is not available.');
      } finally {
        if (!cancelled) setLoadingReview(false);
      }
    }
    loadReview();
    return () => {
      cancelled = true;
    };
  }, [attemptId, tab, reviewData, error]);

  function switchTab(nextTab) {
    setTab(nextTab);
    setSearchParams(nextTab === 'review' ? { tab: 'review' } : {});
  }

  const breakdown = resultData?.breakdown;

  const filteredItems = (reviewData?.items || []).filter((item) => {
    if (sectionFilter !== 'ALL' && item.section !== sectionFilter) return false;
    if (outcomeFilter === 'correct' && !item.isCorrect) return false;
    if (outcomeFilter === 'incorrect' && (item.isCorrect || item.isUnanswered)) return false;
    if (outcomeFilter === 'unanswered' && !item.isUnanswered) return false;
    return true;
  });

  return (
    <div className="academic-shell">
      <header className="site-header">
        <div>
          <h1 className="site-title">Examination Results</h1>
          <p className="site-subtitle">
            {resultData
              ? `${resultData.paperTitle} (${resultData.paperId})`
              : `Attempt: ${attemptId}`}
          </p>
        </div>
        <div className="header-nav">
          <button type="button" className="btn btn-secondary" onClick={() => navigate('/history')}>
            Past Tests
          </button>
          <button type="button" className="btn btn-secondary" onClick={() => navigate('/')}>
            Back to Home
          </button>
        </div>
      </header>

      {loading && <p className="muted-text">Loading score report...</p>}

      {error && (
        <div className="alert alert-error" role="alert">
          {error}
        </div>
      )}

      {resultData && breakdown && (
        <>
          {resultData.terminated && (
            <div className="alert alert-error" style={{ marginBottom: 16 }} role="alert">
              <strong>Attempt Terminated:</strong>{' '}
              {resultData.terminationReason || 'Terminated due to violation limit.'} Scored on
              submitted work only.
            </div>
          )}

          <div className="stat-strip" aria-label="Headline score">
            <div className="stat-item">
              <span className="stat-value" data-testid="headline-total">
                {resultData.total} / 100
              </span>
              <span className="stat-label">Total Score</span>
            </div>
            <div className="stat-item">
              <span className="stat-value">{breakdown.percentage}%</span>
              <span className="stat-label">Percentage</span>
            </div>
            <div className="stat-item">
              <span className="stat-value">{breakdown.counts.correct}</span>
              <span className="stat-label">Correct</span>
            </div>
            <div className="stat-item">
              <span className="stat-value">{breakdown.counts.incorrect}</span>
              <span className="stat-label">Incorrect</span>
            </div>
            <div className="stat-item">
              <span className="stat-value">{breakdown.counts.unanswered}</span>
              <span className="stat-label">Unanswered</span>
            </div>
          </div>

          <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
            <button
              type="button"
              className={`btn ${tab === 'summary' ? 'btn-primary' : 'btn-secondary'}`}
              onClick={() => switchTab('summary')}
            >
              Score Dashboard
            </button>
            <button
              type="button"
              className={`btn ${tab === 'review' ? 'btn-primary' : 'btn-secondary'}`}
              onClick={() => switchTab('review')}
            >
              Review Answers &amp; Explanations
            </button>
          </div>

          {tab === 'summary' && (
            <main className="home-grid">
              <section className="panel">
                <h2>Section Breakdown</h2>
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>Section</th>
                      <th>Marks Obtained</th>
                      <th>Maximum Marks</th>
                      <th>Time Used</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr>
                      <td>Section 1 — Common to All</td>
                      <td>{breakdown.sections.S1.obtained}</td>
                      <td>{breakdown.sections.S1.possible}</td>
                      <td>{formatDurationMs(breakdown.sections.S1.timeMs)}</td>
                    </tr>
                    <tr>
                      <td>Section 2 — Software Only</td>
                      <td>{breakdown.sections.S2.obtained}</td>
                      <td>{breakdown.sections.S2.possible}</td>
                      <td>{formatDurationMs(breakdown.sections.S2.timeMs)}</td>
                    </tr>
                    <tr>
                      <td>Section 2a — Coding</td>
                      <td>{breakdown.sections.S2A.obtained}</td>
                      <td>{breakdown.sections.S2A.possible}</td>
                      <td>{formatDurationMs(breakdown.sections.S2A.timeMs)}</td>
                    </tr>
                    <tr>
                      <th>Total</th>
                      <th>{resultData.total}</th>
                      <th>100</th>
                      <th>{formatDurationMs(breakdown.time.totalMs)}</th>
                    </tr>
                  </tbody>
                </table>
              </section>

              <section className="panel">
                <h2>Category Breakdown</h2>
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>Category</th>
                      <th>Marks Obtained</th>
                      <th>Maximum Marks</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr>
                      <td>Aptitude (Section 1)</td>
                      <td>{breakdown.categories.aptitude.obtained}</td>
                      <td>{breakdown.categories.aptitude.possible}</td>
                    </tr>
                    <tr>
                      <td>Reasoning (Section 1)</td>
                      <td>{breakdown.categories.reasoning.obtained}</td>
                      <td>{breakdown.categories.reasoning.possible}</td>
                    </tr>
                    <tr>
                      <td>Verbal (Section 1)</td>
                      <td>{breakdown.categories.verbal.obtained}</td>
                      <td>{breakdown.categories.verbal.possible}</td>
                    </tr>
                    <tr>
                      <td>Code Snippets (Section 2)</td>
                      <td>{breakdown.snippets.obtained}</td>
                      <td>{breakdown.snippets.possible}</td>
                    </tr>
                    <tr>
                      <td>Coding Problems (Section 2a)</td>
                      <td>{breakdown.coding.obtained}</td>
                      <td>{breakdown.coding.possible}</td>
                    </tr>
                  </tbody>
                </table>
              </section>

              <section className="panel">
                <h2>Subject Breakdown (Section 2 Department MCQs)</h2>
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>Code</th>
                      <th>Subject</th>
                      <th>Marks Obtained</th>
                      <th>Maximum Marks</th>
                    </tr>
                  </thead>
                  <tbody>
                    {Object.values(breakdown.subjects).map((subj) => (
                      <tr key={subj.code}>
                        <td>
                          <code>{subj.code}</code>
                        </td>
                        <td>{subj.name}</td>
                        <td>{subj.obtained}</td>
                        <td>{subj.possible}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </section>

              <section className="panel">
                <h2>
                  Coding Evaluation ({breakdown.coding.testsPassed} / {breakdown.coding.testsTotal}{' '}
                  Hidden Tests Passed)
                </h2>
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>Problem</th>
                      <th>Difficulty</th>
                      <th>Language</th>
                      <th>Tests Passed</th>
                      <th>Marks</th>
                    </tr>
                  </thead>
                  <tbody>
                    {breakdown.coding.problems.map((p) => (
                      <tr key={p.id}>
                        <td>
                          <code>{p.id}</code> — {p.title}
                        </td>
                        <td>{p.difficulty}</td>
                        <td>{p.language || 'Not submitted'}</td>
                        <td>
                          {p.testsPassed} / {p.testsTotal}
                        </td>
                        <td>
                          {p.marksObtained} / {p.marksPossible}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </section>

              <section className="panel">
                <h2>Violations Log</h2>
                {breakdown.violations.length === 0 ? (
                  <p className="muted-text">No browser violations recorded during this attempt.</p>
                ) : (
                  <table className="data-table">
                    <thead>
                      <tr>
                        <th>Type</th>
                        <th>Timestamp</th>
                        <th>Section</th>
                        <th>Question ID</th>
                      </tr>
                    </thead>
                    <tbody>
                      {breakdown.violations.map((v) => (
                        <tr key={v.id}>
                          <td>
                            <code>{v.type}</code>
                          </td>
                          <td>{new Date(v.at).toLocaleString()}</td>
                          <td>{v.section || '-'}</td>
                          <td>{v.questionId || '-'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </section>
            </main>
          )}

          {tab === 'review' && (
            <section className="panel">
              <div className="panel-header-row" style={{ flexWrap: 'wrap' }}>
                <h2>Answer Review &amp; Solutions</h2>
                <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                  <select
                    aria-label="Filter by section"
                    value={sectionFilter}
                    onChange={(e) => setSectionFilter(e.target.value)}
                  >
                    <option value="ALL">All Sections</option>
                    <option value="S1">Section 1</option>
                    <option value="S2">Section 2</option>
                    <option value="S2A">Section 2a</option>
                  </select>
                  <select
                    aria-label="Filter by outcome"
                    value={outcomeFilter}
                    onChange={(e) => setOutcomeFilter(e.target.value)}
                  >
                    <option value="all">All Outcomes</option>
                    <option value="correct">Correct Only</option>
                    <option value="incorrect">Incorrect / Partial</option>
                    <option value="unanswered">Unanswered Only</option>
                  </select>
                </div>
              </div>

              {loadingReview ? (
                <p className="muted-text">Loading full question review...</p>
              ) : filteredItems.length === 0 ? (
                <p className="muted-text">No questions match the current filter.</p>
              ) : (
                <div style={{ display: 'grid', gap: 16 }}>
                  {filteredItems.map((item) => (
                    <article
                      key={item.id}
                      style={{
                        border: '1px solid #d0d0d0',
                        borderRadius: 4,
                        padding: 14,
                        background: '#fafafa',
                      }}
                    >
                      <div
                        style={{
                          display: 'flex',
                          justifyContent: 'space-between',
                          flexWrap: 'wrap',
                          gap: 8,
                          marginBottom: 8,
                        }}
                      >
                        <div>
                          <strong>
                            <code>{item.id}</code> ({item.section})
                          </strong>{' '}
                          · {item.topic}
                        </div>
                        <div>
                          <strong>
                            {item.marksAwarded} / {item.marks} Marks
                          </strong>{' '}
                          ·{' '}
                          {item.isUnanswered
                            ? 'Unanswered'
                            : item.isCorrect
                              ? 'Correct'
                              : 'Incorrect'}
                          {typeof item.timeSpentMs === 'number' &&
                            ` · ${Math.round(item.timeSpentMs / 1000)}s`}
                        </div>
                      </div>

                      {item.type === 'snippet' && (
                        <div style={{ marginBottom: 10 }}>
                          <SnippetBlock language={item.language} code={item.code} />
                        </div>
                      )}

                      {item.type !== 'coding' ? (
                        <>
                          <SafeQuestionText text={item.text} />
                          <ul style={{ listStyle: 'none', padding: 0, margin: '10px 0' }}>
                            {(item.options || []).map((opt, idx) => {
                              const isStudent = item.selectedIndex === idx;
                              const isAnswer = item.answerIndex === idx;
                              return (
                                <li
                                  key={idx}
                                  style={{
                                    padding: '6px 10px',
                                    marginBottom: 4,
                                    borderRadius: 4,
                                    border: isAnswer
                                      ? '1px solid #1e8e3e'
                                      : isStudent
                                        ? '1px solid #d93025'
                                        : '1px solid #e0e0e0',
                                    background: isAnswer
                                      ? '#e6f4ea'
                                      : isStudent
                                        ? '#fce8e6'
                                        : '#fff',
                                  }}
                                >
                                  <strong>{LETTERS[idx]}.</strong> {opt}{' '}
                                  {isAnswer && <strong>(Correct Answer)</strong>}{' '}
                                  {isStudent && !isAnswer && <strong>(Your Answer)</strong>}
                                  {isStudent && isAnswer && <strong>(Your Answer)</strong>}
                                </li>
                              );
                            })}
                          </ul>
                          <p style={{ margin: '6px 0 0' }}>
                            <strong>Explanation:</strong> {item.explanation}
                          </p>
                        </>
                      ) : (
                        <>
                          <p>
                            <strong>{item.title}</strong> ({item.difficulty})
                          </p>
                          <p>{item.statement}</p>
                          <p>
                            <strong>Your Submission:</strong>{' '}
                            {item.submittedSource
                              ? `Language: ${item.submittedLanguage}`
                              : 'No submission recorded'}
                          </p>
                          {item.submittedSource && (
                            <pre className="output-pre">{item.submittedSource}</pre>
                          )}
                          {item.testResults?.length > 0 && (
                            <table className="data-table" style={{ marginTop: 8 }}>
                              <thead>
                                <tr>
                                  <th>Test ID</th>
                                  <th>Status</th>
                                  <th>Runtime</th>
                                  <th>Marks</th>
                                </tr>
                              </thead>
                              <tbody>
                                {item.testResults.map((tr) => (
                                  <tr key={tr.testId}>
                                    <td>{tr.testId}</td>
                                    <td>{tr.passed ? 'PASS' : tr.status.toUpperCase()}</td>
                                    <td>{tr.runtimeMs} ms</td>
                                    <td>{tr.marksAwarded}</td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          )}
                          <div style={{ marginTop: 10 }}>
                            <strong>
                              Reference Solution ({item.referenceSolution?.language}):
                            </strong>
                            <pre className="output-pre">{item.referenceSolution?.code}</pre>
                          </div>
                          <p style={{ margin: '6px 0 0' }}>
                            <strong>Explanation:</strong> {item.explanation}
                          </p>
                        </>
                      )}
                    </article>
                  ))}
                </div>
              )}
            </section>
          )}
        </>
      )}
    </div>
  );
}
