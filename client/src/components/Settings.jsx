import { useState, useEffect } from 'react';
import { getSettings, saveSettings, restartServer, waitForServer, listMcpTokens, createMcpToken, revokeMcpToken, listOAuthClients, createOAuthClient, revokeOAuthClient } from '../api.js';

export default function Settings() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [edits, setEdits] = useState({});           // key → new value (only touched fields)
  const [revealed, setRevealed] = useState({});     // key → true when "Show" pressed
  const [saving, setSaving] = useState(false);
  const [restarting, setRestarting] = useState(false);
  const [status, setStatus] = useState(null);       // {type: 'ok'|'err', text: '...'}

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await getSettings();
      setData(res);
      setEdits({});
      setRevealed({});
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const setEdit = (key, value) => {
    setEdits((prev) => ({ ...prev, [key]: value }));
  };

  const dirtyKeys = Object.keys(edits);
  const isDirty = dirtyKeys.length > 0;

  const onRevealToggle = async (key) => {
    if (revealed[key]) {
      setRevealed((p) => ({ ...p, [key]: false }));
      return;
    }
    // Fetch unmasked value once
    try {
      const res = await getSettings(true);
      const item = res.items.find((i) => i.key === key);
      setRevealed((p) => ({ ...p, [key]: item?.value ?? '' }));
    } catch (err) {
      setStatus({ type: 'err', text: `Reveal failed: ${err.message}` });
    }
  };

  const onSave = async (alsoRestart) => {
    setSaving(true);
    setStatus(null);
    try {
      const res = await saveSettings(edits);
      if (res.error) throw new Error(res.error);
      setStatus({ type: 'ok', text: `Saved ${res.changed} key${res.changed === 1 ? '' : 's'}.` });
      setEdits({});
      if (alsoRestart) {
        setRestarting(true);
        await restartServer();
        // Server exits within ~500ms. Wait for it to come back.
        await new Promise((r) => setTimeout(r, 2500));
        const back = await waitForServer(30000);
        if (back) {
          await load();
          setStatus({ type: 'ok', text: 'Saved + server restarted.' });
        } else {
          setStatus({ type: 'err', text: 'Server did not come back within 30s. SSH check needed.' });
        }
        setRestarting(false);
      } else {
        await load();
      }
    } catch (err) {
      setStatus({ type: 'err', text: err.message });
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <p className="text-txt-ter text-sm">Loading…</p>;
  if (error) return <p className="text-red-600 dark:text-red-400 text-sm">Error: {error}</p>;
  if (!data) return null;

  // Group items by category
  const byCategory = new Map();
  for (const item of data.items) {
    if (!byCategory.has(item.category)) byCategory.set(item.category, []);
    byCategory.get(item.category).push(item);
  }

  return (
    <div className="settings-tab">
      {/* Top bar — save buttons + status */}
      <div className="settings-topbar flex items-center justify-between gap-3 mb-6 pb-3 border-b border-[var(--border)] flex-wrap">
        <div className="text-xs text-txt-ter">
          {data.updated_at
            ? <>Last saved: <span className="text-txt-sec">{new Date(data.updated_at).toLocaleString()}</span></>
            : <span className="text-amber-700 dark:text-amber-300">Settings file not yet created — values loaded from .env</span>}
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {isDirty && (
            <span className="text-xs text-amber-700 dark:text-amber-300">{dirtyKeys.length} unsaved</span>
          )}
          <button
            type="button"
            onClick={() => onSave(false)}
            disabled={!isDirty || saving || restarting}
            className="px-3 py-1.5 bg-surface border border-subtle text-txt-sec text-xs hover:bg-[var(--border)] disabled:opacity-50 transition-colors"
          >
            Save
          </button>
          <button
            type="button"
            onClick={() => onSave(true)}
            disabled={!isDirty || saving || restarting}
            className="px-3 py-1.5 bg-accent text-white text-xs font-medium hover:bg-accent-dark disabled:opacity-50 transition-colors"
          >
            {restarting ? 'Restarting…' : saving ? 'Saving…' : 'Save & Restart'}
          </button>
        </div>
      </div>

      {status && (
        <div className={`settings-status text-xs mb-4 px-3 py-2 ${status.type === 'ok' ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900 dark:text-emerald-300' : 'bg-red-100 text-red-700 dark:bg-red-900 dark:text-red-300'}`}>
          {status.text}
        </div>
      )}

      <OAuthClientsSection onStatus={setStatus} />

      <McpTokensSection onStatus={setStatus} />

      {[...byCategory.entries()].map(([category, items]) => (
        <div key={category} className="settings-category mb-8">
          <h2 className="settings-category__header text-xs uppercase tracking-wider text-txt-ter mb-3 pb-1 border-b border-subtle">
            {category}
          </h2>
          {items.map((item) => (
            <SettingsField
              key={item.key}
              item={item}
              editValue={edits[item.key]}
              revealedValue={revealed[item.key]}
              onChange={(v) => setEdit(item.key, v)}
              onRevealToggle={() => onRevealToggle(item.key)}
            />
          ))}
        </div>
      ))}

      <p className="text-xs text-txt-ter mt-8">
        Settings file: <code className="text-txt-sec">{data.settings_path}</code>
      </p>
    </div>
  );
}

function OAuthClientsSection({ onStatus }) {
  const [clients, setClients] = useState([]);
  const [loading, setLoading] = useState(true);
  const [newName, setNewName] = useState('');
  const [newClientId, setNewClientId] = useState('');
  const [newRedirect, setNewRedirect] = useState('');
  const [newAuthMethod, setNewAuthMethod] = useState('none');
  const [creating, setCreating] = useState(false);
  // Holds the just-created client's full credentials (client_id + client_secret).
  // Cleared on next refresh; secret is shown ONCE per industry standard.
  const [justCreated, setJustCreated] = useState(null);

  const refresh = async () => {
    setLoading(true);
    try {
      const res = await listOAuthClients();
      setClients(res.clients || []);
    } catch (err) {
      onStatus?.({ type: 'err', text: `OAuth clients load failed: ${err.message}` });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { refresh(); }, []);

  const onCreate = async () => {
    const name = newName.trim();
    const redirectsList = newRedirect.split(',').map((s) => s.trim()).filter(Boolean);
    if (!name || redirectsList.length === 0) return;
    setCreating(true);
    try {
      const res = await createOAuthClient({
        name,
        redirect_uris: redirectsList,
        token_endpoint_auth_method: newAuthMethod,
        client_id: newClientId.trim() || undefined,
      });
      setJustCreated(res.client);
      setNewName('');
      setNewClientId('');
      setNewRedirect('');
      setNewAuthMethod('none');
      onStatus?.({ type: 'ok', text: `Created OAuth client "${name}". ${res.client.client_secret ? 'Copy the client_secret now — it won\'t be shown again.' : 'PKCE-only client (no secret needed).'}` });
      await refresh();
    } catch (err) {
      onStatus?.({ type: 'err', text: `Create failed: ${err.message}` });
    } finally {
      setCreating(false);
    }
  };

  const onRevoke = async (client) => {
    if (!confirm(`Revoke OAuth client "${client.name}"? Any tokens already issued to it stay active until they expire — revoke those separately from the MCP tokens list below.`)) return;
    try {
      await revokeOAuthClient(client.id);
      onStatus?.({ type: 'ok', text: `Revoked "${client.name}".` });
      if (justCreated && justCreated.id === client.id) setJustCreated(null);
      await refresh();
    } catch (err) {
      onStatus?.({ type: 'err', text: `Revoke failed: ${err.message}` });
    }
  };

  const onCopy = async (value, label) => {
    try {
      await navigator.clipboard.writeText(value);
      onStatus?.({ type: 'ok', text: `Copied ${label}.` });
    } catch (err) {
      onStatus?.({ type: 'err', text: `Copy failed: ${err.message}` });
    }
  };

  return (
    <div className="settings-category oauth-clients mb-8">
      <h2 className="settings-category__header text-xs uppercase tracking-wider text-txt-ter mb-3 pb-1 border-b border-subtle">
        OAuth clients
      </h2>
      <p className="text-xs text-txt-ter mb-3">
        Registered OAuth 2.0 clients (Grok, Claude Desktop, etc.). Each gets its own <code>client_id</code> + optional <code>client_secret</code>;
        consent uses the <code>OAUTH_USER</code> + <code>OAUTH_PASSWORD</code> values from the OAuth category below (NOT the UI master).
      </p>

      <div className="form-field grid grid-cols-1 gap-2 mb-2">
        <input
          type="text"
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
          placeholder='Display name (e.g. "Grok", "Claude Desktop")'
          className="px-2 py-1.5 bg-surface border border-subtle text-sm text-txt"
          disabled={creating}
        />
        <input
          type="text"
          value={newClientId}
          onChange={(e) => setNewClientId(e.target.value)}
          placeholder='Custom client_id (optional — leave empty for random hex)'
          className="px-2 py-1.5 bg-surface border border-subtle text-sm text-txt font-mono text-xs"
          disabled={creating}
        />
        <input
          type="text"
          value={newRedirect}
          onChange={(e) => setNewRedirect(e.target.value)}
          placeholder='Redirect URI(s) — comma-separated (e.g. https://grok.com/connectors-oauth-exchange-code/)'
          className="px-2 py-1.5 bg-surface border border-subtle text-sm text-txt font-mono text-xs"
          disabled={creating}
        />
        <div className="flex items-stretch gap-2">
          <select
            value={newAuthMethod}
            onChange={(e) => setNewAuthMethod(e.target.value)}
            className="flex-1 px-2 py-1.5 bg-surface border border-subtle text-sm text-txt"
            disabled={creating}
          >
            <option value="none">none — PKCE only (recommended)</option>
            <option value="client_secret_basic">client_secret_basic</option>
            <option value="client_secret_post">client_secret_post</option>
          </select>
          <button
            type="button"
            onClick={onCreate}
            disabled={!newName.trim() || !newRedirect.trim() || creating}
            className="toolbar-btn px-3 py-1.5 bg-accent text-white text-xs font-medium hover:bg-accent-dark disabled:opacity-50"
          >
            {creating ? 'Creating…' : '+ Generate client'}
          </button>
        </div>
      </div>

      {justCreated && (
        <div className="mcp-tokens__row py-3 px-3 border border-amber-500 bg-amber-50 dark:bg-amber-900/20 mb-3">
          <div className="text-xs font-semibold text-amber-700 dark:text-amber-300 uppercase mb-2">
            Just created — copy these now
          </div>
          <div className="text-xs text-txt-sec mb-1">client_id:</div>
          <div className="flex items-stretch gap-2 mb-2">
            <code className="flex-1 px-2 py-1.5 bg-surface border border-subtle text-xs text-txt-sec font-mono">{justCreated.client_id}</code>
            <button type="button" onClick={() => onCopy(justCreated.client_id, 'client_id')} className="toolbar-btn px-2 py-1.5 bg-surface border border-subtle text-xs">Copy</button>
          </div>
          {justCreated.client_secret && (
            <>
              <div className="text-xs text-txt-sec mb-1">client_secret (shown only once):</div>
              <div className="flex items-stretch gap-2">
                <code className="flex-1 px-2 py-1.5 bg-surface border border-subtle text-xs text-txt-sec font-mono">{justCreated.client_secret}</code>
                <button type="button" onClick={() => onCopy(justCreated.client_secret, 'client_secret')} className="toolbar-btn px-2 py-1.5 bg-surface border border-subtle text-xs">Copy</button>
              </div>
            </>
          )}
          {!justCreated.client_secret && (
            <div className="text-xs text-txt-ter italic">PKCE-only client — no secret to copy. Connector uses code_verifier instead.</div>
          )}
        </div>
      )}

      {loading ? (
        <p className="text-txt-ter text-sm">Loading…</p>
      ) : clients.length === 0 ? (
        <p className="empty-state text-txt-ter text-sm py-3 italic">
          No OAuth clients yet. Generate one above for Grok / Claude Desktop connectors.
        </p>
      ) : (
        <div className="oauth-clients__list">
          {clients.map((c) => (
            <div key={c.id} className="oauth-clients__row py-3 border-t border-[var(--border)] first:border-t-0 -mx-6 px-6">
              <div className="flex items-start justify-between gap-3 mb-1">
                <div className="flex-1 min-w-0">
                  <div className="text-sm text-txt font-medium">
                    {c.name}
                    {c.auto_registered && <span className="ml-2 text-[10px] uppercase tracking-wider text-purple-600 dark:text-purple-300">DCR</span>}
                    <span className="ml-2 text-[10px] uppercase tracking-wider text-txt-ter">{c.token_endpoint_auth_method}</span>
                  </div>
                  <div className="text-[10px] text-txt-ter mt-1 font-mono">
                    client_id: {c.client_id}
                  </div>
                  <div className="text-[10px] text-txt-ter font-mono">
                    redirect: {c.redirect_uris.join(', ')}
                  </div>
                  <div className="text-[10px] text-txt-ter">
                    Created {new Date(c.created_at).toLocaleString()}
                    {c.last_used_at ? <> · last used {new Date(c.last_used_at).toLocaleString()}</> : <> · never used</>}
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => onRevoke(c)}
                  className="toolbar-btn px-2 py-1 bg-surface border border-subtle text-xs text-red-600 dark:text-red-400 shrink-0"
                >
                  Revoke
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function McpTokensSection({ onStatus }) {
  const [tokens, setTokens] = useState([]);
  const [loading, setLoading] = useState(true);
  const [revealed, setRevealed] = useState({}); // id → raw token
  const [newName, setNewName] = useState('');
  const [creating, setCreating] = useState(false);

  const refresh = async () => {
    setLoading(true);
    try {
      const res = await listMcpTokens();
      setTokens(res.tokens || []);
    } catch (err) {
      onStatus?.({ type: 'err', text: `MCP tokens load failed: ${err.message}` });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { refresh(); }, []);

  const onCreate = async () => {
    const name = newName.trim();
    if (!name) return;
    setCreating(true);
    try {
      const res = await createMcpToken(name);
      setRevealed((p) => ({ ...p, [res.token.id]: res.token.token }));
      setNewName('');
      onStatus?.({ type: 'ok', text: `Created MCP token "${name}" — copy it now from the row below.` });
      await refresh();
    } catch (err) {
      onStatus?.({ type: 'err', text: `Create failed: ${err.message}` });
    } finally {
      setCreating(false);
    }
  };

  const onRevoke = async (token) => {
    if (!confirm(`Revoke "${token.name}"? This cannot be undone — any client using it will get 401.`)) return;
    try {
      await revokeMcpToken(token.id);
      setRevealed((p) => {
        const copy = { ...p };
        delete copy[token.id];
        return copy;
      });
      onStatus?.({ type: 'ok', text: `Revoked "${token.name}".` });
      await refresh();
    } catch (err) {
      onStatus?.({ type: 'err', text: `Revoke failed: ${err.message}` });
    }
  };

  const onRevealToggle = async (token) => {
    if (revealed[token.id]) {
      setRevealed((p) => {
        const copy = { ...p };
        delete copy[token.id];
        return copy;
      });
      return;
    }
    try {
      const res = await listMcpTokens({ revealId: token.id });
      const full = res.tokens.find((t) => t.id === token.id);
      if (full) setRevealed((p) => ({ ...p, [token.id]: full.token }));
    } catch (err) {
      onStatus?.({ type: 'err', text: `Reveal failed: ${err.message}` });
    }
  };

  const onCopy = async (value, label) => {
    try {
      await navigator.clipboard.writeText(value);
      onStatus?.({ type: 'ok', text: `Copied ${label}.` });
    } catch (err) {
      onStatus?.({ type: 'err', text: `Copy failed: ${err.message}` });
    }
  };

  return (
    <div className="settings-category mcp-tokens mb-8">
      <h2 className="settings-category__header text-xs uppercase tracking-wider text-txt-ter mb-3 pb-1 border-b border-subtle">
        MCP tokens
      </h2>
      <p className="text-xs text-txt-ter mb-3">
        Named bearer tokens for <code className="text-txt-sec">/mcp/http</code> (Claude Desktop, connector testing, etc.).
        Master <code className="text-txt-sec">UI_SECRET</code> is UI-only and does NOT authorize MCP — every external MCP client needs its own token from this list.
      </p>

      {/* Create new token */}
      <div className="form-field flex items-stretch gap-2 mb-4">
        <input
          type="text"
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') onCreate(); }}
          placeholder='e.g. "Claude Desktop", "MCP test"'
          className="flex-1 px-2 py-1.5 bg-surface border border-subtle text-sm text-txt"
          disabled={creating}
        />
        <button
          type="button"
          onClick={onCreate}
          disabled={!newName.trim() || creating}
          className="toolbar-btn px-3 py-1.5 bg-accent text-white text-xs font-medium hover:bg-accent-dark disabled:opacity-50 transition-colors"
        >
          {creating ? 'Creating…' : '+ Generate token'}
        </button>
      </div>

      {/* Token list */}
      {loading ? (
        <p className="text-txt-ter text-sm">Loading…</p>
      ) : tokens.length === 0 ? (
        <p className="empty-state text-txt-ter text-sm py-3 italic">
          No MCP tokens yet. Generate one above to start using <code>/mcp/http</code>.
        </p>
      ) : (
        <div className="mcp-tokens__list">
          {tokens.map((t) => {
            const rawToken = revealed[t.id] || null;
            const display = rawToken || t.token;
            return (
              <div key={t.id} className="mcp-tokens__row py-3 border-t border-[var(--border)] first:border-t-0 -mx-6 px-6">
                <div className="flex items-start justify-between gap-3 mb-1">
                  <div className="flex-1 min-w-0">
                    <div className="text-sm text-txt font-medium">{t.name}</div>
                    <div className="text-[10px] text-txt-ter">
                      Created {new Date(t.created_at).toLocaleString()}
                      {t.last_used_at
                        ? <> · last used {new Date(t.last_used_at).toLocaleString()}</>
                        : <> · never used</>}
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => onRevoke(t)}
                    className="toolbar-btn px-2 py-1 bg-surface border border-subtle text-xs text-red-600 dark:text-red-400 hover:bg-[var(--border)] transition-colors shrink-0"
                  >
                    Revoke
                  </button>
                </div>
                <div className="flex items-stretch gap-2">
                  <code className="flex-1 min-w-0 px-2 py-1.5 bg-surface border border-subtle text-xs text-txt-sec font-mono overflow-x-auto whitespace-nowrap">
                    {display}
                  </code>
                  <button
                    type="button"
                    onClick={() => onRevealToggle(t)}
                    className="toolbar-btn px-2 py-1.5 bg-surface border border-subtle text-xs text-txt-sec hover:bg-[var(--border)] transition-colors"
                  >
                    {rawToken ? 'Hide' : 'Show'}
                  </button>
                  {rawToken && (
                    <button
                      type="button"
                      onClick={() => onCopy(rawToken, t.name)}
                      className="toolbar-btn px-2 py-1.5 bg-surface border border-subtle text-xs text-txt-sec hover:bg-[var(--border)] transition-colors"
                    >
                      Copy
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function SettingsField({ item, editValue, revealedValue, onChange, onRevealToggle }) {
  const touched = editValue != null;
  const displayValue = touched
    ? editValue
    : revealedValue != null && revealedValue !== false
      ? revealedValue
      : item.value;
  const inputType = item.is_secret && !touched && revealedValue == null ? 'password' : 'text';
  const sourceLabel = {
    'settings.json': null,
    'env': '.env',
    'unset': item.required ? 'REQUIRED — not set' : 'unset',
  }[item.source];
  return (
    <div className="settings-field py-3 border-t border-[var(--border)] first:border-t-0 -mx-6 px-6">
      <div className="flex items-start justify-between gap-3 mb-1">
        <div className="flex-1 min-w-0">
          <label className="text-sm text-txt font-medium block">
            {item.label}
            {item.required && <span className="text-red-600 dark:text-red-400 ml-1">*</span>}
          </label>
          <code className="text-[10px] text-txt-ter">{item.key}</code>
        </div>
        {sourceLabel && (
          <span className={`text-[10px] uppercase tracking-wider shrink-0 ${item.source === 'unset' && item.required ? 'text-red-600 dark:text-red-400' : 'text-txt-ter'}`}>
            {sourceLabel}
          </span>
        )}
      </div>
      {item.description && (
        <p className="text-xs text-txt-ter mb-2">{item.description}</p>
      )}
      <div className="flex items-stretch gap-2">
        <input
          type={inputType}
          value={displayValue || ''}
          placeholder={item.default ? `default: ${item.default}` : ''}
          onChange={(e) => onChange(e.target.value)}
          className={`flex-1 min-w-0 px-2 py-1.5 bg-surface border text-sm text-txt font-mono ${touched ? 'border-amber-500' : 'border-subtle'}`}
        />
        {item.is_secret && item.has_value && (
          <button
            type="button"
            onClick={onRevealToggle}
            className="px-2 py-1.5 bg-surface border border-subtle text-xs text-txt-sec hover:bg-[var(--border)] transition-colors"
          >
            {revealedValue != null && revealedValue !== false ? 'Hide' : 'Show'}
          </button>
        )}
      </div>
    </div>
  );
}
