import { Router } from 'express';
import crypto from 'node:crypto';
import { getFirefliesTranscriptById } from '../../agent/tools/fireflies.js';
import { findBySourceId } from '../qdrant.js';
import { captureThought } from './capture.js';

const router = Router();

const MAX_TRANSCRIPT_CHARS = 30000;
const FETCH_RETRIES = 3;
const FETCH_BACKOFF_MS = 30000;

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function verifySignature(rawBody, header, secret) {
  if (!header || !rawBody || !secret) return false;
  const provided = header.startsWith('sha256=') ? header.slice(7) : header;
  const expected = crypto
    .createHmac('sha256', secret)
    .update(rawBody)
    .digest('hex');
  try {
    return crypto.timingSafeEqual(
      Buffer.from(provided, 'hex'),
      Buffer.from(expected, 'hex'),
    );
  } catch {
    return false;
  }
}

async function fetchTranscriptWithRetry(id) {
  for (let attempt = 1; attempt <= FETCH_RETRIES; attempt++) {
    try {
      const transcript = await getFirefliesTranscriptById(id);
      if (transcript && transcript.transcript_text) return transcript;
      console.log(`Fireflies transcript ${id} not ready (attempt ${attempt})`);
    } catch (err) {
      console.log(`Fireflies fetch error for ${id} (attempt ${attempt}): ${err.message}`);
    }
    if (attempt < FETCH_RETRIES) await sleep(FETCH_BACKOFF_MS);
  }
  return null;
}

function buildText(t) {
  const head = [
    `# ${t.title || 'Untitled meeting'}`,
    `${t.date} · ${t.duration_minutes}min`,
    `Participants: ${(t.participants || []).join(', ')}`,
    '',
  ].join('\n');
  const body = (t.transcript_text || '').slice(0, MAX_TRANSCRIPT_CHARS);
  return `${head}\n${body}`;
}

router.post('/', async (req, res) => {
  const secret = process.env.FIREFLIES_WEBHOOK_SECRET;
  if (!secret) {
    console.error('FIREFLIES_WEBHOOK_SECRET not set — rejecting webhook');
    return res.status(500).json({ error: 'webhook not configured' });
  }

  const sigHeader = req.header('x-hub-signature') || req.header('x-hub-signature-256');
  if (!verifySignature(req.rawBody, sigHeader, secret)) {
    console.warn('Fireflies webhook: signature verification failed');
    return res.status(401).json({ error: 'invalid signature' });
  }

  const { event, meeting_id: meetingId } = req.body || {};
  console.log(`Fireflies webhook: event=${event} meeting_id=${meetingId}`);

  if (event === 'test' || meetingId === 'test_00000000') {
    return res.status(200).json({ ok: true, test: true });
  }

  if (!meetingId) {
    return res.status(400).json({ error: 'meeting_id required' });
  }

  try {
    const existing = await findBySourceId('fireflies', meetingId);
    if (existing) {
      console.log(`Fireflies webhook: ${meetingId} already captured (${existing.id})`);
      return res.status(200).json({ ok: true, duplicate: true, id: existing.id });
    }

    const transcript = await fetchTranscriptWithRetry(meetingId);
    if (!transcript) {
      console.log(`Fireflies webhook: ${meetingId} not ready after ${FETCH_RETRIES} retries, acking`);
      return res.status(200).json({ ok: true, deferred: true });
    }

    const text = buildText(transcript);
    const result = await captureThought(text, {
      source: 'fireflies',
      sourceId: meetingId,
    });

    console.log(`Fireflies webhook: captured ${meetingId} as ${result.id}`);
    res.status(200).json(result);
  } catch (err) {
    console.error(`Fireflies webhook error for ${meetingId}:`, err.message);
    res.status(500).json({ error: err.message });
  }
});

export default router;
