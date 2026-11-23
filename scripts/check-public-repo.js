#!/usr/bin/env node
// Public-repo check: this repository is public, so an IP address, ssh data or a
// server path must not be committed (AGENTS.md, "Deploy"). Box facts live in
// ~/.agents/infra-map.md, outside the repo.
//
// Reads a unified diff on stdin and reports the ADDED lines that look like
// such data. Old lines are not judged: the history already has some, and a
// check that fails on day one gets switched off.
//
//   git diff --cached -U0 --no-color | node scripts/check-public-repo.js
//
// The patterns are generic on purpose. A real address or key name written here
// would publish the very thing the check protects. Real values go, one per
// line, into an untracked file inside the git folder: info/public-repo-denylist
// (lines starting with # are comments). The check reads it when it exists.
import { readFileSync, existsSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import { join } from 'node:path';

const OCTET = '(?:25[0-5]|2[0-4]\\d|1\\d\\d|[1-9]?\\d)';
const IPV4 = new RegExp(`(?<![\\d.])${OCTET}(?:\\.${OCTET}){3}(?![\\d.])`, 'g');
// Loopback, the any-address, netmasks, and the three documentation ranges.
const HARMLESS_IP = [/^127\./, /^0\.0\.0\.0$/, /^255\./, /^192\.0\.2\./, /^198\.51\.100\./, /^203\.0\.113\./];

const PATTERNS = [
  { kind: 'ssh-identity', re: /\bssh\b[^\n]*\s-i\s+\S+/ },
  { kind: 'user-at-host', re: /\b(?:root|ubuntu|admin|deploy)@[A-Za-z0-9][A-Za-z0-9.-]*/ },
  { kind: 'ssh-folder', re: /(?:~|\/)\.ssh\/[\w.-]+/ },
  { kind: 'key-file', re: /\bid_(?:rsa|ed25519|ecdsa|dsa)\w*/ },
  { kind: 'private-key', re: /-----BEGIN [A-Z ]*PRIVATE KEY-----/ },
  { kind: 'server-path', re: /(?<![\w.~-])\/(?:root|var\/www|mnt|opt|home\/[a-z_][\w-]*)\/[\w.-]+/ },
];

function kindsOf(text, denylist) {
  const kinds = [];
  const ips = text.match(IPV4) || [];
  if (ips.some((ip) => !HARMLESS_IP.some((ok) => ok.test(ip)))) kinds.push('ip-address');
  for (const { kind, re } of PATTERNS) if (re.test(text)) kinds.push(kind);
  const lower = text.toLowerCase();
  if (denylist.some((entry) => lower.includes(entry.toLowerCase()))) kinds.push('denylist');
  return kinds;
}

/** The added lines of a unified diff that look like server data. */
export function findProblems(diff, denylist = []) {
  const problems = [];
  let file = null;
  let line = 0;
  for (const row of diff.split('\n')) {
    if (row.startsWith('+++ ')) {
      file = row.slice(4).replace(/^b\//, '');
    } else if (row.startsWith('@@')) {
      line = Number((row.match(/\+(\d+)/) || [])[1]);
    } else if (row.startsWith('+')) {
      const text = row.slice(1);
      for (const kind of kindsOf(text, denylist)) problems.push({ file, line, kind, text });
      line += 1;
    } else if (row.startsWith(' ')) {
      line += 1;
    }
  }
  return problems;
}

function localDenylist() {
  const gitDir = execFileSync('git', ['rev-parse', '--git-common-dir'], { encoding: 'utf8' }).trim();
  const file = join(gitDir, 'info', 'public-repo-denylist');
  if (!existsSync(file)) return [];
  return readFileSync(file, 'utf8').split('\n').map((entry) => entry.trim()).filter((entry) => entry && !entry.startsWith('#'));
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const problems = findProblems(readFileSync(0, 'utf8'), localDenylist());
  if (problems.length) {
    console.error('This repo is public. These added lines look like server data:');
    for (const p of problems) {
      const text = p.text.trim();
      console.error(`  ${p.file}:${p.line}  [${p.kind}]  ${text.length > 120 ? `${text.slice(0, 120)}…` : text}`);
    }
    console.error('Box facts belong in ~/.agents/infra-map.md or the shared notes, not here.');
    console.error('False alarm? Commit once with PUBLIC_REPO_CHECK=off in front of the git command.');
    process.exit(1);
  }
}
