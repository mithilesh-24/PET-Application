import { useEffect } from 'react';
import SafeQuestionText from './SafeQuestionText.jsx';

const LETTERS = ['A', 'B', 'C', 'D'];

export default function MCQOptions({
  options,
  selectedIndex,
  onSelect,
  saveStatus = 'idle',
  onRetry,
  disabled = false,
}) {
  useEffect(() => {
    if (disabled) return undefined;
    const handleKeyDown = (e) => {
      const tag = e.target?.tagName?.toLowerCase();
      if (
        tag === 'input' ||
        tag === 'textarea' ||
        tag === 'select' ||
        e.target?.isContentEditable
      ) {
        if (e.target?.type !== 'radio') return;
      }
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      if (e.key >= '1' && e.key <= '4') {
        const idx = Number(e.key) - 1;
        if (idx < (options?.length || 0)) {
          e.preventDefault();
          onSelect(idx);
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [disabled, options, onSelect]);

  return (
    <div>
      <div className="mcq-options-header">
        <strong>Select one option (shortcuts 1–4):</strong>
        <span
          className={`save-indicator${
            saveStatus === 'saved'
              ? ' save-indicator-saved'
              : saveStatus === 'error'
                ? ' save-indicator-error'
                : ''
          }`}
          role="status"
        >
          {saveStatus === 'saving' && 'Saving...'}
          {saveStatus === 'saved' && 'Saved'}
          {saveStatus === 'error' && (
            <>
              Not saved -{' '}
              <button type="button" className="btn-link" onClick={onRetry}>
                retry
              </button>
            </>
          )}
        </span>
      </div>

      <div className="mcq-options-list" role="radiogroup" aria-label="Answer options">
        {(options || []).map((opt, idx) => {
          const isSelected = selectedIndex === idx;
          return (
            <label key={idx} className={`mcq-option-row${isSelected ? ' selected' : ''}`}>
              <input
                type="radio"
                name="mcq-option"
                value={idx}
                checked={isSelected}
                disabled={disabled}
                onChange={() => onSelect(idx)}
              />
              <span className="mcq-option-letter">{LETTERS[idx]}.</span>
              <span className="mcq-option-text">
                <SafeQuestionText text={opt} inlineOnly />
              </span>
            </label>
          );
        })}
      </div>
    </div>
  );
}
