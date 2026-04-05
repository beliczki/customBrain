import { useState, useEffect } from 'react';

export default function ThemeToggle() {
  const [dark, setDark] = useState(() =>
    document.documentElement.classList.contains('dark')
  );

  useEffect(() => {
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const handler = (e) => {
      if (!localStorage.getItem('theme')) {
        setDark(e.matches);
        document.documentElement.classList.toggle('dark', e.matches);
      }
    };
    mq.addEventListener('change', handler);
    return () => mq.removeEventListener('change', handler);
  }, []);

  function toggle(wantDark) {
    setDark(wantDark);
    document.documentElement.classList.toggle('dark', wantDark);
    localStorage.setItem('theme', wantDark ? 'dark' : 'light');
  }

  return (
    <div className="theme-toggle" role="radiogroup" aria-label="Color theme">
      <button
        className={`theme-toggle-btn${dark ? ' active' : ''}`}
        onClick={() => toggle(true)}
        aria-label="Dark mode"
      >
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
        </svg>
      </button>
      <button
        className={`theme-toggle-btn${!dark ? ' active' : ''}`}
        onClick={() => toggle(false)}
        aria-label="Light mode"
      >
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="12" cy="12" r="5" />
          <line x1="12" y1="1" x2="12" y2="3" />
          <line x1="12" y1="21" x2="12" y2="23" />
          <line x1="4.22" y1="4.22" x2="5.64" y2="5.64" />
          <line x1="18.36" y1="18.36" x2="19.78" y2="19.78" />
          <line x1="1" y1="12" x2="3" y2="12" />
          <line x1="21" y1="12" x2="23" y2="12" />
          <line x1="4.22" y1="19.78" x2="5.64" y2="18.36" />
          <line x1="18.36" y1="5.64" x2="19.78" y2="4.22" />
        </svg>
      </button>
      <div className={`theme-toggle-pill${!dark ? ' pos-1' : ''}`} />
    </div>
  );
}
