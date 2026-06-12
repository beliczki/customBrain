// Compact per-thought facts row (P18): index richness (1 vektor vs summary+N
// chunk) and, for Gmail threads, when the thread last got a new message and who
// sent it. Shared by Search results and Recent (ThoughtView).
function fmtDate(ms) {
  const d = new Date(Number(ms));
  return Number.isNaN(d.getTime()) ? null : d.toLocaleDateString();
}

function senderName(from) {
  if (!from) return null;
  const name = from.replace(/<[^>]*>/, '').trim().replace(/^"|"$/g, '');
  return name || from;
}

export default function ThoughtFacts({ item }) {
  const isGmail = item.source === 'gmail';
  const updated = isGmail && item.last_internal_date ? fmtDate(item.last_internal_date) : null;
  const sender = isGmail ? senderName(item.last_message_from) : null;

  return (
    <div className="thought-facts flex flex-wrap items-center gap-x-3 gap-y-1 text-[10px] mt-2">
      <span className="vector-badge px-2 py-0.5 uppercase tracking-wider font-mono bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300">
        {item.has_v2_summary ? `summary + ${item.chunk_count ?? 0} chunk` : '1 vektor'}
      </span>
      {updated && (
        <span className="thread-updated text-txt-ter">
          szál frissítve: {updated}
          {item.refresh_count ? ` · ${item.refresh_count}× frissült` : ''}
        </span>
      )}
      {sender && <span className="thread-sender text-txt-ter">új sor feladója: {sender}</span>}
    </div>
  );
}
