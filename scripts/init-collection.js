import 'dotenv/config';
import { QdrantClient } from '@qdrant/js-client-rest';

const qdrant = new QdrantClient({
  url: process.env.QDRANT_URL || 'http://localhost:6333',
});

const COLLECTION = 'thoughts';

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
      vectors: { size: 3072, distance: 'Cosine' },
    });
    console.log(`Collection "${COLLECTION}" created with 3072-dim Cosine vectors.`);
  } else {
    console.log(`Collection "${COLLECTION}" already exists, ensuring indexes.`);
  }

  await ensureIndex('created_at', 'datetime');
  await ensureIndex('source', 'keyword');
  await ensureIndex('source_id', 'keyword');
}

init().catch((err) => {
  console.error('Failed to init collection:', err.message);
  process.exit(1);
});
