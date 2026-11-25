import * as monaco from 'monaco-editor';
import editorWorker from 'monaco-editor/editor/editor.worker?worker';
import Editor, { loader } from '@monaco-editor/react';
import { useRef } from 'react';

if (typeof self !== 'undefined' && !self.MonacoEnvironment) {
  self.MonacoEnvironment = {
    getWorker() {
      return new editorWorker();
    },
  };
}

loader.config({ monaco });

const MONACO_LANGUAGE_MAP = {
  c: 'c',
  cpp: 'cpp',
  java: 'java',
  python: 'python',
};

export default function CodeEditor({
  language,
  value,
  fontSize = 14,
  onChange,
  onRunShortcut,
  onLanguageChange,
  onRun,
  onSubmit,
  onReset,
  onFontSizeChange,
  running = false,
  submitting = false,
  draftStatus = 'idle',
}) {
  const editorRef = useRef(null);

  function handleMount(editor) {
    editorRef.current = editor;
    editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.Enter, () => {
      if (typeof onRunShortcut === 'function') {
        onRunShortcut();
      }
    });
  }

  return (
    <div className="coding-editor-shell" data-allow-paste="true">
      <div className="coding-toolbar">
        <div className="coding-toolbar-group">
          <label htmlFor="coding-lang-select" className="toolbar-label">
            Language:
          </label>
          <select
            id="coding-lang-select"
            value={language}
            onChange={(e) => onLanguageChange(e.target.value)}
            disabled={running || submitting}
          >
            <option value="c">C (GCC 17)</option>
            <option value="cpp">C++ (G++ 17)</option>
            <option value="java">Java (OpenJDK)</option>
            <option value="python">Python 3</option>
          </select>

          <label htmlFor="coding-font-select" className="toolbar-label">
            Font:
          </label>
          <select
            id="coding-font-select"
            value={fontSize}
            onChange={(e) => onFontSizeChange(Number(e.target.value))}
          >
            <option value={12}>12px</option>
            <option value={14}>14px</option>
            <option value={16}>16px</option>
            <option value={18}>18px</option>
          </select>

          <button
            type="button"
            className="btn btn-secondary btn-sm"
            disabled={running || submitting}
            onClick={onReset}
          >
            Reset to Template
          </button>
        </div>

        <div className="coding-toolbar-group">
          <span className="save-indicator" aria-live="polite">
            {draftStatus === 'saving' && 'Saving draft...'}
            {draftStatus === 'saved' && 'Draft saved'}
            {draftStatus === 'error' && 'Draft save failed'}
          </span>
          <button
            type="button"
            className="btn btn-secondary btn-sm"
            disabled={running || submitting}
            onClick={onRun}
            title="Ctrl+Enter"
          >
            {running ? 'Running...' : 'Run Code'}
          </button>
          <button
            type="button"
            className="btn btn-primary btn-sm"
            disabled={running || submitting}
            onClick={onSubmit}
          >
            {submitting ? 'Judging...' : 'Submit Code'}
          </button>
        </div>
      </div>

      <div className="coding-monaco-wrap" data-allow-paste="true">
        <Editor
          height="100%"
          language={MONACO_LANGUAGE_MAP[language] || 'python'}
          value={value}
          onChange={(val) => onChange(val ?? '')}
          onMount={handleMount}
          theme="vs"
          options={{
            fontSize,
            minimap: { enabled: false },
            lineNumbers: 'on',
            autoIndent: 'full',
            matchBrackets: 'always',
            scrollBeyondLastLine: false,
            automaticLayout: true,
            tabSize: 4,
          }}
        />
      </div>
    </div>
  );
}
