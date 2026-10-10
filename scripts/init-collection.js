import 'dotenv/config';
import { QdrantClient } from '@qdrant/js-client-rest';
import { THOUGHTS, COMMITMENTS } from '../server/collections.js';

const qdrant = new QdrantClient({
  url: process.env.QDRANT_URL || 'http://localhost:6333',
});

// Both collections share the vector schema: dense for meaning, bm25 for exact
// words. Commitments use the dense leg to match new candidates to existing
// commitments (dedup).
const INDEXES = {
  [THOUGHTS]: [
    ['created_at', 'datetime'],
    ['effective_date', 'datetime'],
    ['source', 'keyword'],
    ['source_id', 'keyword'],
    // 0.19.0 chunked-vector layer
    ['kind', 'keyword'],
    ['pipeline_version', 'keyword'],
    ['parent_id', 'keyword'],
  ],
  // 0.53.0 commitment layer
  [COMMITMENTS]: [
    ['status', 'keyword'],
    ['owner', 'keyword'],
    ['kind', 'keyword'],
    ['projects', 'keyword'],
    ['due', 'datetime'],
    ['event_ref.end', 'datetime'],
  ],
};

async function ensureIndex(collection, field, schema) {
  try {
    await qdrant.createPayloadIndex(collection, { field_name: field, field_schema: schema });
    console.log(`  index created: ${field} (${schema})`);
  } catch (err) {
    if (/already exists/i.test(err.message || '')) {
      console.log(`  index exists: ${field}`);
    } else {
      throw err;
    }
  }
}

async function init() {
  for (const [collection, indexes] of Object.entries(INDEXES)) {
    const exists = await qdrant.collectionExists(collection);
    if (!exists.exists) {
      await qdrant.createCollection(collection, {
        vectors: { dense: { size: 3072, distance: 'Cosine' } },
        sparse_vectors: { bm25: { modifier: 'idf' } },
      });
      console.log(`Collection "${collection}" created with named dense (3072 Cosine) + sparse bm25 (IDF) vectors.`);
    } else {
      console.log(`Collection "${collection}" already exists, ensuring indexes.`);
    }
    for (const [field, schema] of indexes) await ensureIndex(collection, field, schema);
  }
}

init().catch((err) => {
  console.error('Failed to init collection:', err.message);
  process.exit(1);
});
