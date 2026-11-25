import { useCallback, useEffect, useRef, useState } from 'react';
import CodeEditor from './CodeEditor.jsx';
import CompilerOutput from './CompilerOutput.jsx';
import ProgressIndicator from './ProgressIndicator.jsx';
import { runCode, saveCodeDraft, submitCode } from '../services/examApi.js';

const STARTER_TEMPLATES = {
  c: `#include <stdio.h>

int main(void) {
    // Fast I/O: use scanf / printf
    return 0;
}
`,
  cpp: `#include <bits/stdc++.h>
using namespace std;

int main() {
    ios::sync_with_stdio(false);
    cin.tie(nullptr);

    return 0;
}
`,
  java: `import java.io.*;
import java.util.*;

public class Main {
    public static void main(String[] args) throws Exception {
        BufferedReader br = new BufferedReader(new InputStreamReader(System.in));
        // Write your solution inside Main
    }
}
`,
  python: `import sys

def solve():
    data = sys.stdin.read().split()
    # Write your solution here

if __name__ == "__main__":
    solve()
`,
};

export default function CodingWorkspace({
  attemptId,
  question,
  codingDraft,
  questionIndex,
  totalInSection,
  answeredCount,
  unansweredCount,
  secondsRemaining,
  violationCount,
  violationLimit,
  onSubmittedSuccess,
  registerSaveDraftAction,
}) {
  const storageKey = `pet_coding_split_${attemptId}`;
  const [problemWidthPct, setProblemWidthPct] = useState(() => {
    try {
      const saved = Number(localStorage.getItem(storageKey));
      if (Number.isFinite(saved) && saved >= 25 && saved <= 65) return saved;
    } catch {
      // Ignore storage failures
    }
    return 40;
  });
  const [outputHeightPx, setOutputHeightPx] = useState(230);

  const initialLang = codingDraft?.finalLanguage || 'cpp';
  const [language, setLanguage] = useState(initialLang);
  const [draftsByLang, setDraftsByLang] = useState(() => ({
    c: codingDraft?.draftsByLanguage?.c ?? STARTER_TEMPLATES.c,
    cpp: codingDraft?.draftsByLanguage?.cpp ?? STARTER_TEMPLATES.cpp,
    java: codingDraft?.draftsByLanguage?.java ?? STARTER_TEMPLATES.java,
    python: codingDraft?.draftsByLanguage?.python ?? STARTER_TEMPLATES.python,
  }));
  const [fontSize, setFontSize] = useState(14);
  const [activeTab, setActiveTab] = useState('input');
  const [customInput, setCustomInput] = useState(() => question?.samples?.[0]?.input || '');
  const [runResult, setRunResult] = useState(null);
  const [submitResult, setSubmitResult] = useState(null);
  const [execError, setExecError] = useState(null);
  const [running, setRunning] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [draftStatus, setDraftStatus] = useState('idle');
  const [copiedSampleIdx, setCopiedSampleIdx] = useState(null);

  const splitContainerRef = useRef(null);
  const rightPaneRef = useRef(null);
  const latestDraftRef = useRef({ language, source: draftsByLang[language] || '' });

  useEffect(() => {
    latestDraftRef.current = { language, source: draftsByLang[language] || '' };
  }, [language, draftsByLang]);

  // Reset state when switching between S2A-01 and S2A-02
  useEffect(() => {
    const lang = codingDraft?.finalLanguage || 'cpp';
    setLanguage(lang);
    setDraftsByLang({
      c: codingDraft?.draftsByLanguage?.c ?? STARTER_TEMPLATES.c,
      cpp: codingDraft?.draftsByLanguage?.cpp ?? STARTER_TEMPLATES.cpp,
      java: codingDraft?.draftsByLanguage?.java ?? STARTER_TEMPLATES.java,
      python: codingDraft?.draftsByLanguage?.python ?? STARTER_TEMPLATES.python,
    });
    setCustomInput(question?.samples?.[0]?.input || '');
    setRunResult(null);
    setSubmitResult(null);
    setExecError(null);
    setActiveTab('input');
  }, [question?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const persistDraft = useCallback(
    async (langToSave, sourceToSave) => {
      if (!question?.id) return;
      setDraftStatus('saving');
      try {
        await saveCodeDraft(attemptId, {
          questionId: question.id,
          language: langToSave,
          source: sourceToSave,
        });
        setDraftStatus('saved');
      } catch {
        setDraftStatus('error');
      }
    },
    [attemptId, question?.id]
  );

  // Register Save Draft footer action
  useEffect(() => {
    if (typeof registerSaveDraftAction === 'function') {
      registerSaveDraftAction(() =>
        persistDraft(latestDraftRef.current.language, latestDraftRef.current.source)
      );
    }
  }, [persistDraft, registerSaveDraftAction]);

  // Autosave every 10 seconds
  useEffect(() => {
    const id = setInterval(() => {
      const { language: langNow, source: srcNow } = latestDraftRef.current;
      persistDraft(langNow, srcNow);
    }, 10000);
    return () => clearInterval(id);
  }, [persistDraft]);

  function handleCodeChange(nextCode) {
    setDraftsByLang((prev) => ({ ...prev, [language]: nextCode }));
    setDraftStatus('idle');
  }

  async function handleLanguageChange(nextLang) {
    if (nextLang === language) return;
    await persistDraft(language, draftsByLang[language] || '');
    setLanguage(nextLang);
    setExecError(null);
  }

  function handleResetTemplate() {
    if (
      !window.confirm(
        'Reset editor to starter template? Your current code for this language will be overwritten.'
      )
    ) {
      return;
    }
    const tmpl = STARTER_TEMPLATES[language] || '';
    setDraftsByLang((prev) => ({ ...prev, [language]: tmpl }));
    persistDraft(language, tmpl);
  }

  const handleRun = useCallback(async () => {
    if (running || submitting || !question?.id) return;
    setRunning(true);
    setExecError(null);
    setActiveTab('run');
    try {
      const res = await runCode(attemptId, {
        questionId: question.id,
        language,
        source: draftsByLang[language] || '',
        stdin: customInput,
      });
      setRunResult(res);
    } catch (err) {
      setExecError(err.message || 'Execution failed.');
    } finally {
      setRunning(false);
    }
  }, [attemptId, customInput, draftsByLang, language, question?.id, running, submitting]);

  const handleSubmit = useCallback(async () => {
    if (running || submitting || !question?.id) return;
    setSubmitting(true);
    setExecError(null);
    setActiveTab('results');
    try {
      const src = draftsByLang[language] || '';
      await persistDraft(language, src);
      const res = await submitCode(attemptId, {
        questionId: question.id,
        language,
        source: src,
      });
      setSubmitResult(res);
      if (typeof onSubmittedSuccess === 'function') {
        onSubmittedSuccess(res);
      }
    } catch (err) {
      setExecError(err.message || 'Submission failed.');
    } finally {
      setSubmitting(false);
    }
  }, [
    attemptId,
    draftsByLang,
    language,
    onSubmittedSuccess,
    persistDraft,
    question?.id,
    running,
    submitting,
  ]);

  function startHorizontalResize(e) {
    e.preventDefault();
    const container = splitContainerRef.current;
    if (!container) return;
    const rect = container.getBoundingClientRect();

    const onMove = (moveEvt) => {
      const pct = ((moveEvt.clientX - rect.left) / rect.width) * 100;
      const clamped = Math.max(25, Math.min(65, Math.round(pct)));
      setProblemWidthPct(clamped);
      try {
        localStorage.setItem(storageKey, String(clamped));
      } catch {
        // Ignore
      }
    };
    const onUp = () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
  }

  function startVerticalResize(e) {
    e.preventDefault();
    const pane = rightPaneRef.current;
    if (!pane) return;
    const rect = pane.getBoundingClientRect();

    const onMove = (moveEvt) => {
      const bottomHeight = rect.bottom - moveEvt.clientY;
      const clamped = Math.max(140, Math.min(rect.height - 180, Math.round(bottomHeight)));
      setOutputHeightPx(clamped);
    };
    const onUp = () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
  }

  async function handleCopySample(text, idx) {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedSampleIdx(idx);
      setTimeout(() => setCopiedSampleIdx(null), 1500);
    } catch {
      setCustomInput(text);
    }
  }

  return (
    <main className="coding-workspace" aria-label="Coding assessment workspace">
      <div className="coding-main-split" ref={splitContainerRef}>
        <section
          className="coding-problem-pane exam-question-col"
          style={{ width: `${problemWidthPct}%`, flex: 'none', maxWidth: 'none', border: 'none' }}
          aria-label="Coding problem statement"
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            <h2 style={{ margin: 0, fontSize: 17 }}>
              {question.id}: {question.title}
            </h2>
            <span className="exam-badge">{question.difficulty}</span>
            <span className="exam-badge exam-badge-marks">{question.marks} Marks</span>
          </div>

          <div className="muted-text" style={{ fontSize: 12 }}>
            Time Limit: {question.timeLimitMs} ms · Memory Limit: {question.memoryLimitMb} MB ·
            Domain: {question.domain}
          </div>

          <div className="question-text-block">{question.statement}</div>

          <div>
            <strong>Input Format</strong>
            <div className="question-text-block">{question.inputFormat}</div>
          </div>

          <div>
            <strong>Output Format</strong>
            <div className="question-text-block">{question.outputFormat}</div>
          </div>

          <div>
            <strong>Constraints</strong>
            <pre className="output-pre">{question.constraints}</pre>
          </div>

          <div>
            <strong>Sample Test Cases</strong>
            {(question.samples || []).map((sample, idx) => (
              <div key={idx} className="sample-card">
                <div className="sample-card-header">
                  <strong>Sample {idx + 1}</strong>
                  <button
                    type="button"
                    className="btn btn-secondary btn-sm"
                    onClick={() => handleCopySample(sample.input, idx)}
                  >
                    {copiedSampleIdx === idx ? 'Copied' : 'Copy Input'}
                  </button>
                </div>
                <div className="sample-io-grid">
                  <div>
                    <span className="muted-text">Input</span>
                    <pre className="output-pre">{sample.input || '(empty)'}</pre>
                  </div>
                  <div>
                    <span className="muted-text">Output</span>
                    <pre className="output-pre">{sample.output}</pre>
                  </div>
                </div>
                <p style={{ margin: '6px 0 0', fontSize: 13 }}>{sample.explanation}</p>
              </div>
            ))}
          </div>
        </section>

        <div
          className="coding-drag-handle-v"
          role="separator"
          aria-orientation="vertical"
          aria-label="Resize problem and editor panels"
          onMouseDown={startHorizontalResize}
        />

        <section
          className="coding-right-pane"
          ref={rightPaneRef}
          aria-label="Code editor and output"
        >
          <div style={{ flex: 1, minHeight: 180, overflow: 'hidden' }}>
            <CodeEditor
              language={language}
              value={draftsByLang[language] ?? ''}
              fontSize={fontSize}
              onChange={handleCodeChange}
              onRunShortcut={handleRun}
              onLanguageChange={handleLanguageChange}
              onRun={handleRun}
              onSubmit={handleSubmit}
              onReset={handleResetTemplate}
              onFontSizeChange={setFontSize}
              running={running}
              submitting={submitting}
              draftStatus={draftStatus}
            />
          </div>

          <div
            className="coding-drag-handle-h"
            role="separator"
            aria-orientation="horizontal"
            aria-label="Resize editor and output panels"
            onMouseDown={startVerticalResize}
          />

          <div style={{ height: `${outputHeightPx}px`, flexShrink: 0, overflow: 'hidden' }}>
            <CompilerOutput
              activeTab={activeTab}
              onTabChange={setActiveTab}
              customInput={customInput}
              onCustomInputChange={setCustomInput}
              samples={question.samples}
              runResult={runResult}
              submitResult={submitResult}
              error={execError}
            />
          </div>
        </section>
      </div>

      <div className="coding-info-rail">
        <ProgressIndicator
          currentIndex={questionIndex}
          totalInSection={totalInSection}
          answeredCount={answeredCount}
          unansweredCount={unansweredCount}
          secondsRemaining={secondsRemaining}
          violationCount={violationCount}
          violationLimit={violationLimit}
        />
      </div>
    </main>
  );
}
