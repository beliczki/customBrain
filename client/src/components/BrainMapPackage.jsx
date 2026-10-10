import { useState } from 'react';
import ThoughtModal from './ThoughtModal.jsx';

// The brain_map package (0.57.0) — the same seven sections the MCP tool hands
// an agent, rendered as-is. No retrieval logic lives here: the server builds
// the package, this only lays it out. Row and header styles follow the Agenda
// tab (agenda-day__header, agenda-thought-link); chip colours follow Search.

const CHIP = {
  project: 'bg-purple-100 text-purple-700 dark:bg-purple-900 dark:text-purple-300',
  person: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900 dark:text-emerald-300',
  topic: 'bg-indigo-100 text-indigo-700 dark:bg-indigo-900 dark:text-indigo-300',
  candidate: 'border border-subtle text-txt-ter',
};

const DERIVED_LABEL = { search_hits: 'keresésből', param: 'megadva' };

function Section({ title, count, children }) {
  return (
    <section className="brain-map__section mb-8">
      <h2 className="brain-map__header text-xs uppercase tracking-wider text-txt-ter mb-3 pb-1 border-b border-subtle flex items-baseline gap-2">
        {title}
        {count != null && <span className="text-[10px]">{count}</span>}
      </h2>
      {count === 0 ? <p className="brain-map__empty text-xs text-txt-ter italic">nincs adat</p> : children}
    </section>
  );
}

function AnchorChip({ kind, name, note }) {
  return (
    <span className={`brain-map__chip inline-flex items-baseline gap-1 px-2 py-0.5 text-xs ${CHIP[kind]}`}>
      {name}
      {note && <span className="text-[10px] opacity-70">{note}</span>}
    </span>
  );
}

function ThoughtRow({ line, onOpen }) {
  return (
    <li>
      <button
        type="button"
        onClick={() => onOpen(line.id)}
        className="brain-map__row agenda-thought-link flex items-baseline gap-2 text-xs w-full text-left py-0.5 hover:bg-[var(--border)] -mx-1 px-1 transition-colors"
      >
        <span className="font-mono w-20 shrink-0 text-txt-ter">{line.date}</span>
        <span className="w-24 shrink-0 text-[10px] uppercase tracking-wider text-txt-ter">{line.type || '—'}</span>
        <span className="w-16 shrink-0 text-[10px] uppercase tracking-wider text-txt-ter">{line.source}</span>
        <span className="text-txt-sec flex-1 underline-offset-2 hover:underline">{line.title}</span>
      </button>
    </li>
  );
}

const argsText = (args) => Object.entries(args).map(([k, v]) => `${k}=${JSON.stringify(v)}`).join(', ');

export default function BrainMapPackage({ map, onShowHits }) {
  const [openThoughtId, setOpenThoughtId] = useState(null);
  const { HORGONYOK: anchors, HELYZET: situation, ELŐZMÉNYEK: history, KÖVETKEZŐ: next, HÁTTÉR: background, HIÁNYOK: gaps, TOVÁBB: further } = map;
  const anchorCount = anchors.projects.length + anchors.people.length + anchors.topics.length;

  return (
    <div className="brain-map">
      <Section title="Horgonyok" count={anchorCount + anchors.candidates.length}>
        <div className="flex flex-col gap-2">
          {anchors.projects.map((a) => (
            <div key={a.name} className="brain-map__anchor flex items-baseline gap-2 text-xs">
              <AnchorChip kind="project" name={a.name} note={DERIVED_LABEL[a.derived_from]} />
              <span className="text-txt-ter">
                repo: {a.repo ? <span className="text-txt-sec font-mono">{a.repo}</span> : '–'}
                {a.drive_files != null && <> · {a.drive_files} Drive-fájl</>}
              </span>
            </div>
          ))}
          {(anchors.people.length > 0 || anchors.topics.length > 0 || anchors.candidates.length > 0) && (
            <div className="flex gap-1 flex-wrap">
              {anchors.people.map((a) => <AnchorChip key={a.name} kind="person" name={a.name} note={DERIVED_LABEL[a.derived_from]} />)}
              {anchors.topics.map((a) => <AnchorChip key={a.name} kind="topic" name={a.name} note={DERIVED_LABEL[a.derived_from]} />)}
              {anchors.candidates.map((name) => <AnchorChip key={name} kind="candidate" name={name} note="jelölt" />)}
            </div>
          )}
        </div>
      </Section>

      <Section title="Helyzet" count={situation.repos.length + situation.files.length}>
        <ul className="space-y-1">
          {situation.repos.map((r) => (
            <li key={r.repo} className="brain-map__row flex items-baseline gap-2 text-xs">
              <span className="font-mono text-txt-sec">{r.repo}</span>
              {r.error ? (
                <span className="text-red-600 dark:text-red-400">{r.error}</span>
              ) : (
                <span className="text-txt-ter">
                  v{r.version} · {r.last_commit.date.slice(0, 10)} {r.last_commit.message}
                </span>
              )}
            </li>
          ))}
          {situation.files.map((f) => (
            <li key={`${f.link}|${f.name}`} className="brain-map__row flex items-baseline gap-2 text-xs">
              <span className="font-mono w-20 shrink-0 text-txt-ter">{f.modified}</span>
              <span className="w-20 shrink-0 text-[10px] uppercase tracking-wider text-txt-ter">{f.kind}</span>
              <a href={f.link} target="_blank" rel="noreferrer" className="text-txt-sec flex-1 underline-offset-2 hover:underline">{f.name}</a>
            </li>
          ))}
        </ul>
      </Section>

      <Section title="Előzmények" count={history.length}>
        <ul className="space-y-1">
          {history.map((l) => <ThoughtRow key={l.id} line={l} onOpen={setOpenThoughtId} />)}
        </ul>
      </Section>

      <Section title="Következő" count={next.commitments.length + next.events.length}>
        <ul className="space-y-1">
          {next.events.map((e) => (
            <li key={e.event_id} className="brain-map__row flex items-baseline gap-2 text-xs">
              <span className="font-mono w-32 shrink-0 text-txt-ter">{new Date(e.start).toLocaleString([], { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })}</span>
              <span className="w-16 shrink-0 text-[10px] uppercase tracking-wider text-txt-ter">esemény</span>
              <span className="text-txt flex-1">{e.title}</span>
              <span className="text-[10px] text-txt-ter">{e.matched_by.join(' · ')}</span>
            </li>
          ))}
          {next.commitments.map((c) => (
            <li key={c.id} className={`brain-map__row flex items-baseline gap-2 text-xs ${c.overdue ? 'brain-map__row--overdue' : ''}`}>
              <span className={`font-mono w-32 shrink-0 ${c.overdue ? 'text-red-600 dark:text-red-400' : 'text-txt-ter'}`}>{c.due || 'nincs határidő'}</span>
              <span className="w-16 shrink-0 text-[10px] uppercase tracking-wider text-txt-ter">{c.status}</span>
              <span className="text-txt-sec flex-1">{c.title}</span>
              <span className="text-[10px] text-txt-ter">{c.owner}</span>
            </li>
          ))}
        </ul>
      </Section>

      <Section title="Háttér" count={background.length}>
        <ul className="space-y-1">
          {background.map((l) => <ThoughtRow key={l.id} line={l} onOpen={setOpenThoughtId} />)}
        </ul>
      </Section>

      <Section title="Hiányok" count={gaps.length}>
        <ul className="space-y-1">
          {gaps.map((g, i) => (
            <li key={i} className="brain-map__gap flex items-baseline gap-2 text-xs">
              <span className="px-2 py-0.5 shrink-0 text-[10px] uppercase tracking-wider bg-amber-100 text-amber-700 dark:bg-amber-900 dark:text-amber-300">{g.kind.replaceAll('_', ' ')}</span>
              <span className="text-txt-sec">{g.detail}</span>
            </li>
          ))}
        </ul>
      </Section>

      <Section title="Tovább" count={further.length}>
        <ul className="space-y-1">
          {further.map((f, i) => (
            <li key={i} className="brain-map__row flex items-baseline gap-2 text-xs">
              <span className="w-24 shrink-0 text-[10px] uppercase tracking-wider text-txt-ter">{f.section}</span>
              {f.tool === 'search_brain' ? (
                <button type="button" onClick={onShowHits} className="brain-map__to-hits text-txt-sec underline underline-offset-2 hover:text-txt">
                  Találatok mód →
                </button>
              ) : (
                <span className="font-mono text-txt-sec">{f.tool}({argsText(f.args)})</span>
              )}
              {f.note && <span className="text-[10px] text-txt-ter">{f.note}</span>}
            </li>
          ))}
        </ul>
      </Section>

      {openThoughtId && <ThoughtModal thoughtId={openThoughtId} onClose={() => setOpenThoughtId(null)} />}
    </div>
  );
}
