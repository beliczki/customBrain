import 'dotenv/config';
import { google } from 'googleapis';
import { readFileSync } from 'node:fs';
import http from 'node:http';

const credentials = JSON.parse(readFileSync('./client_secret.json', 'utf8'));
const { client_id, client_secret } = credentials.web || credentials.installed;
const REDIRECT = 'http://localhost:3001/callback';

const oauth2 = new google.auth.OAuth2(client_id, client_secret, REDIRECT);

const url = oauth2.generateAuthUrl({
  access_type: 'offline',
  prompt: 'consent',
  scope: [
    'https://www.googleapis.com/auth/drive.file',
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

    console.log('\n✓ Success! Add these to your server/.env:\n');
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
