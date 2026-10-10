import { useState } from 'react';

// spider's quality panel (0.69.0; 0.71.0: fixed strip, explanations, linked
// hover, clickable tags). It sits in the shell's footer strip (ShellFooter) —
// edge to edge under the content, outside the scroll, so it never moves while
// the lens columns fill. Every chart is computed from the steps revealed so
// far and eases as it grows. Hovering a chart part highlights the matching
// results above (the `hover` the parent owns); a tag opens a search menu.
// Hand-drawn SVG on purpose — five small charts do not justify a library.

export const LENS_COLOR = {
  start: '#9ca3af', ontology: '#a78bfa', project: '#60a5fa', person: '#34d399',
  source: '#f59e0b', type: '#f87171', cluster: '#22d3ee',
};
const LAYER_COLOR = { horgony: '#a78bfa', tortenes: '#60a5fa', targy: '#f59e0b', vallalas: '#f87171', tudas: '#34d399' };
const LAYER_LABEL = { horgony: 'Horgony', tortenes: 'Történés', targy: 'Tárgy', vallalas: 'Vállalás', tudas: 'Tudás' };
const W = 200;
const H = 150;

const polar = (cx, cy, r, a) => [cx + r * Math.sin(a), cy - r * Math.cos(a)];
const tagsOf = (i) => [...i.topics, ...i.projects, ...i.people.filter((p) => p !== 'Me')];

/** Does a result item match what is hovered in the panel? Used by the lists too. */
export function matchesHover(item, hover) {
  if (!hover) return false;
  if (hover.kind === 'item') return item.id === hover.id;
  if (hover.kind === 'lens') return item.round > 0 && item.lens === hover.lens;
  if (hover.kind === 'layer') return item.layer === hover.layer && (!hover.type || item.type === hover.type);
  if (hover.kind === 'tag') return tagsOf(item).includes(hover.tag);
  return false;
}

function Chart({ title, help, children }) {
  return (
    <figure className="spider-stats__chart min-w-0">
      <figcaption className="mb-1">
        <span className="block text-[10px] uppercase tracking-wider text-txt-ter">{title}</span>
        <span className="spider-stats__help block text-[10px] leading-snug text-txt-ter opacity-80">{help}</span>
      </figcaption>
      {/* One fixed body height for every chart, so the tag cloud lines up with the SVGs. */}
      <div className="spider-stats__body h-[170px]">{children}</div>
    </figure>
  );
}

// 1. Star: steps per lens — a balanced walk, or one lens carrying it.
function Radar({ items, lenses, hover, setHover }) {
  const counts = lenses.map((l) => items.filter((i) => i.lens === l.key).length);
  const max = Math.max(1, ...counts);
  const cx = W / 2; const cy = H / 2 + 2; const R = 50;
  const angle = (i) => (2 * Math.PI * i) / lenses.length;
  const shape = counts.map((c, i) => polar(cx, cy, (R * c) / max, angle(i)));
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-full" preserveAspectRatio="xMidYMid meet">
      {[0.33, 0.66, 1].map((f) => (
        <polygon key={f} points={lenses.map((_, i) => polar(cx, cy, R * f, angle(i)).join(',')).join(' ')} fill="none" stroke="var(--border)" />
      ))}
      <path d={`M${shape.map((p) => p.join(',')).join('L')}Z`} fill="var(--accent-blue)" fillOpacity="0.25" stroke="var(--accent-blue)" />
      {lenses.map((l, i) => {
        const [x, y] = polar(cx, cy, R + 13, angle(i));
        const on = hover && hover.kind === 'lens' && hover.lens === l.key;
        return (
          <text key={l.key} x={x} y={y} fontSize="9" textAnchor="middle" dominantBaseline="middle" fill={LENS_COLOR[l.key]}
            fontWeight={on ? 700 : 400} className="cursor-pointer"
            onMouseEnter={() => setHover({ kind: 'lens', lens: l.key })} onMouseLeave={() => setHover(null)}>
            {l.label} {counts[i]}
          </text>
        );
      })}
    </svg>
  );
}

// 2. Sunburst: inner ring = layer, outer ring = type within the layer.
function Sunburst({ items, hover, setHover }) {
  const cx = W / 2; const cy = H / 2; const total = Math.max(1, items.length);
  const byLayer = {};
  for (const i of items) {
    byLayer[i.layer] = byLayer[i.layer] || {};
    byLayer[i.layer][i.type] = (byLayer[i.layer][i.type] || 0) + 1;
  }
  const arc = (r0, r1, a0, a1) => {
    const large = a1 - a0 > Math.PI ? 1 : 0;
    const [x0, y0] = polar(cx, cy, r1, a0); const [x1, y1] = polar(cx, cy, r1, a1);
    const [x2, y2] = polar(cx, cy, r0, a1); const [x3, y3] = polar(cx, cy, r0, a0);
    return `M${x0},${y0}A${r1},${r1} 0 ${large} 1 ${x1},${y1}L${x2},${y2}A${r0},${r0} 0 ${large} 0 ${x3},${y3}Z`;
  };
  const isOn = (layer, type) => hover && hover.kind === 'layer' && hover.layer === layer && (!hover.type || hover.type === type);
  let a = 0;
  const paths = [];
  for (const [layer, types] of Object.entries(byLayer)) {
    const n = Object.values(types).reduce((s, v) => s + v, 0);
    const span = Math.min(2 * Math.PI - 0.01, (2 * Math.PI * n) / total);
    paths.push(
      <path key={layer} d={arc(20, 42, a, a + span - 0.005)} fill={LAYER_COLOR[layer]} fillOpacity={isOn(layer) ? 1 : 0.85}
        stroke={isOn(layer) ? 'var(--text-primary)' : 'none'} className="cursor-pointer"
        onMouseEnter={() => setHover({ kind: 'layer', layer })} onMouseLeave={() => setHover(null)}>
        <title>{LAYER_LABEL[layer]}: {n}</title>
      </path>,
    );
    let b = a;
    for (const [type, c] of Object.entries(types)) {
      const s2 = Math.min(2 * Math.PI - 0.01, (2 * Math.PI * c) / total);
      paths.push(
        <path key={`${layer}/${type}`} d={arc(44, 64, b, b + s2 - 0.005)} fill={LAYER_COLOR[layer]} fillOpacity={isOn(layer, type) ? 0.9 : 0.5}
          stroke={hover && hover.kind === 'layer' && hover.type === type && hover.layer === layer ? 'var(--text-primary)' : 'none'} className="cursor-pointer"
          onMouseEnter={() => setHover({ kind: 'layer', layer, type })} onMouseLeave={() => setHover(null)}>
          <title>{LAYER_LABEL[layer]} › {type}: {c}</title>
        </path>,
      );
      b += s2;
    }
    a += span;
  }
  return <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-full" preserveAspectRatio="xMidYMid meet">{paths}</svg>;
}

// 3. Bars: score per step in step order, lens-coloured; a dot = several lenses agreed.
function Bars({ items, total, hover, setHover }) {
  const n = Math.max(1, total);
  const bw = (W - 10) / n;
  const max = Math.max(0.0001, ...items.map((i) => i.score));
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-full" preserveAspectRatio="xMidYMid meet">
      <line x1="5" x2={W - 5} y1={H - 12} y2={H - 12} stroke="var(--border)" />
      {items.map((i) => {
        const h = ((H - 26) * i.score) / max;
        const on = matchesHover(i, hover);
        return (
          <g key={i.id} className="cursor-pointer" onMouseEnter={() => setHover({ kind: 'item', id: i.id })} onMouseLeave={() => setHover(null)}>
            <rect className="spider-stats__bar" x={5 + (i.step - 1) * bw} y={H - 12 - h} width={Math.max(1, bw - 1)} height={h}
              fill={LENS_COLOR[i.lens]} fillOpacity={hover && !on ? 0.35 : 1} stroke={on ? 'var(--text-primary)' : 'none'}>
              <title>#{i.step} {i.title} · {i.score.toFixed(3)}{i.agree > 1 ? ` · ${i.agree} lencse` : ''}</title>
            </rect>
            {i.agree > 1 && <circle cx={5 + (i.step - 0.5) * bw} cy={H - 16 - h} r="1.6" fill="var(--text-secondary)" />}
          </g>
        );
      })}
      <text x="5" y={H - 2} fontSize="8" fill="var(--text-tertiary)">#1</text>
      <text x={W - 5} y={H - 2} fontSize="8" textAnchor="end" fill="var(--text-tertiary)">#{total}</text>
    </svg>
  );
}

// 4. Tree: who led to whom, depth from the starting points, lens-coloured.
function Tree({ items, hover, setHover }) {
  const byId = new Map(items.map((i) => [i.id, i]));
  const depth = new Map();
  const depthOf = (i) => {
    if (depth.has(i.id)) return depth.get(i.id);
    const parent = i.from && byId.get(i.from);
    const d = parent ? depthOf(parent) + 1 : 0;
    depth.set(i.id, d);
    return d;
  };
  for (const i of items) depthOf(i);
  const levels = [];
  for (const i of items) (levels[depth.get(i.id)] = levels[depth.get(i.id)] || []).push(i);
  const pos = new Map();
  const dx = levels.length > 1 ? (W - 20) / (levels.length - 1) : 0;
  levels.forEach((lvl, d) => lvl.forEach((i, k) => pos.set(i.id, [10 + d * dx, 8 + ((H - 16) * (k + 0.5)) / lvl.length])));
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-full" preserveAspectRatio="xMidYMid meet">
      {items.filter((i) => i.from && pos.has(i.from)).map((i) => {
        const [x0, y0] = pos.get(i.from); const [x1, y1] = pos.get(i.id);
        return <path key={`e${i.id}`} d={`M${x0},${y0}C${(x0 + x1) / 2},${y0} ${(x0 + x1) / 2},${y1} ${x1},${y1}`} fill="none" stroke={LENS_COLOR[i.lens]} strokeOpacity={hover && !matchesHover(i, hover) ? 0.15 : 0.6} />;
      })}
      {items.map((i) => {
        const [x, y] = pos.get(i.id);
        const on = matchesHover(i, hover);
        return (
          <circle key={i.id} cx={x} cy={y} r={on ? 4 : 2.6} fill={LENS_COLOR[i.lens]} className="cursor-pointer"
            onMouseEnter={() => setHover({ kind: 'item', id: i.id })} onMouseLeave={() => setHover(null)}>
            <title>#{i.step} {i.title}</title>
          </circle>
        );
      })}
    </svg>
  );
}

// 5. Tag cloud: the reached items' tags as pills, coloured by kind (project /
// person / topic — the Search chip colours), sized by score weight. Hover
// highlights the items carrying the tag; the ⋮ at the end of a pill opens the
// menu that runs it as a new search with any method.
const TAG_CHIP = {
  project: 'bg-purple-100 text-purple-700 dark:bg-purple-900 dark:text-purple-300',
  person: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900 dark:text-emerald-300',
  topic: 'bg-indigo-100 text-indigo-700 dark:bg-indigo-900 dark:text-indigo-300',
};

function Tags({ items, hover, setHover, onSearch }) {
  const [menu, setMenu] = useState(null);
  const w = {};
  const kind = {};
  for (const i of items) {
    for (const [k, list] of [['project', i.projects], ['person', i.people.filter((p) => p !== 'Me')], ['topic', i.topics]]) {
      for (const t of list) { w[t] = (w[t] || 0) + i.score; kind[t] = kind[t] || k; }
    }
  }
  const top = Object.entries(w).sort((a, b) => b[1] - a[1]).slice(0, 40); // the strip scrolls
  const max = top.length ? top[0][1] : 1;
  return (
    <div className="spider-stats__tags relative flex flex-wrap items-center content-start gap-1 h-full overflow-y-auto">
      {top.map(([tag, v]) => {
        const on = hover && hover.kind === 'tag' && hover.tag === tag;
        return (
          <span
            key={tag}
            onMouseEnter={() => setHover({ kind: 'tag', tag })}
            onMouseLeave={() => setHover(null)}
            className={`spider-stats__tag inline-flex items-center gap-1 rounded-full pl-2 pr-1 py-0.5 leading-tight transition-all duration-300 ${TAG_CHIP[kind[tag]]} ${on ? 'ring-1 ring-[var(--accent-blue)]' : ''}`}
            style={{ fontSize: `${10 + 5 * (v / max)}px`, opacity: 0.6 + 0.4 * (v / max) }}
          >
            {tag}
            <button type="button" onClick={() => setMenu(menu === tag ? null : tag)} title="Keresés erre…"
              className="spider-stats__tag-more px-1 rounded-full hover:bg-black/10 dark:hover:bg-white/10">⋮</button>
          </span>
        );
      })}
      {menu && (
        <div className="spider-stats__tag-menu sticky bottom-0 z-20 w-full flex items-center gap-1 px-2 py-1.5 bg-surface border border-subtle shadow-lg text-xs">
          <span className="text-txt-ter mr-1">„{menu}” keresése:</span>
          {['search', 'map', 'spider'].map((m) => (
            <button key={m} type="button" onClick={() => { setMenu(null); onSearch(menu, m); }}
              className="px-2 py-0.5 border border-subtle text-txt-sec hover:bg-accent hover:text-white uppercase tracking-wider text-[10px]">
              {m}
            </button>
          ))}
          <button type="button" onClick={() => setMenu(null)} className="ml-1 text-txt-ter hover:text-txt">✕</button>
        </div>
      )}
    </div>
  );
}

function Kpis({ items }) {
  const walked = items.filter((i) => i.round > 0);
  const agree = walked.length ? walked.reduce((s, i) => s + i.agree, 0) / walked.length : 0;
  const layers = new Set(items.map((i) => i.layer)).size;
  const dated = items.filter((i) => !i.entity && i.date);
  const age = dated.length ? dated.reduce((s, i) => s + (Date.now() - new Date(i.date).getTime()) / 86400000, 0) / dated.length : 0;
  const proj = {};
  for (const i of items) for (const p of i.projects) proj[p] = (proj[p] || 0) + 1;
  const ranked = Object.entries(proj).sort((a, b) => b[1] - a[1]);
  const kpi = (label, value, hint) => (
    <div className="spider-stats__kpi" title={hint}>
      <span className="block text-[10px] uppercase tracking-wider text-txt-ter">{label}</span>
      <span className="text-sm text-txt font-mono">{value}</span>
    </div>
  );
  return (
    <div className="spider-stats__kpis flex flex-wrap gap-6">
      {kpi('lencse-egyetértés', agree.toFixed(1), 'Átlagosan hány lencse jutott el ugyanahhoz a lépéshez — magas = a nézetek egyetértenek')}
      {kpi('rétegek', `${layers}/5`, 'Hány ontológia-réteget fedett le')}
      {kpi('átlagos kor', `${Math.round(age)} nap`, 'Az elért thoughtok tartalmának átlagos kora')}
      {kpi('fókusz', ranked.length ? `${ranked[0][0]} ${Math.round((100 * ranked[0][1]) / items.length)}%` : '—', 'A leggyakoribb projekt aránya — alacsony = szétszórt bejárás')}
    </div>
  );
}

export default function SpiderStats({ items, lenses, total, hover, setHover, onSearch }) {
  const [open, setOpen] = useState(true);
  return (
    <div className="spider-stats px-6 pt-2 pb-3 bg-surface border-t border-subtle">
      <div className="spider-stats__header flex items-center gap-6 mb-2">
        <button type="button" onClick={() => setOpen(!open)} className="text-[10px] uppercase tracking-wider text-txt-ter hover:text-txt shrink-0">
          A bejárás minősége {open ? '▾' : '▸'}
        </button>
        <Kpis items={items} />
      </div>
      {open && (
        <div className="grid grid-cols-2 md:grid-cols-3 2xl:grid-cols-5 gap-5">
          <Chart title="Lencsék (csillag)" help="Hány lépést tett az egyes lencse. Kiegyensúlyozott csillag = több nézet vitte a bejárást; egy kiugró ág = egy lencse uralta. Rámutatva kiemeli a lencse találatait.">
            <Radar items={items.filter((i) => i.round > 0)} lenses={lenses} hover={hover} setHover={setHover} />
          </Chart>
          <Chart title="Rétegek → típusok (sunburst)" help="Belső gyűrű: ontológia-réteg (Horgony, Történés, Tárgy, Vállalás, Tudás); külső: a típus a rétegen belül. Rámutatva kiemeli az odatartozó találatokat.">
            <Sunburst items={items} hover={hover} setHover={setHover} />
          </Chart>
          <Chart title="Pontszám lépésenként" help="Minden oszlop egy lépés, sorrendben, a lencse színével; pont = több lencse egyetértett. A lejtés mutatja, milyen gyorsan gyengül a bejárás. Rámutatva kiemeli a lépést fent.">
            <Bars items={items} total={total} hover={hover} setHover={setHover} />
          </Chart>
          <Chart title="Bejárás fája" help="Balra a kiindulópontok, jobbra a belőlük nyílt lépések; a vonal színe a lencse, amelyen át jött. Mély, ágas fa = valódi bejárás; lapos = csak a keresés.">
            <Tree items={items} hover={hover} setHover={setHover} />
          </Chart>
          <Chart title="Címkefelhő" help="Az elért elemek címkéi pontszámmal súlyozva — lila projekt, zöld ember, indigó téma. Ebből látszik, miről szól a bejárás, és becsúszott-e idegen téma. A ⋮ új keresést indít a címkére.">
            <Tags items={items} hover={hover} setHover={setHover} onSearch={onSearch} />
          </Chart>
        </div>
      )}
    </div>
  );
}
