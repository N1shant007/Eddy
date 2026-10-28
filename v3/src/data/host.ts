/** Downloads a file the page made (an exported MP3). */
export async function saveFile(filename: string, blob: Blob): Promise<'saved'> {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 60000);
  return 'saved';
}
