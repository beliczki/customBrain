const GEMINI_MODEL = 'gemini-2.5-flash';
const GEMINI_URL = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`;
const FETCH_TIMEOUT_MS = 180_000; // 3 min — catches hung calls without killing legitimate long-video processing

const PROMPT = `You are capturing knowledge from a YouTube video into a second brain. Watch the full video and extract high-signal content only.

Return markdown with these sections (only include sections that apply):

## Summary
2–4 sentences on what the video is about and why it matters.

## Key ideas
Bulleted. Substantive insights, claims, arguments, data points. Skip intros/outros/sponsor reads/pleasantries. Up to 12 bullets.

## Action items
Concrete recommendations the speaker makes to the viewer. Bulleted. Omit if none.

## Frameworks, models, concepts
Named frameworks, mental models, vocabulary the video introduces. Bulleted with one-line definitions.

## Speakers
Names of host/guests if identifiable.

Respond in the primary language of the video. If the video is in Hungarian, write in Hungarian; if English, English. Do not translate.

If the video is music, pure entertainment, or has no substantive content, respond with exactly: __NO_CONTENT__`;

export async function fetchVideoSummary(videoId) {
  const apiKey = process.env.GOOGLE_API_KEY;
  if (!apiKey) throw new Error('GOOGLE_API_KEY not set');

  const body = {
    contents: [
      {
        parts: [
          { fileData: { fileUri: `https://www.youtube.com/watch?v=${videoId}` } },
          { text: PROMPT },
        ],
      },
    ],
    generationConfig: {
      temperature: 0.2,
      maxOutputTokens: 8192,
    },
  };

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  let res;
  try {
    res = await fetch(`${GEMINI_URL}?key=${apiKey}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
  } catch (err) {
    if (err.name === 'AbortError') {
      throw new Error(`Gemini video summary timeout after ${FETCH_TIMEOUT_MS}ms`);
    }
    throw err;
  } finally {
    clearTimeout(timeoutId);
  }

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Gemini video summary failed (${res.status}): ${err.slice(0, 300)}`);
  }

  const json = await res.json();
  const candidate = json.candidates?.[0];
  const text = candidate?.content?.parts?.[0]?.text?.trim() || null;
  const finish = candidate?.finishReason;
  const usage = json.usageMetadata;

  if (finish && finish !== 'STOP') {
    console.warn(`Gemini summary: finishReason=${finish} tokens=${usage?.totalTokenCount} chars=${text?.length || 0}`);
  }

  if (!text || text === '__NO_CONTENT__') return null;
  return text;
}
