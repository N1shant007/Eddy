import { useEffect, useState } from 'react';
import { useApp, type View } from './state/app';
import { cloudConfigured } from './data/backend';
import { SupabaseBackend } from './data/supabaseBackend';
import { DialogHost, MenuHost } from './ui/dialogs';
import { ILogo } from './ui/icons';
import { ProjectsView } from './projects/ProjectsView';
import { EditorView } from './editor/EditorView';
import { LibraryView } from './library/LibraryView';
import { GuidelinesView } from './library/GuidelinesView';

const NAV: [View, string][] = [['projects', 'Projects'], ['editor', 'Editor'], ['library', 'Audio library'], ['guidelines', 'Guidelines']];

export function App() {
  const { ready, user, view, setView, init, be, toasts, openProjectId } = useApp();
  const [busy, setBusy] = useState(false);
  useEffect(() => { init(); }, []);

  if (!ready) return <div className="app"><div className="topbar"><div className="brand"><ILogo /> Eddy</div></div></div>;

  if (!user && be instanceof SupabaseBackend) {
    return (
      <div className="app" style={{ background: 'var(--navy)' }}>
        <div className="signin">
          <ILogo width={40} height={40} />
          <h2>Eddy</h2>
          <p>AI podcast editor for the Bajaj team. Sign in with your Google account to open the shared projects and library.</p>
          <button className="btn primary" disabled={busy} onClick={async () => { setBusy(true); await be.signInWithGoogle(); }}>Sign in with Google</button>
          <p style={{ fontSize: 12, marginTop: 18 }}>
            <a href="#" onClick={(e) => { e.preventDefault(); localStorage.setItem('eddy.mode', 'local'); location.reload(); }}>Use this browser only (no account)</a>
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="app">
      <div className="topbar">
        <div className="brand"><ILogo /> Eddy</div>
        <nav className="nav">
          {NAV.map(([v, label]) => (
            <button key={v} className={view === v ? 'on' : ''} disabled={v === 'editor' && !openProjectId} style={v === 'editor' && !openProjectId ? { opacity: 0.4 } : undefined} onClick={() => setView(v)}>{label}</button>
          ))}
        </nav>
        <div className="spacer" />
        <div className="who">
          <span className="pill">{be.kind === 'cloud' ? 'Team cloud' : 'This browser'}</span>
          {be.kind === 'cloud' && <span>{user?.email}</span>}
          {be.kind === 'cloud' && <button className="btn ghost sm" style={{ color: '#c9d4ea' }} onClick={async () => { await (be as SupabaseBackend).signOut(); location.reload(); }}>Sign out</button>}
          {be.kind === 'local' && cloudConfigured && <button className="btn ghost sm" style={{ color: '#c9d4ea' }} onClick={() => { localStorage.removeItem('eddy.mode'); location.reload(); }}>Use team cloud</button>}
        </div>
      </div>
      {view === 'projects' && <ProjectsView />}
      {view === 'editor' && openProjectId && <EditorView key={openProjectId} projectId={openProjectId} />}
      {view === 'library' && <LibraryView />}
      {view === 'guidelines' && <GuidelinesView />}
      <DialogHost />
      <MenuHost />
      <div className="toasts" aria-live="polite">{toasts.map((t) => <div key={t.id} className={'toast ' + (t.kind || '')}>{t.text}</div>)}</div>
    </div>
  );
}
