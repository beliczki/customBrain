import { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import ForceGraph3D from '3d-force-graph';
import ForceGraph2D from 'force-graph';
import SpriteText from 'three-spritetext';
import * as THREE from 'three';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { getGraph } from '../api.js';
import ThoughtModal from './ThoughtModal.jsx';

// Community color palette — fixed order so cluster N keeps its color across
// reloads (server-side Louvain is deterministic: randomWalk off).
const PALETTE = [
  '#6366f1', '#10b981', '#a855f7', '#f59e0b', '#f43f5e', '#06b6d4',
  '#84cc16', '#d946ef', '#0ea5e9', '#f97316', '#14b8a6', '#8b5cf6',
];
const communityColor = (c) => (c < 0 ? '#94a3b8' : PALETTE[c % PALETTE.length]);
const MISC_COLOR = '#64748b';

// The scene is always a dark "deep space" viewport regardless of app theme.
// Pure black on purpose: the 3D postprocessing chain applies an extra
// linear→sRGB lift to any non-zero background — black is invariant.
const SCENE_BG = '#000000';
const DIM_LINK = '#0a0e1a';

// Edge provenance colors (every edge says WHY it exists; legend decodes).
// 'anchor'/'spoke' are layout links: member→group anchor and anchor→brain.
const LINK_COLOR = {
  metadata: '#333c50', semantic: '#3b5bdb', supersedes: '#b45309',
  anchor: '#161d2e', spoke: '#232c44',
};
const LINK_HL = { metadata: '#94a3b8', semantic: '#60a5fa', supersedes: '#fbbf24' };

const EDGE_KIND_LABELS = {
  metadata: 'shared tag (deterministic)',
  semantic: 'semantic ≥ threshold (cosine)',
  supersedes: 'supersedes (archive chain)',
};

const GROUP_MODES = [
  { key: 'clusters', label: 'Clusters' },
  { key: 'project', label: 'Project' },
  { key: 'person', label: 'Person' },
  { key: 'type', label: 'Type' },
  { key: 'source', label: 'Source' },
];

// Every thought mentions the owner — grouping by person must exclude self or
// everything collapses into one blob.
const SELF_ALIASES = new Set(['Me', 'Beliczki Róbert', 'Robert Beliczki', 'Róbert Beliczki', 'Robi']);

// A project/person needs at least this many thoughts to earn an anchor.
const MIN_ANCHOR_SIZE = 3;

// Orbit = thoughts with no anchored group; they ring the whole system.
const ORBIT_LABEL = { project: 'no project', person: 'solo', clusters: 'unclustered' };

const PREFS_KEY = 'graph_prefs';
function loadPrefs() {
  try { return JSON.parse(localStorage.getItem(PREFS_KEY)) || {}; } catch { return {}; }
}

// Thought radius as a function of degree. `spread` is the contrast exponent:
// 1 = the default sqrt curve, >1 exaggerates hubs vs. loners, <1 flattens.
const thoughtRadius = (degree, spread) =>
  1.8 + 10 * Math.pow(Math.min(1, (degree || 0) / 40), 0.5 * spread);

// Pre-rendered radial-gradient glow sprites, one per color. ctx.shadowBlur on
// every node froze the 2D renderer (hundreds of ms per frame at retina DPR);
// drawImage of a cached sprite is 10-50x cheaper.
const glowCache = new Map();
function glowSprite(color) {
  let c = glowCache.get(color);
  if (c) return c;
  const size = 64;
  c = document.createElement('canvas');
  c.width = size;
  c.height = size;
  const g = c.getContext('2d');
  const grad = g.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  grad.addColorStop(0, withAlpha(color, 0.55));
  grad.addColorStop(0.3, withAlpha(color, 0.22));
  grad.addColorStop(1, withAlpha(color, 0));
  g.fillStyle = grad;
  g.fillRect(0, 0, size, size);
  glowCache.set(color, c);
  return c;
}

const withAlpha = (hex, a) => {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgba(${r},${g},${b},${a})`;
};

const endId = (v) => (typeof v === 'object' && v !== null ? v.id : v);
const truncate = (s, n) => ((s || '').length > n ? `${s.slice(0, n - 1)}…` : s || '');
const escapeHtml = (s) => (s || '').replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);

/** Group membership under the chosen mode. Multi-valued fields (projects,
 *  people) give a thought ONE membership PER anchored value — physics places
 *  it between its clusters. `primary` (the rarest membership) drives color.
 *  Thoughts with no anchored membership are "orbit" nodes: no fake cluster,
 *  they ring the whole system. */
function deriveGroups(nodes, groupBy, communities) {
  const memberships = new Map();
  const primary = new Map();

  if (groupBy === 'clusters') {
    const commLabel = new Map(communities.map((c) => [c.id, c.label]));
    const singles = new Set(communities.filter((c) => c.size === 1).map((c) => c.id));
    for (const n of nodes) {
      const isOrbit = singles.has(n.community) || n.community < 0;
      memberships.set(n.id, isOrbit ? [] : [`c${n.community}`]);
      if (!isOrbit) primary.set(n.id, `c${n.community}`);
    }
    const counts = countMemberships(memberships);
    const groups = [...counts.entries()].map(([key, count]) => ({
      key,
      label: commLabel.get(parseInt(key.slice(1), 10)) || key,
      color: communityColor(parseInt(key.slice(1), 10)),
      count,
    }));
    groups.sort((a, b) => b.count - a.count);
    return { memberships, primary, groups, orbitCount: orbitTotal(memberships) };
  }

  if (groupBy === 'project' || groupBy === 'person') {
    const field = groupBy === 'project' ? 'projects' : 'people';
    const freq = new Map();
    for (const n of nodes) {
      for (const v of n[field] || []) {
        if (groupBy === 'person' && SELF_ALIASES.has(v)) continue;
        freq.set(v, (freq.get(v) || 0) + 1);
      }
    }
    const anchored = new Set(
      [...freq.entries()].filter(([, c]) => c >= MIN_ANCHOR_SIZE).map(([k]) => k),
    );
    for (const n of nodes) {
      const vals = [...new Set((n[field] || []).filter(
        (v) => anchored.has(v) && !(groupBy === 'person' && SELF_ALIASES.has(v)),
      ))];
      vals.sort((a, b) => freq.get(a) - freq.get(b)); // rarest first
      memberships.set(n.id, vals);
      if (vals.length) primary.set(n.id, vals[0]);
    }
    const counts = countMemberships(memberships);
    const groups = [...counts.entries()].map(([key, count]) => ({ key, label: key, count }));
    groups.sort((a, b) => b.count - a.count);
    groups.forEach((grp, i) => { grp.color = PALETTE[i % PALETTE.length]; });
    return { memberships, primary, groups, orbitCount: orbitTotal(memberships) };
  }

  // type | source — direct payload fields, single-valued, never orbit.
  for (const n of nodes) {
    const key = n[groupBy] || 'unknown';
    memberships.set(n.id, [key]);
    primary.set(n.id, key);
  }
  const counts = countMemberships(memberships);
  const groups = [...counts.entries()].map(([key, count]) => ({ key, label: key, count }));
  groups.sort((a, b) => b.count - a.count);
  groups.forEach((grp, i) => { grp.color = PALETTE[i % PALETTE.length]; });
  return { memberships, primary, groups, orbitCount: 0 };
}

function countMemberships(memberships) {
  const counts = new Map();
  for (const vals of memberships.values()) {
    for (const key of vals) counts.set(key, (counts.get(key) || 0) + 1);
  }
  return counts;
}

function orbitTotal(memberships) {
  let n = 0;
  for (const vals of memberships.values()) if (vals.length === 0) n++;
  return n;
}

export default function Graph() {
  const prefs = useRef(loadPrefs()).current;
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [mode, setMode] = useState(prefs.mode === '3d' ? '3d' : '2d');
  const [groupBy, setGroupBy] = useState(GROUP_MODES.some((m) => m.key === prefs.groupBy) ? prefs.groupBy : 'clusters');
  const [isolatedGroup, setIsolatedGroup] = useState(null);
  const [edgeKinds, setEdgeKinds] = useState(prefs.edgeKinds || { metadata: true, semantic: true, supersedes: true });
  const [semThreshold, setSemThreshold] = useState(prefs.semThreshold ?? 0.75);
  const [edgeOpacity, setEdgeOpacity] = useState(prefs.edgeOpacity ?? 0.6);
  const [sizeMult, setSizeMult] = useState(prefs.sizeMult ?? 1);
  const [sizeSpread, setSizeSpread] = useState(prefs.sizeSpread ?? 1);
  const [gravityMult, setGravityMult] = useState(prefs.gravityMult ?? 1);
  const [repelMult, setRepelMult] = useState(prefs.repelMult ?? 1);
  const [selectedNode, setSelectedNode] = useState(null);
  const [modalThoughtId, setModalThoughtId] = useState(null);
  const [query, setQuery] = useState('');
  const [panelOpen, setPanelOpen] = useState(prefs.panelOpen ?? true);
  const [collapsed, setCollapsed] = useState(prefs.collapsed || { edges: true, appearance: true, insights: true });
  const toggleSection = (key) => setCollapsed((prev) => ({ ...prev, [key]: !prev[key] }));

  const containerRef = useRef(null);
  const graphRef = useRef(null);
  // Per-node three.js handles (3D only) so highlight changes mutate materials
  // in place; 2D reads the highlight refs every canvas frame instead.
  const nodeObjsRef = useRef(new Map());
  // Node objects cached per id so d3 positions survive filter changes.
  const nodeCacheRef = useRef(new Map());
  const selectedRef = useRef(null);
  const neighborhoodRef = useRef(new Set());
  const labeledRef = useRef(new Set());
  const hoverRef = useRef(null);
  const fitPendingRef = useRef(false);
  const sizeMultRef = useRef(sizeMult);
  const sizeSpreadRef = useRef(sizeSpread);
  const edgeOpacityRef = useRef(edgeOpacity);
  const gravityMultRef = useRef(gravityMult);
  const repelMultRef = useRef(repelMult);
  const groupsRef = useRef([]);

  useEffect(() => {
    getGraph().then(setData).catch((err) => setError(err.message));
  }, []);

  // Persist view prefs.
  useEffect(() => {
    localStorage.setItem(PREFS_KEY, JSON.stringify({
      mode, groupBy, sizeMult, sizeSpread, gravityMult, repelMult, semThreshold, edgeKinds, edgeOpacity,
      panelOpen, collapsed,
    }));
  }, [mode, groupBy, sizeMult, sizeSpread, gravityMult, repelMult, semThreshold, edgeKinds, edgeOpacity, panelOpen, collapsed]);

  const nodeById = useMemo(() => {
    if (!data) return new Map();
    return new Map(data.nodes.map((n) => [n.id, n]));
  }, [data]);

  const grouping = useMemo(() => {
    if (!data) return { memberships: new Map(), primary: new Map(), groups: [], orbitCount: 0 };
    const active = data.nodes.filter((n) => !n.archived);
    return deriveGroups(active, groupBy, data.communities);
  }, [data, groupBy]);

  // Active edges under the current legend toggles + semantic threshold.
  const activeEdges = useMemo(() => {
    if (!data) return [];
    return data.edges.filter((e) => {
      if (!edgeKinds[e.kind]) return false;
      if (e.kind === 'semantic' && e.score < semThreshold) return false;
      return true;
    });
  }, [data, edgeKinds, semThreshold]);

  // Neighbor list of the selected node, with edge provenance (side panel).
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
  // fades and loses labels. 2D reads these refs per frame; 3D mutates mats. ===
  const applyHighlight = useCallback(() => {
    const graph = graphRef.current;
    if (!graph) return;
    const sel = selectedRef.current;

    const neighborhood = new Set();
    const labeled = new Set();
    if (sel) {
      neighborhood.add(sel);
      labeled.add(sel);
      const weighted = [];
      for (const l of graph.graphData().links) {
        if (l.kind === 'anchor' || l.kind === 'spoke') continue;
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
    neighborhoodRef.current = neighborhood;
    labeledRef.current = labeled;

    for (const [id, o] of nodeObjsRef.current) {
      if (!sel) {
        o.mat.opacity = 0.95;
        o.mat.emissiveIntensity = o.archived ? 0.15 : 0.5;
        o.label.visible = !!o.always;
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
    if (graph.cameraPosition) {
      // Bigger spheres need a longer approach or the camera lands inside them.
      const dist = 140 + (node.r || 4) * 12 * sizeMultRef.current;
      const len = Math.hypot(node.x || 0, node.y || 0, node.z || 0) || 1;
      const ratio = 1 + dist / len;
      graph.cameraPosition({ x: node.x * ratio, y: node.y * ratio, z: node.z * ratio }, node, 1000);
    } else {
      graph.centerAt(node.x, node.y, 800);
      graph.zoom(Math.max(3, graph.zoom()), 800);
    }
  }, [applyHighlight]);

  const focusOnNode = useCallback((id) => {
    setQuery('');
    setIsolatedGroup(null);
    // If isolation was active the data effect rebuilds first; flying after a
    // beat lets the node exist again before the camera chases it.
    setTimeout(() => selectNode(id), 60);
  }, [selectNode]);

  // === One graph instance per (data, mode) ===
  useEffect(() => {
    if (!data || !containerRef.current) return;
    const el = containerRef.current;

    const graph = mode === '3d'
      ? new ForceGraph3D(el, { controlType: 'orbit' })
      : new ForceGraph2D(el);
    graphRef.current = graph;

    graph
      .backgroundColor(SCENE_BG)
      .width(window.innerWidth)
      .height(window.innerHeight)
      .nodeLabel((n) => (n.kind === 'thought' ? `
        <div class="graph-tooltip3d">
          <span class="graph-tooltip3d__title">${escapeHtml(n.title)}</span>
          <span class="graph-tooltip3d__meta">${escapeHtml(n.sub || '')}</span>
        </div>` : ''))
      .linkColor((l) => {
        let base;
        if (l.kind === 'anchor' || l.kind === 'spoke') {
          base = LINK_COLOR[l.kind];
        } else {
          const sel = selectedRef.current;
          const hl = sel && (endId(l.source) === sel || endId(l.target) === sel);
          base = !sel ? (LINK_COLOR[l.kind] || LINK_COLOR.metadata) : hl ? LINK_HL[l.kind] : DIM_LINK;
        }
        // 2D honors alpha in the color; 3D uses the global linkOpacity uniform.
        return mode === '3d' ? base : withAlpha(base, edgeOpacityRef.current);
      })
      .linkWidth((l) => {
        if (l.kind === 'anchor') return 0.2;
        if (l.kind === 'spoke') return 0.5;
        const sel = selectedRef.current;
        const hl = sel && (endId(l.source) === sel || endId(l.target) === sel);
        return hl ? 1.4 : l.kind === 'supersedes' ? 0.8 : 0.3;
      })
      .linkDirectionalArrowLength((l) => (l.kind === 'supersedes' ? 3.5 : 0))
      .linkDirectionalArrowRelPos(0.9)
      .linkDirectionalParticles((l) => {
        if (l.kind === 'anchor' || l.kind === 'spoke') return 0;
        const sel = selectedRef.current;
        return sel && (endId(l.source) === sel || endId(l.target) === sel) ? 3 : 0;
      })
      .linkDirectionalParticleWidth(1.6)
      .linkDirectionalParticleSpeed(0.006)
      .onNodeClick((node) => {
        if (node.kind === 'anchor') {
          setIsolatedGroup((cur) => (cur === node.groupKey ? null : node.groupKey));
        } else if (node.kind === 'thought') {
          selectNode(node.id);
        } else {
          selectNode(null);
          setIsolatedGroup(null);
        }
      })
      .onBackgroundClick(() => {
        if (selectedRef.current) selectNode(null);
        else setIsolatedGroup(null);
      })
      .onNodeHover((node) => {
        el.style.cursor = node ? 'pointer' : null;
        hoverRef.current = node ? node.id : null;
        if (mode === '3d') {
          const prev = nodeObjsRef.current.get(hoverRef.current);
          void prev; // hover emphasis handled via emissive below
        }
      });

    // Gravity: a real pull toward the origin. Repulsion alone flings every
    // unlinked node to infinity, which breaks zoom-to-fit framing. Orbit
    // nodes are exempt — the orbit force owns them.
    let simNodes = [];
    const gravity = (alpha) => {
      const k = 0.06 * gravityMultRef.current * alpha;
      for (const n of simNodes) {
        if (n.orbit) continue;
        n.vx -= n.x * k;
        n.vy -= n.y * k;
        if (n.vz !== undefined) n.vz -= (n.z || 0) * k;
      }
    };
    gravity.initialize = (ns) => { simNodes = ns; };
    graph.d3Force('gravity', gravity);
    // Orbit ring: park no-group thoughts on a ring (2D) / shell (3D) just
    // outside the outermost cluster — visually "belongs to nothing".
    const orbitForce = (alpha) => {
      // Ring radius from the 92nd-percentile cluster extent, not the max —
      // one flung-out node must not push the ring into deep space.
      const ds = [];
      for (const n of simNodes) {
        if (n.orbit) continue;
        ds.push(Math.hypot(n.x || 0, n.y || 0, n.z || 0));
      }
      ds.sort((a, b) => a - b);
      const R = (ds.length ? ds[Math.floor(ds.length * 0.92)] : 0) + 30;
      // Strong pull: charge repulsion from ~300 core nodes otherwise wins and
      // smears the ring outward into a diffuse cloud.
      const k = 0.3 * alpha;
      for (const n of simNodes) {
        if (!n.orbit) continue;
        const d = Math.hypot(n.x || 0, n.y || 0, n.z || 0) || 1;
        const f = k * (d - R) / d;
        n.vx -= n.x * f;
        n.vy -= n.y * f;
        if (n.vz !== undefined) n.vz -= (n.z || 0) * f;
      }
    };
    orbitForce.initialize = (ns) => { simNodes = ns; };
    graph.d3Force('orbit', orbitForce);
    graph.d3VelocityDecay(0.3);
    // Faster cooldown: rearrangement settles in ~1/3 the time (default 0.0228
    // keeps the sim ticking — and repainting — for ~15s per change).
    graph.d3AlphaDecay(0.06);
    // Satellite layout: per-link distances/strengths precomputed on link
    // objects (anchor strength divides by membership count); real edges pull
    // only weakly so group membership wins the tug of war.
    graph.d3Force('link')
      .distance((l) => l.dist ?? 60)
      .strength((l) => l.strength ?? (l.kind === 'anchor' ? 0.7 : l.kind === 'spoke' ? 0.35 : 0.03));
    graph.d3Force('charge').strength((n) => {
      const base = n.kind === 'anchor' ? -500 : n.kind === 'brain' ? -700 : -35;
      return base * repelMultRef.current;
    });
    graph.warmupTicks(80);

    // Final camera fit once physics settles (once per data load — a flag, so
    // later engine stops after user drags don't yank the camera).
    graph.onEngineStop(() => {
      if (!fitPendingRef.current) return;
      fitPendingRef.current = false;
      graph.zoomToFit(700, 60);
    });

    if (mode === '3d') {
      graph.showNavInfo(false);
      graph.linkOpacity(edgeOpacityRef.current);
      graph.nodeThreeObject((node) => {
        const group = new THREE.Group();
        const mat = new THREE.MeshPhongMaterial({
          color: node.color,
          emissive: node.color,
          emissiveIntensity: node.archived ? 0.15 : 0.5,
          shininess: 40,
          transparent: true,
          opacity: 0.95,
          wireframe: node.kind === 'anchor',
        });
        const mesh = new THREE.Mesh(new THREE.SphereGeometry(node.r, 24, 16), mat);
        mesh.scale.setScalar(node.kind === 'thought'
          ? (thoughtRadius(node.degree, sizeSpreadRef.current) / node.r) * sizeMultRef.current
          : 1);
        group.add(mesh);

        const labelSize = node.big
          ? Math.min(9, Math.max(5, node.r * 0.5))
          : Math.max(3, Math.min(5, node.r * 0.4));
        const label = new SpriteText(truncate(node.title, 46), labelSize);
        label.color = '#dbe4ee';
        label.backgroundColor = 'rgba(4, 7, 16, 0.82)';
        label.padding = 2;
        label.borderRadius = 2;
        label.position.y = node.r * sizeMultRef.current + Math.max(3.5, node.r * 0.9);
        // Labels always render on top — a label you can't read is worse than
        // no label.
        label.material.depthTest = false;
        label.material.depthWrite = false;
        label.renderOrder = 999;
        label.visible = !!node.big;
        group.add(label);

        nodeObjsRef.current.set(node.id, {
          mat, label, mesh, baseR: node.r, degree: node.degree,
          archived: !!node.archived, always: !!node.big,
        });
        return group;
      });

      // Bloom — subtle glow on the bright emissive spheres only (threshold
      // well above 0 or white label sprites flare and wash the scene), plus
      // OutputPass so the frame converts back to sRGB.
      const bloom = new UnrealBloomPass(new THREE.Vector2(1024, 1024), 0.5, 0.2, 0.5);
      graph.postProcessingComposer().addPass(bloom);
      graph.postProcessingComposer().addPass(new OutputPass());

      const controls = graph.controls();
      controls.autoRotate = true;
      controls.autoRotateSpeed = 0.45;
      const stopSpin = () => { controls.autoRotate = false; };
      controls.addEventListener('start', stopSpin);
    } else {
      // 2D canvas renderer — glow via shadowBlur, ring anchors, video-style
      // always-on group labels; thought labels only for the highlight set.
      graph
        .nodeCanvasObject((node, ctx, globalScale) => {
          const sel = selectedRef.current;
          const inHood = !sel || neighborhoodRef.current.has(node.id);
          const r = node.kind === 'thought'
            ? thoughtRadius(node.degree, sizeSpreadRef.current) * 0.55 * sizeMultRef.current
            : node.r * 0.55;
          const alpha = node.kind === 'thought'
            ? (inHood ? (node.archived ? 0.5 : 0.95) : 0.06)
            : (inHood || node.kind === 'brain' ? 0.95 : 0.15);

          ctx.globalAlpha = alpha;
          if (node.kind === 'anchor') {
            const gs = r * 4;
            ctx.drawImage(glowSprite(node.color), node.x - gs / 2, node.y - gs / 2, gs, gs);
            ctx.strokeStyle = node.color;
            ctx.lineWidth = 1.2;
            ctx.beginPath();
            ctx.arc(node.x, node.y, r, 0, 2 * Math.PI);
            ctx.stroke();
            ctx.fillStyle = node.color;
            ctx.beginPath();
            ctx.arc(node.x, node.y, Math.max(1.6, r * 0.28), 0, 2 * Math.PI);
            ctx.fill();
          } else {
            if (inHood) {
              const gs = r * 5;
              ctx.drawImage(glowSprite(node.color), node.x - gs / 2, node.y - gs / 2, gs, gs);
            }
            ctx.fillStyle = node.color;
            ctx.beginPath();
            ctx.arc(node.x, node.y, r, 0, 2 * Math.PI);
            ctx.fill();
          }

          const showLabel = node.kind !== 'thought'
            ? true
            : (sel ? labeledRef.current.has(node.id) : hoverRef.current === node.id);
          if (showLabel && (node.kind !== 'thought' || inHood)) {
            const fontPx = node.kind === 'thought'
              ? Math.max(2.6, 10 / globalScale)
              : Math.max(3.2, Math.min(7, node.r * 0.42));
            ctx.font = `${node.kind === 'thought' ? '' : '600 '}${fontPx}px Inter, system-ui, sans-serif`;
            const text = node.kind === 'anchor'
              ? truncate(node.title, 38).toUpperCase()
              : truncate(node.title, 46);
            const w = ctx.measureText(text).width;
            const ty = node.y + r + fontPx + 2;
            ctx.globalAlpha = Math.min(1, alpha + 0.05);
            ctx.fillStyle = 'rgba(3, 5, 12, 0.78)';
            ctx.fillRect(node.x - w / 2 - 2, ty - fontPx, w + 4, fontPx + 3);
            ctx.fillStyle = node.kind === 'thought' ? '#e6edf5' : '#dbe4ee';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'alphabetic';
            ctx.fillText(text, node.x, ty);
          }
          ctx.globalAlpha = 1;
        })
        .nodePointerAreaPaint((node, color, ctx) => {
          const r = (node.kind === 'thought'
            ? thoughtRadius(node.degree, sizeSpreadRef.current) * 0.55 * sizeMultRef.current
            : node.r * 0.55) + 2;
          ctx.fillStyle = color;
          ctx.beginPath();
          ctx.arc(node.x, node.y, r, 0, 2 * Math.PI);
          ctx.fill();
        })
        .linkDirectionalArrowLength(0);
    }

    const onResize = () => graph.width(window.innerWidth).height(window.innerHeight);
    window.addEventListener('resize', onResize);

    return () => {
      window.removeEventListener('resize', onResize);
      graph._destructor();
      graphRef.current = null;
      nodeObjsRef.current.clear();
    };
  }, [data, mode, selectNode]);

  // === Feed the satellite graph on grouping / filter changes ===
  useEffect(() => {
    const graph = graphRef.current;
    if (!graph || !data) return;
    selectedRef.current = null;
    setSelectedNode(null);
    nodeObjsRef.current.clear();

    const { memberships, primary, groups } = grouping;
    groupsRef.current = groups;
    const groupColor = new Map(groups.map((grp) => [grp.key, grp.color]));
    const groupCount = new Map(groups.map((grp) => [grp.key, grp.count]));
    const visibleGroups = isolatedGroup
      ? groups.filter((grp) => grp.key === isolatedGroup)
      : groups;
    const cache = nodeCacheRef.current;
    const orbitTag = ORBIT_LABEL[groupBy];

    const thoughts = data.nodes
      .filter((n) => {
        if (n.archived) return false;
        const mems = memberships.get(n.id) || [];
        if (isolatedGroup === '__orbit') return mems.length === 0;
        if (isolatedGroup) return mems.includes(isolatedGroup);
        return true;
      })
      .map((n) => {
        const mems = memberships.get(n.id) || [];
        const isOrbit = mems.length === 0;
        const cached = cache.get(n.id) || {};
        const obj = Object.assign(cached, {
          id: n.id,
          kind: 'thought',
          title: n.title,
          sub: `${n.type} · ${n.source} · ${n.degree} links${isOrbit && orbitTag ? ` · ${orbitTag}` : ''}`,
          color: isOrbit ? MISC_COLOR : groupColor.get(primary.get(n.id)) || MISC_COLOR,
          orbit: isOrbit,
          degree: n.degree,
          r: thoughtRadius(n.degree, 1),
        });
        cache.set(n.id, obj);
        return obj;
      });

    const anchors = visibleGroups.map((grp) => {
      const id = `g:${grp.key}`;
      const cached = cache.get(id) || {};
      const obj = Object.assign(cached, {
        id,
        kind: 'anchor',
        title: `${grp.label} (${grp.count})`,
        color: grp.color,
        groupKey: grp.key,
        r: 6 + Math.sqrt(grp.count) * 1.4,
        big: true,
      });
      cache.set(id, obj);
      return obj;
    });

    const nodes = [...thoughts, ...anchors];
    const links = [];

    if (!isolatedGroup) {
      const brainCached = cache.get('brain') || {};
      // Pinned at the origin: the brain IS the center. Without the pin, high
      // gravity compresses the system below the spoke length and the springs
      // expel the brain outside the blob.
      nodes.push(Object.assign(brainCached, {
        id: 'brain', kind: 'brain', title: 'BRAIN', color: '#e2e8f0', r: 7, big: true,
        fx: 0, fy: 0, fz: 0,
      }));
      cache.set('brain', nodes[nodes.length - 1]);
      for (const grp of visibleGroups) {
        links.push({ source: 'brain', target: `g:${grp.key}`, kind: 'spoke', dist: 190 + Math.sqrt(grp.count) * 6 });
      }
    }

    // One anchor link PER membership: multi-project thoughts get pulled by all
    // their anchors and settle between the clusters. Strength divides by the
    // membership count so they balance instead of being crushed.
    const anchorPresent = new Set(visibleGroups.map((grp) => grp.key));
    for (const t of thoughts) {
      const mems = (memberships.get(t.id) || []).filter((key) => anchorPresent.has(key));
      for (const key of mems) {
        links.push({
          source: t.id, target: `g:${key}`, kind: 'anchor',
          dist: 18 + Math.sqrt(groupCount.get(key) || 1) * 3.2,
          strength: 0.7 / mems.length,
        });
      }
    }

    const present = new Set(nodes.map((n) => n.id));
    const seen = new Set();
    for (const e of activeEdges) {
      if (!present.has(e.source) || !present.has(e.target)) continue;
      const key = e.source < e.target ? `${e.source}|${e.target}` : `${e.target}|${e.source}`;
      if (seen.has(key)) continue;
      seen.add(key);
      links.push({ source: e.source, target: e.target, kind: e.kind, weight: e.weight, score: e.score, dist: 60 });
    }

    fitPendingRef.current = true;
    graph.graphData({ nodes, links });
    applyHighlight();
    const fitTimer = setTimeout(() => graph.zoomToFit(800, 60), 700);
    return () => clearTimeout(fitTimer);
  }, [data, mode, grouping, groupBy, isolatedGroup, activeEdges, applyHighlight]);

  // === Live physics/size sliders — mutate in place, no scene rebuild ===
  useEffect(() => {
    sizeMultRef.current = sizeMult;
    sizeSpreadRef.current = sizeSpread;
    for (const o of nodeObjsRef.current.values()) {
      if (o.always) continue; // anchors/brain keep their size
      const scale = (thoughtRadius(o.degree, sizeSpread) / o.baseR) * sizeMult;
      o.mesh.scale.setScalar(scale);
      o.label.position.y = o.baseR * scale + Math.max(3.5, o.baseR * 0.9);
    }
  }, [sizeMult, sizeSpread]);

  useEffect(() => {
    edgeOpacityRef.current = edgeOpacity;
    const graph = graphRef.current;
    if (!graph) return;
    if (graph.linkOpacity) graph.linkOpacity(edgeOpacity); // 3D global uniform
    graph.linkColor(graph.linkColor()); // 2D re-derives rgba colors
  }, [edgeOpacity]);

  useEffect(() => {
    gravityMultRef.current = gravityMult;
    repelMultRef.current = repelMult;
    const graph = graphRef.current;
    if (!graph) return;
    graph.d3Force('charge').strength((n) => {
      const base = n.kind === 'anchor' ? -500 : n.kind === 'brain' ? -700 : -35;
      return base * repelMult;
    });
    graph.d3ReheatSimulation();
  }, [gravityMult, repelMult]);

  if (error) return <p className="text-red-600 dark:text-red-400 text-sm">Graph error: {error}</p>;
  if (!data) {
    return (
      <div className="graph-loading fixed inset-0 z-30 bg-black flex items-center justify-center">
        <p className="text-slate-500 text-sm">Building graph…</p>
      </div>
    );
  }

  const selected = selectedNode ? nodeById.get(selectedNode) : null;
  const isolated = isolatedGroup
    ? (isolatedGroup === '__orbit'
      ? { label: 'In orbit' }
      : grouping.groups.find((grp) => grp.key === isolatedGroup))
    : null;

  return (
    <div className="graph-tab">
      {/* Full-screen scene */}
      <div ref={containerRef} className="graph-canvas graph-canvas--full fixed inset-0 z-30 bg-black" />

      {/* Hint overlay */}
      <p className="graph-hint fixed bottom-3 left-4 z-40 text-[10px] uppercase tracking-wider text-slate-600 pointer-events-none">
        {mode === '3d' ? 'drag to orbit' : 'drag to pan'} · scroll to zoom · click thought to focus · click group to isolate
      </p>

      {/* Controls overlay panel */}
      {!panelOpen && (
        <button
          onClick={() => setPanelOpen(true)}
          className="graph-controls-panel__reopen fixed top-[104px] right-4 z-40 px-3 py-1.5 text-[10px] uppercase tracking-wider bg-[rgba(6,9,16,0.72)] border border-white/10 text-slate-300 hover:text-white backdrop-blur transition-colors"
        >
          ☰ controls
        </button>
      )}
      <div className={`graph-controls-panel fixed top-[104px] right-4 z-40 w-72 max-h-[calc(100vh-120px)] overflow-y-auto space-y-3 ${panelOpen ? '' : 'hidden'}`}>
        <div className="graph-controls-panel__header flex items-center justify-between">
          <span className="text-[10px] uppercase tracking-wider text-slate-500">Controls</span>
          <button
            onClick={() => setPanelOpen(false)}
            className="text-slate-500 hover:text-white text-xs px-1 transition-colors"
            title="Hide panel"
          >
            ✕
          </button>
        </div>
        {/* Search */}
        <div className="graph-search relative">
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Find thought…"
            className="graph-search__input w-full px-3 py-1.5 bg-black/40 border border-white/10 text-slate-200 text-sm placeholder-slate-500"
          />
          {searchMatches.length > 0 && (
            <div className="graph-search__results absolute top-full left-0 right-0 z-20 bg-[#0a0d16] border border-white/10 shadow-lg max-h-64 overflow-y-auto">
              {searchMatches.map((n) => (
                <button
                  key={n.id}
                  onClick={() => focusOnNode(n.id)}
                  className="block w-full text-left px-3 py-2 text-xs text-slate-200 hover:bg-white/10 transition-colors"
                >
                  <span className="inline-block w-2 h-2 mr-2" style={{ backgroundColor: communityColor(n.community) }} />
                  {n.title}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Renderer + grouping */}
        <div className="graph-controls-panel__section">
          <button onClick={() => toggleSection('layout')} className="graph-accordion__header flex w-full items-center justify-between text-[10px] uppercase tracking-wider text-slate-500 hover:text-slate-300 transition-colors mb-1.5">
            Layout <span>{collapsed.layout ? '+' : '−'}</span>
          </button>
          {!collapsed.layout && (
          <>
          <div className="flex gap-2 mb-2">
            <div className="graph-mode-switch flex border border-white/10">
              {['2d', '3d'].map((m) => (
                <button
                  key={m}
                  onClick={() => setMode(m)}
                  className={`px-3 py-1 text-xs font-medium uppercase tracking-wider transition-colors ${
                    mode === m ? 'bg-accent text-white' : 'text-slate-400 hover:text-slate-200'
                  }`}
                >
                  {m}
                </button>
              ))}
            </div>
            {isolated && (
              <button
                onClick={() => setIsolatedGroup(null)}
                className="graph-isolation-chip px-2 py-1 text-xs border border-white/10 text-slate-300 hover:text-white transition-colors"
                title="Show all groups"
              >
                {truncate(isolated.label, 18)} ✕
              </button>
            )}
          </div>
          <p className="graph-controls-panel__label">Group by</p>
          <div className="graph-groupby flex flex-wrap gap-1">
            {GROUP_MODES.map((m) => (
              <button
                key={m.key}
                onClick={() => { setGroupBy(m.key); setIsolatedGroup(null); }}
                className={`px-2 py-1 text-[10px] font-medium uppercase tracking-wider border transition-colors ${
                  groupBy === m.key
                    ? 'bg-accent border-accent text-white'
                    : 'border-white/10 text-slate-400 hover:text-slate-200'
                }`}
              >
                {m.label}
              </button>
            ))}
          </div>
          </>
          )}
        </div>

        {/* Groups list */}
        <div className="graph-controls-panel__section">
          <button onClick={() => toggleSection('groups')} className="graph-accordion__header flex w-full items-center justify-between text-[10px] uppercase tracking-wider text-slate-500 hover:text-slate-300 transition-colors mb-1.5">
            Groups <span>{collapsed.groups ? '+' : '−'}</span>
          </button>
          {!collapsed.groups && (
          <div className="space-y-0.5">
            {grouping.groups.map((grp) => (
              <button
                key={grp.key}
                onClick={() => setIsolatedGroup((cur) => (cur === grp.key ? null : grp.key))}
                className={`block w-full text-left text-xs transition-colors ${
                  isolatedGroup === grp.key ? 'text-white' : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                <span className="inline-block w-2 h-2 mr-2" style={{ backgroundColor: grp.color }} />
                {grp.label} <span className="text-slate-600">({grp.count})</span>
              </button>
            ))}
            {grouping.orbitCount > 0 && (
              <button
                onClick={() => setIsolatedGroup((cur) => (cur === '__orbit' ? null : '__orbit'))}
                className={`graph-orbit-row block w-full text-left text-xs transition-colors ${
                  isolatedGroup === '__orbit' ? 'text-white' : 'text-slate-500 hover:text-slate-200'
                }`}
              >
                <span className="inline-block w-2 h-2 mr-2 rounded-full border border-slate-500" />
                In orbit <span className="text-slate-600">({grouping.orbitCount} · {ORBIT_LABEL[groupBy] || 'ungrouped'})</span>
              </button>
            )}
          </div>
          )}
        </div>

        {/* Edge kinds + threshold */}
        <div className="graph-controls-panel__section">
          <button onClick={() => toggleSection('edges')} className="graph-accordion__header flex w-full items-center justify-between text-[10px] uppercase tracking-wider text-slate-500 hover:text-slate-300 transition-colors mb-1.5">
            Edges <span>{collapsed.edges ? '+' : '−'}</span>
          </button>
          {!collapsed.edges && (
          <>

          {Object.keys(EDGE_KIND_LABELS).map((kind) => (
            <label key={kind} className="graph-legend__item flex items-center gap-1.5 cursor-pointer select-none text-[10px] uppercase tracking-wider text-slate-400 mb-1">
              <input
                type="checkbox"
                checked={edgeKinds[kind]}
                onChange={() => setEdgeKinds((prev) => ({ ...prev, [kind]: !prev[kind] }))}
                className="accent-[var(--accent-blue)]"
              />
              <span className="inline-block w-4 h-0.5" style={{ backgroundColor: LINK_HL[kind] }} />
              {EDGE_KIND_LABELS[kind]}
            </label>
          ))}
          <label className="graph-legend__threshold flex items-center gap-1.5 text-[10px] uppercase tracking-wider text-slate-400 mt-1">
            cosine ≥ {semThreshold.toFixed(2)}
            <input
              type="range" min="0.7" max="0.9" step="0.01" value={semThreshold}
              onChange={(e) => setSemThreshold(parseFloat(e.target.value))}
              className="flex-1 accent-[var(--accent-blue)]"
            />
          </label>
          </>
          )}
        </div>

        {/* Appearance + physics sliders */}
        <div className="graph-controls-panel__section">
          <button onClick={() => toggleSection('appearance')} className="graph-accordion__header flex w-full items-center justify-between text-[10px] uppercase tracking-wider text-slate-500 hover:text-slate-300 transition-colors mb-1.5">
            Appearance <span>{collapsed.appearance ? '+' : '−'}</span>
          </button>
          {!collapsed.appearance && (
          <>
          <label className="graph-physics__slider flex items-center gap-1.5 text-[10px] uppercase tracking-wider text-slate-400 mt-1">
            edge opacity ×{edgeOpacity.toFixed(2)}
            <input
              type="range" min="0.05" max="1" step="0.05" value={edgeOpacity}
              onChange={(e) => setEdgeOpacity(parseFloat(e.target.value))}
              className="flex-1 accent-[var(--accent-blue)]"
            />
          </label>
          <label className="graph-physics__slider flex items-center gap-1.5 text-[10px] uppercase tracking-wider text-slate-400 mt-1">
            node size ×{sizeMult.toFixed(1)}
            <input
              type="range" min="0.4" max="2.5" step="0.1" value={sizeMult}
              onChange={(e) => setSizeMult(parseFloat(e.target.value))}
              className="flex-1 accent-[var(--accent-blue)]"
            />
          </label>
          <label className="graph-physics__slider flex items-center gap-1.5 text-[10px] uppercase tracking-wider text-slate-400 mt-1">
            size contrast ×{sizeSpread.toFixed(1)}
            <input
              type="range" min="0.3" max="10" step="0.1" value={sizeSpread}
              onChange={(e) => setSizeSpread(parseFloat(e.target.value))}
              className="flex-1 accent-[var(--accent-blue)]"
            />
          </label>
          <label className="graph-physics__slider flex items-center gap-1.5 text-[10px] uppercase tracking-wider text-slate-400 mt-1">
            gravity ×{gravityMult.toFixed(1)}
            <input
              type="range" min="0" max="6" step="0.1" value={gravityMult}
              onChange={(e) => setGravityMult(parseFloat(e.target.value))}
              className="flex-1 accent-[var(--accent-blue)]"
            />
          </label>
          <label className="graph-physics__slider flex items-center gap-1.5 text-[10px] uppercase tracking-wider text-slate-400 mt-1">
            repel ×{repelMult.toFixed(1)}
            <input
              type="range" min="0.2" max="3" step="0.1" value={repelMult}
              onChange={(e) => setRepelMult(parseFloat(e.target.value))}
              className="flex-1 accent-[var(--accent-blue)]"
            />
          </label>
          </>
          )}
        </div>

        {/* Selection / hubs */}
        {selected ? (
          <div className="graph-node-info graph-controls-panel__section">
            <div className="flex items-center gap-2 mb-1">
              <span className="inline-block w-2.5 h-2.5 shrink-0" style={{ backgroundColor: communityColor(selected.community) }} />
              <span className="font-medium text-slate-100 text-xs leading-tight">{selected.title}</span>
            </div>
            <p className="text-[10px] uppercase tracking-wider text-slate-500 mb-2">
              {selected.type} · {selected.source} · {selected.degree} links
            </p>
            <button
              onClick={() => setModalThoughtId(selected.id)}
              className="graph-node-info__open w-full px-3 py-1.5 bg-accent text-white text-xs font-medium hover:bg-accent-dark transition-colors mb-2"
            >
              Open thought
            </button>
            {selectedNeighbors.length > 0 && (
              <>
                <p className="graph-controls-panel__label mt-2">Connections</p>
                <div className="graph-node-info__neighbors max-h-40 overflow-y-auto space-y-1">
                  {selectedNeighbors.map(({ node: n, edge: e }, i) => (
                    <button
                      key={`${n.id}-${i}`}
                      onClick={() => focusOnNode(n.id)}
                      className="block w-full text-left text-xs text-slate-400 hover:text-slate-100 transition-colors"
                      title={
                        e.kind === 'metadata'
                          ? `shared: ${[...(e.shared?.people || []), ...(e.shared?.projects || []), ...(e.shared?.topics || [])].join(', ')}`
                          : e.kind === 'semantic'
                            ? `cosine ${(e.score * 100).toFixed(0)}%`
                            : 'supersedes'
                      }
                    >
                      <span className={`inline-block w-1.5 h-1.5 mr-1.5 ${e.kind === 'semantic' ? 'bg-[var(--accent-blue)]' : e.kind === 'supersedes' ? 'bg-amber-500' : 'bg-slate-600'}`} />
                      {n.title}
                      {e.kind === 'semantic' && <span className="text-slate-600"> {(e.score * 100).toFixed(0)}%</span>}
                    </button>
                  ))}
                </div>
              </>
            )}
          </div>
        ) : (
          <div className="graph-health-panel graph-controls-panel__section">
            <button onClick={() => toggleSection('insights')} className="graph-accordion__header flex w-full items-center justify-between text-[10px] uppercase tracking-wider text-slate-500 hover:text-slate-300 transition-colors mb-1.5">
              Hubs & orphans <span>{collapsed.insights ? '+' : '−'}</span>
            </button>
            {!collapsed.insights && (
            <>
            <p className="graph-controls-panel__label">
              Hubs <span className="normal-case">(most connected)</span>
            </p>
            <div className="space-y-1 mb-2">
              {hubs.map((n) => (
                <button key={n.id} onClick={() => focusOnNode(n.id)} className="block w-full text-left text-xs text-slate-400 hover:text-slate-100 transition-colors">
                  {n.title} <span className="text-slate-600">({n.degree})</span>
                </button>
              ))}
            </div>
            {orphans.length > 0 && (
              <>
                <p className="graph-controls-panel__label">
                  Orphans <span className="normal-case">({orphans.length} unlinked)</span>
                </p>
                <div className="max-h-28 overflow-y-auto space-y-1">
                  {orphans.map((n) => (
                    <button key={n.id} onClick={() => setModalThoughtId(n.id)} className="block w-full text-left text-xs text-slate-400 hover:text-slate-100 transition-colors">
                      {n.title}
                    </button>
                  ))}
                </div>
              </>
            )}
            </>
            )}
          </div>
        )}

        {/* Stats */}
        <div className="graph-stats graph-controls-panel__section text-[10px] uppercase tracking-wider text-slate-500 space-y-0.5">
          <p>{data.stats.node_count} thoughts · {data.stats.edge_count} links</p>
          <p>{data.stats.metadata_edges} tag · {data.stats.semantic_edges} semantic · {data.stats.supersedes_edges} supersedes</p>
          <p>{data.stats.community_count} clusters · {data.stats.orphan_count} orphans</p>
        </div>
      </div>

      {modalThoughtId && (
        <ThoughtModal thoughtId={modalThoughtId} onClose={() => setModalThoughtId(null)} />
      )}
    </div>
  );
}
