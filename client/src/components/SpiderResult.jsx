import { useEffect, useState } from 'react';
import ThoughtModal from './ThoughtModal.jsx';
import { Section } from './BrainMapPackage.jsx';

// spider's text view (0.63.0): what the best-first walk reached, per layer,
// with the step it was reached at and why; then the frontier it left. The
// same answer the "Bejárás a gráfon" replay plays step by step.
//
// 0.64.0: SpiderProgress lists the server's stages live while it works; the
// result then builds up one step at a time. That build-up is a replay — the
// walk itself is done in milliseconds — and says so.

const STOPPED = { max_steps: 'elérte a lépésszám-korlátot', min_score: 'a legjobb jelölt a küszöb alá esett' };
const REVEAL_MS = 150;

// Commitments and file bundles are graph nodes, not Qdrant thoughts.
const openable = (item, layer) => layer !== 'vallalas' && !item.id.startsWith('files:');

export function SpiderProgress({ phases }) {
  return (
    <ul className="spider-progress mb-6 space-y-0.5 text-xs">
      {phases.map((p) => (
        <li key={p.name} className="spider-progress__phase flex items-baseline gap-2">
          <span className={`w-4 shrink-0 ${p.status === 'done' ? 'text-emerald-600 dark:text-emerald-400' : 'text-txt-ter animate-pulse'}`}>
            {p.status === 'done' ? '✓' : '…'}
          </span>
          <span className="text-txt-sec">{p.label}</span>
          {p.note && <span className="text-txt-ter truncate">{p.note}</span>}
          {p.status === 'done' && <span className="ml-auto font-mono text-[10px] text-txt-ter shrink-0">{p.ms} ms</span>}
        </li>
      ))}
    </ul>
  );
}

function Row({ item, layer, current, onOpen }) {
  const canOpen = openable(item, layer);
  return (
    <li>
      <button
        type="button"
        disabled={!canOpen}
        onClick={() => onOpen(item.id)}
        className={`spider-result__row agenda-thought-link flex items-baseline gap-2 text-xs w-full text-left py-0.5 hover:bg-[var(--border)] -mx-1 px-1 transition-colors disabled:hover:bg-transparent disabled:cursor-default ${current ? 'spider-result__row--current bg-[var(--border)]' : ''}`}
      >
        <span className="font-mono w-10 shrink-0 text-txt-ter">{item.step != null ? `#${item.step}` : '—'}</span>
        <span className="font-mono w-12 shrink-0 text-[10px] text-txt-ter">{item.score.toFixed(3)}</span>
        <span className="flex-1 min-w-0">
          <span className={`text-txt-sec ${canOpen ? 'underline-offset-2 hover:underline' : ''}`}>{item.title}</span>
          <span className="spider-result__why block text-[10px] text-txt-ter">{item.why}</span>
        </span>
      </button>
    </li>
  );
}

export default function SpiderResult({ walk }) {
  const [openThoughtId, setOpenThoughtId] = useState(null);
  const total = walk.layers.reduce((n, l) => n + l.items.length, 0);
  const [shown, setShown] = useState(0);

  useEffect(() => {
    if (shown >= total) return undefined;
    const t = setTimeout(() => setShown((n) => n + 1), REVEAL_MS);
    return () => clearTimeout(t);
  }, [shown, total]);

  const done = shown >= total;

  return (
    <div className="spider-result">
      <div className="spider-result__summary flex items-baseline gap-3 text-xs text-txt-ter mb-6">
        <span>
          {done ? `${total} lépés` : `visszajátszás · ${shown}/${total} lépés`} · {STOPPED[walk.stopped]} · max {walk.params.MAX_STEPS} lépés, küszöb {walk.params.MIN_SCORE}, csillapítás {walk.params.DECAY}
        </span>
        {!done && (
          <button type="button" onClick={() => setShown(total)} className="spider-result__show-all ml-auto shrink-0 px-2 py-0.5 border border-subtle text-txt-sec hover:text-txt">
            mind
          </button>
        )}
      </div>
      {walk.layers.map((l) => {
        const items = l.items.filter((item) => item.step <= shown);
        // An empty layer says "nincs adat" only once the replay is over.
        if (!items.length && !done) return null;
        return (
          <Section key={l.key} title={l.label} count={items.length}>
            <ul>
              {items.map((item) => <Row key={item.id} item={item} layer={l.key} current={!done && item.step === shown} onOpen={setOpenThoughtId} />)}
            </ul>
          </Section>
        );
      })}
      {done && (
        <Section title="Ide ment volna még" count={walk.candidates.length}>
          <ul className="opacity-70">
            {walk.candidates.map((item) => <Row key={item.id} item={{ ...item, step: null }} layer={item.layer} onOpen={setOpenThoughtId} />)}
          </ul>
        </Section>
      )}
      {openThoughtId && <ThoughtModal thoughtId={openThoughtId} onClose={() => setOpenThoughtId(null)} />}
    </div>
  );
}
