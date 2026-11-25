export default function CompilerOutput({
  activeTab,
  onTabChange,
  customInput,
  onCustomInputChange,
  samples = [],
  runResult,
  submitResult,
  error,
}) {
  return (
    <div className="coding-output-shell" data-allow-paste="true">
      <div className="coding-output-tabs" role="tablist" aria-label="Execution output tabs">
        <button
          type="button"
          role="tab"
          aria-selected={activeTab === 'input'}
          className={`coding-tab-btn${activeTab === 'input' ? ' active' : ''}`}
          onClick={() => onTabChange('input')}
        >
          Custom Input
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={activeTab === 'run'}
          className={`coding-tab-btn${activeTab === 'run' ? ' active' : ''}`}
          onClick={() => onTabChange('run')}
        >
          Run Output
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={activeTab === 'results'}
          className={`coding-tab-btn${activeTab === 'results' ? ' active' : ''}`}
          onClick={() => onTabChange('results')}
        >
          Test Results
          {submitResult ? ` (${submitResult.passedCount}/${submitResult.totalTests})` : ''}
        </button>
      </div>

      <div className="coding-output-body">
        {error && (
          <div
            className="alert alert-error"
            style={{ marginTop: 0, marginBottom: 10 }}
            role="alert"
          >
            {error}
          </div>
        )}

        {activeTab === 'input' && (
          <div>
            {samples.length > 0 && (
              <div className="sample-quick-row">
                <span className="muted-text">Load sample into input:</span>
                {samples.map((s, idx) => (
                  <button
                    key={idx}
                    type="button"
                    className="btn btn-secondary btn-sm"
                    onClick={() => onCustomInputChange(s.input)}
                  >
                    Sample {idx + 1}
                  </button>
                ))}
              </div>
            )}
            <textarea
              className="custom-stdin-box"
              data-allow-paste="true"
              aria-label="Custom standard input"
              value={customInput}
              onChange={(e) => onCustomInputChange(e.target.value)}
              rows={6}
              placeholder="Enter stdin for Run Code (max 8 KB)..."
            />
          </div>
        )}

        {activeTab === 'run' && (
          <div>
            {!runResult ? (
              <p className="muted-text">
                Click <strong>Run Code</strong> (or press Ctrl+Enter) to test against Custom Input.
              </p>
            ) : (
              <div className="run-output-view">
                <div className="run-status-line">
                  <span>
                    <strong>Status:</strong> <code>{String(runResult.status).toUpperCase()}</code>
                  </span>
                  <span>
                    <strong>Compile:</strong>{' '}
                    {runResult.compile?.ok ? 'Success' : 'Compilation Error'}
                  </span>
                  <span>
                    <strong>Time:</strong> {runResult.ms} ms
                  </span>
                  {runResult.memoryKb > 0 && (
                    <span>
                      <strong>Memory:</strong> {runResult.memoryKb} KB
                    </span>
                  )}
                </div>

                {!runResult.compile?.ok && runResult.compile?.stderr && (
                  <div className="output-section">
                    <strong>Compiler Diagnostics:</strong>
                    <pre className="output-pre output-pre-error">{runResult.compile.stderr}</pre>
                  </div>
                )}

                {runResult.compile?.ok && (
                  <>
                    <div className="output-section">
                      <strong>Standard Output:</strong>
                      <pre className="output-pre">{runResult.stdout || '(empty)'}</pre>
                    </div>
                    {runResult.stderr && (
                      <div className="output-section">
                        <strong>Standard Error:</strong>
                        <pre className="output-pre output-pre-error">{runResult.stderr}</pre>
                      </div>
                    )}
                  </>
                )}
              </div>
            )}
          </div>
        )}

        {activeTab === 'results' && (
          <div>
            {!submitResult ? (
              <p className="muted-text">
                Click <strong>Submit Code</strong> to evaluate against all sample and hidden test
                cases.
              </p>
            ) : (
              <div>
                <div className="run-status-line">
                  <span>
                    <strong>Compilation:</strong>{' '}
                    {submitResult.compile?.ok ? 'Successful' : 'Failed'}
                  </span>
                  <span>
                    <strong>Hidden Tests Passed:</strong> {submitResult.passedCount} /{' '}
                    {submitResult.totalTests}
                  </span>
                  <span>
                    <strong>Marks Obtained:</strong> {submitResult.marksObtained} /{' '}
                    {submitResult.totalMarks}
                  </span>
                  <span>
                    <strong>Max Runtime:</strong> {submitResult.runtimeMs} ms
                  </span>
                </div>

                {!submitResult.compile?.ok && submitResult.compile?.stderr && (
                  <pre className="output-pre output-pre-error">{submitResult.compile.stderr}</pre>
                )}

                <table className="data-table" style={{ marginTop: 8 }}>
                  <thead>
                    <tr>
                      <th>Test</th>
                      <th>Outcome</th>
                      <th>Status</th>
                      <th>Runtime</th>
                      <th>Memory</th>
                      <th>Marks</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(submitResult.samples || []).map((s) => (
                      <tr key={s.id}>
                        <td>{s.label}</td>
                        <td>{s.passed ? 'PASS' : 'FAIL'}</td>
                        <td>
                          <code>{s.status}</code>
                        </td>
                        <td>{s.runtimeMs} ms</td>
                        <td>{s.memoryKb ? `${s.memoryKb} KB` : '-'}</td>
                        <td>- (sample)</td>
                      </tr>
                    ))}
                    {(submitResult.tests || []).map((t) => (
                      <tr key={t.id}>
                        <td>{t.label}</td>
                        <td>{t.passed ? 'PASS' : 'FAIL'}</td>
                        <td>
                          <code>{t.status}</code>
                        </td>
                        <td>{t.runtimeMs} ms</td>
                        <td>{t.memoryKb ? `${t.memoryKb} KB` : '-'}</td>
                        <td>
                          {t.marksAwarded} / {t.maxMarks}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>

                {(submitResult.samples || []).length > 0 && (
                  <div style={{ marginTop: 10 }}>
                    <strong>Sample Details:</strong>
                    {submitResult.samples.map((s) => (
                      <div key={s.id} className="sample-detail-box">
                        <div>
                          <strong>{s.label}</strong> ({s.passed ? 'PASS' : 'FAIL'})
                        </div>
                        <div className="sample-io-grid">
                          <div>
                            <span className="muted-text">Input:</span>
                            <pre className="output-pre">{s.input || '(empty)'}</pre>
                          </div>
                          <div>
                            <span className="muted-text">Expected:</span>
                            <pre className="output-pre">{s.sampleExpected}</pre>
                          </div>
                          <div>
                            <span className="muted-text">Actual:</span>
                            <pre className="output-pre">{s.actualOutput || '(empty)'}</pre>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
