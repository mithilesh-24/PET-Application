import { useEffect, useRef, useState } from 'react';

const SECTION_DESCRIPTIONS = {
  S1: {
    title: 'Section 1 — Common to All',
    details: '40 MCQs (Aptitude 15, Reasoning 15, Verbal 10) · 40 Marks · 50 Minutes',
  },
  S2: {
    title: 'Section 2 — Software Only',
    details: '20 Department MCQs (CC01–CC05) + 5 Code Snippets · 40 Marks · 50 Minutes',
  },
  S2A: {
    title: 'Section 2a — Software Only Coding',
    details: '2 Coding Problems (1 Medium, 1 Hard) · 20 Marks · 50 Minutes',
  },
};

const SECTION_LABELS = {
  S1: 'Section 1',
  S2: 'Section 2',
  S2A: 'Section 2a',
};

export default function TransitionScreen({
  lastSubmittedSection,
  nextSection,
  transitionDeadlineAt,
  serverNow,
  onStartSection,
  onPollState,
  starting,
}) {
  const [offsetMs] = useState(() => (typeof serverNow === 'number' ? serverNow - Date.now() : 0));
  const [secondsLeft, setSecondsLeft] = useState(() => {
    if (!transitionDeadlineAt) return 0;
    const approxNow = typeof serverNow === 'number' ? serverNow : Date.now();
    return Math.max(0, Math.ceil((transitionDeadlineAt - approxNow) / 1000));
  });
  const expiredRef = useRef(false);

  useEffect(() => {
    if (!transitionDeadlineAt) return undefined;
    expiredRef.current = false;

    const timer = setInterval(() => {
      const rem = Math.max(0, Math.ceil((transitionDeadlineAt - (Date.now() + offsetMs)) / 1000));
      setSecondsLeft(rem);
      if (rem === 0 && !expiredRef.current) {
        expiredRef.current = true;
        onPollState();
      }
    }, 500);

    return () => clearInterval(timer);
  }, [transitionDeadlineAt, offsetMs, onPollState]);

  const nextInfo = SECTION_DESCRIPTIONS[nextSection] || {
    title: nextSection,
    details: '',
  };

  return (
    <div className="transition-card">
      {lastSubmittedSection ? (
        <>
          <h1>
            {SECTION_LABELS[lastSubmittedSection.section] || lastSubmittedSection.section}{' '}
            {lastSubmittedSection.status === 'expired' ? 'expired' : 'submitted'}.{' '}
            {lastSubmittedSection.answeredCount} of {lastSubmittedSection.totalInSection} answered.
          </h1>
          <p className="muted-text">
            Your responses for this section are locked. No scores are shown until the examination is
            completed.
          </p>
        </>
      ) : (
        <h1>Ready to begin {nextInfo.title}</h1>
      )}

      <div className="panel" style={{ marginTop: 16, marginBottom: 16 }}>
        <h2>Up Next: {nextInfo.title}</h2>
        <p>{nextInfo.details}</p>
        <ul className="rules-list">
          <li>Navigation is strictly forward-only. You cannot return to previous questions.</li>
          <li>The section timer starts immediately and runs on the server.</li>
        </ul>
        {transitionDeadlineAt && (
          <p>
            Auto-starting in <span className="transition-countdown">{secondsLeft}s</span> (clicking
            Start Section begins immediately).
          </p>
        )}
      </div>

      <button
        type="button"
        className="btn btn-primary"
        disabled={starting}
        onClick={() => onStartSection(nextSection)}
      >
        {starting ? 'Starting Section...' : `Start ${SECTION_LABELS[nextSection] || nextSection}`}
      </button>
    </div>
  );
}
