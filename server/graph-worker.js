// Graph build off the main thread (0.64.0, server/graph-cache.js). buildGraph
// fetches every vector (~2.3 s) and runs an O(N²) cosine kNN (~3.2 s at 632
// thoughts); on the main thread that froze every request, and the Qdrant call
// right after it landed on a keep-alive socket Qdrant had closed meanwhile.
import { parentPort } from 'node:worker_threads';
import { buildGraph } from './routes/graph.js';

parentPort.postMessage(await buildGraph());
// The Qdrant client keeps sockets open; without an exit the thread lingers.
process.exit(0);
