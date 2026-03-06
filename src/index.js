
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
    if (!Array.isArray(pages) || pages.length === 0) return error('Missing pages array (e.g. [1,2,3])');

    // Decode base64 → bytes
    let pdfBytes;
    try {
      const binary = atob(pdf_base64);
      pdfBytes = new Uint8Array(binary.length);
      for (let i = 0; i < binary.length; i++) {
        pdfBytes[i] = binary.charCodeAt(i);
      }
    } catch {
      return error('Invalid base64 data');
    }

    // Load source PDF
    let srcDoc;
    try { srcDoc = await PDFDocument.load(pdfBytes); }
    catch (e) { return error('Failed to load PDF: ' + e.message); }

    const totalPages = srcDoc.getPageCount();

    // Validate page numbers (1-based)
    const invalid = pages.filter(p => !Number.isInteger(p) || p < 1 || p > totalPages);
    if (invalid.length > 0) {
      return error('Pages out of range: [' + invalid.join(', ') + ']. PDF has ' + totalPages + ' pages.');
    }

    // Build new PDF with only requested pages
    const newDoc = await PDFDocument.create();
    const indices = pages.map(p => p - 1); // convert to 0-based
    const copied  = await newDoc.copyPages(srcDoc, indices);
    copied.forEach(page => newDoc.addPage(page));

    // Serialize to bytes
    const newBytes = await newDoc.save();

    // Safe base64 encode (avoids stack overflow on large files)
    let newBase64 = '';
    const chunk  = 8192;
    for (let i = 0; i < newBytes.length; i += chunk) {
      newBase64 += String.fromCharCode(...newBytes.subarray(i, i + chunk));
    }
    newBase64 = btoa(newBase64);

    return new Response(JSON.stringify({
      success:    true,
      pages_in:   pages,
      pages_out:  newDoc.getPageCount(),
      total_size_kb: Math.round(newBytes.length / 1024),
      pdf_base64: newBase64
    }), {
      headers: { 'Content-Type': 'application/json', ...corsHeaders() }
    });
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
