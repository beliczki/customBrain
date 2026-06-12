import ThoughtBody from './ThoughtBody.jsx';
import ThoughtFacts from './ThoughtFacts.jsx';

// Reusable thought display block — shared between Recent (list mode) and
// ThoughtModal (overlay mode). `onDelete` / `onAnatomy` optional; their buttons
// only render when the callback is provided.
export default function ThoughtView({ thought, onDelete, onAnatomy }) {
  if (!thought) return null;
  const meta = thought.metadata || thought;  // tolerate both shapes
  return (
    <div className="thought-view">
      <div className="flex justify-between items-start mb-3">
        <div className="flex-1 min-w-0">
          {thought.title && (
            <h3 className="text-base font-bold mb-1 uppercase tracking-wide text-txt">
              {thought.title}
            </h3>
          )}
          {thought.text && <ThoughtBody text={thought.text} />}
        </div>
        <div className="thought-view__actions flex items-center gap-2 ml-3 shrink-0">
          {onAnatomy && (
            <button
              onClick={() => onAnatomy(thought.id)}
              className="anatomy-btn inline-flex items-center gap-1 text-xs text-txt-ter hover:text-accent border border-subtle px-2 py-1"
              title="Vektor-anatómia: hány vektor és milyen chunkok reprezentálják"
            >
              ⊞ Anatómia
            </button>
          )}
          {onDelete && (
            <button
              onClick={() => onDelete(thought.id)}
              className="px-3 py-1 bg-red-100 hover:bg-red-200 text-red-600 dark:bg-red-900/40 dark:hover:bg-red-800 dark:text-red-400 text-xs flex items-center gap-1"
            >
              <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="3 6 5 6 21 6" />
                <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
              </svg>
              Delete
            </button>
          )}
        </div>
      </div>

      <div className="space-y-2 text-xs">
        {meta.type && (
          <div className="flex items-center gap-2">
            <span className="text-txt-ter w-16">Type</span>
            <span className="px-2 py-0.5 bg-gray-200 text-gray-700 dark:bg-gray-700 dark:text-gray-300">{meta.type}</span>
          </div>
        )}
        {meta.topics?.length > 0 && (
          <div className="flex items-start gap-2">
            <span className="text-txt-ter w-16 pt-0.5">Topics</span>
            <div className="flex gap-1 flex-wrap">
              {meta.topics.map((topic) => (
                <span key={topic} className="px-2 py-0.5 bg-indigo-100 text-indigo-700 dark:bg-indigo-900 dark:text-indigo-300">{topic}</span>
              ))}
            </div>
          </div>
        )}
        {meta.projects?.length > 0 && (
          <div className="flex items-start gap-2">
            <span className="text-txt-ter w-16 pt-0.5">Projects</span>
            <div className="flex gap-1 flex-wrap">
              {meta.projects.map((p) => (
                <span key={p} className="px-2 py-0.5 bg-purple-100 text-purple-700 dark:bg-purple-900 dark:text-purple-300">{p}</span>
              ))}
            </div>
          </div>
        )}
        {meta.people?.length > 0 && (
          <div className="flex items-start gap-2">
            <span className="text-txt-ter w-16 pt-0.5">People</span>
            <div className="flex gap-1 flex-wrap">
              {meta.people.map((p) => (
                <span key={p} className="px-2 py-0.5 bg-emerald-100 text-emerald-700 dark:bg-emerald-900 dark:text-emerald-300">{p}</span>
              ))}
            </div>
          </div>
        )}
        {meta.action_items?.length > 0 && (
          <div className="flex items-start gap-2">
            <span className="text-txt-ter w-16 pt-0.5">Actions</span>
            <div className="flex flex-col gap-1">
              {meta.action_items.map((a, i) => (
                <span key={i} className="px-2 py-0.5 bg-amber-100 text-amber-700 dark:bg-amber-900 dark:text-amber-300">{a}</span>
              ))}
            </div>
          </div>
        )}
      </div>

      <ThoughtFacts item={thought} />

      {thought.created_at && (
        <p className="text-xs text-txt-ter mt-3">
          {thought.effective_date && thought.effective_date.slice(0, 10) !== thought.created_at.slice(0, 10) ? (
            <>
              <span title="when the content happened">{new Date(thought.effective_date).toLocaleString()}</span>
              <span className="ml-2 text-[10px] uppercase tracking-wider">captured {new Date(thought.created_at).toLocaleDateString()}</span>
            </>
          ) : (
            new Date(thought.effective_date || thought.created_at).toLocaleString()
          )}
        </p>
      )}
    </div>
  );
}
