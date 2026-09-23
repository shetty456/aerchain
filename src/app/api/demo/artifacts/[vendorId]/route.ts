import ExcelJS from 'exceljs';
import mammoth from 'mammoth';
import { getArtifactForVendor, readArtifactBytes } from '@/lib/ingestion/source-artifacts';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const mimeTypes = {
  XLSX: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  PDF: 'application/pdf',
  DOCX: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  IMAGE: 'image/jpeg',
  EMAIL: 'text/plain; charset=utf-8',
} as const;

function cellText(value: ExcelJS.CellValue) {
  if (value === null || value === undefined) return '';
  if (typeof value === 'object') {
    if ('text' in value && typeof value.text === 'string') return value.text;
    if ('result' in value) return String(value.result ?? '');
  }
  return String(value);
}

export async function GET(request: Request, context: { params: Promise<{ vendorId: string }> }) {
  try {
    const { vendorId } = await context.params;
    const artifact = getArtifactForVendor(vendorId);
    const bytes = await readArtifactBytes(artifact);
    const mode = new URL(request.url).searchParams.get('mode') ?? 'preview';
    if (mode === 'raw' || mode === 'download') {
      return new Response(new Uint8Array(bytes), { headers: {
        'Content-Type': mimeTypes[artifact.kind],
        'Content-Disposition': `${mode === 'download' ? 'attachment' : 'inline'}; filename="${artifact.fileName}"`,
        'Cache-Control': 'public, max-age=3600',
        'X-Content-Type-Options': 'nosniff',
      } });
    }
    if (artifact.kind === 'XLSX') {
      const workbook = new ExcelJS.Workbook();
      await workbook.xlsx.load(bytes as unknown as ArrayBuffer);
      const sheets: Array<{ name: string; rows: string[][] }> = [];
      workbook.eachSheet((sheet) => {
        const rows: string[][] = [];
        sheet.eachRow({ includeEmpty: false }, (row) => {
          const values = Array.isArray(row.values) ? row.values.slice(1).map(cellText) : [];
          rows.push(values);
        });
        sheets.push({ name: sheet.name, rows });
      });
      return Response.json({ kind: artifact.kind, fileName: artifact.fileName, sheets });
    }
    if (artifact.kind === 'DOCX') {
      const document = await mammoth.extractRawText({ buffer: bytes });
      return Response.json({ kind: artifact.kind, fileName: artifact.fileName, text: document.value });
    }
    if (artifact.kind === 'EMAIL') {
      return Response.json({ kind: artifact.kind, fileName: artifact.fileName, text: bytes.toString('utf8') });
    }
    return Response.json({ kind: artifact.kind, fileName: artifact.fileName, rawUrl: `/api/demo/artifacts/${vendorId}?mode=raw` });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : 'Supplier attachment is unavailable.' }, { status: 404 });
  }
}
