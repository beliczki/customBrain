import { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import ForceGraph3D from '3d-force-graph';
import SpriteText from 'three-spritetext';
import * as THREE from 'three';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { getGraph } from '../api.js';
import ThoughtModal from './ThoughtModal.jsx';

// Community color palette — fixed order so cluster N keeps its color across
// reloads (server-side Louvain is deterministic: randomWalk off).
const PALETTE = [
  '#6366f1', '#10b981', '#a855f7', '#f59e0b', '#f43f5e', '#06b6d4',
  '#84cc16', '#d946ef', '#0ea5e9', '#f97316', '#14b8a6', '#8b5cf6',
];
const communityColor = (c) => (c < 0 ? '#94a3b8' : PALETTE[c % PALETTE.length]);

// The 3D scene is always a dark "deep space" viewport regardless of app theme
// (bloom glow needs a near-black background to read).
const SCENE_BG = '#04060f';
const DIM_LINK = '#0a0e1a';

// Edge provenance colors (every edge says WHY it exists; legend decodes).
const LINK_COLOR = { metadata: '#333c50', semantic: '#3b5bdb', supersedes: '#b45309' };
const LINK_HL = { metadata: '#94a3b8', semantic: '#60a5fa', supersedes: '#fbbf24' };

const EDGE_KIND_LABELS = {
  metadata: 'shared tag (deterministic)',
  semantic: 'semantic ≥ threshold (cosine)',
  supersedes: 'supersedes (archive chain)',
};

const endId = (v) => (typeof v === 'object' && v !== null ? v.id : v);
const truncate = (s, n) => ((s || '').length > n ? `${s.slice(0, n - 1)}…` : s || '');
const escapeHtml = (s) => (s || '').replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);

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

  const wrapRef = useRef(null);
  const containerRef = useRef(null);
  const graphRef = useRef(null);
  // Per-node three.js handles so highlight changes mutate materials in place
  // (no scene rebuild, no dropped frames).
  const nodeObjsRef = useRef(new Map());
  // Node objects are cached per id so d3 positions survive filter changes —
  // toggling an edge kind re-settles gently instead of exploding the layout.
  const nodeCacheRef = useRef(new Map());
  const selectedRef = useRef(null);
  const viewRef = useRef(view);
  const hoverRef = useRef(null);
  const pendingFocusRef = useRef(null);

  useEffect(() => {
    getGraph().then(setData).catch((err) => setError(err.message));
  }, []);

  const nodeById = useMemo(() => {
    if (!data) return new Map();
    return new Map(data.nodes.map((n) => [n.id, n]));
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

  // === Highlight: selected node + neighbors stay lit and labeled, the rest
  // of the scene fades to near-invisible and loses its labels entirely. ===
  const applyHighlight = useCallback(() => {
    const graph = graphRef.current;
    if (!graph) return;
    const sel = selectedRef.current;
    const inClusterView = viewRef.current === 'clusters';

    const neighborhood = new Set();
    const labeled = new Set();
    if (sel) {
      neighborhood.add(sel);
      labeled.add(sel);
      const weighted = [];
      for (const l of graph.graphData().links) {
        const a = endId(l.source); const b = endId(l.target);
        if (a !== sel && b !== sel) continue;
        const other = a === sel ? b : a;
        neighborhood.add(other);
        weighted.push({ other, w: l.weight || 0 });
      }
      // Label only the strongest neighbors — a 48-degree hub must not become
      // a word cloud. Everything else stays lit but unlabeled.
      weighted.sort((x, y) => y.w - x.w).slice(0, 8).forEach(({ other }) => labeled.add(other));
    }

    for (const [id, o] of nodeObjsRef.current) {
      if (!sel) {
        o.mat.opacity = 0.95;
        o.mat.emissiveIntensity = o.archived ? 0.15 : 0.5;
        o.label.visible = inClusterView;
      } else if (neighborhood.has(id)) {
        o.mat.opacity = 1;
        o.mat.emissiveIntensity = id === sel ? 1.1 : 0.75;
        o.label.visible = labeled.has(id);
      } else {
        o.mat.opacity = 0.05;
        o.mat.emissiveIntensity = 0.02;
        o.label.visible = false;
      }
    }
    // Re-trigger link accessors (they read selectedRef).
    graph.linkColor(graph.linkColor());
    graph.linkDirectionalParticles(graph.linkDirectionalParticles());
  }, []);

  const selectNode = useCallback((id, { fly = true } = {}) => {
    selectedRef.current = id;
    setSelectedNode(id);
    applyHighlight();
    const graph = graphRef.current;
    if (!graph || !id || !fly) return;
    const node = graph.graphData().nodes.find((n) => n.id === id);
    if (!node) return;
    const dist = 130;
    const len = Math.hypot(node.x || 0, node.y || 0, node.z || 0) || 1;
    const ratio = 1 + dist / len;
    graph.cameraPosition(
      { x: node.x * ratio, y: node.y * ratio, z: node.z * ratio },
      node,
      1000,
    );
  }, [applyHighlight]);

  const drillInto = useCallback((communityIds) => {
    setFocusCommunities(communityIds ? new Set(communityIds) : null);
    setView('thoughts');
    selectedRef.current = null;
    setSelectedNode(null);
  }, []);

  // === One ForceGraph3D instance for the lifetime of the tab ===
  // Gated on `data`: before the fetch resolves the component renders the
  // loading placeholder, so the container div doesn't exist yet.
  useEffect(() => {
    if (!data || !containerRef.current) return;

    const graph = new ForceGraph3D(containerRef.current, { controlType: 'orbit' });
    graphRef.current = graph;

    graph
      .backgroundColor(SCENE_BG)
      .showNavInfo(false)
      .nodeLabel((n) => `
        <div class="graph-tooltip3d">
          <span class="graph-tooltip3d__title">${escapeHtml(n.title)}</span>
          <span class="graph-tooltip3d__meta">${escapeHtml(n.sub || '')}</span>
        </div>`)
      .nodeThreeObject((node) => {
        const group = new THREE.Group();
        const mat = new THREE.MeshPhongMaterial({
          color: node.color,
          emissive: node.color,
          emissiveIntensity: node.archived ? 0.15 : 0.5,
          shininess: 40,
          transparent: true,
          opacity: 0.95,
        });
        const mesh = new THREE.Mesh(new THREE.SphereGeometry(node.r, 24, 16), mat);
        group.add(mesh);

        const label = new SpriteText(truncate(node.title, 46), Math.max(3, Math.min(5, node.r * 0.4)));
        label.color = '#dbe4ee';
        label.backgroundColor = 'rgba(4, 7, 16, 0.82)';
        label.padding = 2;
        label.borderRadius = 2;
        label.position.y = node.r + Math.max(3.5, node.r * 0.9);
        // Labels always render on top — a label you can't read is worse than
        // no label (the exact bug this rewrite kills).
        label.material.depthTest = false;
        label.material.depthWrite = false;
        label.renderOrder = 999;
        label.visible = viewRef.current === 'clusters';
        group.add(label);

        nodeObjsRef.current.set(node.id, { mat, label, archived: !!node.archived });
        return group;
      })
      .linkColor((l) => {
        const sel = selectedRef.current;
        if (!sel) return LINK_COLOR[l.kind] || LINK_COLOR.metadata;
        const hl = endId(l.source) === sel || endId(l.target) === sel;
        return hl ? LINK_HL[l.kind] : DIM_LINK;
      })
      .linkWidth((l) => {
        const sel = selectedRef.current;
        const hl = sel && (endId(l.source) === sel || endId(l.target) === sel);
        return hl ? 1.2 : l.kind === 'supersedes' ? 0.8 : 0.3;
      })
      .linkOpacity(0.5)
      .linkDirectionalArrowLength((l) => (l.kind === 'supersedes' ? 3.5 : 0))
      .linkDirectionalArrowRelPos(0.9)
      .linkDirectionalParticles((l) => {
        const sel = selectedRef.current;
        return sel && (endId(l.source) === sel || endId(l.target) === sel) ? 3 : 0;
      })
      .linkDirectionalParticleWidth(1.4)
      .linkDirectionalParticleSpeed(0.006)
      .onNodeClick((node) => {
        if (viewRef.current === 'clusters') {
          drillInto(node.communityIds);
        } else {
          selectNode(node.id);
        }
      })
      .onBackgroundClick(() => selectNode(null))
      .onNodeHover((node) => {
        containerRef.current.style.cursor = node ? 'pointer' : null;
        const prev = hoverRef.current;
        if (prev && prev !== selectedRef.current) {
          const o = nodeObjsRef.current.get(prev);
          if (o && o.mat.opacity > 0.5) o.mat.emissiveIntensity = o.archived ? 0.15 : 0.5;
        }
        hoverRef.current = node ? node.id : null;
        if (node) {
          const o = nodeObjsRef.current.get(node.id);
          if (o && o.mat.opacity > 0.5) o.mat.emissiveIntensity = 0.95;
        }
      });

    // Gravity: stronger repulsion + a gentle pull to the origin so the brain
    // settles as one breathing organism instead of drifting apart.
    graph.d3Force('charge').strength(-110);
    graph.d3VelocityDecay(0.25);

    // Bloom — subtle glow only on the bright emissive spheres. Threshold must
    // stay well above 0 or the white label sprites flare and wash the scene.
    const bloom = new UnrealBloomPass(new THREE.Vector2(1024, 1024), 0.7, 0.4, 0.35);
    graph.postProcessingComposer().addPass(bloom);

    // Slow idle orbit until the user grabs the scene.
    const controls = graph.controls();
    controls.autoRotate = true;
    controls.autoRotateSpeed = 0.45;
    const stopSpin = () => { controls.autoRotate = false; };
    controls.addEventListener('start', stopSpin);

    const ro = new ResizeObserver(() => {
      if (!wrapRef.current) return;
      graph.width(wrapRef.current.clientWidth).height(640);
    });
    ro.observe(wrapRef.current);

    return () => {
      ro.disconnect();
      controls.removeEventListener('start', stopSpin);
      graph._destructor();
      graphRef.current = null;
      nodeObjsRef.current.clear();
    };
  }, [data, drillInto, selectNode]);

  // === Feed data into the scene on view / filter changes ===
  useEffect(() => {
    const graph = graphRef.current;
    if (!graph || !data) return;
    viewRef.current = view;
    selectedRef.current = null;
    setSelectedNode(null);
    nodeObjsRef.current.clear();

    let nodes = [];
    let links = [];

    if (view === 'clusters') {
      // Level 0 — community meta-graph. Size-1 communities aggregate into one
      // "Unclustered" node so 40 singleton dots don't drown the map.
      const singles = data.communities.filter((c) => c.size === 1);
      const clusters = data.communities.filter((c) => c.size > 1);
      const cache = nodeCacheRef.current;
      const metaNode = (id, label, size, color, communityIds) => {
        const cached = cache.get(id) || {};
        const n = Object.assign(cached, {
          id, title: label, sub: `${size} thoughts`, color, communityIds,
          r: 5 + Math.sqrt(size) * 1.7,
        });
        cache.set(id, n);
        return n;
      };
      nodes = clusters.map((c) =>
        metaNode(`c${c.id}`, `${c.label} (${c.size})`, c.size, communityColor(c.id), [c.id]));
      if (singles.length > 0) {
        nodes.push(metaNode('c_unclustered', `Unclustered (${singles.length})`,
          singles.length, '#64748b', singles.map((c) => c.id)));
      }
      // Meta edges = cross-community edge counts over the active edge set.
      const crossCounts = new Map();
      const nodeCommunity = new Map(data.nodes.map((n) => [n.id, n.community]));
      const singleIds = new Set(singles.map((c) => c.id));
      const metaId = (c) => (singleIds.has(c) ? 'c_unclustered' : `c${c}`);
      const present = new Set(nodes.map((n) => n.id));
      for (const e of activeEdges) {
        const ca = nodeCommunity.get(e.source);
        const cb = nodeCommunity.get(e.target);
        if (ca === undefined || cb === undefined || ca === cb) continue;
        const a = metaId(ca); const b = metaId(cb);
        if (a === b || !present.has(a) || !present.has(b)) continue;
        const key = a < b ? `${a}|${b}` : `${b}|${a}`;
        crossCounts.set(key, (crossCounts.get(key) || 0) + 1);
      }
      links = [...crossCounts].map(([key, count]) => {
        const [a, b] = key.split('|');
        return { source: a, target: b, kind: 'metadata', weight: count };
      });
    } else {
      // Level 1 — thoughts (all, or the drilled-into communities).
      const visible = data.nodes.filter(
        (n) => !focusCommunities || focusCommunities.has(n.community),
      );
      const cache = nodeCacheRef.current;
      nodes = visible.map((n) => {
        const cached = cache.get(n.id) || {};
        const obj = Object.assign(cached, {
          id: n.id,
          title: n.title,
          sub: `${n.type} · ${n.source} · ${n.degree} links${n.archived ? ' · archived' : ''}`,
          color: n.archived ? '#475569' : communityColor(n.community),
          archived: n.archived,
          r: n.archived ? 1.6 : 2.2 + Math.min(6.5, Math.sqrt(n.degree) * 1.1),
        });
        cache.set(n.id, obj);
        return obj;
      });
      const present = new Set(nodes.map((n) => n.id));
      const seen = new Set();
      links = activeEdges.filter((e) => {
        if (!present.has(e.source) || !present.has(e.target)) return false;
        const key = e.source < e.target ? `${e.source}|${e.target}` : `${e.target}|${e.source}`;
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      }).map((e) => ({ source: e.source, target: e.target, kind: e.kind, weight: e.weight, score: e.score }));
    }

    graph.graphData({ nodes, links });
    applyHighlight();

    // Deferred fly-to from search (waits for the new view's data to exist).
    if (pendingFocusRef.current && view === 'thoughts') {
      const id = pendingFocusRef.current;
      pendingFocusRef.current = null;
      setTimeout(() => selectNode(id), 700);
    }
  }, [data, view, focusCommunities, activeEdges, applyHighlight, selectNode]);

  const focusOnNode = useCallback((id) => {
    setQuery('');
    if (viewRef.current === 'thoughts' && !focusCommunities) {
      selectNode(id);
    } else {
      pendingFocusRef.current = id;
      setFocusCommunities(null);
      setView('thoughts');
    }
  }, [focusCommunities, selectNode]);

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
              onClick={() => { setView(v); setFocusCommunities(null); }}
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
            onClick={() => { setView('clusters'); setFocusCommunities(null); }}
            className="graph-back-btn px-3 py-1.5 text-xs text-txt-sec border border-subtle hover:text-txt transition-colors"
          >
            ← back to map
          </button>
        )}
        <p className="graph-hint text-[10px] uppercase tracking-wider text-txt-ter hidden md:block">
          drag to orbit · scroll to zoom · click a node to focus
        </p>
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
        <div className="graph-canvas-wrap flex-1 min-w-0" ref={wrapRef}>
          <div
            ref={containerRef}
            className="graph-canvas graph-canvas--3d border border-subtle overflow-hidden"
            style={{ height: '640px' }}
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
                  style={{ backgroundColor: LINK_HL[kind] }}
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
