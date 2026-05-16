import { useState, useEffect } from 'react';
import { getSettings, saveSettings, restartServer, waitForServer } from '../api.js';

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
