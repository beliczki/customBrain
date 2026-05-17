import { newStemmer } from 'snowball-stemmers';

const hu = newStemmer('hungarian');
const en = newStemmer('english');

const STOPWORDS = new Set([
  'the', 'a', 'an', 'and', 'or', 'but', 'is', 'are', 'was', 'were', 'be', 'been',
  'to', 'of', 'in', 'on', 'at', 'for', 'with', 'by', 'from', 'as', 'it', 'this',
  'that', 'these', 'those', 'i', 'you', 'we', 'they', 'he', 'she',
  'az', 'és', 'vagy', 'de', 'hogy', 'nem', 'meg', 'is', 'mint', 'ami', 'csak',
  'már', 'még', 'ha', 'így', 'úgy', 'van', 'volt', 'lesz', 'ez', 'azt',
]);

function tokenize(text) {
  const raw = text.toLowerCase()
    .normalize('NFC')
    .replace(/[^\p{Letter}\p{Number}]+/gu, ' ')
    .split(/\s+/)
    .filter(t => t.length >= 2 && !STOPWORDS.has(t));

  // Try Hungarian stemmer first; if it leaves the token unchanged, try English.
  // Cheap heuristic that covers bilingual content without a language detector.
  return raw.map(t => {
    const huStem = hu.stem(t);
    return huStem !== t ? huStem : en.stem(t);
  });
}

// Stable term→u32 index via FNV-1a so indices survive process restarts without
// persisting a map. Collision rate for ~100k distinct stems in 2^32 space is
// negligible and treated as acceptable noise.
function fnv1a(str) {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

const BM25_K1 = 1.2;
const BM25_B = 0.75;
const AVG_DOC_LEN = 500;

export function sparseEncodeDoc(text) {
  const tokens = tokenize(text);
  if (tokens.length === 0) return { indices: [], values: [] };

  const tf = new Map();
  for (const t of tokens) tf.set(t, (tf.get(t) || 0) + 1);

  const docLen = tokens.length;
  const lenNorm = 1 - BM25_B + BM25_B * (docLen / AVG_DOC_LEN);

  const indices = [];
  const values = [];
  for (const [term, count] of tf) {
    const weight = (count * (BM25_K1 + 1)) / (count + BM25_K1 * lenNorm);
    indices.push(fnv1a(term));
    values.push(weight);
  }
  return { indices, values };
}

// Queries send raw term counts; Qdrant applies IDF server-side via the sparse
// vector's `modifier: "idf"` config, then computes the dot product.
export function sparseEncodeQuery(text) {
  const tokens = tokenize(text);
  if (tokens.length === 0) return { indices: [], values: [] };

  const tf = new Map();
  for (const t of tokens) tf.set(t, (tf.get(t) || 0) + 1);

  const indices = [];
  const values = [];
  for (const [term, count] of tf) {
    indices.push(fnv1a(term));
    values.push(count);
  }
  return { indices, values };
}

export const _internals = { tokenize, fnv1a };
