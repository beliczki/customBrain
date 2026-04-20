const FIREFLIES_URL = 'https://api.fireflies.ai/graphql';

const TRANSCRIPTS_QUERY = `
  query Transcripts($fromDate: DateTime) {
    transcripts(fromDate: $fromDate) {
      id
      title
      date
      duration
      organizer_email
      participants
      sentences {
        speaker_name
        text
      }
    }
  }
`;

const TRANSCRIPT_BY_ID_QUERY = `
  query Transcript($id: String!) {
    transcript(id: $id) {
      id
      title
      date
      duration
      organizer_email
      participants
      sentences {
        speaker_name
        text
      }
    }
  }
`;

/**
 * Normalize the `participants` field. Fireflies' GraphQL response mixes
 * shapes: sometimes pure array of emails, sometimes an array where ONE
 * element is itself a comma-joined string of all organizer+attendee emails
 * plus individual elements for each attendee (meaning every email appears
 * both inside the joined string AND as its own element → duplicates).
 *
 * Observed 2026-04-20 on meeting 01KPFY7N7K9TCKBF67S5JDNTWY:
 *   ["a@b.hu,c@d.hu,e@f.hu", "a@b.hu", "c@d.hu", "e@f.hu"]
 * After normalization: ["a@b.hu", "c@d.hu", "e@f.hu"] — one each.
 *
 * Defensive: handles array, single string, or mixed. Splits on both
 * commas and semicolons. Trims whitespace. Dedupes. Filters empty.
 */
function normalizeParticipants(raw) {
  if (!raw) return [];
  const arr = Array.isArray(raw) ? raw : [raw];
  const out = [];
  for (const item of arr) {
    if (typeof item !== 'string') continue;
    for (const email of item.split(/[,;]/).map((s) => s.trim()).filter(Boolean)) {
      out.push(email);
    }
  }
  return [...new Set(out)];
}

function shapeTranscript(t) {
  // Fireflies returns `duration` in MINUTES already (not seconds as
  // originally assumed). Verified 2026-04-19 against 45 real meetings —
  // values of 30, 45, 60 come back directly; dividing by 60 made every
  // meeting look like 0-2 minutes.
  // `date` is a Unix timestamp in milliseconds — convert to ISO for
  // downstream display.
  const dateIso = t.date
    ? new Date(Number(t.date)).toISOString()
    : null;
  return {
    id: t.id,
    title: t.title,
    date: dateIso,
    duration_minutes: Math.round(t.duration || 0),
    participants: normalizeParticipants(t.participants),
    transcript_text: (t.sentences || [])
      .map((s) => `${s.speaker_name}: ${s.text}`)
      .join('\n'),
  };
}

async function firefliesQuery(query, variables) {
  const apiKey = process.env.FIREFLIES_API_KEY;
  if (!apiKey) throw new Error('FIREFLIES_API_KEY not set');

  const res = await fetch(FIREFLIES_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({ query, variables }),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Fireflies API error ${res.status}: ${text}`);
  }

  const { data, errors } = await res.json();
  if (errors) throw new Error(`Fireflies GraphQL error: ${JSON.stringify(errors)}`);
  return data;
}

export async function getFirefliesTranscriptById(id) {
  const data = await firefliesQuery(TRANSCRIPT_BY_ID_QUERY, { id });
  if (!data.transcript) return null;
  return shapeTranscript(data.transcript);
}

export async function getFirefliesTranscripts(sinceDate) {
  const fromDate = sinceDate || new Date(Date.now() - 86400000).toISOString().split('T')[0];
  const data = await firefliesQuery(TRANSCRIPTS_QUERY, { fromDate });
  return (data.transcripts || []).map(shapeTranscript);
}
