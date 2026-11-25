import Prism from 'prismjs';
import 'prismjs/components/prism-c';
import 'prismjs/components/prism-cpp';
import 'prismjs/components/prism-java';
import 'prismjs/components/prism-python';

const LANGUAGE_LABELS = {
  c: 'C (GCC)',
  cpp: 'C++ (G++)',
  java: 'Java',
  python: 'Python 3',
};

const PRISM_GRAMMAR_MAP = {
  c: 'c',
  cpp: 'cpp',
  java: 'java',
  python: 'python',
};

export default function SnippetBlock({ language, code }) {
  const grammarKey = PRISM_GRAMMAR_MAP[language] || 'c';
  const grammar = Prism.languages[grammarKey] || Prism.languages.clike;
  const lines = String(code || '')
    .replace(/\r\n/g, '\n')
    .split('\n');

  return (
    <div className="snippet-container" aria-label="Read-only code snippet">
      <div className="snippet-header">
        <span>Code Snippet</span>
        <span className="exam-badge">{LANGUAGE_LABELS[language] || language}</span>
      </div>
      <div className="snippet-scroll" tabIndex={0}>
        <table className="snippet-code-table">
          <tbody>
            {lines.map((line, idx) => {
              const highlighted = grammar ? Prism.highlight(line, grammar, grammarKey) : line;
              return (
                <tr key={idx}>
                  <td className="snippet-line-num" aria-hidden="true">
                    {idx + 1}
                  </td>
                  <td
                    className="snippet-line-code"
                    // Prism output is generated strictly from local grammar tokens on validated paper code
                    dangerouslySetInnerHTML={{ __html: highlighted || '&nbsp;' }}
                  />
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
