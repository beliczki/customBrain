import 'dotenv/config';
import { QdrantClient } from '@qdrant/js-client-rest';

const qdrant = new QdrantClient({
  url: process.env.QDRANT_URL || 'http://localhost:6333',
});

const COLLECTION = 'thoughts_v2';

async function ensureIndex(field, schema) {
  try {
    await qdrant.createPayloadIndex(COLLECTION, { field_name: field, field_schema: schema });
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
  const exists = await qdrant.collectionExists(COLLECTION);
  if (!exists.exists) {
    await qdrant.createCollection(COLLECTION, {
      vectors: { dense: { size: 3072, distance: 'Cosine' } },
      sparse_vectors: { bm25: { modifier: 'idf' } },
    });
    console.log(`Collection "${COLLECTION}" created with named dense (3072 Cosine) + sparse bm25 (IDF) vectors.`);
  } else {
    console.log(`Collection "${COLLECTION}" already exists, ensuring indexes.`);
  }

  await ensureIndex('created_at', 'datetime');
  await ensureIndex('effective_date', 'datetime');
  await ensureIndex('source', 'keyword');
  await ensureIndex('source_id', 'keyword');
  // 0.19.0 chunked-vector layer
  await ensureIndex('kind', 'keyword');
  await ensureIndex('pipeline_version', 'keyword');
  await ensureIndex('parent_id', 'keyword');
}

init().catch((err) => {
  console.error('Failed to init collection:', err.message);
  process.exit(1);
});
