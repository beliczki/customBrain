// Capability scopes for named MCP tokens.
//
// Why: a named token from state/mcp-tokens.json is restricted to /capture and
// /search over REST (NAMED_TOKEN_PATHS in server/index.js), but the same token
// reaching /mcp/http used to get the ENTIRE tool surface — including direct
// Gmail, Calendar and Fireflies reads, and the mutating brain tools. The REST
// allowlist was the only limit, and it only limited REST. A token minted for
// the Chrome clipper could read the mailbox.
//
// Enforcement is by non-registration, not by a check inside each handler: a
// connection whose token lacks a scope never has that tool registered, so
// tools/list hides it AND a direct tools/call for it fails as unknown. See
// applyScopeGate below.

import { logMcpCall } from './mcp-call-log.js';

export const SCOPES = ['capture', 'brain-read', 'curate', 'live-provider-read'];

// Every tool MUST appear here. A tool with no entry throws at registration time
// rather than defaulting to allowed — this file is duplicated in effect across
// server/mcp.js, server/mcp-stdio.js and agent/register.js, and a silent
// full-access default is exactly how a new tool would slip the gate.
export const TOOL_SCOPES = {
  // capture — writes new material into the brain
  capture_thought: 'capture',
  manage_drafts: 'capture', // approve calls captureThought

  // brain-read — reads only what is already in the brain
  search_brain: 'brain-read',
  get_thought: 'brain-read',
  quick_lookup: 'brain-read',
  find_files: 'brain-read', // reads state/files-catalog.json; no provider calls
  list_commitments: 'brain-read',
  list_commitment_candidates: 'brain-read',
  brain_map: 'brain-read', // agenda cache, not live Calendar; no provider calls
  list_recent: 'brain-read',
  brain_stats: 'brain-read',
  find_overconnected: 'brain-read',
  list_thoughts_needing_summary: 'brain-read',
  brain_health_check: 'brain-read',
  get_task_context: 'brain-read', // brain search wrapper; no provider calls

  // curate — mutates stored thoughts, the vault, or the index
  suggest_metadata_fix: 'curate',
  update_thought: 'curate',
  update_thought_text_with_summary: 'curate',
  rebuild_obsidian_vault: 'curate',
  reindex_dossiers: 'curate',
  save_commitments: 'curate', // writes commitments + candidates_reviewed_at on thoughts

  // live-provider-read — reaches the mailbox, calendar, or meeting recorder.
  // A brain search must never quietly widen into a live mailbox search.
  get_gmail_threads: 'live-provider-read',
  get_calendar_events: 'live-provider-read',
  get_fireflies_transcripts: 'live-provider-read',
  get_youtube_likes: 'live-provider-read',
  get_event_context: 'live-provider-read', // brain + Gmail + Fireflies
  get_agenda: 'live-provider-read',        // reads Calendar
};

export function isValidScopeList(scopes) {
  return Array.isArray(scopes) && scopes.length > 0 && scopes.every((s) => SCOPES.includes(s));
}

/**
 * Restrict an McpServer to the given scopes by wrapping `server.tool` BEFORE any
 * registration runs. Call sites stay untouched, which is the point: the 23 tools
 * are registered across three files (mcp.js, mcp-stdio.js, agent/register.js),
 * and annotating each one would have to be done — and kept in sync — three times.
 *
 * `scopes = null` means unrestricted. Tokens minted before 0.41.3 carry no
 * scopes field and stay unrestricted, so existing clients keep working; narrowing
 * a specific token is a deliberate act.
 */
export function applyScopeGate(server, scopes, caller = null) {
  const register = server.tool.bind(server);
  server.tool = (name, ...rest) => {
    const required = TOOL_SCOPES[name];
    if (!required) {
      throw new Error(
        `[mcp-scopes] tool "${name}" has no scope mapping — add it to TOOL_SCOPES in server/mcp-scopes.js`
      );
    }
    if (scopes && !scopes.includes(required)) return undefined;
    if (!caller) return register(name, ...rest);
    // 0.58.0: the same single wrap point also logs each call for the Runs tab.
    const handler = rest.pop();
    return register(name, ...rest, (...callArgs) => loggedCall(caller, name, handler, callArgs));
  };
  return server;
}

// The handler gets (args, extra) when the tool declares a schema. The log is a
// side record, not the data path: a failed write is reported in the pm2 log
// and the agent still gets its result.
async function loggedCall(caller, tool, handler, callArgs) {
  const startedAt = Date.now();
  const args = callArgs.length > 1 ? callArgs[0] : {};
  let result;
  try {
    result = await handler(...callArgs);
  } catch (error) {
    writeLog({ caller, tool, args, startedAt, error });
    throw error;
  }
  writeLog({ caller, tool, args, startedAt, result });
  return result;
}

function writeLog(entry) {
  try {
    logMcpCall(entry);
  } catch (err) {
    console.error(`[mcp-call-log] write failed for ${entry.tool}:`, err.message);
  }
}
