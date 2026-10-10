import { createContext, useContext, useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  PenLine, Search, Clock, CalendarDays, Share2, BarChart3, ScrollText, Download,
  Settings, LogOut, Menu, PanelRightClose, PanelRightOpen,
} from 'lucide-react';
import ThemeToggle from './ThemeToggle.jsx';

// App shell (0.62.0, docs/app-shell-terv-2026-10-10.md), after confAi2's
// HINT-map: left menu with a fixed footer (theme, Settings dialog, logout, version),
// content with a title header, and a collapsible right toolbar that a page
// fills through <ShellToolbar> — no page, no toolbar.

export const NAV = [
  { key: 'Capture', icon: PenLine },
  { key: 'Search', icon: Search },
  { key: 'Recent', icon: Clock },
  { key: 'Agenda', icon: CalendarDays },
  { key: 'Graph', icon: Share2 },
  { key: 'Stats', icon: BarChart3 },
  { key: 'MCP log', icon: ScrollText },
  { key: 'Export', icon: Download },
];

const SIDEBAR_KEY = 'cb_shell_sidebar';
const TOOLBAR_KEY = 'cb_shell_toolbar';
// Below this width the menu starts collapsed, as in HINT-map.
const NARROW_PX = 1080;

function readFlag(key, fallback) {
  try {
    const v = localStorage.getItem(key);
    return v === null ? fallback : v === '1';
  } catch { return fallback; }
}
function writeFlag(key, value) {
  try { localStorage.setItem(key, value ? '1' : '0'); } catch { /* per-viewer convenience only */ }
}

const ToolbarContext = createContext(null);

/** Renders its children into the content header, after the title (0.68.0). */
export function ShellHeader({ children }) {
  const ctx = useContext(ToolbarContext);
  return ctx.headerNode ? createPortal(children, ctx.headerNode) : null;
}

/** Renders its children into the shell's right toolbar while mounted. */
export function ShellToolbar({ children }) {
  const ctx = useContext(ToolbarContext);
  const { register } = ctx;
  useEffect(() => register(), [register]);
  return ctx.node ? createPortal(children, ctx.node) : null;
}

function NavItem({ icon: Icon, label, active, collapsed, onClick }) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={collapsed ? label : undefined}
      className={`app-sidebar__item flex items-center gap-3 w-full h-9 px-[21px] text-sm transition-colors ${
        active ? 'app-sidebar__item--active bg-primary text-txt font-medium' : 'text-txt-sec hover:text-txt'
      }`}
    >
      <Icon size={18} className="shrink-0" />
      {!collapsed && <span className="truncate">{label}</span>}
    </button>
  );
}

export default function AppShell({ appName, version, active, onNavigate, onLogout, onOpenSettings, settingsOpen, title, fullBleed, wide, children }) {
  const [collapsed, setCollapsed] = useState(() => readFlag(SIDEBAR_KEY, window.innerWidth < NARROW_PX));
  const [toolbarOpen, setToolbarOpen] = useState(() => readFlag(TOOLBAR_KEY, true));
  const [toolbarNode, setToolbarNode] = useState(null);
  const [headerNode, setHeaderNode] = useState(null);
  const [toolbarUsers, setToolbarUsers] = useState(0);
  // Stable: ShellToolbar's effect depends on it. Returns the unregister.
  const [register] = useState(() => () => {
    setToolbarUsers((n) => n + 1);
    return () => setToolbarUsers((n) => n - 1);
  });

  const toggleSidebar = () => { setCollapsed(!collapsed); writeFlag(SIDEBAR_KEY, !collapsed); };
  const toggleToolbar = () => { setToolbarOpen(!toolbarOpen); writeFlag(TOOLBAR_KEY, !toolbarOpen); };

  return (
    <ToolbarContext.Provider value={{ node: toolbarNode, headerNode, register }}>
      <div className="app-shell flex h-screen overflow-hidden bg-primary">
        <aside className={`app-sidebar flex flex-col shrink-0 bg-surface border-r border-[var(--border)] transition-[width] duration-300 ${collapsed ? 'w-[60px]' : 'w-[240px]'}`}>
          <div className="app-sidebar__brand flex items-center gap-2 h-14 px-[18px] border-b border-[var(--border)]">
            <button type="button" onClick={toggleSidebar} className="text-txt-sec hover:text-txt shrink-0" title={collapsed ? 'Menü kinyitása' : 'Menü összecsukása'}>
              <Menu size={22} />
            </button>
            {!collapsed && (
              <>
                <img src="/brain_darkmode.svg" alt="" className="w-6 h-6 hidden dark:block" />
                <img src="/brain.svg" alt="" className="w-6 h-6 dark:hidden" />
                <span className="font-bold text-txt truncate">{appName}</span>
              </>
            )}
          </div>
          <nav className="app-sidebar__nav flex-1 overflow-y-auto py-2">
            {NAV.map(({ key, icon }) => (
              <NavItem key={key} icon={icon} label={key} active={active === key} collapsed={collapsed} onClick={() => onNavigate(key)} />
            ))}
          </nav>
          {/* Version above the footer rule, as in HINT-map: in the 60 px strip
              it only fits on its side — the outer box holds the space (a
              rotation does not change the layout box), the inner one turns. */}
          {version && (collapsed ? (
            <span className="app-version flex h-14 w-full shrink-0 items-center justify-center">
              <span className="-rotate-90 whitespace-nowrap font-mono text-[10px] leading-none text-txt-ter">v{version}</span>
            </span>
          ) : (
            <p className="app-version shrink-0 px-[21px] pb-2 font-mono text-[10px] text-txt-ter">v{version}</p>
          ))}
          <div className="app-sidebar__footer border-t border-[var(--border)] py-2">
            <div className={`app-sidebar__theme h-11 flex items-center ${collapsed ? 'justify-center' : 'px-[18px]'}`}>
              <ThemeToggle inline compact={collapsed} />
            </div>
            <NavItem icon={Settings} label="Settings" active={settingsOpen} collapsed={collapsed} onClick={onOpenSettings} />
            <NavItem icon={LogOut} label="Kijelentkezés" active={false} collapsed={collapsed} onClick={onLogout} />
          </div>
        </aside>

        <main className="app-content flex-1 min-w-0 flex flex-col">
          <header className="app-content__header flex items-center gap-2 h-14 shrink-0 px-6 border-b border-[var(--border)]">
            {/* The brand leaves the collapsed menu, so it moves in front of the title. */}
            {collapsed && (
              <>
                <img src="/brain_darkmode.svg" alt="" className="w-6 h-6 hidden dark:block" />
                <img src="/brain.svg" alt="" className="w-6 h-6 dark:hidden" />
              </>
            )}
            <h1 className="text-lg font-semibold text-txt truncate shrink-0">{title}</h1>
            {/* A page's own header controls (ShellHeader), e.g. the Search bar. */}
            <div ref={setHeaderNode} className="app-content__header-slot flex-1 min-w-0 flex items-center ml-4" />
          </header>
          {fullBleed ? (
            <div className="app-content__body app-content__body--full relative flex-1 min-h-0">{children}</div>
          ) : (
            <div className="app-content__body flex-1 min-h-0 overflow-y-auto">
              {/* wide: pages that lay results out in columns (Search spider) drop the reading width */}
              <div className={`${wide ? 'max-w-[1600px]' : 'max-w-[900px]'} mx-auto px-6 py-8`}>{children}</div>
            </div>
          )}
        </main>

        <aside className={`app-toolbar flex flex-col shrink-0 bg-surface border-l border-[var(--border)] ${toolbarUsers ? '' : 'hidden'} ${toolbarOpen ? 'w-72' : 'w-10'}`}>
          <div className={`app-toolbar__header flex items-center h-14 shrink-0 border-b border-[var(--border)] ${toolbarOpen ? 'justify-between px-3' : 'justify-center'}`}>
            {toolbarOpen && <span className="text-[10px] uppercase tracking-wider text-txt-ter">Eszköztár</span>}
            <button type="button" onClick={toggleToolbar} className="text-txt-sec hover:text-txt" title={toolbarOpen ? 'Eszköztár összecsukása' : 'Eszköztár kinyitása'}>
              {toolbarOpen ? <PanelRightClose size={18} /> : <PanelRightOpen size={18} />}
            </button>
          </div>
          {/* Kept mounted while collapsed so the page's portal content survives. */}
          <div ref={setToolbarNode} className={`app-toolbar__body flex-1 min-h-0 overflow-y-auto ${toolbarOpen ? '' : 'hidden'}`} />
        </aside>
      </div>
    </ToolbarContext.Provider>
  );
}
