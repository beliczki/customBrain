import 'dotenv/config';
import { QdrantClient } from '@qdrant/js-client-rest';

const qdrant = new QdrantClient({
  url: process.env.QDRANT_URL || 'http://localhost:6333',
});

const COLLECTION = 'thoughts';

async function init() {
  const exists = await qdrant.collectionExists(COLLECTION);
  if (exists.exists) {
    console.log(`Collection "${COLLECTION}" already exists, skipping.`);
    return;
  }

  await qdrant.createCollection(COLLECTION, {
    vectors: { size: 3072, distance: 'Cosine' },
  });

  await qdrant.createPayloadIndex(COLLECTION, {
    field_name: 'created_at',
    field_schema: 'datetime',
  });

  console.log(`Collection "${COLLECTION}" created with 3072-dim Cosine vectors and created_at index.`);
}

init().catch((err) => {
  console.error('Failed to init collection:', err.message);
  process.exit(1);
});
