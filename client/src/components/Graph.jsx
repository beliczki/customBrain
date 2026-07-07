import { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import GraphologyGraph from 'graphology';
import forceAtlas2 from 'graphology-layout-forceatlas2';
import Sigma from 'sigma';
import { getGraph } from '../api.js';
import ThoughtModal from './ThoughtModal.jsx';

// Community color palette — fixed order so cluster N keeps its color across
// reloads (server-side Louvain is deterministic: randomWalk off).
const PALETTE = [
  '#6366f1', '#10b981', '#a855f7', '#f59e0b', '#f43f5e', '#06b6d4',
  '#84cc16', '#d946ef', '#0ea5e9', '#f97316', '#14b8a6', '#8b5cf6',
];
const communityColor = (c) => (c < 0 ? '#999999' : PALETTE[c % PALETTE.length]);

// Edge provenance colors (the gbrain/Graphify steal: every edge says WHY).
// Sigma's default programs don't do dashed lines, so provenance is encoded
// by color + arrow instead; the legend is the decoder ring.
const EDGE_STYLE = {
  light: { metadata: 'rgba(0,0,0,0.16)', semantic: 'rgba(0,0,255,0.35)', supersedes: 'rgba(217,119,6,0.8)' },
  dark: { metadata: 'rgba(255,255,255,0.14)', semantic: 'rgba(80,120,255,0.5)', supersedes: 'rgba(245,158,11,0.8)' },
};

const EDGE_KIND_LABELS = {
  metadata: 'shared tag (deterministic)',
  semantic: 'semantic ≥ threshold (cosine)',
  supersedes: 'supersedes (archive chain)',
};

function isDark() {
  return document.documentElement.classList.contains('dark');
}

/** Deterministic ring positions as ForceAtlas2 seed — no Math.random so the
 *  layout is identical on every load (nodes never "jump" between visits). */
function seedPositions(g) {
  const n = g.order;
  let i = 0;
  g.forEachNode((node) => {
    const angle = (2 * Math.PI * i) / Math.max(1, n);
    // Second golden-angle term de-rings the seed so FA2 converges faster.
    const r = 1 + 0.3 * ((i * 137.5) % 360) / 360;
    g.setNodeAttribute(node, 'x', r * Math.cos(angle));
    g.setNodeAttribute(node, 'y', r * Math.sin(angle));
    i++;
  });
}

function runLayout(g, iterations = 200) {
  if (g.order === 0) return;
  seedPositions(g);
  const settings = forceAtlas2.inferSettings(g);
  forceAtlas2.assign(g, { iterations, settings });
}

export default function Graph() {
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [view, setView] = useState('clusters'); // 'clusters' | 'thoughts'
  const [focusCommunities, setFocusCommunities] = useState(null); // null = all, Set = drill-down
  const [edgeKinds, setEdgeKinds] = useState({ metadata: true, semantic: true, supersedes: true });
  const [semThreshold, setSemThreshold] = useState(0.75);
  const [selectedNode, setSelectedNode] = useState(null);
  const [modalThoughtId, setModalThoughtId] = useState(null);
  const [query, setQuery] = useState('');
  const containerRef = useRef(null);
  const sigmaRef = useRef(null);

  useEffect(() => {
    getGraph().then(setData).catch((err) => setError(err.message));
  }, []);

  const nodeById = useMemo(() => {
    if (!data) return new Map();
    return new Map(data.nodes.map((n) => [n.id, n]));
  }, [data]);

  const communityLabel = useMemo(() => {
    if (!data) return new Map();
    return new Map(data.communities.map((c) => [c.id, c.label]));
  }, [data]);

  // Active edges under the current legend toggles + semantic threshold.
  const activeEdges = useMemo(() => {
    if (!data) return [];
    return data.edges.filter((e) => {
      if (!edgeKinds[e.kind]) return false;
      if (e.kind === 'semantic' && e.score < semThreshold) return false;
      return true;
    });
  }, [data, edgeKinds, semThreshold]);

  // Neighbor list of the selected node, with edge provenance.
  const selectedNeighbors = useMemo(() => {
    if (!selectedNode || !data) return [];
    const out = [];
    for (const e of activeEdges) {
      if (e.source !== selectedNode && e.target !== selectedNode) continue;
      const otherId = e.source === selectedNode ? e.target : e.source;
      const other = nodeById.get(otherId);
      if (!other) continue;
      out.push({ node: other, edge: e });
    }
    out.sort((a, b) => b.edge.weight - a.edge.weight);
    return out;
  }, [selectedNode, activeEdges, nodeById, data]);

  // Orphans + hubs for the side panel (full-graph degrees from the server,
  // independent of client-side edge toggles — matches find_overconnected).
  const orphans = useMemo(
    () => (data ? data.nodes.filter((n) => n.degree === 0 && !n.archived) : []),
    [data],
  );
  const hubs = useMemo(
    () => (data ? data.nodes.slice().sort((a, b) => b.degree - a.degree).slice(0, 5) : []),
    [data],
  );

  const searchMatches = useMemo(() => {
    if (!data || query.trim().length < 2) return [];
    const q = query.trim().toLowerCase();
    return data.nodes.filter((n) => (n.title || '').toLowerCase().includes(q)).slice(0, 8);
  }, [data, query]);

  const drillInto = useCallback((communityIds) => {
    setFocusCommunities(communityIds ? new Set(communityIds) : null);
    setView('thoughts');
    setSelectedNode(null);
  }, []);

  // === Sigma instance ===
  useEffect(() => {
    if (!data || !containerRef.current) return;
    const dark = isDark();
    const edgeColors = dark ? EDGE_STYLE.dark : EDGE_STYLE.light;
    const labelColor = dark ? '#E0E0E0' : '#000000';
    const g = new GraphologyGraph({ multi: false, type: 'mixed' });

    if (view === 'clusters') {
      // Level 0 — community meta-graph. Size-1 communities aggregate into one
      // "Unclustered" node so 40 singleton dots don't drown the map.
      const singles = data.communities.filter((c) => c.size === 1);
      const clusters = data.communities.filter((c) => c.size > 1);
      for (const c of clusters) {
        g.addNode(`c${c.id}`, {
          label: `${c.label} (${c.size})`,
          size: 8 + Math.sqrt(c.size) * 2.5,
          color: communityColor(c.id),
          communityIds: [c.id],
        });
      }
      if (singles.length > 0) {
        g.addNode('c_unclustered', {
          label: `Unclustered (${singles.length})`,
          size: 8 + Math.sqrt(singles.length) * 2.5,
          color: '#999999',
          communityIds: singles.map((c) => c.id),
        });
      }
      // Meta edges = cross-community edge counts over the active edge set.
      const crossCounts = new Map();
      const nodeCommunity = new Map(data.nodes.map((n) => [n.id, n.community]));
      const singleIds = new Set(singles.map((c) => c.id));
      const metaId = (c) => (singleIds.has(c) ? 'c_unclustered' : `c${c}`);
      for (const e of activeEdges) {
        const ca = nodeCommunity.get(e.source);
        const cb = nodeCommunity.get(e.target);
        if (ca === undefined || cb === undefined || ca === cb) continue;
        const a = metaId(ca); const b = metaId(cb);
        if (a === b || !g.hasNode(a) || !g.hasNode(b)) continue;
        const key = a < b ? `${a}|${b}` : `${b}|${a}`;
        crossCounts.set(key, (crossCounts.get(key) || 0) + 1);
      }
      for (const [key, count] of crossCounts) {
        const [a, b] = key.split('|');
        g.addEdge(a, b, { size: Math.min(6, 0.5 + Math.log2(1 + count)), color: edgeColors.metadata });
      }
      runLayout(g, 150);
    } else {
      // Level 1 — thoughts (all, or the drilled-into communities).
      const visible = data.nodes.filter(
        (n) => !focusCommunities || focusCommunities.has(n.community),
      );
      for (const n of visible) {
        g.addNode(n.id, {
          label: n.title,
          size: n.archived ? 3 : 4 + Math.min(10, Math.sqrt(n.degree) * 1.6),
          color: n.archived ? (dark ? '#555555' : '#cccccc') : communityColor(n.community),
        });
      }
      for (const e of activeEdges) {
        if (!g.hasNode(e.source) || !g.hasNode(e.target) || g.hasEdge(e.source, e.target)) continue;
        if (e.kind === 'supersedes') {
          g.addDirectedEdge(e.source, e.target, { size: 1.5, color: edgeColors.supersedes, type: 'arrow' });
        } else {
          g.addEdge(e.source, e.target, {
            size: e.kind === 'semantic' ? 1.2 : Math.min(3, 0.6 + e.weight * 0.4),
            color: edgeColors[e.kind],
          });
        }
      }
      runLayout(g, 200);
    }

    const sigma = new Sigma(g, containerRef.current, {
      renderLabels: true,
      labelSize: 11,
      labelColor: { color: labelColor },
      labelRenderedSizeThreshold: view === 'clusters' ? 0 : 7,
      defaultEdgeType: 'line',
      minCameraRatio: 0.05,
      maxCameraRatio: 4,
    });
    sigmaRef.current = sigma;

    // Hover: dim everything outside the hovered node's neighborhood.
    let hovered = null;
    sigma.setSetting('nodeReducer', (node, attrs) => {
      if (!hovered || node === hovered || g.areNeighbors(node, hovered)) return attrs;
      return { ...attrs, color: dark ? '#333333' : '#eeeeee', label: '' };
    });
    sigma.setSetting('edgeReducer', (edge, attrs) => {
      if (!hovered || g.hasExtremity(edge, hovered)) return attrs;
      return { ...attrs, hidden: true };
    });
    sigma.on('enterNode', ({ node }) => { hovered = node; sigma.refresh(); });
    sigma.on('leaveNode', () => { hovered = null; sigma.refresh(); });

    sigma.on('clickNode', ({ node }) => {
      if (view === 'clusters') {
        drillInto(g.getNodeAttribute(node, 'communityIds'));
      } else {
        setSelectedNode(node);
      }
    });
    sigma.on('clickStage', () => setSelectedNode(null));

    return () => {
      sigma.kill();
      sigmaRef.current = null;
    };
  }, [data, view, focusCommunities, activeEdges, drillInto]);

  const focusOnNode = useCallback((id) => {
    setView('thoughts');
    setFocusCommunities(null);
    setSelectedNode(id);
    setQuery('');
    // Camera move happens after the effect above rebuilds sigma for the new view.
    setTimeout(() => {
      const sigma = sigmaRef.current;
      if (!sigma || !sigma.getGraph().hasNode(id)) return;
      const pos = sigma.getNodeDisplayData(id);
      if (pos) sigma.getCamera().animate({ x: pos.x, y: pos.y, ratio: 0.25 }, { duration: 400 });
    }, 100);
  }, []);

  if (error) return <p className="text-red-600 dark:text-red-400 text-sm">Graph error: {error}</p>;
  if (!data) return <p className="text-txt-ter text-sm">Building graph…</p>;

  const selected = selectedNode ? nodeById.get(selectedNode) : null;

  return (
    <div className="graph-tab">
      {/* Toolbar */}
      <div className="graph-toolbar flex flex-wrap items-center gap-3 mb-4">
        <div className="graph-toolbar__views flex border border-subtle">
          {['clusters', 'thoughts'].map((v) => (
            <button
              key={v}
              onClick={() => { setView(v); setFocusCommunities(null); setSelectedNode(null); }}
              className={`graph-view-btn px-3 py-1.5 text-xs font-medium uppercase tracking-wider transition-colors ${
                view === v && !focusCommunities ? 'bg-accent text-white' : 'text-txt-sec hover:text-txt'
              }`}
            >
              {v === 'clusters' ? 'Cluster map' : 'All thoughts'}
            </button>
          ))}
        </div>
        {focusCommunities && (
          <button
            onClick={() => { setView('clusters'); setFocusCommunities(null); setSelectedNode(null); }}
            className="graph-back-btn px-3 py-1.5 text-xs text-txt-sec border border-subtle hover:text-txt transition-colors"
          >
            ← back to map
          </button>
        )}
        <div className="graph-search relative ml-auto">
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Find thought…"
            className="graph-search__input px-3 py-1.5 bg-surface border border-subtle text-txt text-sm w-56"
          />
          {searchMatches.length > 0 && (
            <div className="graph-search__results absolute top-full left-0 right-0 z-20 bg-surface border border-subtle shadow-lg max-h-64 overflow-y-auto">
              {searchMatches.map((n) => (
                <button
                  key={n.id}
                  onClick={() => focusOnNode(n.id)}
                  className="block w-full text-left px-3 py-2 text-xs text-txt hover:bg-[var(--border)] transition-colors"
                >
                  <span className="inline-block w-2 h-2 mr-2" style={{ backgroundColor: communityColor(n.community) }} />
                  {n.title}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      <div className="flex gap-4 items-start">
        {/* Canvas */}
        <div className="graph-canvas-wrap flex-1 min-w-0">
          <div
            ref={containerRef}
            className="graph-canvas border border-subtle bg-surface"
            style={{ height: '560px' }}
          />
          {/* Legend */}
          <div className="graph-legend flex flex-wrap items-center gap-4 mt-2 text-[10px] uppercase tracking-wider text-txt-ter">
            {Object.keys(EDGE_KIND_LABELS).map((kind) => (
              <label key={kind} className="graph-legend__item flex items-center gap-1.5 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={edgeKinds[kind]}
                  onChange={() => setEdgeKinds((prev) => ({ ...prev, [kind]: !prev[kind] }))}
                  className="accent-[var(--accent-blue)]"
                />
                <span
                  className="inline-block w-4 h-0.5"
                  style={{ backgroundColor: (isDark() ? EDGE_STYLE.dark : EDGE_STYLE.light)[kind] }}
                />
                {EDGE_KIND_LABELS[kind]}
              </label>
            ))}
            <label className="graph-legend__threshold flex items-center gap-1.5 ml-auto">
              cosine ≥ {semThreshold.toFixed(2)}
              <input
                type="range"
                min="0.7"
                max="0.9"
                step="0.01"
                value={semThreshold}
                onChange={(e) => setSemThreshold(parseFloat(e.target.value))}
                className="w-24 accent-[var(--accent-blue)]"
              />
            </label>
          </div>
        </div>

        {/* Side panel */}
        <div className="graph-side-panel w-64 shrink-0 space-y-4 text-sm">
          {selected ? (
            <div className="graph-node-info border border-subtle p-3">
              <div className="flex items-center gap-2 mb-1">
                <span className="inline-block w-2.5 h-2.5 shrink-0" style={{ backgroundColor: selected.archived ? '#999' : communityColor(selected.community) }} />
                <span className="font-medium text-txt text-xs leading-tight">{selected.title}</span>
              </div>
              <p className="text-[10px] uppercase tracking-wider text-txt-ter mb-2">
                {selected.type} · {selected.source} · {selected.degree} links
                {selected.archived && ' · archived'}
              </p>
              <button
                onClick={() => setModalThoughtId(selected.id)}
                className="graph-node-info__open w-full px-3 py-1.5 bg-accent text-white text-xs font-medium hover:bg-accent-dark transition-colors mb-2"
              >
                Open thought
              </button>
              {selectedNeighbors.length > 0 && (
                <>
                  <p className="text-xs uppercase tracking-wider text-txt-ter mt-2 mb-1">Connections</p>
                  <div className="graph-node-info__neighbors max-h-48 overflow-y-auto space-y-1">
                    {selectedNeighbors.map(({ node: n, edge: e }, i) => (
                      <button
                        key={`${n.id}-${i}`}
                        onClick={() => focusOnNode(n.id)}
                        className="block w-full text-left text-xs text-txt-sec hover:text-txt transition-colors"
                        title={
                          e.kind === 'metadata'
                            ? `shared: ${[...(e.shared?.people || []), ...(e.shared?.projects || []), ...(e.shared?.topics || [])].join(', ')}`
                            : e.kind === 'semantic'
                              ? `cosine ${(e.score * 100).toFixed(0)}%`
                              : 'supersedes'
                        }
                      >
                        <span className={`inline-block w-1.5 h-1.5 mr-1.5 ${e.kind === 'semantic' ? 'bg-[var(--accent-blue)]' : e.kind === 'supersedes' ? 'bg-amber-500' : 'bg-[var(--border-subtle)]'}`} />
                        {n.title}
                        {e.kind === 'semantic' && <span className="text-txt-ter"> {(e.score * 100).toFixed(0)}%</span>}
                      </button>
                    ))}
                  </div>
                </>
              )}
            </div>
          ) : view === 'clusters' ? (
            <div className="graph-cluster-panel border border-subtle p-3">
              <p className="text-xs uppercase tracking-wider text-txt-ter mb-2">Clusters</p>
              <div className="max-h-72 overflow-y-auto space-y-1">
                {data.communities.filter((c) => c.size > 1).map((c) => (
                  <button
                    key={c.id}
                    onClick={() => drillInto([c.id])}
                    className="block w-full text-left text-xs text-txt-sec hover:text-txt transition-colors"
                  >
                    <span className="inline-block w-2 h-2 mr-2" style={{ backgroundColor: communityColor(c.id) }} />
                    {c.label} <span className="text-txt-ter">({c.size})</span>
                  </button>
                ))}
              </div>
            </div>
          ) : (
            <div className="graph-health-panel border border-subtle p-3">
              <p className="text-xs uppercase tracking-wider text-txt-ter mb-2">
                Hubs <span className="text-[10px] normal-case">(most connected)</span>
              </p>
              <div className="space-y-1 mb-3">
                {hubs.map((n) => (
                  <button key={n.id} onClick={() => focusOnNode(n.id)} className="block w-full text-left text-xs text-txt-sec hover:text-txt transition-colors">
                    {n.title} <span className="text-txt-ter">({n.degree})</span>
                  </button>
                ))}
              </div>
              {orphans.length > 0 && (
                <>
                  <p className="text-xs uppercase tracking-wider text-txt-ter mb-1">
                    Orphans <span className="text-[10px] normal-case">({orphans.length} unlinked)</span>
                  </p>
                  <div className="max-h-40 overflow-y-auto space-y-1">
                    {orphans.map((n) => (
                      <button key={n.id} onClick={() => setModalThoughtId(n.id)} className="block w-full text-left text-xs text-txt-sec hover:text-txt transition-colors">
                        {n.title}
                      </button>
                    ))}
                  </div>
                </>
              )}
            </div>
          )}

          {/* Stats */}
          <div className="graph-stats border border-subtle p-3 text-[10px] uppercase tracking-wider text-txt-ter space-y-0.5">
            <p>{data.stats.node_count} thoughts · {data.stats.edge_count} links</p>
            <p>{data.stats.metadata_edges} tag · {data.stats.semantic_edges} semantic · {data.stats.supersedes_edges} supersedes</p>
            <p>{data.stats.community_count} clusters · {data.stats.orphan_count} orphans</p>
          </div>
        </div>
      </div>

      {modalThoughtId && (
        <ThoughtModal thoughtId={modalThoughtId} onClose={() => setModalThoughtId(null)} />
      )}
    </div>
  );
}
