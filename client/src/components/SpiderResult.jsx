import { useEffect, useState } from 'react';
import ThoughtModal from './ThoughtModal.jsx';
import SpiderStats, { LENS_COLOR, matchesHover } from './SpiderStats.jsx';
import { ShellFooter } from './AppShell.jsx';

// spider's text view (0.63.0) — what the walk reached and why.
// 0.64.0: SpiderProgress lists the server's stages live; the result then
// builds up one step at a time (a replay — the walk itself takes ms).
// 0.68.0: one column per lens. 0.71.0: three panels on top (stages ·
// starting points · frontier), the quality panel in the shell's fixed footer,
// and one `hover` shared by the lists and the charts.

const STOPPED = { max_steps: 'elérte a lépésszám-korlátot', min_score: 'a legjobb jelölt a küszöb alá esett' };
const REVEAL_MS = 150;
const FRONTIER_SHORT = 5;

// Thoughts and dossiers open in the thought modal; files and repo docs have
// an outside link; commitments and file bundles neither.
const opener = (item) => (!item.entity || item.entity === 'dossier' || item.entity === 'repo' ? 'modal' : item.link ? 'link' : null);

export function SpiderProgress({ phases }) {
  return (
    <ul className="spider-progress space-y-0.5 text-xs">
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

function Panel({ title, count, children }) {
  return (
    <section className="spider-panel min-w-0">
      <h3 className="spider-panel__header text-xs uppercase tracking-wider text-txt-ter mb-2 pb-1 border-b border-subtle flex items-baseline gap-2">
        {title}
        {count != null && <span className="text-[10px]">{count}</span>}
      </h3>
      {children}
    </section>
  );
}

// One result line, used by every panel and column. `compact` drops the score.
function Item({ item, current, hover, setHover, onOpen, compact = false }) {
  const how = opener(item);
  const on = matchesHover(item, hover);
  // [overflow-wrap:anywhere]: file names have no spaces and ran into the next column.
  const label = <span className={`text-xs text-txt-sec [overflow-wrap:anywhere] ${how ? 'underline-offset-2 hover:underline' : ''}`}>{item.title}</span>;
  return (
    <li
      onMouseEnter={() => setHover({ kind: 'item', id: item.id })}
      onMouseLeave={() => setHover(null)}
      className={`spider-item py-1 border-t border-[var(--border)] first:border-t-0 -mx-1 px-1 transition-colors ${
        current ? 'spider-item--current bg-[var(--border)]' : ''} ${on ? 'spider-item--hover bg-[var(--border)] ring-1 ring-[var(--accent-blue)]' : ''}`}
    >
      <span className="font-mono text-[10px] text-txt-ter mr-1">{item.step != null ? `#${item.step}` : '—'}</span>
      {!compact && <span className="font-mono text-[10px] text-txt-ter mr-1">{item.score.toFixed(3)}</span>}
      {how === 'link' ? <a href={item.link} target="_blank" rel="noreferrer">{label}</a>
        : how === 'modal' ? <button type="button" onClick={() => onOpen(item.id)} className="text-left">{label}</button>
          : label}
      <span className="block text-[10px] text-txt-ter leading-snug [overflow-wrap:anywhere]">{item.why.replace(/^\[[^\]]+\]\s*/, '')}</span>
    </li>
  );
}

export default function SpiderResult({ walk, phases, onSearch, active }) {
  const [openThoughtId, setOpenThoughtId] = useState(null);
  const [hover, setHover] = useState(null);
  const [frontierOpen, setFrontierOpen] = useState(false);
  // Items carry the lens that took the step and the wave (round 0 = start).
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
  const itemProps = { hover, setHover, onOpen: setOpenThoughtId };
  const frontier = walk.candidates.slice(0, frontierOpen ? walk.candidates.length : FRONTIER_SHORT);

  return (
    <div className="spider-result">
      <div className="spider-result__top grid grid-cols-1 lg:grid-cols-3 gap-6 mb-8">
        <Panel title="Lépések">
          <SpiderProgress phases={phases} />
          <p className="spider-result__summary mt-3 text-[10px] text-txt-ter leading-snug">
            {done ? `${total} lépés, ${walk.rounds} hullám` : `visszajátszás · ${shown}/${total}`} · {STOPPED[walk.stopped]} · max {walk.params.MAX_STEPS} lépés, küszöb {walk.params.MIN_SCORE}, csillapítás {walk.params.DECAY}
            {!done && (
              <button type="button" onClick={() => setShown(total)} className="spider-result__show-all ml-2 px-2 py-0.5 border border-subtle text-txt-sec hover:text-txt">
                mind
              </button>
            )}
          </p>
          {done && (
            <p className="spider-result__layers mt-1 text-[10px] text-txt-ter">
              Mi állt össze: {walk.layers.filter((l) => l.items.length).map((l) => `${l.label} ${l.items.length}`).join(' · ')}
            </p>
          )}
        </Panel>
        <Panel title="Kiindulópontok" count={starts.length}>
          <ul>{starts.map((item) => <Item key={item.id} item={item} current={current(item)} {...itemProps} />)}</ul>
        </Panel>
        <Panel title="Ide ment volna még" count={done ? walk.candidates.length : null}>
          {!done ? <p className="text-xs text-txt-ter italic">a bejárás végén</p> : (
            <>
              <ul className="opacity-80">{frontier.map((item) => <Item key={item.id} item={{ ...item, step: null }} {...itemProps} />)}</ul>
              {walk.candidates.length > FRONTIER_SHORT && (
                <button type="button" onClick={() => setFrontierOpen(!frontierOpen)} className="spider-result__more mt-1 text-[10px] uppercase tracking-wider text-txt-ter hover:text-txt">
                  {frontierOpen ? 'kevesebb' : `more (+${walk.candidates.length - FRONTIER_SHORT})`}
                </button>
              )}
            </>
          )}
        </Panel>
      </div>

      <div className="spider-lenses grid grid-cols-2 lg:grid-cols-3 2xl:grid-cols-6 gap-4 mb-8">
        {walk.lenses.map((lens) => {
          const items = visible.filter((item) => item.round > 0 && item.lens === lens.key);
          const lensOn = hover && hover.kind === 'lens' && hover.lens === lens.key;
          return (
            <div key={lens.key} className={`spider-lens min-w-0 ${lensOn ? 'spider-lens--hover' : ''}`}>
              <h3 className={`spider-lens__header text-xs uppercase tracking-wider mb-2 pb-1 border-b flex items-baseline gap-2 ${lensOn ? 'text-txt border-[var(--accent-blue)]' : 'text-txt-ter border-subtle'}`}>
                {/* lens colour, the same as in the quality panel */}
                <span className="spider-lens__swatch inline-block w-2 h-2 shrink-0" style={{ backgroundColor: LENS_COLOR[lens.key] }} />
                {lens.label}
                <span className="text-[10px]">{items.length}</span>
              </h3>
              {items.length === 0
                ? <p className="text-xs text-txt-ter italic">{done ? 'nem lépett' : '…'}</p>
                : <ul>{items.map((item) => <Item key={item.id} item={item} current={current(item)} compact {...itemProps} />)}</ul>}
            </div>
          );
        })}
      </div>

      {active && (
      <ShellFooter>
        <SpiderStats items={visible} lenses={walk.lenses} total={total} hover={hover} setHover={setHover} onSearch={onSearch} />
      </ShellFooter>
      )}
      {openThoughtId && <ThoughtModal thoughtId={openThoughtId} onClose={() => setOpenThoughtId(null)} />}
    </div>
  );
}
