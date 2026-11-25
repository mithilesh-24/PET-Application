import { useRef, useState } from 'react';
import { importPaperFiles } from '../services/paperApi.js';

const MAX_FILE_BYTES = 10 * 1024 * 1024;
const ALLOWED_EXTENSIONS = ['.petdraft', '.pet'];

function hasAllowedExtension(name) {
  const lower = (name || '').toLowerCase();
  return ALLOWED_EXTENSIONS.some((ext) => lower.endsWith(ext));
}

function classifyErrorSection(err) {
  const path = err?.path || '';
  if (path.startsWith('section1')) return 'Section 1 (Aptitude / Reasoning / Verbal)';
  if (path.startsWith('section2a')) return 'Section 2a (Coding)';
  if (path.startsWith('section2')) return 'Section 2 (Department MCQs & Snippets)';
  return 'General / Metadata';
}

function extractQuestionIdHint(err) {
  const msg = err?.message || '';
  const match = msg.match(/\b(S1-[A-Z]+-\d+|S2-[A-Z0-9]+-\d+|S2A-\d+)\b/);
  if (match) return match[1];
  return err?.path || '$';
}

export default function PaperUploader({ onImported, onGoInstructions }) {
  const inputRef = useRef(null);
  const [files, setFiles] = useState([]);
  const [dragActive, setDragActive] = useState(false);
  const [clientError, setClientError] = useState(null);
  const [serverError, setServerError] = useState(null);
  const [importing, setImporting] = useState(false);
  const [summary, setSummary] = useState(null);

  function validateClientSelection(incomingList) {
    const arr = Array.from(incomingList || []);
    if (arr.length === 0) return null;
    if (arr.length > 3) {
      return 'You can upload at most 3 files (Parts A, B, and C, or 1 full paper).';
    }
    for (const file of arr) {
      if (!hasAllowedExtension(file.name)) {
        return `Unsupported file "${file.name}". Only .petdraft and .pet files are accepted.`;
      }
      if (file.size > MAX_FILE_BYTES) {
        return `File "${file.name}" exceeds the 10 MB per-file limit.`;
      }
    }
    return null;
  }

  function handleSelectFiles(fileList) {
    const arr = Array.from(fileList || []);
    setSummary(null);
    setServerError(null);
    const err = validateClientSelection(arr);
    if (err) {
      setClientError(err);
      setFiles([]);
      return;
    }
    setClientError(null);
    setFiles(arr);
  }

  function handleDrop(e) {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
    handleSelectFiles(e.dataTransfer?.files);
  }

  function removeFile(index) {
    setFiles((prev) => prev.filter((_, i) => i !== index));
    setClientError(null);
    setServerError(null);
  }

  async function handleImport() {
    if (files.length === 0) {
      setClientError('Please select 1 to 3 .petdraft files (or 1 .pet file).');
      return;
    }
    setImporting(true);
    setClientError(null);
    setServerError(null);
    setSummary(null);

    try {
      const result = await importPaperFiles(files);
      setSummary(result.summary);
      setFiles([]);
      if (typeof onImported === 'function') {
        onImported(result);
      }
    } catch (err) {
      setServerError({
        code: err.code || 'PAPER_INVALID',
        message: err.message || 'Import failed.',
        errors: err.details?.errors || [],
      });
    } finally {
      setImporting(false);
    }
  }

  const groupedErrors = (serverError?.errors || []).reduce((acc, item) => {
    const group = classifyErrorSection(item);
    if (!acc[group]) acc[group] = [];
    acc[group].push(item);
    return acc;
  }, {});

  return (
    <div className="uploader-box">
      <div
        className={`dropzone${dragActive ? ' dropzone-active' : ''}`}
        onDragOver={(e) => {
          e.preventDefault();
          setDragActive(true);
        }}
        onDragLeave={() => setDragActive(false)}
        onDrop={handleDrop}
        onClick={() => inputRef.current?.click()}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            inputRef.current?.click();
          }
        }}
        aria-label="Drop .petdraft or .pet files here or click to browse"
      >
        <input
          ref={inputRef}
          type="file"
          multiple
          accept=".petdraft,.pet"
          className="visually-hidden"
          onChange={(e) => {
            handleSelectFiles(e.target.files);
            e.target.value = '';
          }}
        />
        <p className="dropzone-title">Drag and drop 1 to 3 question paper files here</p>
        <p className="dropzone-sub">
          Accepted: <code>.petdraft</code> (single full or Parts A, B, C) or <code>.pet</code> — max
          10 MB per file
        </p>
        <button
          type="button"
          className="btn btn-secondary"
          onClick={(e) => {
            e.stopPropagation();
            inputRef.current?.click();
          }}
        >
          Choose Files
        </button>
      </div>

      {files.length > 0 && (
        <ul className="file-list" aria-label="Selected files">
          {files.map((file, idx) => (
            <li key={`${file.name}-${idx}`} className="file-list-item">
              <span>
                <strong>{file.name}</strong> ({(file.size / 1024).toFixed(1)} KB)
              </span>
              <button type="button" className="btn-link" onClick={() => removeFile(idx)}>
                Remove
              </button>
            </li>
          ))}
        </ul>
      )}

      {clientError && (
        <div className="alert alert-error" role="alert">
          {clientError}
        </div>
      )}

      <div className="uploader-actions">
        <button
          type="button"
          className="btn btn-primary"
          disabled={importing || files.length === 0}
          onClick={handleImport}
        >
          {importing ? 'Validating & Encrypting...' : 'Upload & Verify Paper'}
        </button>
      </div>

      {serverError && (
        <div className="alert alert-error" role="alert">
          <div className="alert-title">
            Import rejected ({serverError.code}): {serverError.message}
          </div>
          {Object.keys(groupedErrors).length > 0 && (
            <div className="grouped-errors">
              {Object.entries(groupedErrors).map(([section, items]) => (
                <div key={section} className="error-group">
                  <h4>{section}</h4>
                  <ul>
                    {items.map((item, idx) => (
                      <li key={`${item.code}-${idx}`}>
                        <code>{extractQuestionIdHint(item)}</code> — {item.message}
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {summary && (
        <div className="alert alert-success" role="status">
          <div className="alert-title">Paper verified and encrypted: {summary.title}</div>
          <p className="summary-meta">
            Paper ID: <code>{summary.paperId}</code> · Section 1: {summary.counts.section1} Qs ·
            Section 2: {summary.counts.section2} Qs · Section 2a: {summary.counts.section2a} Qs ·
            Total: {summary.totalMarks} Marks · Tree/Graph requirement:{' '}
            {summary.treeOrGraphSatisfied ? 'Satisfied' : 'Not satisfied'}
          </p>
          {summary.warnings?.length > 0 && (
            <ul className="warning-list">
              {summary.warnings.map((w, idx) => (
                <li key={idx}>Warning: {w.message}</li>
              ))}
            </ul>
          )}
          {typeof onGoInstructions === 'function' && (
            <button
              type="button"
              className="btn btn-primary"
              onClick={() => onGoInstructions(summary.paperId)}
            >
              Go to Exam Instructions
            </button>
          )}
        </div>
      )}
    </div>
  );
}
