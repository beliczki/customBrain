import 'dotenv/config';
import { QdrantClient } from '@qdrant/js-client-rest';
import { sparseEncodeDoc } from '../server/sparse.js';

const args = process.argv.slice(2);
const opt = (name, fallback) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1] : fallback;
};
const hasFlag = (name) => args.includes(`--${name}`);

const SOURCE = opt('source', 'thoughts');
const DEST = opt('dest', 'thoughts_v2');
const LIMIT = opt('limit', null);
const FORCE = hasFlag('force');
const BATCH = parseInt(opt('batch', '50'));

const qdrant = new QdrantClient({ url: process.env.QDRANT_URL || 'http://localhost:6333' });

async function main() {
  console.log(`Source: ${SOURCE}`);
  console.log(`Dest:   ${DEST}`);
  console.log(`Limit:  ${LIMIT ?? '(all)'}`);
  console.log(`Batch:  ${BATCH}`);
  console.log();

  const src = await qdrant.getCollection(SOURCE);
  const srcParams = src.config.params.vectors;
  if (!srcParams.size || !srcParams.distance) {
    throw new Error(`Source ${SOURCE} doesn't have a single unnamed vector — unexpected shape: ${JSON.stringify(srcParams)}`);
  }
  console.log(`Source has unnamed dense vector: ${srcParams.size}-dim ${srcParams.distance}, ${src.points_count} points`);

  const destExists = await qdrant.collectionExists(DEST).then((r) => r.exists);
  if (destExists) {
    if (!FORCE) {
      console.error(`✗ Destination ${DEST} already exists. Pass --force to delete + recreate.`);
      process.exit(1);
    }
    console.log(`⚠ Deleting existing ${DEST} (--force)`);
    await qdrant.deleteCollection(DEST);
  }

  console.log(`Creating ${DEST} with named vectors { dense, bm25 }...`);
  await qdrant.createCollection(DEST, {
    vectors: {
      dense: { size: srcParams.size, distance: srcParams.distance },
    },
    sparse_vectors: {
      bm25: { modifier: 'idf' },
    },
  });

  // Recreate payload indexes that exist on source. Listed explicitly to keep
  // the script readable; matches current payload_schema (verified 2026-05-17).
  const PAYLOAD_INDEXES = [
    { field: 'source', type: 'keyword' },
    { field: 'created_at', type: 'datetime' },
    { field: 'effective_date', type: 'datetime' },
    { field: 'parent_id', type: 'keyword' },
    { field: 'kind', type: 'keyword' },
    { field: 'pipeline_version', type: 'keyword' },
    { field: 'source_id', type: 'keyword' },
  ];
  for (const idx of PAYLOAD_INDEXES) {
    await qdrant.createPayloadIndex(DEST, { field_name: idx.field, field_schema: idx.type });
  }
  console.log(`Created ${PAYLOAD_INDEXES.length} payload indexes`);

  let offset = undefined;
  let processed = 0;
  let skippedNoText = 0;
  let chunksMigrated = 0;
  let thoughtsMigrated = 0;
  const limit = LIMIT ? parseInt(LIMIT) : Infinity;

  console.log(`\nMigrating points...`);
  while (processed < limit) {
    const batchSize = Math.min(BATCH, limit - processed);
    const batch = await qdrant.scroll(SOURCE, {
      limit: batchSize,
      with_payload: true,
      with_vector: true,
      offset,
    });
    if (!batch.points.length) break;

    const upserts = [];
    for (const p of batch.points) {
      const isChunk = p.payload.kind === 'chunk';
      const textToEncode = isChunk ? (p.payload.chunk_text || '') : (p.payload.text || '');
      if (!textToEncode) {
        skippedNoText++;
        continue;
      }
      const sparse = sparseEncodeDoc(textToEncode);
      upserts.push({
        id: p.id,
        vector: {
          dense: p.vector,
          bm25: sparse,
        },
        payload: p.payload,
      });
      if (isChunk) chunksMigrated++; else thoughtsMigrated++;
    }

    if (upserts.length) {
      await qdrant.upsert(DEST, { points: upserts, wait: true });
    }

    processed += batch.points.length;
    console.log(`  ${processed} processed  (${thoughtsMigrated} thoughts, ${chunksMigrated} chunks, ${skippedNoText} skipped)`);

    if (!batch.next_page_offset || processed >= limit) break;
    offset = batch.next_page_offset;
  }

  const destCount = (await qdrant.getCollection(DEST)).points_count;
  console.log(`\nDest count: ${destCount}`);
  console.log(`Source count: ${src.points_count}`);

  if (LIMIT) {
    console.log(`✓ Smoke test: migrated ${processed} of ${src.points_count} points (--limit ${LIMIT}).`);
  } else if (destCount === src.points_count - skippedNoText) {
    console.log(`✓ Migration complete and consistent.`);
  } else {
    console.error(`✗ Count mismatch (skipped ${skippedNoText} for empty text; expected dest=${src.points_count - skippedNoText}, got ${destCount}).`);
    process.exit(2);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(3);
});
