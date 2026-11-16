import { check } from './security';
export type Chunk = { id: number; page: number; text: string };
export async function extractDocument(buffer: Buffer, name: string): Promise<{ pages: number; chunks: Chunk[]; text: string }> {
  check(buffer.length <= 20 * 1024 * 1024, 'Documents must be smaller than 20 MB.');
  let pages: string[] = [];
  if (/\.pdf$/i.test(name)) {
    const { getDocument } = await import('pdfjs-dist/legacy/build/pdf.mjs');
    const task = getDocument({ data: new Uint8Array(buffer), useSystemFonts: true });
    const doc = await task.promise;
    try { check(doc.numPages <= 300, 'Use a PDF with at most 300 pages.'); for (let page = 1; page <= doc.numPages; page++) { const text = await (await doc.getPage(page)).getTextContent(); pages.push(text.items.map((item: any) => item.str || '').join(' ')); } } finally { await doc.destroy(); }
  } else if (/\.docx$/i.test(name)) {
    // Bound ZIP expansion before handing an untrusted DOCX to the parser.
    let expanded = 0; let entries = 0;
    for (let i = 0; i <= buffer.length - 46; i++) if (buffer.readUInt32LE(i) === 0x02014b50) { expanded += buffer.readUInt32LE(i + 24); entries++; }
    check(entries > 0 && entries < 2000 && expanded <= 40 * 1024 * 1024, 'This DOCX archive is too large or invalid.');
    const mammoth = await import('mammoth'); const result = await mammoth.extractRawText({ buffer }); pages = [result.value];
  } else { check(/\.(txt|md)$/i.test(name), 'Supported documents: PDF, TXT, Markdown, DOCX.'); check(!buffer.includes(0), 'The document is not UTF-8 text.'); pages = [buffer.toString('utf8')]; }
  const chunks: Chunk[] = [];
  for (let page = 0; page < pages.length; page++) for (let offset = 0; offset < pages[page].length; offset += 1200) chunks.push({ id: chunks.length + 1, page: page + 1, text: pages[page].slice(offset, offset + 1400) });
  check(chunks.length <= 5000, 'The extracted document is too large.');
  return { pages: pages.length, chunks, text: pages.join('\n\n') };
}
export function relevantChunks(chunks: Chunk[], query: string, count = 8) { const words = [...new Set(query.toLowerCase().match(/[\p{L}\p{N}]{3,}/gu) || [])]; return chunks.map(c => ({ ...c, score: words.reduce((s, word) => s + (c.text.toLowerCase().includes(word) ? 1 : 0), 0) })).sort((a, b) => b.score - a.score || a.id - b.id).slice(0, count).sort((a, b) => a.id - b.id); }
