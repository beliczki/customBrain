import { useState } from 'react';
import ThoughtModal from './ThoughtModal.jsx';
import { Section } from './BrainMapPackage.jsx';

// spider's text view (0.63.0): what the best-first walk reached, per layer,
// with the step it was reached at and why; then the frontier it left. The
// same answer the "Bejárás a gráfon" replay plays step by step.

const STOPPED = { max_steps: 'elérte a lépésszám-korlátot', min_score: 'a legjobb jelölt a küszöb alá esett' };

// Commitments and file bundles are graph nodes, not Qdrant thoughts.
const openable = (item, layer) => layer !== 'vallalas' && !item.id.startsWith('files:');

function Row({ item, layer, onOpen }) {
  const canOpen = openable(item, layer);
  return (
    <li>
      <button
        type="button"
        disabled={!canOpen}
        onClick={() => onOpen(item.id)}
        className="spider-result__row agenda-thought-link flex items-baseline gap-2 text-xs w-full text-left py-0.5 hover:bg-[var(--border)] -mx-1 px-1 transition-colors disabled:hover:bg-transparent disabled:cursor-default"
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
  const steps = walk.layers.reduce((n, l) => n + l.items.length, 0);

  return (
    <div className="spider-result">
      <p className="spider-result__summary text-xs text-txt-ter mb-6">
        {steps} lépés · {STOPPED[walk.stopped]} · max {walk.params.MAX_STEPS} lépés, küszöb {walk.params.MIN_SCORE}, csillapítás {walk.params.DECAY}
      </p>
      {walk.layers.map((l) => (
        <Section key={l.key} title={l.label} count={l.items.length}>
          <ul>
            {l.items.map((item) => <Row key={item.id} item={item} layer={l.key} onOpen={setOpenThoughtId} />)}
          </ul>
        </Section>
      ))}
      <Section title="Ide ment volna még" count={walk.candidates.length}>
        <ul className="opacity-70">
          {walk.candidates.map((item) => <Row key={item.id} item={{ ...item, step: null }} layer={item.layer} onOpen={setOpenThoughtId} />)}
        </ul>
      </Section>
      {openThoughtId && <ThoughtModal thoughtId={openThoughtId} onClose={() => setOpenThoughtId(null)} />}
    </div>
  );
}
