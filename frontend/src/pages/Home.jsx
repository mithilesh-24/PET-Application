import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import PaperUploader from '../components/PaperUploader.jsx';
import { deletePaper, listPapers } from '../services/paperApi.js';
import {
  GENERATION_PROMPT,
  copyPromptToClipboard,
  downloadPromptAsTxt,
} from '../services/promptService.js';

export default function Home() {
  const navigate = useNavigate();
  const [papers, setPapers] = useState([]);
  const [loadingPapers, setLoadingPapers] = useState(true);
  const [papersError, setPapersError] = useState(null);
  const [toast, setToast] = useState(null);
  const [showPromptPreview, setShowPromptPreview] = useState(false);
  const [showUploadModal, setShowUploadModal] = useState(false);

  async function refreshPapers() {
    setLoadingPapers(true);
    setPapersError(null);
    try {
      const data = await listPapers();
      setPapers(data.papers || []);
    } catch (err) {
      setPapersError(err.message || 'Could not load imported papers.');
    } finally {
      setLoadingPapers(false);
    }
  }

  useEffect(() => {
    refreshPapers();
  }, []);

  async function handleCopyPrompt() {
    try {
      await copyPromptToClipboard();
      setToast('PET question-generation prompt copied successfully.');
      setTimeout(() => setToast(null), 4000);
    } catch {
      setToast('Copy failed. Please expand the prompt preview or download as .txt.');
    }
  }

  async function handleDeletePaper(paper) {
    if (!window.confirm(`Delete "${paper.title}" (${paper.paperId}) and its encrypted package?`)) {
      return;
    }
    try {
      await deletePaper(paper.id);
      await refreshPapers();
    } catch (err) {
      setPapersError(err.message || 'Failed to delete paper.');
    }
  }

  return (
    <div className="academic-shell">
      <header className="site-header">
        <div>
          <h1 className="site-title">PET PREP</h1>
          <p className="site-subtitle">Your Personal PET Examination Preparation Platform</p>
        </div>
        <nav className="header-nav" aria-label="Primary actions">
          <button type="button" className="btn btn-primary" onClick={handleCopyPrompt}>
            Copy AI Question Generation Prompt
          </button>
          <button
            type="button"
            className="btn btn-secondary"
            onClick={() => setShowUploadModal(true)}
          >
            Upload Question Paper
          </button>
          <button type="button" className="btn btn-secondary" onClick={() => navigate('/history')}>
            Past Tests
          </button>
          <button type="button" className="btn btn-secondary" onClick={() => navigate('/syllabus')}>
            View Syllabus
          </button>
          <button type="button" className="btn btn-secondary" onClick={() => navigate('/settings')}>
            Settings
          </button>
        </nav>
      </header>

      {toast && (
        <div className="toast-banner" role="status" aria-live="polite">
          {toast}
        </div>
      )}

      <section className="stat-strip" aria-label="Examination overview">
        <div className="stat-item">
          <span className="stat-value">3</span>
          <span className="stat-label">Sections</span>
        </div>
        <div className="stat-item">
          <span className="stat-value">67</span>
          <span className="stat-label">Questions</span>
        </div>
        <div className="stat-item">
          <span className="stat-value">100</span>
          <span className="stat-label">Marks</span>
        </div>
        <div className="stat-item">
          <span className="stat-value">150</span>
          <span className="stat-label">Minutes</span>
        </div>
        <div className="stat-item">
          <span className="stat-value">4</span>
          <span className="stat-label">Languages</span>
        </div>
      </section>

      <main className="home-grid">
        <section className="panel">
          <h2>Generate Your PET Mock Test</h2>
          <ol className="steps-list">
            <li>Copy the AI Question Generation Prompt using the button above.</li>
            <li>Open an external AI assistant (ChatGPT, Gemini, or Claude).</li>
            <li>
              Paste the prompt to generate Part A, then reply <code>next</code> for Part B and{' '}
              <code>next</code> for Part C.
            </li>
            <li>
              Download the generated <code>.petdraft</code> files (or save the JSON code blocks as{' '}
              <code>.petdraft</code>).
            </li>
            <li>
              Upload the 1 to 3 files here (or via the <Link to="/upload">Upload page</Link>) to
              validate, verify, and encrypt the paper.
            </li>
            <li>Start your timed 150-minute mock examination.</li>
          </ol>

          <div className="meta-notes">
            <p>
              <strong>Supported external AI tools:</strong> ChatGPT, Gemini, Claude
            </p>
            <p>
              <strong>Accepted file extensions:</strong> <code>.petdraft</code>, and{' '}
              <code>.pet</code> for packages exported from this app
            </p>
            <p className="local-privacy-note">
              All exam data, encryption keys, SQLite history, and Docker code execution stay
              strictly on this computer. No external AI or compiler API is called by PET Prep.
            </p>
          </div>

          <div className="prompt-tools">
            <button
              type="button"
              className="btn btn-secondary"
              onClick={() => setShowPromptPreview((v) => !v)}
              aria-expanded={showPromptPreview}
            >
              {showPromptPreview ? 'Hide Prompt Preview' : 'Show Prompt Preview'}
            </button>
            <button type="button" className="btn-link" onClick={downloadPromptAsTxt}>
              Download as .txt
            </button>
          </div>

          {showPromptPreview && (
            <div className="prompt-preview-wrap">
              <textarea
                readOnly
                value={GENERATION_PROMPT}
                rows={12}
                className="prompt-preview"
                aria-label="AI question generation prompt preview"
              />
            </div>
          )}
        </section>

        <section className="panel">
          <div className="panel-header-row">
            <h2>Imported Question Papers</h2>
            <button type="button" className="btn btn-secondary" onClick={() => navigate('/upload')}>
              Open Upload Page
            </button>
          </div>

          {papersError && (
            <div className="alert alert-error" role="alert">
              {papersError}
            </div>
          )}

          {loadingPapers ? (
            <p className="muted-text">Loading stored papers...</p>
          ) : papers.length === 0 ? (
            <div className="empty-state">
              <p>No verified question papers imported yet.</p>
              <p className="muted-text">
                Generate a <code>.petdraft</code> paper using the prompt and click{' '}
                <strong>Upload Question Paper</strong> to begin.
              </p>
            </div>
          ) : (
            <table className="data-table">
              <thead>
                <tr>
                  <th>Title</th>
                  <th>Paper ID</th>
                  <th>Questions</th>
                  <th>Marks</th>
                  <th>Imported</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {papers.map((paper) => (
                  <tr key={paper.id}>
                    <td>{paper.title}</td>
                    <td>
                      <code>{paper.paperId}</code>
                    </td>
                    <td>{paper.questionCount}</td>
                    <td>{paper.totalMarks}</td>
                    <td>{new Date(paper.createdAt).toLocaleDateString()}</td>
                    <td className="table-actions">
                      <button
                        type="button"
                        className="btn btn-primary btn-sm"
                        onClick={() =>
                          navigate(`/instructions/${encodeURIComponent(paper.paperId)}`)
                        }
                      >
                        Start Exam
                      </button>
                      <button
                        type="button"
                        className="btn btn-secondary btn-sm"
                        onClick={() => handleDeletePaper(paper)}
                      >
                        Delete
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </section>
      </main>

      {showUploadModal && (
        <div
          className="modal-backdrop"
          role="dialog"
          aria-modal="true"
          aria-label="Upload Question Paper"
        >
          <div className="modal-card">
            <div className="modal-header">
              <h2>Upload Question Paper</h2>
              <button
                type="button"
                className="btn btn-secondary btn-sm"
                onClick={() => setShowUploadModal(false)}
              >
                Close
              </button>
            </div>
            <PaperUploader
              onImported={() => {
                refreshPapers();
              }}
              onGoInstructions={(paperId) => {
                setShowUploadModal(false);
                navigate(`/instructions/${encodeURIComponent(paperId)}`);
              }}
            />
          </div>
        </div>
      )}
    </div>
  );
}
