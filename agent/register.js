import { getFirefliesTranscripts } from './tools/fireflies.js';
import { getYoutubeLikes } from './tools/youtube.js';
import { getGmailThreads } from './tools/gmail.js';
import { getCalendarEvents } from './tools/calendar.js';
import { getEventContext } from './tools/context.js';
import { getTaskContext } from './tools/task-context.js';
import { listDrafts, saveDraft, approveDraft, rejectDraft } from './drafts/store.js';

function json(data) {
  return { content: [{ type: 'text', text: JSON.stringify(data, null, 2) }] };
}

export function registerAgentTools(server, z) {
  server.tool(
    'get_fireflies_transcripts',
    'Fetch raw meeting transcripts from Fireflies since a given date',
    { since_date: z.string().optional().describe('ISO date, defaults to yesterday') },
    async ({ since_date }) => json(await getFirefliesTranscripts(since_date))
  );

  server.tool(
    'get_youtube_likes',
    'Fetch liked YouTube videos with metadata and captions since a given date',
    { since_date: z.string().optional().describe('ISO date, defaults to yesterday') },
    async ({ since_date }) => json(await getYoutubeLikes(since_date))
  );

  server.tool(
    'get_gmail_threads',
    'Search Gmail threads by query and return subjects, senders, and body text',
    {
      query: z.string().describe('Gmail search query'),
      max_results: z.number().optional().describe('Max threads to return, default 10'),
    },
    async ({ query, max_results }) => json(await getGmailThreads(query, max_results))
  );

  server.tool(
    'get_calendar_events',
    'Get calendar events for a date range (defaults to today)',
    {
      start: z.string().optional().describe('Start date ISO string'),
      end: z.string().optional().describe('End date ISO string'),
    },
    async ({ start, end }) => {
      try {
        const dateRange = start || end ? { start, end } : undefined;
        return json(await getCalendarEvents(dateRange));
      } catch (e) {
        return json({ error: e.message, status: e.response?.status, data: e.response?.data });
      }
    }
  );

  server.tool(
    'get_event_context',
    'Assemble brain + email + meeting context for an upcoming event',
    {
      event_title: z.string(),
      attendees: z.array(z.string()).optional().describe('Attendee names or emails'),
    },
    async ({ event_title, attendees }) => json(await getEventContext(event_title, attendees))
  );

  server.tool(
    'get_task_context',
    'Search brain for context related to a task — when it was discussed, by whom, in which meetings',
    { task_title: z.string() },
    async ({ task_title }) => json(await getTaskContext(task_title))
  );

  server.tool(
    'manage_drafts',
    'Manage draft thoughts: list pending, save new, approve, or reject',
    {
      action: z.enum(['list', 'save', 'approve', 'reject']),
      status: z.string().optional().describe('For list: pending|approved|rejected'),
      id: z.string().optional().describe('For approve/reject: draft ID'),
      data: z.object({
        source: z.string(),
        summary: z.string(),
        original: z.string(),
        metadata: z.record(z.any()).optional(),
      }).optional().describe('For save: draft data'),
    },
    async ({ action, status, id, data }) => {
      switch (action) {
        case 'list': return json(listDrafts(status));
        case 'save': return json(saveDraft(data));
        case 'approve': return json(approveDraft(id));
        case 'reject': return json(rejectDraft(id));
        default: return json({ error: 'Unknown action' });
      }
    }
  );
}
