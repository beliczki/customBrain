import dotenv from 'dotenv';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
dotenv.config({ path: join(dirname(fileURLToPath(import.meta.url)), '.env') });

import { google } from 'googleapis';
import { readFileSync, existsSync } from 'node:fs';
import http from 'node:http';

function loadCreds() {
  if (process.env.GOOGLE_DRIVE_CLIENT_ID && process.env.GOOGLE_DRIVE_CLIENT_SECRET) {
    return {
      client_id: process.env.GOOGLE_DRIVE_CLIENT_ID,
      client_secret: process.env.GOOGLE_DRIVE_CLIENT_SECRET,
    };
  }
  if (existsSync('./client_secret.json')) {
    const raw = JSON.parse(readFileSync('./client_secret.json', 'utf8'));
    return raw.web || raw.installed;
  }
  throw new Error(
    'No creds: set GOOGLE_DRIVE_CLIENT_ID + GOOGLE_DRIVE_CLIENT_SECRET in env, or provide ./client_secret.json'
  );
}

const { client_id, client_secret } = loadCreds();
const REDIRECT = 'http://localhost:3001/callback';

const oauth2 = new google.auth.OAuth2(client_id, client_secret, REDIRECT);

const url = oauth2.generateAuthUrl({
  access_type: 'offline',
  prompt: 'consent',
  scope: [
    // Full drive scope replaces the service account for vault reads (0.39.0).
    // Two constraints forced this exact scope:
    //   1. drive.file only sees app-created files, so hand-made dossiers
    //      (Me.md, the whole Topics folder) were invisible — that was the real
    //      cause of the "OAuth2 can't see all vault files" note in CLAUDE.md.
    //   2. Google rejects drive.file and youtube.readonly in the same consent
    //      request ("scopes that cannot be requested together", 2026-08-02).
    //      The old token predates that rule and still carries both.
    // drive.readonly would cover the reads but not the vault writes the export
    // performs, so full drive is the narrowest scope that satisfies both.
    'https://www.googleapis.com/auth/drive',
    'https://www.googleapis.com/auth/gmail.modify',
    'https://www.googleapis.com/auth/calendar.readonly',
    'https://www.googleapis.com/auth/youtube.readonly',
  ],
});

console.log('\nOpening browser for Google sign-in...\n');

// Start a temporary server to catch the callback
const server = http.createServer(async (req, res) => {
  if (!req.url.startsWith('/callback')) return;
  const code = new URL(req.url, 'http://localhost:3001').searchParams.get('code');

  try {
    const { tokens } = await oauth2.getToken(code);
    res.writeHead(200, { 'Content-Type': 'text/html' });
    res.end('<h1>Done! You can close this tab.</h1>');

    console.log('\n✓ Success! Paste these into Settings UI → Google Drive section (since 0.23.0):\n');
    console.log(`GOOGLE_DRIVE_REFRESH_TOKEN=${tokens.refresh_token}`);
    console.log(`GOOGLE_DRIVE_CLIENT_ID=${client_id}`);
    console.log(`GOOGLE_DRIVE_CLIENT_SECRET=${client_secret}`);
    console.log('');
  } catch (err) {
    res.writeHead(500);
    res.end('Error: ' + err.message);
    console.error('Error:', err.message);
  }
  server.close();
});

server.listen(3001, () => {
  console.log('Open this URL in your browser:\n');
  console.log(url);
  console.log('');
});
