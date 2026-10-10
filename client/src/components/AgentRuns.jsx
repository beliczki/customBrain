import { useEffect, useState } from 'react';
import { agentRuns } from '../api.js';
import ThoughtModal from './ThoughtModal.jsx';

// Runs tab (0.58.0) — replay of real agent runs from the MCP call log
// (docs/bejaras-visszajatszas-terv-2026-10-10.md). A run = one token's calls
// with gaps of at most run_gap_minutes. Playback is client state only: it
// reveals the logged steps one by one, no call is re-made.

const SPEEDS = [1, 4, 16];
// The real gap between two agent calls can be minutes (the agent was thinking
// or the human was typing); playback clamps each wait into this window so a
// replay neither freezes nor flashes past.
const MIN_STEP_MS = 400;
const MAX_STEP_MS = 4000;

const clock = (ms) => {
  const s = Math.round(ms / 1000);
  return `+${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
};
const argsText = (args) => Object.entries(args).map(([k, v]) => `${k}=${JSON.stringify(v)}`).join(', ');
const firstArg = (step) => {
  const v = Object.values(step.args).find((x) => typeof x === 'string');
  return v || '';
};

function Step({ step, state, onOpen }) {
  const [open, setOpen] = useState(false);
  return (
    <li
      className={`agent-runs__step py-2 border-t border-[var(--border)] first:border-t-0 transition-opacity ${
        state === 'pending' ? 'opacity-30' : ''
      } ${state === 'current' ? 'agent-runs__step--current bg-[var(--border)] -mx-2 px-2' : ''}`}
    >
      <button type="button" onClick={() => setOpen(!open)} className="flex items-baseline gap-2 text-xs w-full text-left">
        <span className="font-mono w-14 shrink-0 text-txt-ter">{clock(step.offset_ms)}</span>
        <span className={`font-mono shrink-0 ${step.ok ? 'text-txt' : 'text-red-600 dark:text-red-400'}`}>{step.tool}</span>
        <span className="font-mono text-txt-ter truncate flex-1">{argsText(step.args)}</span>
        <span className="text-[10px] text-txt-ter shrink-0">{step.ms} ms</span>
        <span className="text-[10px] text-txt-ter shrink-0 w-16 text-right">
          {step.ok ? `${step.refs.length} találat` : 'hiba'}
        </span>
      </button>
      {open && (
        <div className="agent-runs__detail mt-2 ml-16 text-xs">
          {!step.ok && <p className="text-red-600 dark:text-red-400 mb-1">{step.error}</p>}
          <p className="font-mono text-txt-ter break-all mb-1">{argsText(step.args)}</p>
          {step.ok && <p className="text-[10px] text-txt-ter mb-1">{step.result_chars} karakter válasz</p>}
          {step.ok && (
          <ul className="space-y-0.5">
            {step.refs.map((r) => (
              <li key={r.id}>
                <button
                  type="button"
                  onClick={() => onOpen(r.id)}
                  className="agenda-thought-link text-left text-txt-sec underline-offset-2 hover:underline"
                >
                  {r.title}
                </button>
              </li>
            ))}
          </ul>
          )}
        </div>
      )}
    </li>
  );
}

function Player({ run, onOpen }) {
  const total = run.steps.length;
  const [cursor, setCursor] = useState(total); // steps revealed; total = all shown
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState(4);

  useEffect(() => {
    if (!playing) return undefined;
    if (cursor >= total) { setPlaying(false); return undefined; }
    const gap = cursor === 0 ? 0 : run.steps[cursor].offset_ms - run.steps[cursor - 1].offset_ms;
    const wait = Math.min(MAX_STEP_MS, Math.max(MIN_STEP_MS, gap / speed));
    const t = setTimeout(() => setCursor((c) => c + 1), wait);
    return () => clearTimeout(t);
  }, [playing, cursor, speed, total, run]);

  const play = () => { if (cursor >= total) setCursor(0); setPlaying(true); };

  return (
    <div className="agent-runs__run-body mt-3">
      <div className="agent-runs__player flex items-center gap-2 mb-3 text-xs">
        <button type="button" onClick={() => { setPlaying(false); setCursor(Math.max(0, cursor - 1)); }} className="px-2 py-1 border border-subtle text-txt-ter hover:text-txt">◀</button>
        {playing ? (
          <button type="button" onClick={() => setPlaying(false)} className="px-3 py-1 bg-accent text-white">❚❚</button>
        ) : (
          <button type="button" onClick={play} className="px-3 py-1 bg-accent text-white">▶ Lejátszás</button>
        )}
        <button type="button" onClick={() => { setPlaying(false); setCursor(Math.min(total, cursor + 1)); }} className="px-2 py-1 border border-subtle text-txt-ter hover:text-txt">▶</button>
        <div className="search-mode-switch inline-flex border border-subtle ml-2">
          {SPEEDS.map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => setSpeed(s)}
              className={`px-2 py-1 text-xs font-medium transition-colors ${speed === s ? 'bg-accent text-white' : 'text-txt-ter hover:text-txt'}`}
            >
              {s}×
            </button>
          ))}
        </div>
        <span className="text-[10px] text-txt-ter ml-2">{cursor}/{total}</span>
      </div>
      <ul>
        {run.steps.map((s, i) => (
          <Step
            key={s.ts + s.tool + i}
            step={s}
            state={i >= cursor ? 'pending' : (playing || cursor < total) && i === cursor - 1 ? 'current' : 'done'}
            onOpen={onOpen}
          />
        ))}
      </ul>
    </div>
  );
}

export default function AgentRuns() {
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [openRunId, setOpenRunId] = useState(null);
  const [openThoughtId, setOpenThoughtId] = useState(null);

  useEffect(() => {
    agentRuns(7).then(setData).catch((err) => setError(err.message));
  }, []);

  if (error) return <p className="text-red-600 dark:text-red-400 text-sm">Error: {error}</p>;
  if (!data) return <p className="text-txt-ter text-sm">Loading…</p>;

  return (
    <div className="agent-runs">
      <div className="agent-runs__topbar text-xs text-txt-ter mb-6 pb-3 border-b border-[var(--border)]">
        <strong className="text-txt-sec">{data.runs.length}</strong> futás az elmúlt 7 napban · egy futás = egy token hívásai, legfeljebb {data.run_gap_minutes} perc szünettel
      </div>
      {data.runs.length === 0 && <p className="agent-runs__empty text-txt-ter text-sm">Még nincs naplózott MCP-hívás.</p>}
      {data.runs.map((run) => (
        <div key={run.id} className="agent-runs__run py-3 border-t border-[var(--border)] first:border-t-0 -mx-6 px-6">
          <button
            type="button"
            onClick={() => setOpenRunId(openRunId === run.id ? null : run.id)}
            className="flex items-baseline gap-2 text-xs w-full text-left"
          >
            <span className="font-mono w-28 shrink-0 text-txt-ter">
              {new Date(run.start).toLocaleString([], { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })}
            </span>
            <span className="px-2 py-0.5 shrink-0 bg-emerald-100 text-emerald-700 dark:bg-emerald-900 dark:text-emerald-300">{run.caller}</span>
            <span className="shrink-0 text-txt-ter">{run.steps.length} lépés · {clock(new Date(run.end) - new Date(run.start))}</span>
            <span className="text-txt-sec truncate flex-1">{firstArg(run.steps[0])}</span>
          </button>
          {openRunId === run.id && <Player run={run} onOpen={setOpenThoughtId} />}
        </div>
      ))}
      {openThoughtId && <ThoughtModal thoughtId={openThoughtId} onClose={() => setOpenThoughtId(null)} />}
    </div>
  );
}
