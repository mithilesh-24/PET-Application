import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { apiRequest } from '../services/apiClient.js';

export default function Settings() {
  const navigate = useNavigate();
  const [violationLimit, setViolationLimit] = useState(3);
  const [dataDir, setDataDir] = useState('');
  const [compilers, setCompilers] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [backingUp, setBackingUp] = useState(false);
  const [rebuilding, setRebuilding] = useState(false);
  const [message, setMessage] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      try {
        const [settingsData, compilerData] = await Promise.all([
          apiRequest('/settings'),
          apiRequest('/settings/compilers'),
        ]);
        if (!cancelled) {
          setViolationLimit(settingsData.violationLimit ?? 3);
          setDataDir(settingsData.dataDir || '');
          setCompilers(compilerData);
        }
      } catch (err) {
        if (!cancelled) setError(err.message || 'Could not load settings.');
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => {
      cancelled = true;
    };
  }, []);

  async function handleSave(e) {
    e.preventDefault();
    setSaving(true);
    setMessage(null);
    setError(null);
    try {
      const res = await apiRequest('/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ violationLimit }),
      });
      setViolationLimit(res.violationLimit);
      setMessage(
        `Saved. New attempts will default to ${res.violationLimit} allowed violation warnings.`
      );
    } catch (err) {
      setError(err.message || 'Failed to save settings.');
    } finally {
      setSaving(false);
    }
  }

  async function handleBackupNow() {
    setBackingUp(true);
    setMessage(null);
    setError(null);
    try {
      const res = await apiRequest('/settings/backup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });
      setMessage(`Database backup created at: ${res.backupPath}`);
    } catch (err) {
      setError(err.message || 'Database backup failed.');
    } finally {
      setBackingUp(false);
    }
  }

  async function handleVerifySandbox() {
    setRebuilding(true);
    setMessage(null);
    setError(null);
    try {
      const res = await apiRequest('/settings/rebuild-runner', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });
      if (res.compilers) {
        setCompilers(res.compilers);
      }
      setMessage('Local sandbox verified successfully.');
    } catch (err) {
      setError(err.message || 'Failed to verify sandbox.');
    } finally {
      setRebuilding(false);
    }
  }

  return (
    <div className="academic-shell">
      <header className="site-header">
        <div>
          <h1 className="site-title">Settings</h1>
          <p className="site-subtitle">
            Examination proctoring defaults, local data storage, and sandbox status
          </p>
        </div>
        <button type="button" className="btn btn-secondary" onClick={() => navigate('/')}>
          Back to Home
        </button>
      </header>

      {error && (
        <div className="alert alert-error" role="alert">
          {error}
        </div>
      )}

      {message && (
        <div className="alert alert-success" role="status">
          {message}
        </div>
      )}

      <main className="home-grid">
        <section className="panel">
          <h2>Exam Monitoring Preferences</h2>
          <form onSubmit={handleSave}>
            <div className="form-row">
              <label htmlFor="settings-violation-limit">
                <strong>Default Violation Limit (applies to new attempts only):</strong>
              </label>
              <select
                id="settings-violation-limit"
                value={violationLimit}
                onChange={(e) => setViolationLimit(Number(e.target.value))}
                disabled={loading}
              >
                <option value={3}>3 warnings (4th violation terminates)</option>
                <option value={5}>5 warnings (6th violation terminates)</option>
              </select>
              <button type="submit" className="btn btn-primary" disabled={loading || saving}>
                {saving ? 'Saving...' : 'Save Settings'}
              </button>
            </div>
          </form>
        </section>

        <section className="panel">
          <div className="panel-header-row">
            <h2>Data Storage &amp; Database Backup</h2>
            <button
              type="button"
              className="btn btn-primary btn-sm"
              onClick={handleBackupNow}
              disabled={loading || backingUp}
            >
              {backingUp ? 'Backing up...' : 'Backup Now'}
            </button>
          </div>
          {dataDir && (
            <p>
              <strong>Local Data Folder:</strong> <code>{dataDir}</code>
            </p>
          )}
          <div className="meta-notes">
            <p>
              <strong>How to open the data folder:</strong>
            </p>
            <ul style={{ margin: '6px 0 0', paddingLeft: 20 }}>
              <li>
                <strong>Windows:</strong> Press <code>Win + R</code>, paste the path above, and
                press Enter (or run <code>explorer &quot;{dataDir || '.'}&quot;</code>).
              </li>
              <li>
                <strong>macOS:</strong> In Finder press <code>Cmd + Shift + G</code> and paste the
                data folder path.
              </li>
              <li>
                <strong>Linux:</strong> Run <code>xdg-open &quot;{dataDir || '.'}&quot;</code> in
                your terminal.
              </li>
            </ul>
            <p className="muted-text" style={{ marginTop: 8 }}>
              Backups are written automatically on startup and exam completion inside{' '}
              <code>database/backups/</code> (latest 10 snapshots retained).
            </p>
          </div>
        </section>

        <section className="panel">
          <div className="panel-header-row">
            <h2>Compilers &amp; Sandbox Status</h2>
            <button
              type="button"
              className="btn btn-secondary btn-sm"
              onClick={handleVerifySandbox}
              disabled={loading || rebuilding}
            >
              {rebuilding ? 'Verifying...' : 'Verify Sandbox'}
            </button>
          </div>
          {loading ? (
            <p className="muted-text">Checking local compilers and sandbox...</p>
          ) : compilers ? (
            <>
              <p>
                <strong>Sandbox ready:</strong>{' '}
                {compilers.sandboxReady
                  ? `Yes — ${compilers.sandboxMode || compilers.sandboxDriver || 'active'}`
                  : 'No — see hints below'}
              </p>
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Tool</th>
                    <th>Status</th>
                    <th>Version</th>
                    <th>Path / Install Hint</th>
                  </tr>
                </thead>
                <tbody>
                  {(compilers.tools || []).map((t) => (
                    <tr key={t.tool}>
                      <td>
                        <code>{t.tool}</code>
                      </td>
                      <td>{t.available ? 'Available' : 'Missing'}</td>
                      <td>{t.version || '-'}</td>
                      <td>{t.available ? <code>{t.path}</code> : t.installHint}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </>
          ) : null}
        </section>
      </main>
    </div>
  );
}
