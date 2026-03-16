import { QdrantClient } from '@qdrant/js-client-rest';
import crypto from 'node:crypto';

const qdrant = new QdrantClient({
  url: process.env.QDRANT_URL || 'http://qdrant:6333',
});

const COLLECTION = 'thoughts';

export async function upsertPoint(vector, payload) {
  const id = crypto.randomUUID();
  await qdrant.upsert(COLLECTION, {
    points: [{ id, vector, payload }],
  });
  return id;
}

export async function searchVector(vector, limit = 5) {
  const results = await qdrant.query(COLLECTION, {
    query: vector,
    limit,
    with_payload: true,
  });
  return results.points.map((p) => ({
    id: p.id,
    text: p.payload.text,
    title: p.payload.title,
    metadata: {
      people: p.payload.people,
      topics: p.payload.topics,
      projects: p.payload.projects,
      type: p.payload.type,
      action_items: p.payload.action_items,
    },
    created_at: p.payload.created_at,
    score: p.score,
  }));
}

export async function scrollRecent(limit = 10) {
  const results = await qdrant.scroll(COLLECTION, {
    limit,
    with_payload: true,
    order_by: { key: 'created_at', direction: 'desc' },
  });
  return results.points.map((p) => ({
    id: p.id,
    text: p.payload.text,
    title: p.payload.title,
    metadata: {
      people: p.payload.people,
      topics: p.payload.topics,
      projects: p.payload.projects,
      type: p.payload.type,
      action_items: p.payload.action_items,
    },
    created_at: p.payload.created_at,
  }));
}

export async function getAllPayloads() {
  const all = [];
  let offset = undefined;
  while (true) {
    const batch = await qdrant.scroll(COLLECTION, {
      limit: 100,
      with_payload: true,
      offset,
    });
    all.push(...batch.points);
    if (!batch.next_page_offset) break;
    offset = batch.next_page_offset;
  }
  return all.map((p) => p.payload);
}

export async function deletePoint(id) {
  await qdrant.delete(COLLECTION, { points: [id] });
}

export async function scrollFiltered(filter, limit = 100) {
  const all = [];
  let offset = undefined;
  while (true) {
    const batch = await qdrant.scroll(COLLECTION, {
      limit,
      with_payload: true,
      filter,
      offset,
    });
    all.push(...batch.points);
    if (!batch.next_page_offset) break;
    offset = batch.next_page_offset;
  }
  return all.map((p) => ({
    id: p.id,
    text: p.payload.text,
    title: p.payload.title,
    people: p.payload.people,
    topics: p.payload.topics,
    projects: p.payload.projects,
    type: p.payload.type,
    action_items: p.payload.action_items,
    created_at: p.payload.created_at,
  }));
}
