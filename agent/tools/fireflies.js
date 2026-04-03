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

export async function getFirefliesTranscripts(sinceDate) {
  const apiKey = process.env.FIREFLIES_API_KEY;
  if (!apiKey) throw new Error('FIREFLIES_API_KEY not set');

  const fromDate = sinceDate || new Date(Date.now() - 86400000).toISOString().split('T')[0];

  const res = await fetch(FIREFLIES_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      query: TRANSCRIPTS_QUERY,
      variables: { fromDate },
    }),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Fireflies API error ${res.status}: ${text}`);
  }

  const { data, errors } = await res.json();
  if (errors) throw new Error(`Fireflies GraphQL error: ${JSON.stringify(errors)}`);

  return (data.transcripts || []).map((t) => ({
    id: t.id,
    title: t.title,
    date: t.date,
    duration_minutes: Math.round((t.duration || 0) / 60),
    participants: t.participants || [],
    transcript_text: (t.sentences || [])
      .map((s) => `${s.speaker_name}: ${s.text}`)
      .join('\n'),
  }));
}
