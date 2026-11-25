function renderInlineSegments(text, keyPrefix) {
  const parts = String(text || '').split(/(`[^`]+`)/g);
  return parts.map((part, idx) => {
    if (part.startsWith('`') && part.endsWith('`') && part.length >= 2) {
      return (
        <code key={`${keyPrefix}-${idx}`} className="inline-code">
          {part.slice(1, -1)}
        </code>
      );
    }
    return <span key={`${keyPrefix}-${idx}`}>{part}</span>;
  });
}

export default function SafeQuestionText({ text, inlineOnly = false }) {
  const raw = String(text || '');
  if (inlineOnly) {
    return <>{renderInlineSegments(raw, 'inline')}</>;
  }

  const blocks = raw.split(/(```[\s\S]*?```)/g);
  return (
    <div className="question-text-block">
      {blocks.map((block, idx) => {
        if (block.startsWith('```') && block.endsWith('```')) {
          const inner = block.replace(/^```[^\n]*\n?/, '').replace(/\n?```$/, '');
          return (
            <pre key={`code-${idx}`} className="code-fenced-inline">
              <code>{inner}</code>
            </pre>
          );
        }
        return <span key={`txt-${idx}`}>{renderInlineSegments(block, `seg-${idx}`)}</span>;
      })}
    </div>
  );
}
