import { getCalendar } from '../google-auth.js';

export async function getCalendarEvents(dateRange) {
  const calendar = getCalendar();

  const now = new Date();
  const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const endOfDay = new Date(startOfDay.getTime() + 86400000);

  const timeMin = dateRange?.start
    ? new Date(dateRange.start).toISOString()
    : startOfDay.toISOString();
  const timeMax = dateRange?.end
    ? new Date(dateRange.end).toISOString()
    : endOfDay.toISOString();

  const res = await calendar.events.list({
    calendarId: 'primary',
    timeMin,
    timeMax,
    singleEvents: true,
    orderBy: 'startTime',
  });

  return (res.data.items || []).map((event) => {
    const attendees = (event.attendees || []).map((a) => ({
      email: a.email,
      name: a.displayName || '',
      status: a.responseStatus || '',
    }));

    const isAllDay = Boolean(event.start?.date);

    return {
      event_id: event.id,
      title: event.summary || '',
      start: event.start?.dateTime || event.start?.date || '',
      end: event.end?.dateTime || event.end?.date || '',
      attendees,
      description: event.description || '',
      is_all_day: isAllDay,
      likely_type: attendees.length > 0 ? 'meeting' : 'task',
    };
  });
}
