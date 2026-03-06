import { PDFDocument } from 'pdf-lib';

export default {
  async fetch(request) {

    if (request.method === 'OPTIONS') {
      return new Response(null, { headers: corsHeaders() });
    }
    if (request.method !== 'POST') {
      return new Response('POST only', { status: 405 });
    }

    let body;
    try { body = await request.json(); }
    catch { return error('Invalid JSON body'); }

    const { pdf_base64, pages } = body;
    if (!pdf_base64) return error('Missing pdf_base64');
    if (!Array.isArray(pages) || pages.length === 0) return error('Missing pages array');

    let pdfBytes;
    try { pdfBytes = Uint8Array.from(atob(pdf_base64), c => c.charCodeAt(0)); }
    catch { return error('Invalid base64'); }

    let srcDoc;
    try { srcDoc = await PDFDocument.load(pdfBytes); }
    catch (e) { return error('Failed to load PDF: ' + e.message); }

    const totalPages = srcDoc.getPageCount();
    const invalid = pages.filter(p => p < 1 || p > totalPages);
    if (invalid.length > 0) {
      return error('Pages out of range: ' + invalid.join(', ') + ' (PDF has ' + totalPages + ' pages)');
    }

    const newDoc = await PDFDocument.create();
    const copied = await newDoc.copyPages(srcDoc, pages.map(p => p - 1));
    copied.forEach(p => newDoc.addPage(p));

    const newBytes  = await newDoc.save();
    const newBase64 = btoa(String.fromCharCode(...new Uint8Array(newBytes)));

    return new Response(JSON.stringify({
      success:    true,
      pages_in:   pages,
      pages_out:  newDoc.getPageCount(),
      pdf_base64: newBase64
    }), { headers: { 'Content-Type': 'application/json', ...corsHeaders() } });
  }
};

function error(msg) {
  return new Response(JSON.stringify({ success: false, error: msg }), {
    status: 400,
    headers: { 'Content-Type': 'application/json', ...corsHeaders() }
  });
}

function corsHeaders() {
  return {
    'Access-Control-Allow-Origin':  '*',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type'
  };
}
