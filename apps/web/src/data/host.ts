/* When Eddy runs as a claude.ai artifact, the viewer offers capabilities (saving files, asking Claude).
   Anywhere else these resolve to null and Eddy uses its normal paths. */
const memo = new Map<string, Promise<any>>();
export function hostCap<T = any>(name: string): Promise<T | null> {
  let p = memo.get(name);
  if (!p) {
    const use = (window as any).claude?.use;
    p = typeof use === 'function'
      ? Promise.race([Promise.resolve(use(name)).catch(() => null), new Promise((r) => setTimeout(() => r(null), 10000))])
      : Promise.resolve(null);
    memo.set(name, p);
  }
  return p as Promise<T | null>;
}

/** Saves a file: through the claude.ai viewer when hosted there (zipped, since it only accepts certain types), else a normal download. */
export async function saveFile(filename: string, blob: Blob): Promise<'saved' | 'declined'> {
  const dl = await hostCap<{ save(o: { filename: string; data: Blob }): Promise<unknown> }>('downloads');
  if (dl) {
    const { default: JSZip } = await import('jszip');
    const z = new JSZip();
    z.file(filename, blob);
    const zip = await z.generateAsync({ type: 'blob', compression: 'STORE' });
    try { await dl.save({ filename: filename.replace(/\.[^.]+$/, '') + '.zip', data: zip }); return 'saved'; }
    catch (e: any) { if (e?.code === 'declined') return 'declined'; throw new Error(e?.message || 'The file could not be saved here.'); }
  }
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 60000);
  return 'saved';
}
