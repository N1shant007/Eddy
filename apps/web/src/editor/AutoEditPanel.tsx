import { useMemo, useRef, useState } from 'react';
import {
  alignLines, applyTimings, autoEdit, linesFromBlocks, parseAlignJson, parseScript, parseSubs, placeCues,
  type AutoEditReport, type Cue,
} from '@eddy/rules';
import { useApp } from '../state/app';
import { useEditor } from '../state/editor';
import { getBuffer, loadAll, loadBuffer, speechSegments } from '../audio/engine';
import { IMagic, IUpload } from '../ui/icons';
import { fmtTime } from './layout';

const DEFAULT_PRODUCTS = ['Home Loan', 'Personal Loan', 'Gold Loan', 'Business Loan', 'Loan Against Property', 'Insurance', 'Fixed Deposit', 'Credit Card'];

export function AutoEditPanel() {
  const { doc, edit } = useEditor();
  const { assets, categories, toast } = useApp();
  const [report, setReport] = useState<AutoEditReport | null>(null);
  const [busy, setBusy] = useState(false);
  const [showCues, setShowCues] = useState(false);
  const scriptFile = useRef<HTMLInputElement>(null), subsFile = useRef<HTMLInputElement>(null);
  const products = useMemo(() => [...new Set([...DEFAULT_PRODUCTS, ...assets.filter((a) => a.role === 'pdisclaimer' && a.product).map((a) => a.product!)])], [assets]);
  const parsedCount = useMemo(() => parseScript(doc.scriptText || '').lines.length, [doc.scriptText]);
  const exact = doc.lines.filter((l) => l.exact).length;

  const ctx = async () => {
    const h = doc.dialogueHash;
    const buf = h ? getBuffer(h) || (await loadBuffer(h)) : null;
    return { assets, categories, speech: h && buf ? speechSegments(h) : [], dialogueDur: buf?.duration || 0, products };
  };

  const run = async () => {
    if (!doc.dialogueHash) { toast('Import the episode audio first (top right).', 'error'); return; }
    if (!assets.length) { toast('The audio library is empty. Import the starter library in Audio library.', 'error', 6000); return; }
    setBusy(true);
    try {
      const c = await ctx();
      let rep!: AutoEditReport;
      edit((d) => { rep = autoEdit(d, c); });
      await loadAll(useEditor.getState().doc.clips.map((x) => x.assetHash));
      setReport(rep);
      toast(`Auto-edit placed ${rep.placed} sounds`, 'ok');
    } catch (e: any) { toast(e?.message || String(e), 'error', 6000); }
    finally { setBusy(false); }
  };

  const loadScript = async (f?: File) => {
    if (!f) return;
    const txt = await f.text();
    if (/\.(srt|vtt|json)$/i.test(f.name)) { loadSubs(f); return; }
    if (!parseScript(txt).lines.length) { toast(`No speaker lines in ${f.name}. Lines should look like NAME: text`, 'error', 6000); return; }
    edit((d) => { d.scriptText = txt; });
    toast(`Script loaded: ${parseScript(txt).lines.length} lines. Press Auto-edit.`, 'ok');
  };

  const loadSubs = async (f?: File) => {
    if (!f) return;
    let blocks: ReturnType<typeof parseSubs> = [];
    try { const t = await f.text(); blocks = /\.json$/i.test(f.name) ? parseAlignJson(JSON.parse(t)) : parseSubs(t); } catch { /* handled below */ }
    if (!blocks.length) { toast(`No timings found in ${f.name}. Use .srt, .vtt or an ElevenLabs / Whisper .json`, 'error', 6000); return; }
    const c = await ctx();
    let msg = '';
    edit((d) => {
      if ((d.scriptText || '').trim()) {
        const p = parseScript(d.scriptText);
        alignLines(p.lines, c.speech, c.dialogueDur);
        const n = applyTimings(p.lines, blocks);
        d.lines = p.lines;
        msg = `Subtitles matched ${n} of ${p.lines.length} script lines exactly`;
      } else {
        d.lines = linesFromBlocks(blocks);
        d.scriptText = d.lines.map((l) => `${l.speaker}: ${l.text}`).join('\n');
        msg = `Built a ${d.lines.length}-line script from ${f.name}. Add speaker names (NAME: text) for the storytelling rules.`;
      }
    });
    toast(msg + '. Press Auto-edit.', 'ok', 6000);
  };

  const toggleCue = (q: Cue) => {
    edit((d) => {
      const c = d.cues.find((x) => x.id === q.id);
      if (!c) return;
      c.on = !c.on;
      placeCues(d, d.cues, { assets, categories });
    });
  };

  return (
    <div className="insp">
      <div className="field">
        <label>Script <span className="val" style={{ fontWeight: 400, color: 'var(--muted)' }}>{parsedCount ? `${parsedCount} lines` : ''}{exact ? ` · ${exact} timed by subtitles` : ''}</span></label>
        <textarea value={doc.scriptText} spellCheck={false} placeholder={'SHWETA: Welcome to the show…\nKARAN: Today we talk about…\n[SFX: whoosh]'}
          onFocus={() => useEditor.getState().checkpoint()}
          onChange={(e) => edit((d) => { d.scriptText = e.target.value; }, false)} style={{ minHeight: 150, fontSize: 12.5 }} />
      </div>
      <div className="acts" style={{ marginTop: -4, marginBottom: 12 }}>
        <input ref={scriptFile} type="file" accept=".txt,.md,.srt,.vtt,.json" hidden onChange={(e) => { loadScript(e.target.files?.[0]); e.target.value = ''; }} />
        <input ref={subsFile} type="file" accept=".srt,.vtt,.json" hidden onChange={(e) => { loadSubs(e.target.files?.[0]); e.target.value = ''; }} />
        <button className="btn sm" onClick={() => scriptFile.current?.click()}><IUpload /> Script file</button>
        <button className="btn sm" onClick={() => subsFile.current?.click()}><IUpload /> Subtitles (.srt)</button>
      </div>
      <div className="field">
        <label>Product</label>
        <input list="eddy-products" value={doc.product} placeholder="Picked from the script if empty"
          onFocus={() => useEditor.getState().checkpoint()} onChange={(e) => edit((d) => { d.product = e.target.value; }, false)} />
        <datalist id="eddy-products">{products.map((p) => <option key={p} value={p} />)}</datalist>
      </div>
      <div className="field">
        <label>Hosts (blank = first two speakers)</label>
        <input value={doc.settings.hosts} placeholder="e.g. Shweta, Karan" onFocus={() => useEditor.getState().checkpoint()}
          onChange={(e) => edit((d) => { d.settings.hosts = e.target.value; }, false)} />
      </div>
      <button className="btn primary" style={{ width: '100%', justifyContent: 'center', padding: 10 }} disabled={busy} onClick={run}>
        <IMagic /> {busy ? 'Editing…' : doc.cues.length ? 'Auto-edit again' : 'Auto-edit'}
      </button>
      <p className="hint" style={{ marginTop: 8 }}>
        Uses the Bajaj storytelling rules: story play and story rewrite, Unfolding Insights under questions, coin chime on low interest and savings,
        warm keys for the guest, harp glide, intro music under the CTA, one background music at a time and the disclaimers. Your own clips stay.
      </p>
      {report && (
        <div className="report">
          <b>{report.placed} sounds placed</b> from {report.cues} cues · {report.lines} lines{report.exactLines ? `, ${report.exactLines} timed by subtitles` : ''}
          {report.notes.map((n, i) => <div key={i} className="note">{n}</div>)}
        </div>
      )}
      {doc.cues.length > 0 && (
        <div style={{ marginTop: 14 }}>
          <button className="btn sm ghost" onClick={() => setShowCues((s) => !s)}>{showCues ? 'Hide' : 'Show'} the {doc.cues.length} cues (why each sound is there)</button>
          {showCues && (
            <div className="cues">
              {doc.cues.slice().sort((a, b) => (a.at ?? 1e9) - (b.at ?? 1e9)).map((q) => (
                <label key={q.id} className={'cue' + (q.on ? '' : ' off')}>
                  <input type="checkbox" checked={q.on} onChange={() => toggleCue(q)} />
                  <span className="cw">
                    <span className="ct">{q.at != null ? fmtTime(q.at) : '—'} · {q.sound}</span>
                    <span className="cr">{q.reason}{q.note ? ` · ${q.note}` : ''}</span>
                  </span>
                </label>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
