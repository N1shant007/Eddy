export * from './types';
export * from './patterns';
export * from './script';
export * from './storytelling';
export * from './place';

import type { Asset, Category, Cue, ProjectDoc } from './types';
import { alignLines, cueId, cuesFromTags, guessProduct, keepExact, parseScript } from './script';
import { hostNames, ruleCues } from './storytelling';
import { placeCues } from './place';

export interface AutoEditInput {
  assets: Asset[];
  categories: Category[];
  /** speech segments in the dialogue file (seconds), for lining the script up when there are no subtitles */
  speech: [number, number][];
  dialogueDur: number;
  products?: string[];
}
export interface AutoEditReport {
  lines: number;
  exactLines: number;
  cues: number;
  placed: number;
  notes: string[];
  product?: string;
}

/**
 * Builds the whole edit with the rules engine. Mutates `doc` (pass a copy).
 * Order: parse script → keep subtitle timings → line up the rest with the speech → script tags →
 * storytelling rules → place clips → one music at a time → fill gaps → disclaimers.
 */
export function autoEdit(doc: ProjectDoc, inp: AutoEditInput): AutoEditReport {
  const notes: string[] = [];
  const parsed = parseScript(doc.scriptText || '');
  let cues: Cue[];
  if (parsed.lines.length) {
    const old = doc.lines;
    // a script typed over subtitle-built lines keeps their timings where the words match
    alignLines(parsed.lines, inp.speech, inp.dialogueDur);
    keepExact(old, parsed.lines);
    doc.lines = parsed.lines;
    if (!doc.product && inp.products?.length) {
      const g = guessProduct(doc.scriptText, inp.products);
      if (g) { doc.product = g; notes.push(`Product set to ${g} from the script.`); }
    }
    const hosts = hostNames(doc.lines, doc.settings.hosts);
    cues = ruleCues(doc.lines, hosts, cuesFromTags(parsed, inp.categories, inp.assets));
  } else if (doc.lines.length) {
    // subtitles only (no speaker script): lines already carry exact timings
    const hosts = hostNames(doc.lines, doc.settings.hosts);
    cues = ruleCues(doc.lines, hosts, cuesFromTags({ lines: doc.lines, tags: [] }, inp.categories, inp.assets));
  } else {
    // audio only: intro, outro, storytelling fill and disclaimers
    const s0 = inp.speech[0]?.[0] ?? 0, s1 = inp.speech[inp.speech.length - 1]?.[1] ?? inp.dialogueDur;
    doc.lines = [{ speaker: 'SPEAKER', text: '', t0: s0, t1: s1 }];
    cues = [
      { id: cueId(), on: true, type: 'intro', sound: 'intro', line: 0, position: 'before', source: 'rule', reason: 'Open on intro music' },
      { id: cueId(), on: true, type: 'outro', sound: 'outro', line: 0, position: 'after', source: 'rule', reason: 'Close on outro music' },
    ];
    notes.push('No script yet: only intro, outro, background music and disclaimers were placed. Paste the script or subtitles for story play, coin chimes and the CTA music.');
  }
  // keep cues the user turned off, so they stay off
  const off = new Set(doc.cues.filter((c) => !c.on).map((c) => `${c.type}|${c.sound}|${c.line}`));
  for (const c of cues) if (off.has(`${c.type}|${c.sound}|${c.line}`)) c.on = false;
  const r = placeCues(doc, cues, { assets: inp.assets, categories: inp.categories });
  doc.cues = cues;
  return {
    lines: doc.lines.length,
    exactLines: doc.lines.filter((l) => l.exact).length,
    cues: cues.filter((c) => c.on).length,
    placed: r.placed,
    notes: [...notes, ...r.notes],
    product: doc.product,
  };
}
