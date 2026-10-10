import { useState } from 'react';

// spider's quality panel (0.69.0): pinned to the bottom of the page in spider
// mode. Every chart is computed from the steps revealed so far, so it grows
// with the six lens columns and settles when the replay ends. Hand-drawn SVG
// on purpose — five small charts do not justify a chart library.

export const LENS_COLOR = {
  start: '#9ca3af', ontology: '#a78bfa', project: '#60a5fa', person: '#34d399',
  source: '#f59e0b', type: '#f87171', cluster: '#22d3ee',
};
const LAYER_COLOR = { horgony: '#a78bfa', tortenes: '#60a5fa', targy: '#f59e0b', vallalas: '#f87171', tudas: '#34d399' };
const LAYER_LABEL = { horgony: 'Horgony', tortenes: 'Történés', targy: 'Tárgy', vallalas: 'Vállalás', tudas: 'Tudás' };
const W = 200;
const H = 170;

const polar = (cx, cy, r, a) => [cx + r * Math.sin(a), cy - r * Math.cos(a)];

function Chart({ title, children }) {
  return (
    <figure className="spider-stats__chart min-w-0">
      <figcaption className="text-[10px] uppercase tracking-wider text-txt-ter mb-1">{title}</figcaption>
      {children}
    </figure>
  );
}

// 1. Star: steps per lens — balanced walk or one lens carrying it.
function Radar({ items, lenses }) {
  const counts = lenses.map((l) => items.filter((i) => i.lens === l.key).length);
  const max = Math.max(1, ...counts);
  const cx = W / 2; const cy = H / 2 + 4; const R = 62;
  const angle = (i) => (2 * Math.PI * i) / lenses.length;
  const shape = counts.map((c, i) => polar(cx, cy, (R * c) / max, angle(i)));
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-auto">
      {[0.33, 0.66, 1].map((f) => (
        <polygon key={f} points={lenses.map((_, i) => polar(cx, cy, R * f, angle(i)).join(',')).join(' ')} fill="none" stroke="var(--border)" />
      ))}
      <path className="spider-stats__radar" d={`M${shape.map((p) => p.join(',')).join('L')}Z`} fill="var(--accent-blue)" fillOpacity="0.25" stroke="var(--accent-blue)" />
      {lenses.map((l, i) => {
        const [x, y] = polar(cx, cy, R + 14, angle(i));
        return <text key={l.key} x={x} y={y} fontSize="9" textAnchor="middle" dominantBaseline="middle" fill={LENS_COLOR[l.key]}>{l.label} {counts[i]}</text>;
      })}
    </svg>
  );
}

// 2. Sunburst: inner ring = layer, outer ring = type within the layer.
function Sunburst({ items }) {
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
  let a = 0;
  const paths = [];
  for (const [layer, types] of Object.entries(byLayer)) {
    const n = Object.values(types).reduce((s, v) => s + v, 0);
    const span = (2 * Math.PI * n) / total;
    paths.push(<path key={layer} d={arc(22, 48, a, a + span - 0.005)} fill={LAYER_COLOR[layer]}><title>{LAYER_LABEL[layer]}: {n}</title></path>);
    let b = a;
    for (const [type, c] of Object.entries(types)) {
      const s2 = (2 * Math.PI * c) / total;
      paths.push(<path key={`${layer}/${type}`} d={arc(50, 72, b, b + s2 - 0.005)} fill={LAYER_COLOR[layer]} fillOpacity="0.55"><title>{type}: {c}</title></path>);
      b += s2;
    }
    a += span;
  }
  return <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-auto">{paths}</svg>;
}

// 3. Bars: score per step in step order, lens-coloured; agreement marked.
function Bars({ items, total }) {
  const n = Math.max(1, total);
  const bw = (W - 10) / n;
  const max = Math.max(0.0001, ...items.map((i) => i.score));
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-auto">
      <line x1="5" x2={W - 5} y1={H - 14} y2={H - 14} stroke="var(--border)" />
      {items.map((i) => {
        const h = ((H - 30) * i.score) / max;
        return (
          <g key={i.id}>
            <rect className="spider-stats__bar" x={5 + (i.step - 1) * bw} y={H - 14 - h} width={Math.max(1, bw - 1)} height={h} fill={LENS_COLOR[i.lens]}>
              <title>#{i.step} {i.title} · {i.score.toFixed(3)}{i.agree > 1 ? ` · ${i.agree} lencse` : ''}</title>
            </rect>
            {i.agree > 1 && <circle cx={5 + (i.step - 0.5) * bw} cy={H - 18 - h} r="1.6" fill="var(--text-secondary)" />}
          </g>
        );
      })}
      <text x="5" y={H - 3} fontSize="8" fill="var(--text-tertiary)">#1</text>
      <text x={W - 5} y={H - 3} fontSize="8" textAnchor="end" fill="var(--text-tertiary)">#{total}</text>
    </svg>
  );
}

// 4. Tree: who led to whom, depth from the starting points, lens-coloured.
function Tree({ items }) {
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
  levels.forEach((lvl, d) => lvl.forEach((i, k) => pos.set(i.id, [10 + d * dx, 10 + ((H - 20) * (k + 0.5)) / lvl.length])));
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-auto">
      {items.filter((i) => i.from && pos.has(i.from)).map((i) => {
        const [x0, y0] = pos.get(i.from); const [x1, y1] = pos.get(i.id);
        return <path key={`e${i.id}`} d={`M${x0},${y0}C${(x0 + x1) / 2},${y0} ${(x0 + x1) / 2},${y1} ${x1},${y1}`} fill="none" stroke={LENS_COLOR[i.lens]} strokeOpacity="0.6" />;
      })}
      {items.map((i) => {
        const [x, y] = pos.get(i.id);
        return <circle key={i.id} cx={x} cy={y} r="2.6" fill={LENS_COLOR[i.lens]}><title>#{i.step} {i.title}</title></circle>;
      })}
    </svg>
  );
}

// 5. Words: topics, projects and people of what was reached, score-weighted.
function Words({ items }) {
  const w = {};
  for (const i of items) for (const t of [...i.topics, ...i.projects, ...i.people.filter((p) => p !== 'Me')]) w[t] = (w[t] || 0) + i.score;
  const top = Object.entries(w).sort((a, b) => b[1] - a[1]).slice(0, 28);
  const max = top.length ? top[0][1] : 1;
  return (
    <div className="spider-stats__words flex flex-wrap items-baseline content-start gap-x-2 gap-y-0.5 h-[170px] overflow-hidden">
      {top.map(([word, v]) => (
        <span key={word} className="spider-stats__word text-txt-sec transition-all duration-300 leading-tight" style={{ fontSize: `${10 + 12 * (v / max)}px`, opacity: 0.45 + 0.55 * (v / max) }}>{word}</span>
      ))}
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
  const [topProject, topCount] = Object.entries(proj).sort((a, b) => b[1] - a[1])[0] || ['—', 0];
  const kpi = (label, value, hint) => (
    <div className="spider-stats__kpi" title={hint}>
      <span className="block text-[10px] uppercase tracking-wider text-txt-ter">{label}</span>
      <span className="text-sm text-txt font-mono">{value}</span>
    </div>
  );
  return (
    <div className="spider-stats__kpis flex flex-wrap gap-6 mb-3">
      {kpi('lencse-egyetértés', agree.toFixed(1), 'Átlagosan hány lencse jutott el ugyanahhoz a lépéshez — magas = a nézetek egyetértenek')}
      {kpi('rétegek', `${layers}/5`, 'Hány ontológia-réteget fedett le')}
      {kpi('átlagos kor', `${Math.round(age)} nap`, 'Az elért thoughtok tartalmának átlagos kora')}
      {kpi('fókusz', `${topProject} ${items.length ? Math.round((100 * topCount) / items.length) : 0}%`, 'A leggyakoribb projekt aránya — alacsony = szétszórt bejárás')}
    </div>
  );
}

export default function SpiderStats({ items, lenses, total }) {
  const [open, setOpen] = useState(true);
  return (
    <div className="spider-stats sticky bottom-0 z-10 -mx-6 px-6 pt-2 pb-3 bg-surface border-t border-subtle">
      <button type="button" onClick={() => setOpen(!open)} className="spider-stats__header flex items-center gap-2 text-[10px] uppercase tracking-wider text-txt-ter hover:text-txt mb-1">
        A bejárás minősége {open ? '▾' : '▸'}
      </button>
      {open && (
        <>
          <Kpis items={items} />
          <div className="grid grid-cols-2 md:grid-cols-3 2xl:grid-cols-5 gap-4">
            <Chart title="Lencsék (csillag)"><Radar items={items.filter((i) => i.round > 0)} lenses={lenses} /></Chart>
            <Chart title="Rétegek → típusok (sunburst)"><Sunburst items={items} /></Chart>
            <Chart title="Pontszám lépésenként"><Bars items={items} total={total} /></Chart>
            <Chart title="Bejárás fája"><Tree items={items} /></Chart>
            <Chart title="Szófelhő"><Words items={items} /></Chart>
          </div>
        </>
      )}
    </div>
  );
}
