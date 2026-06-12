import { useState } from 'react';
import ReactMarkdown from 'react-markdown';

// Compact thought renderer (P18). For thoughts whose text is "summary --- original"
// (v2-chunked thoughts and YouTube captures), shows the summary first (collapsed
// past COLLAPSE_AT chars) with the full original behind a toggle. Plain thoughts
// are just collapsible. Keeps cards short so metadata + the Anatómia button stay
// reachable instead of being buried under a wall of text.
const DELIM = '\n\n---\n\n';
const COLLAPSE_AT = 600;

export default function ThoughtBody({ text }) {
  const [expanded, setExpanded] = useState(false);
  const [showFull, setShowFull] = useState(false);
  if (!text) return null;

  const idx = text.indexOf(DELIM);
  const hasSplit = idx > -1;
  const lead = hasSplit ? text.slice(0, idx) : text;
  const rest = hasSplit ? text.slice(idx + DELIM.length) : null;

  const long = lead.length > COLLAPSE_AT;
  const shown = expanded || !long ? lead : `${lead.slice(0, COLLAPSE_AT)}…`;

  return (
    <div className="thought-body text-sm text-txt-sec prose-sm break-words">
      <div className="thought-summary">
        <ReactMarkdown>{shown}</ReactMarkdown>
      </div>
      {long && (
        <button className="show-more-btn text-xs text-accent hover:underline" onClick={() => setExpanded((e) => !e)}>
          {expanded ? 'kevesebb' : 'több…'}
        </button>
      )}
      {hasSplit && (
        <div className="thought-fulltext mt-2">
          <button
            className="show-more-btn inline-flex items-center gap-1 text-xs text-txt-ter hover:text-accent border border-subtle px-2 py-0.5"
            onClick={() => setShowFull((f) => !f)}
          >
            {showFull ? '▾ Teljes thought elrejtése' : '▸ Teljes thought'}
          </button>
          {showFull && (
            <div className="thought-fulltext__content mt-2 pt-2 border-t border-[var(--border)] text-txt-ter">
              <ReactMarkdown>{rest}</ReactMarkdown>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
