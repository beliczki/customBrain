import { QdrantClient } from '@qdrant/js-client-rest';
import crypto from 'node:crypto';

const qdrant = new QdrantClient({
  url: process.env.QDRANT_URL || 'http://localhost:6333',
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

/**
 * Fetch all points with both payload AND vectors. Used by the Obsidian
 * export to compute per-thought semantic neighbors (P1d: semantic autolinks).
 * At ~100-500 thoughts this is cheap; at 1000s, consider batching.
 */
export async function getAllWithVectors() {
  const all = [];
  let offset = undefined;
  while (true) {
    const batch = await qdrant.scroll(COLLECTION, {
      limit: 100,
      with_payload: true,
      with_vector: true,
      offset,
    });
    all.push(...batch.points);
    if (!batch.next_page_offset) break;
    offset = batch.next_page_offset;
  }
  return all.map((p) => ({
    id: p.id,
    vector: p.vector,
    payload: p.payload,
  }));
}

export async function deletePoint(id) {
  await qdrant.delete(COLLECTION, { points: [id] });
}

export async function updatePayload(id, payload) {
  await qdrant.setPayload(COLLECTION, { points: [id], payload });
}

export async function getById(id) {
  const results = await qdrant.retrieve(COLLECTION, {
    ids: [id],
    with_payload: true,
  });
  if (!results || results.length === 0) return null;
  const p = results[0];
  return {
    id: p.id,
    text: p.payload.text,
    title: p.payload.title,
    people: p.payload.people,
    topics: p.payload.topics,
    projects: p.payload.projects,
    type: p.payload.type,
    action_items: p.payload.action_items,
    status: p.payload.status,
    source: p.payload.source,
    source_id: p.payload.source_id,
    created_at: p.payload.created_at,
  };
}

export async function findBySourceId(source, sourceId) {
  const results = await scrollFiltered(
    {
      must: [
        { key: 'source', match: { value: source } },
        { key: 'source_id', match: { value: sourceId } },
      ],
    },
    1,
  );
  return results[0] || null;
}

/**
 * Compute per-thought connection stats for brain-hygiene diagnostics.
 *
 * Returns thoughts sorted by suspicion score (hub_score desc, then
 * project_count desc). Only active thoughts (status != 'archived').
 *
 * hub_score is the sum of "thought-count per project" across all the
 * thought's projects — i.e. how many thoughts this one connects to via
 * shared-project edges in the Obsidian graph.
 */
export async function getConnectionStats() {
  const all = [];
  let offset = undefined;
  while (true) {
    const batch = await qdrant.scroll(COLLECTION, {
      limit: 200,
      with_payload: true,
      offset,
    });
    all.push(...batch.points);
    if (!batch.next_page_offset) break;
    offset = batch.next_page_offset;
  }

  // First pass: reverse index — how many (active) thoughts use each project/person/topic
  const projectCounts = new Map();
  const personCounts = new Map();
  const topicCounts = new Map();
  for (const p of all) {
    if (p.payload.status === 'archived') continue;
    for (const pr of p.payload.projects || []) projectCounts.set(pr, (projectCounts.get(pr) || 0) + 1);
    for (const pe of p.payload.people || []) personCounts.set(pe, (personCounts.get(pe) || 0) + 1);
    for (const to of p.payload.topics || []) topicCounts.set(to, (topicCounts.get(to) || 0) + 1);
  }

  // Second pass: compute per-thought scores
  const stats = [];
  for (const p of all) {
    if (p.payload.status === 'archived') continue;
    const projects = p.payload.projects || [];
    const people = p.payload.people || [];
    const topics = p.payload.topics || [];
    // hub_score excludes self — if a project has count=1 (only this thought),
    // it contributes 0 edges to other thoughts.
    const hubFromProjects = projects.reduce((n, pr) => n + Math.max(0, (projectCounts.get(pr) || 0) - 1), 0);
    const hubFromPeople = people.reduce((n, pe) => n + Math.max(0, (personCounts.get(pe) || 0) - 1), 0);
    stats.push({
      id: p.id,
      title: p.payload.title,
      type: p.payload.type,
      created_at: p.payload.created_at,
      project_count: projects.length,
      people_count: people.length,
      topic_count: topics.length,
      projects,
      people,
      hub_score: hubFromProjects + hubFromPeople,
      hub_from_projects: hubFromProjects,
      hub_from_people: hubFromPeople,
    });
  }

  return { stats, projectCounts, personCounts, topicCounts };
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
