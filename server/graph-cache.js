// Thought-graph cache (0.64.0). Requests (the Graph tab, spider) get the last
// built graph; nobody waits for a rebuild except the very first request after
// a restart. A background check compares a cheap fingerprint (ids + the
// payload fields buildGraph reads, no vectors) every CHECK_MS and rebuilds in
// a worker thread when it changed. Polling, not a write hook: crons capture
// from their own processes, so this server never sees those writes happen.

import { Worker } from 'node:worker_threads';
import crypto from 'node:crypto';
import { graphFingerprintRows } from './qdrant.js';

const CHECK_MS = 60 * 1000;

let cache = null; // { graph, fingerprint, built_at, build_ms }
let building = null; // in-flight rebuild, shared by everyone who asks

async function fingerprint() {
  const rows = await graphFingerprintRows();
  rows.sort((a, b) => String(a[0]).localeCompare(String(b[0])));
  return crypto.createHash('sha1').update(JSON.stringify(rows)).digest('hex');
}

function buildInWorker() {
  return new Promise((resolve, reject) => {
    const worker = new Worker(new URL('./graph-worker.js', import.meta.url));
    worker.once('message', resolve);
    worker.once('error', reject);
    worker.once('exit', (code) => { if (code !== 0) reject(new Error(`graph worker exited with code ${code}`)); });
  });
}

function rebuild(fp) {
  if (!building) {
    building = (async () => {
      const t = Date.now();
      const graph = await buildInWorker();
      cache = { graph, fingerprint: fp, built_at: new Date().toISOString(), build_ms: Date.now() - t };
      console.log(`Graph cache rebuilt: ${graph.nodes.length} nodes, ${graph.edges.length} edges in ${cache.build_ms} ms`);
    })().finally(() => { building = null; });
  }
  return building;
}

/** The current graph, with when it was built. Waits only if none exists yet. */
export async function getCachedGraph() {
  if (!cache) await rebuild(await fingerprint());
  return cache;
}

async function check() {
  const fp = await fingerprint();
  if (!cache || cache.fingerprint !== fp) await rebuild(fp);
}

export function startGraphCache() {
  // A failed tick is logged and the next one tries again; requests keep the
  // last good graph meanwhile. It must not take the server down.
  const tick = () => check().catch((err) => console.error('Graph cache check failed:', err.message));
  tick();
  setInterval(tick, CHECK_MS).unref();
}
