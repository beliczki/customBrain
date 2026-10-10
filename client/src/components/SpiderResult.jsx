import { useEffect, useState } from 'react';
import ThoughtModal from './ThoughtModal.jsx';
import { Section } from './BrainMapPackage.jsx';
import SpiderStats, { LENS_COLOR } from './SpiderStats.jsx';

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

// One step in a lens column: compact, the column already names the lens.
function LensStep({ item, current, onOpen }) {
  const canOpen = openable(item, item.layer);
  return (
    <li className={`spider-lens__step py-1 border-t border-[var(--border)] first:border-t-0 ${current ? 'spider-lens__step--current bg-[var(--border)] -mx-1 px-1' : ''}`}>
      <button type="button" disabled={!canOpen} onClick={() => onOpen(item.id)} className="text-left w-full disabled:cursor-default">
        <span className="font-mono text-[10px] text-txt-ter mr-1">#{item.step}</span>
        <span className={`text-xs text-txt-sec ${canOpen ? 'underline-offset-2 hover:underline' : ''}`}>{item.title}</span>
        <span className="block text-[10px] text-txt-ter leading-snug">{item.why.replace(/^\[[^\]]+\]\s*/, '')}</span>
      </button>
    </li>
  );
}

export default function SpiderResult({ walk }) {
  const [openThoughtId, setOpenThoughtId] = useState(null);
  // 0.68.0: one column per lens. Items carry the lens that took the step and
  // the wave (round 0 = the starting points, above the columns).
  const all = walk.layers.flatMap((l) => l.items.map((item) => ({ ...item, layer: l.key }))).sort((a, b) => a.step - b.step);
  const total = all.length;
  const [shown, setShown] = useState(0);

  useEffect(() => {
    if (shown >= total) return undefined;
    const t = setTimeout(() => setShown((n) => n + 1), REVEAL_MS);
    return () => clearTimeout(t);
  }, [shown, total]);

  const done = shown >= total;
  const visible = all.filter((item) => item.step <= shown);
  const starts = visible.filter((item) => item.round === 0);
  const current = (item) => !done && item.step === shown;

  return (
    <div className="spider-result">
      <div className="spider-result__summary flex items-baseline gap-3 text-xs text-txt-ter mb-6">
        <span>
          {done ? `${total} lépés, ${walk.rounds} hullám` : `visszajátszás · ${shown}/${total} lépés`} · {STOPPED[walk.stopped]} · max {walk.params.MAX_STEPS} lépés, küszöb {walk.params.MIN_SCORE}, csillapítás {walk.params.DECAY}
        </span>
        {!done && (
          <button type="button" onClick={() => setShown(total)} className="spider-result__show-all ml-auto shrink-0 px-2 py-0.5 border border-subtle text-txt-sec hover:text-txt">
            mind
          </button>
        )}
      </div>

      <Section title="Kiindulópontok" count={starts.length}>
        <ul>{starts.map((item) => <Row key={item.id} item={item} layer={item.layer} current={current(item)} onOpen={setOpenThoughtId} />)}</ul>
      </Section>

      <div className="spider-lenses grid grid-cols-2 lg:grid-cols-3 2xl:grid-cols-6 gap-4 mb-8">
        {walk.lenses.map((lens) => {
          const items = visible.filter((item) => item.round > 0 && item.lens === lens.key);
          return (
            <div key={lens.key} className="spider-lens min-w-0">
              <h3 className="spider-lens__header text-xs uppercase tracking-wider text-txt-ter mb-2 pb-1 border-b border-subtle flex items-baseline gap-2">
                {/* lens colour, the same as in the stats panel below */}
                <span className="spider-lens__swatch inline-block w-2 h-2 shrink-0" style={{ backgroundColor: LENS_COLOR[lens.key] }} />
                {lens.label}
                <span className="text-[10px]">{items.length}</span>
              </h3>
              {items.length === 0
                ? <p className="text-xs text-txt-ter italic">{done ? 'nem lépett' : '…'}</p>
                : <ul>{items.map((item) => <LensStep key={item.id} item={item} current={current(item)} onOpen={setOpenThoughtId} />)}</ul>}
            </div>
          );
        })}
      </div>

      {done && (
        <>
          <p className="spider-result__layers text-xs text-txt-ter mb-6">
            Mi állt össze: {walk.layers.filter((l) => l.items.length).map((l) => `${l.label} ${l.items.length}`).join(' · ')}
          </p>
          <Section title="Ide ment volna még" count={walk.candidates.length}>
            <ul className="opacity-70">
              {walk.candidates.map((item) => <Row key={item.id} item={{ ...item, step: null }} layer={item.layer} onOpen={setOpenThoughtId} />)}
            </ul>
          </Section>
        </>
      )}
      <SpiderStats items={visible} lenses={walk.lenses} total={total} />
      {openThoughtId && <ThoughtModal thoughtId={openThoughtId} onClose={() => setOpenThoughtId(null)} />}
    </div>
  );
}
