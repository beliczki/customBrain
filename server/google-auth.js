import { google } from 'googleapis';

// No fallback on purpose: a missing refresh token must fail loudly rather than
// silently degrade to an identity that may not exist (see drive-context.js).
function getOAuth2Client() {
  if (!process.env.GOOGLE_DRIVE_REFRESH_TOKEN) {
    throw new Error('GOOGLE_DRIVE_REFRESH_TOKEN is not set — Google API access unavailable');
  }
  const oauth2 = new google.auth.OAuth2(
    process.env.GOOGLE_DRIVE_CLIENT_ID,
    process.env.GOOGLE_DRIVE_CLIENT_SECRET
  );
  oauth2.setCredentials({ refresh_token: process.env.GOOGLE_DRIVE_REFRESH_TOKEN });
  return oauth2;
}

export function getGmail() {
  return google.gmail({ version: 'v1', auth: getOAuth2Client() });
}

export function getCalendar() {
  return google.calendar({ version: 'v3', auth: getOAuth2Client() });
}

export function getYouTube() {
  return google.youtube({ version: 'v3', auth: getOAuth2Client() });
}
