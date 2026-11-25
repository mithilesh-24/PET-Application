import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import '../styles/codetantra-layout.css';
import '../styles/exam.css';
import MCQOptions from '../components/MCQOptions.jsx';
import ProgressIndicator from '../components/ProgressIndicator.jsx';
import SafeQuestionText from '../components/SafeQuestionText.jsx';
import SnippetBlock from '../components/SnippetBlock.jsx';
import Timer from '../components/Timer.jsx';
import TransitionScreen from '../components/TransitionScreen.jsx';
import {
  getCurrentQuestion,
  getExamState,
  nextQuestion,
  saveAnswer,
  startSection,
  submitSection,
} from '../services/examApi.js';

const SECTION_TITLES = {
  S1: 'Section 1 - Common to All',
  S2: 'Section 2 - Software Only',
  S2A: 'Section 2a - Software Only Coding',
};

const TYPE_LABELS = {
  mcq: 'MCQ',
  snippet: 'Code Snippet',
  coding: 'Coding',
};

export default function Exam() {
  const { attemptId } = useParams();
  const navigate = useNavigate();

  const [examState, setExamState] = useState(null);
  const [questionData, setQuestionData] = useState(null);
  const [selectedIndex, setSelectedIndex] = useState(null);
  const [saveStatus, setSaveStatus] = useState('idle');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);
  const [confirmUnanswered, setConfirmUnanswered] = useState(false);
  const [confirmSubmit, setConfirmSubmit] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(() =>
    typeof document !== 'undefined' ? Boolean(document.fullscreenElement) : false
  );

  const questionHeadingRef = useRef(null);
  const questionLoadedAtRef = useRef(Date.now());
  const accumulatedMsRef = useRef(0);

  useEffect(() => {
    const onFsChange = () => setIsFullscreen(Boolean(document.fullscreenElement));
    document.addEventListener('fullscreenchange', onFsChange);
    return () => document.removeEventListener('fullscreenchange', onFsChange);
  }, []);

  const loadStateAndQuestion = useCallback(async () => {
    setError(null);
    try {
      const state = await getExamState(attemptId);
      setExamState(state);

      if (state.phase === 'in_section') {
        const q = await getCurrentQuestion(attemptId);
        setQuestionData(q);
        setSelectedIndex(q.savedResponse?.selectedIndex ?? null);
        setSaveStatus(q.savedResponse?.selectedIndex !== null ? 'saved' : 'idle');
        accumulatedMsRef.current = q.savedResponse?.timeSpentMs || 0;
        questionLoadedAtRef.current = Date.now();
      } else {
        setQuestionData(null);
      }
    } catch (err) {
      setError(err.message || 'Failed to load examination state.');
    } finally {
      setLoading(false);
    }
  }, [attemptId]);

  useEffect(() => {
    loadStateAndQuestion();
  }, [loadStateAndQuestion]);

  useEffect(() => {
    if (questionData?.question?.id && questionHeadingRef.current) {
      questionHeadingRef.current.focus();
    }
  }, [questionData?.question?.id]);

  function getElapsedTimeMs() {
    return accumulatedMsRef.current + Math.max(0, Date.now() - questionLoadedAtRef.current);
  }

  const handleSelectOption = useCallback(
    async (idx) => {
      if (!questionData?.question) return;
      setSelectedIndex(idx);
      setSaveStatus('saving');
      setError(null);
      try {
        await saveAnswer(attemptId, {
          questionId: questionData.question.id,
          selectedIndex: idx,
          timeSpentMs: getElapsedTimeMs(),
        });
        setSaveStatus('saved');
      } catch (err) {
        setSaveStatus('error');
        if (err.code === 'SECTION_EXPIRED' || err.code === 'ATTEMPT_TERMINATED') {
          await loadStateAndQuestion();
        }
      }
    },
    [attemptId, questionData, loadStateAndQuestion]
  );

  async function handleClearResponse() {
    if (!questionData?.question || busy) return;
    setSelectedIndex(null);
    setSaveStatus('saving');
    try {
      await saveAnswer(attemptId, {
        questionId: questionData.question.id,
        selectedIndex: null,
        timeSpentMs: getElapsedTimeMs(),
      });
      setSaveStatus('idle');
    } catch {
      setSaveStatus('error');
    }
  }

  const proceedToNext = useCallback(
    async (unansweredFlag = false) => {
      if (!questionData?.question || busy) return;
      setBusy(true);
      setError(null);
      try {
        if (
          questionData.question.type !== 'coding' &&
          selectedIndex !== null &&
          saveStatus !== 'saved'
        ) {
          await saveAnswer(attemptId, {
            questionId: questionData.question.id,
            selectedIndex,
            timeSpentMs: getElapsedTimeMs(),
          });
          setSaveStatus('saved');
        }
        const nextQ = await nextQuestion(attemptId, {
          unanswered: unansweredFlag,
          questionId: questionData.question.id,
        });
        setQuestionData(nextQ);
        setSelectedIndex(nextQ.savedResponse?.selectedIndex ?? null);
        setSaveStatus(nextQ.savedResponse?.selectedIndex !== null ? 'saved' : 'idle');
        accumulatedMsRef.current = nextQ.savedResponse?.timeSpentMs || 0;
        questionLoadedAtRef.current = Date.now();
        setConfirmUnanswered(false);
        const state = await getExamState(attemptId);
        setExamState(state);
      } catch (err) {
        setError(err.message || 'Could not advance to next question.');
        if (err.code === 'SECTION_EXPIRED' || err.code === 'ATTEMPT_TERMINATED') {
          await loadStateAndQuestion();
        }
      } finally {
        setBusy(false);
      }
    },
    [attemptId, busy, questionData, selectedIndex, saveStatus, loadStateAndQuestion]
  );

  const handleSaveAndNextClick = useCallback(() => {
    if (!questionData?.question || busy) return;
    const isLast = questionData.questionNumber >= questionData.totalInSection;
    if (isLast) {
      setConfirmSubmit(true);
      return;
    }
    if (questionData.question.type !== 'coding' && selectedIndex === null) {
      setConfirmUnanswered(true);
      return;
    }
    if (questionData.question.type === 'coding' && !questionData.codingDraft?.hasSubmitted) {
      setConfirmUnanswered(true);
      return;
    }
    proceedToNext(false);
  }, [busy, proceedToNext, questionData, selectedIndex]);

  useEffect(() => {
    if (examState?.phase !== 'in_section' || confirmUnanswered || confirmSubmit) {
      return undefined;
    }
    const handleEnter = (e) => {
      if (e.key !== 'Enter') return;
      const tag = e.target?.tagName?.toLowerCase();
      if (tag === 'button' || tag === 'textarea' || tag === 'a') return;
      e.preventDefault();
      handleSaveAndNextClick();
    };
    window.addEventListener('keydown', handleEnter);
    return () => window.removeEventListener('keydown', handleEnter);
  }, [examState?.phase, confirmUnanswered, confirmSubmit, handleSaveAndNextClick]);

  async function handleConfirmSubmitSection() {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      if (
        questionData?.question &&
        questionData.question.type !== 'coding' &&
        selectedIndex !== null &&
        saveStatus !== 'saved'
      ) {
        await saveAnswer(attemptId, {
          questionId: questionData.question.id,
          selectedIndex,
          timeSpentMs: getElapsedTimeMs(),
        });
      }
      await submitSection(attemptId);
      setConfirmSubmit(false);
      await loadStateAndQuestion();
    } catch (err) {
      setError(err.message || 'Could not submit section.');
    } finally {
      setBusy(false);
    }
  }

  async function handleStartSection(sectionName) {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      await startSection(attemptId, sectionName);
      await loadStateAndQuestion();
    } catch (err) {
      setError(err.message || 'Could not start section.');
    } finally {
      setBusy(false);
    }
  }

  if (loading) {
    return (
      <div className="exam-shell">
        <div className="transition-card">
          <h1>Loading Examination...</h1>
        </div>
      </div>
    );
  }

  if (error && !examState) {
    return (
      <div className="exam-shell">
        <div className="transition-card">
          <h1>Examination Unavailable</h1>
          <div className="alert alert-error" role="alert">
            {error}
          </div>
          <button type="button" className="btn btn-secondary" onClick={() => navigate('/')}>
            Return Home
          </button>
        </div>
      </div>
    );
  }

  if (examState?.phase === 'completed' || examState?.phase === 'terminated') {
    return (
      <div className="exam-shell">
        <div className="transition-card">
          <h1>
            {examState.phase === 'terminated' ? 'Examination Terminated' : 'Examination Completed'}
          </h1>
          {examState.terminationReason && (
            <div className="alert alert-error" role="alert">
              Reason: {examState.terminationReason}
            </div>
          )}
          <p>Your submitted responses have been recorded on the server. View your results below.</p>
          <div style={{ display: 'flex', gap: 10 }}>
            <button
              type="button"
              className="btn btn-primary"
              onClick={() => navigate(`/results/${encodeURIComponent(attemptId)}`)}
            >
              View Results
            </button>
            <button type="button" className="btn btn-secondary" onClick={() => navigate('/')}>
              Return Home
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (examState?.phase === 'not_started' || examState?.phase === 'transition') {
    return (
      <div className="exam-shell">
        <header className="exam-topbar">
          <div className="exam-topbar-left">
            <span className="exam-title">{examState.paperTitle}</span>
            <span className="exam-candidate">Candidate: KEC CSE</span>
          </div>
          <div className="exam-topbar-center">Section Transition</div>
          <div className="exam-topbar-right">
            <span className="exam-status-pill">{examState.status}</span>
          </div>
        </header>
        {error && (
          <div className="alert alert-error" style={{ margin: '12px 16px 0' }} role="alert">
            {error}
          </div>
        )}
        <TransitionScreen
          lastSubmittedSection={examState.lastSubmittedSection}
          nextSection={examState.nextSection || 'S1'}
          transitionDeadlineAt={examState.transitionDeadlineAt}
          serverNow={examState.serverNow}
          onStartSection={handleStartSection}
          onPollState={loadStateAndQuestion}
          starting={busy}
        />
      </div>
    );
  }

  const q = questionData?.question;
  const isLastQuestion = questionData && questionData.questionNumber >= questionData.totalInSection;

  return (
    <div className="exam-shell">
      <header className="exam-topbar">
        <div className="exam-topbar-left">
          <span className="exam-title">{examState?.paperTitle}</span>
          <span className="exam-candidate">Candidate: KEC CSE</span>
        </div>
        <div className="exam-topbar-center">
          {SECTION_TITLES[examState?.currentSection] || examState?.currentSection}
        </div>
        <div className="exam-topbar-right">
          <Timer
            deadlineAt={questionData?.deadlineAt ?? examState?.deadlineAt}
            serverNow={questionData?.serverNow ?? examState?.serverNow}
            onSync={loadStateAndQuestion}
            onExpire={loadStateAndQuestion}
          />
          <span className="exam-status-pill">
            {isFullscreen ? 'Fullscreen: Active' : 'Fullscreen: Off'}
          </span>
          <span className="exam-status-pill">In Progress</span>
        </div>
      </header>

      {q && (
        <div className="exam-subbar">
          <div className="exam-subbar-left">
            <strong>
              Question {questionData.questionNumber} of {questionData.totalInSection}
            </strong>
            <span className="exam-badge">
              {q.category || q.domain} · {q.topic}
            </span>
          </div>
          <div className="exam-subbar-right">
            <span className="exam-badge exam-badge-marks">
              {q.marks} {q.marks === 1 ? 'Mark' : 'Marks'}
            </span>
            <span className="exam-badge">{TYPE_LABELS[q.type] || q.type}</span>
          </div>
        </div>
      )}

      {error && (
        <div className="alert alert-error" style={{ margin: '10px 16px 0' }} role="alert">
          {error}
        </div>
      )}

      {q && (
        <main className="exam-body">
          <section className="exam-question-col" aria-label="Question workspace">
            <h2
              ref={questionHeadingRef}
              tabIndex={-1}
              className="question-heading-focus"
              style={{ margin: 0, fontSize: 16 }}
            >
              {q.type === 'coding'
                ? `${q.id}: ${q.title}`
                : `Question ${questionData.questionNumber}`}
            </h2>

            {q.type === 'snippet' && <SnippetBlock language={q.language} code={q.code} />}

            {q.type !== 'coding' ? (
              <>
                <SafeQuestionText text={q.text} />
                <MCQOptions
                  options={q.options}
                  selectedIndex={selectedIndex}
                  onSelect={handleSelectOption}
                  saveStatus={saveStatus}
                  onRetry={() => selectedIndex !== null && handleSelectOption(selectedIndex)}
                  disabled={busy}
                />
              </>
            ) : (
              <div className="question-text-block">
                <p>{q.statement}</p>
                <p>
                  <strong>Input Format:</strong> {q.inputFormat}
                </p>
                <p>
                  <strong>Output Format:</strong> {q.outputFormat}
                </p>
                <p>
                  <strong>Constraints:</strong> {q.constraints}
                </p>
                <p className="muted-text">
                  (Interactive Monaco editor &amp; hidden-test judge arrive in M9.)
                </p>
              </div>
            )}
          </section>

          <ProgressIndicator
            currentIndex={questionData.index}
            totalInSection={questionData.totalInSection}
            answeredCount={questionData.answeredCount}
            unansweredCount={questionData.unansweredCount}
            secondsRemaining={questionData.secondsRemaining}
            violationCount={examState.violationCount}
            violationLimit={examState.violationLimit}
          />
        </main>
      )}

      <footer className="exam-actionbar">
        <div className="exam-actionbar-left">
          <button
            type="button"
            className="btn btn-secondary"
            disabled={busy || !q || q.type === 'coding' || selectedIndex === null}
            onClick={handleClearResponse}
          >
            Clear Response
          </button>
        </div>

        <div className="exam-actionbar-right">
          <button
            type="button"
            className="btn btn-secondary"
            disabled
            title="Not allowed in this examination"
          >
            Previous
          </button>

          {isLastQuestion ? (
            <button
              type="button"
              className="btn btn-primary"
              disabled={busy}
              onClick={handleSaveAndNextClick}
            >
              Save and Submit Section
            </button>
          ) : (
            <button
              type="button"
              className="btn btn-primary"
              disabled={busy}
              onClick={handleSaveAndNextClick}
            >
              Save and Next
            </button>
          )}
        </div>
      </footer>

      {confirmUnanswered && (
        <div
          className="exam-dialog-backdrop"
          role="dialog"
          aria-modal="true"
          aria-label="Confirm unanswered navigation"
        >
          <div className="exam-dialog">
            <h2>Proceed Without Answering?</h2>
            <p>
              You have not saved an answer for this question. Navigation is forward-only, so you
              will not be able to return to it.
            </p>
            <div className="exam-dialog-actions">
              <button
                type="button"
                className="btn btn-secondary"
                onClick={() => setConfirmUnanswered(false)}
              >
                Stay on Question
              </button>
              <button
                type="button"
                className="btn btn-primary"
                disabled={busy}
                onClick={() => proceedToNext(true)}
              >
                Skip &amp; Continue
              </button>
            </div>
          </div>
        </div>
      )}

      {confirmSubmit && (
        <div
          className="exam-dialog-backdrop"
          role="dialog"
          aria-modal="true"
          aria-label="Confirm section submission"
        >
          <div className="exam-dialog">
            <h2>Submit Section?</h2>
            <p>Once submitted, this section is permanently locked and cannot be reopened.</p>
            <div className="exam-dialog-actions">
              <button
                type="button"
                className="btn btn-secondary"
                onClick={() => setConfirmSubmit(false)}
              >
                Cancel
              </button>
              <button
                type="button"
                className="btn btn-primary"
                disabled={busy}
                onClick={handleConfirmSubmitSection}
              >
                Confirm Submit Section
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
