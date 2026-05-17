const EMBEDDING_URL = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-embedding-001:embedContent';

// Gemini's embedContent accepts an optional `taskType` field (camelCase, UPPER_SNAKE value):
//   - RETRIEVAL_DOCUMENT — pass when embedding stored documents
//   - RETRIEVAL_QUERY    — pass when embedding a search query (also the silent default
//                          if the field is omitted; verified via curl 2026-05-17)
//   - SEMANTIC_SIMILARITY, CLASSIFICATION, CLUSTERING — other supported modes
//
// Asymmetric retrieval (DOCUMENT for storage + QUERY for search) is Google's
// recommended pattern for /search-style workloads and produces vectors in distinct
// sub-spaces optimized for cross-comparison. Symmetric retrieval (both sides as the
// same task type) is also valid but loses the asymmetric tuning.
//
// Callers SHOULD pass an explicit taskType. We keep the optional default for back-compat
// with callers we haven't migrated yet.
export async function embedText(text, taskType) {
  const body = { content: { parts: [{ text }] } };
  if (taskType) body.taskType = taskType;

  const res = await fetch(`${EMBEDDING_URL}?key=${process.env.GOOGLE_API_KEY}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Embedding failed: ${err}`);
  }

  const json = await res.json();
  return json.embedding.values;
}
