import { useCallback, useEffect, useRef, useState } from 'react';
import type { Clip, ProjectDoc } from '@eddy/rules';
import { useApp } from '../state/app';
import { kindForRole, pruneTracks, trackFor, useEditor } from '../state/editor';
import { encodeMp3, loadAll, loadBuffer, Player, projectEnd, renderMix } from '../audio/engine';
import { askText, openDialog, openMenu } from '../ui/dialogs';
import { IBack, ICopy, IDownload, IHistory, IPause, IPlay, IRedo, ISave, IScissors, IStop, ITrash, IUndo, IUpload } from '../ui/icons';
import { HistoryDrawer } from '../projects/HistoryDrawer';
import { Timeline } from './Timeline';
import { ClipInspector } from './ClipInspector';
import { LibraryPanel } from './LibraryPanel';
import { AutoEditPanel } from './AutoEditPanel';
import { fmtTime } from './layout';
import type { ProjectMeta } from '../data/types';
import { uid } from '../data/util';

const player = new Player();
type Tab = 'auto' | 'clip' | 'library' | 'keys';

export function EditorView({ projectId }: { projectId: string }) {
  const app = useApp();
  const { be, toast } = app;
  const ed = useEditor();
  const [meta, setMeta] = useState<ProjectMeta | null>(null);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<Tab>('auto');
  const [history, setHistory] = useState(false);
  const [histKey, setHistKey] = useState(0);
  const fileRef = useRef<HTMLInputElement>(null);

  /* ---------- load ---------- */
  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const p = await be.getProject(projectId);
        if (!alive) return;
        if (!p) { toast('Project not found', 'error'); app.setView('projects'); return; }
        const { draft, ...m } = p;
        setMeta(m);
        useEditor.getState().load(projectId, draft);
        await loadAll(draft.clips.map((c) => c.assetHash));
      } catch (e: any) { toast(e?.message || String(e), 'error', 6000); }
      finally { if (alive) setLoading(false); }
    })();
    return () => { alive = false; player.stop(); useEditor.getState().setPlaying(false); };
  }, [projectId]);

  /* ---------- autosave (1.5 s after the last change) ---------- */
  useEffect(() => {
    if (!ed.rev || ed.projectId !== projectId) return;
    const t = setTimeout(async () => {
      const s = useEditor.getState();
      s.setSave('saving');
      try { await be.saveDraft(projectId, s.doc, projectEnd(s.doc)); if (useEditor.getState().rev === s.rev) s.setSave('saved'); }
      catch { s.setSave('error'); }
    }, 1500);
    return () => clearTimeout(t);
  }, [ed.rev]);
  useEffect(() => {
    const warn = (e: BeforeUnloadEvent) => { if (useEditor.getState().save !== 'saved') { e.preventDefault(); e.returnValue = ''; } };
    addEventListener('beforeunload', warn);
    return () => removeEventListener('beforeunload', warn);
  }, []);
  const flush = async () => {
    const s = useEditor.getState();
    if (s.save === 'saved') return;
    await be.saveDraft(projectId, s.doc, projectEnd(s.doc));
    s.setSave('saved');
  };

  /* ---------- transport ---------- */
  const togglePlay = useCallback(async () => {
    const s = useEditor.getState();
    if (player.playing) { const p = player.position(); player.stop(); s.setPlaying(false); s.setPlayhead(p); return; }
    let from = s.playhead;
    if (from >= projectEnd(s.doc) - 0.05) from = 0;
    await player.play(s.doc, from);
    s.setPlaying(true);
  }, []);
  const stop = () => { player.stop(); const s = useEditor.getState(); s.setPlaying(false); s.setPlayhead(0); s.setScroll(0); };
  const livePos = useCallback(() => {
    if (!player.playing) return null;
    const p = player.position();
    if (p >= projectEnd(useEditor.getState().doc) + 0.3) { player.stop(); useEditor.getState().setPlaying(false); useEditor.getState().setPlayhead(0); return null; }
    return p;
  }, []);
  // restart playback when the edit changes while playing, so you hear changes immediately
  useEffect(() => {
    if (!player.playing) return;
    const p = player.position();
    player.play(useEditor.getState().doc, p);
  }, [ed.doc]);

  /* ---------- clip actions ---------- */
  const deleteSel = () => {
    const s = useEditor.getState();
    if (!s.sel) { toast('Click a clip first, then press Delete'); return; }
    const c = s.deleteClip(s.sel);
    if (c) toast(`Deleted ${clipName(c)} · Ctrl+Z to undo`);
  };
  const clipName = (c: Clip) => app.assets.find((a) => a.hash === c.assetHash)?.name || (c.assetHash === ed.doc.dialogueHash ? 'Main dialogue' : 'clip');
  const clipMenu = (c: Clip, x: number, y: number) => openMenu(x, y, [
    { label: 'Split at playhead', icon: <IScissors />, kbd: 'S', onClick: () => { if (!useEditor.getState().splitClip(c.id, useEditor.getState().playhead)) toast('Move the playhead inside the clip to split it'); } },
    { label: 'Duplicate', icon: <ICopy />, kbd: 'Ctrl+D', onClick: () => useEditor.getState().duplicateClip(c.id) },
    { label: 'Volume, fades…', onClick: () => setTab('clip') },
    { sep: true, label: '', onClick: () => {} },
    { label: 'Delete clip', icon: <ITrash />, danger: true, kbd: 'Del', onClick: () => { useEditor.getState().select(c.id); deleteSel(); } },
  ]);
  const dropAsset = async (hash: string, t: number) => {
    const a = app.assets.find((x) => x.hash === hash);
    if (!a) return;
    await loadBuffer(hash);
    useEditor.getState().addAsset(a, t);
    toast(`Added ${a.name} at ${fmtTime(t, true)}`, undefined, 1800);
  };

  /* ---------- keyboard ---------- */
  useEffect(() => {
    const k = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement, tag = el?.tagName;
      const typing = tag === 'TEXTAREA' || tag === 'SELECT' || el?.isContentEditable ||
        (tag === 'INPUT' && !['range', 'checkbox', 'radio', 'button'].includes((el as HTMLInputElement).type));
      if (document.querySelector('.overlay')) return;
      const s = useEditor.getState(), mod = e.ctrlKey || e.metaKey;
      if (mod && e.key.toLowerCase() === 's') { e.preventDefault(); saveVersion(); return; }
      if (typing) return;
      if (tag === 'INPUT' && (e.key.startsWith('Arrow') || e.key === 'Home' || e.key === 'End')) return; // sliders use arrows
      if (e.code === 'Space') { e.preventDefault(); togglePlay(); }
      else if (mod && e.key.toLowerCase() === 'z') { e.preventDefault(); e.shiftKey ? s.redoStep() : s.undoStep(); }
      else if (mod && e.key.toLowerCase() === 'y') { e.preventDefault(); s.redoStep(); }
      else if (mod && e.key.toLowerCase() === 's') { e.preventDefault(); saveVersion(); }
      else if (mod && e.key.toLowerCase() === 'd') { e.preventDefault(); if (s.sel) s.duplicateClip(s.sel); }
      else if (e.key === 'Delete' || e.key === 'Backspace') { e.preventDefault(); deleteSel(); }
      else if (e.key.toLowerCase() === 's' && !mod) { if (s.sel && !s.splitClip(s.sel, s.playhead)) toast('Move the playhead inside the clip to split it'); }
      else if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
        e.preventDefault();
        const d = (e.key === 'ArrowLeft' ? -1 : 1) * (e.shiftKey ? 1 : 0.1);
        if (s.sel) s.edit((doc) => { const c = doc.clips.find((x) => x.id === s.sel); if (c && !c.fixed) { c.start = Math.max(0, Math.round((c.start + d) * 100) / 100); c.auto = false; } });
        else s.setPlayhead(s.playhead + d * 10);
      }
      else if (e.key === '+' || e.key === '=') s.setZoom(s.pps * 1.25);
      else if (e.key === '-') s.setZoom(s.pps / 1.25);
      else if (e.key.toLowerCase() === 'f') fit();
      else if (e.key === 'Home') { s.setPlayhead(0); s.setScroll(0); }
      else if (e.key === 'Escape') s.select(null);
    };
    addEventListener('keydown', k);
    return () => removeEventListener('keydown', k);
  }, []);

  const fit = () => {
    const s = useEditor.getState(), el = document.querySelector('.tl-lanes') as HTMLElement | null;
    const end = projectEnd(s.doc);
    if (el && end > 0) { s.setZoom((el.clientWidth - 20) / end); s.setScroll(0); }
  };

  /* ---------- import main dialogue ---------- */
  const importMain = async (f: File | undefined) => {
    if (!f) return;
    try {
      toast(`Uploading ${f.name}…`);
      const hash = await be.putAudio(f);
      const buf = await loadBuffer(hash);
      if (!buf) throw new Error('This file can’t be read as audio.');
      useEditor.getState().edit((d) => {
        const t = trackFor(d, 'dialogue');
        d.clips = d.clips.filter((c) => c.trackId !== t.id);
        d.clips.push({ id: uid('c_'), trackId: t.id, assetHash: hash, start: 0, offset: 0, dur: Math.round(buf.duration * 100) / 100, gain: 0, fadeIn: 0, fadeOut: 0, loop: false });
        d.dialogueHash = hash;
      });
      setTimeout(fit, 50);
      toast('Episode audio imported. Paste the script or subtitles in Auto-edit next.', 'ok', 5000);
      setTab('auto');
    } catch (e: any) { toast(e?.message || String(e), 'error', 6000); }
  };

  /* ---------- versions ---------- */
  const saveVersion = async () => {
    const note = await askText('Save version', '', 'Save version', 'What changed? (e.g. “coin chime fixed”)');
    if (note == null) return;
    try {
      const v = await be.saveVersion(projectId, useEditor.getState().doc, note);
      useEditor.getState().setSave('saved');
      setMeta((m) => (m ? { ...m, headVersion: v.versionNo } : m));
      setHistKey((k) => k + 1);
      app.refresh();
      toast(`Saved v${v.versionNo}`, 'ok');
    } catch (e: any) { toast(e?.message || String(e), 'error', 6000); }
  };
  const restored = (doc: ProjectDoc) => {
    player.stop();
    const s = useEditor.getState();
    s.checkpoint();
    s.edit((d) => Object.assign(d, structuredClone(doc)), false);
    s.setSave('saved');
    loadAll(doc.clips.map((c) => c.assetHash));
    setMeta((m) => (m ? { ...m, headVersion: m.headVersion + 1 } : m));
  };

  /* ---------- export ---------- */
  const exportMp3 = async () => {
    const ctl = { set: (_p: number, _l: string) => {}, close: () => {} };
    openDialog((close) => <ExportDialog ctl={ctl} close={close} />);
    try {
      const buf = await renderMix(useEditor.getState().doc, (p, l) => ctl.set(p, l));
      ctl.set(0.5, 'Encoding MP3…');
      const blob = await encodeMp3(buf, 192, (p) => ctl.set(0.5 + p * 0.5, 'Encoding MP3…'));
      ctl.set(1, 'Done');
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = `${(meta?.name || 'episode').replace(/[^\w\- ]+/g, '').trim() || 'episode'}.mp3`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 60000);
      toast('MP3 downloaded', 'ok');
    } catch (e: any) { ctl.close(); toast(e?.message || String(e), 'error', 6000); }
  };

  const rename = async () => {
    if (!meta) return;
    const n = await askText('Rename project', meta.name);
    if (!n) return;
    await be.renameProject(projectId, n);
    setMeta({ ...meta, name: n });
    app.refresh();
  };

  if (loading) return <div className="editor"><div className="ed-bar">Loading…</div></div>;
  const hasDialogue = !!ed.doc.dialogueHash;

  return (
    <div className="editor">
      <div className="ed-bar">
        <button className="btn ghost icon" title="Back to projects" onClick={async () => { await flush().catch(() => {}); app.setView('projects'); }}><IBack /></button>
        <span className="title" title="Click to rename" onClick={rename}>{meta?.name}</span>
        {meta && meta.headVersion > 0 && <span className="tag v">v{meta.headVersion}</span>}
        <span className={'savestate ' + ed.save}>{{ saved: 'All changes saved', saving: 'Saving…', unsaved: 'Unsaved', error: 'Save failed, retrying…' }[ed.save]}</span>
        <div className="sep" />
        <button className="btn icon" title="Undo (Ctrl+Z)" disabled={!ed.undo.length} onClick={ed.undoStep}><IUndo /></button>
        <button className="btn icon" title="Redo (Ctrl+Shift+Z)" disabled={!ed.redo.length} onClick={ed.redoStep}><IRedo /></button>
        <div className="sep" />
        <button className="btn icon play" title="Play / pause (Space)" onClick={togglePlay}>{ed.playing ? <IPause /> : <IPlay />}</button>
        <button className="btn icon" title="Stop" onClick={stop}><IStop /></button>
        <span className="time">{fmtTime(ed.playhead, true)}</span>
        <button className="btn sm" onClick={() => ed.setZoom(ed.pps / 1.5)} title="Zoom out (−)">−</button>
        <button className="btn sm" onClick={() => ed.setZoom(ed.pps * 1.5)} title="Zoom in (+)">+</button>
        <button className="btn sm" onClick={fit} title="Fit (F)">Fit</button>
        <div className="grow" />
        <input ref={fileRef} type="file" accept="audio/*,.mp3,.wav,.m4a" hidden onChange={(e) => { importMain(e.target.files?.[0]); e.target.value = ''; }} />
        <button className="btn" onClick={() => fileRef.current?.click()}><IUpload /> {hasDialogue ? 'Replace episode audio' : 'Import episode audio'}</button>
        <button className="btn" onClick={() => setHistory((h) => !h)}><IHistory /> History</button>
        <button className="btn" onClick={saveVersion} title="Ctrl+S"><ISave /> Save version</button>
        <button className="btn primary" onClick={exportMp3} disabled={!ed.doc.clips.length}><IDownload /> Export MP3</button>
      </div>
      <div className="ed-main">
        <div className="ed-center">
          <Timeline onClipMenu={clipMenu} onDropAsset={dropAsset} livePos={livePos} />
        </div>
        <div className="ed-side">
          <div className="tabs" role="tablist">
            {([['auto', 'Auto-edit'], ['clip', 'Clip'], ['library', 'Sounds'], ['keys', 'Keys']] as [Tab, string][]).map(([t, l]) => (
              <button key={t} role="tab" aria-selected={tab === t} className={tab === t ? 'on' : ''} onClick={() => setTab(t)}>{l}</button>
            ))}
          </div>
          <div className="side-body">
            {tab === 'auto' && <AutoEditPanel />}
            {tab === 'clip' && <ClipInspector onDelete={deleteSel} />}
            {tab === 'library' && <LibraryPanel onAdd={(h) => dropAsset(h, useEditor.getState().playhead)} />}
            {tab === 'keys' && <Keys />}
          </div>
        </div>
      </div>
      {history && meta && (
        <HistoryDrawer project={meta} current={ed.doc} onClose={() => setHistory(false)} onRestored={restored} reloadKey={histKey} />
      )}
    </div>
  );
}

function ExportDialog({ ctl, close }: { ctl: { set: (p: number, l: string) => void; close: () => void }; close: (v: null) => void }) {
  const [p, setP] = useState(0), [l, setL] = useState('Preparing…');
  ctl.set = (pp, ll) => { setP(pp); setL(ll); if (pp >= 1) setTimeout(() => close(null), 600); };
  ctl.close = () => close(null);
  return (
    <div className="modal">
      <h3>Exporting MP3</h3>
      <p>{l}</p>
      <div className="progress"><i style={{ width: `${Math.round(p * 100)}%` }} /></div>
      <p className="hint">The editor keeps working while this runs.</p>
      <div className="row"><button className="btn" onClick={() => close(null)}>Hide</button></div>
    </div>
  );
}

function Keys() {
  const rows: [string, string][] = [
    ['Space', 'Play / pause'], ['Click a clip', 'Select it'], ['Drag a clip', 'Move it (snaps to edges and the playhead)'],
    ['Drag clip edges', 'Trim'], ['Del / Backspace', 'Delete the selected clip'], ['Right-click', 'Clip menu'],
    ['S', 'Split at the playhead'], ['Ctrl+D', 'Duplicate'], ['← →', 'Nudge 0.1 s (Shift: 1 s)'],
    ['Ctrl+Z / Ctrl+Shift+Z', 'Undo / redo'], ['Ctrl+S', 'Save version'], ['+ / − / F', 'Zoom in / out / fit'],
    ['Ctrl + wheel', 'Zoom at the pointer'], ['Shift + wheel', 'Scroll in time'],
  ];
  return <div className="kbdlist">{rows.map(([k, d]) => <div key={k}><kbd>{k}</kbd> {d}</div>)}</div>;
}

// re-exported for other panels
export { kindForRole, pruneTracks };
