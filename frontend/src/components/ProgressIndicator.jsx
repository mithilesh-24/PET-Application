import { formatHHMMSS } from '../services/timeFormat.js';

export default function ProgressIndicator({
  currentIndex,
  totalInSection,
  answeredCount,
  unansweredCount,
  secondsRemaining,
  violationCount,
  violationLimit,
}) {
  const seenCount = Math.min(totalInSection, (currentIndex ?? 0) + 1);
  const progressPct = totalInSection > 0 ? Math.round((seenCount / totalInSection) * 100) : 0;

  return (
    <aside className="exam-info-col" aria-label="Section information panel">
      <h2 className="info-panel-heading">Section Summary</h2>

      <div>
        <div className="muted-text" style={{ marginBottom: 6 }}>
          {seenCount} of {totalInSection} answered/seen
        </div>
        <div
          className="progress-bar-track"
          role="progressbar"
          aria-valuenow={seenCount}
          aria-valuemin={0}
          aria-valuemax={totalInSection}
        >
          <div className="progress-bar-fill" style={{ width: `${progressPct}%` }} />
        </div>
      </div>

      <div className="info-stats-grid">
        <div className="info-stat-box">
          <span className="info-stat-label">Current</span>
          <span className="info-stat-val">
            {currentIndex + 1} / {totalInSection}
          </span>
        </div>
        <div className="info-stat-box">
          <span className="info-stat-label">Time Left</span>
          <span className="info-stat-val">{formatHHMMSS(secondsRemaining)}</span>
        </div>
        <div className="info-stat-box">
          <span className="info-stat-label">Answered</span>
          <span className="info-stat-val">{answeredCount}</span>
        </div>
        <div className="info-stat-box">
          <span className="info-stat-label">Unanswered</span>
          <span className="info-stat-val">{unansweredCount}</span>
        </div>
      </div>

      <div className="info-stat-box">
        <span className="info-stat-label">Violations Used</span>
        <span className="info-stat-val">
          {violationCount} / {violationLimit}
        </span>
      </div>

      <div>
        <p className="display-grid-note">
          Question Sequence (display only — forward navigation only)
        </p>
        <div className="display-number-grid" aria-label="Question sequence indicator">
          {Array.from({ length: totalInSection }, (_, idx) => {
            const stateClass = idx === currentIndex ? 'current' : idx < currentIndex ? 'seen' : '';
            return (
              <span
                key={idx}
                aria-disabled="true"
                className={`display-num-cell${stateClass ? ` ${stateClass}` : ''}`}
              >
                {idx + 1}
              </span>
            );
          })}
        </div>
      </div>
    </aside>
  );
}
