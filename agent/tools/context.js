import { searchThoughts } from '../../server/routes/search.js';
import { getGmailThreads } from './gmail.js';
import { getFirefliesTranscripts } from './fireflies.js';

export async function getEventContext(eventTitle, attendees) {
  const [brainResults, emails, transcripts] = await Promise.all([
    searchThoughts(eventTitle, 5).catch(() => []),
    getGmailThreads(eventTitle, 5).catch(() => []),
    getFirefliesTranscripts().catch(() => []),
  ]);

  // Filter transcripts by title or attendee overlap
  const attendeeSet = new Set((attendees || []).map((a) => a.toLowerCase()));
  const titleLower = eventTitle.toLowerCase();

  const pastMeetings = transcripts.filter((t) => {
    if (t.title.toLowerCase().includes(titleLower)) return true;
    if (attendeeSet.size > 0) {
      return t.participants.some((p) => attendeeSet.has(p.toLowerCase()));
    }
    return false;
  });

  return {
    event_info: { title: eventTitle, attendees: attendees || [] },
    brain_results: brainResults,
    related_emails: emails,
    past_meetings: pastMeetings,
  };
}
