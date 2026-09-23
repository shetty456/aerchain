import 'server-only';

import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import path from 'node:path';
import ExcelJS from 'exceljs';
import mammoth from 'mammoth';
import type { AiProvider } from '@/lib/ai/provider';

export type ArtifactKind = 'XLSX' | 'PDF' | 'DOCX' | 'IMAGE' | 'EMAIL';

export interface ArtifactDefinition {
  id: string;
  vendorId: string;
  kind: ArtifactKind;
  fileName: string;
}

export interface ExtractedSource {
  artifact: ArtifactDefinition;
  content: string;
  visionJobId?: string;
  extractionMethod: 'LOCAL_STRUCTURAL' | 'SARVAM_VISION';
}

const artifactDirectory = path.join(process.cwd(), 'demo', 'vendor-responses');

export const artifacts: ArtifactDefinition[] = [
  { id: 'artifact-vendor-a', vendorId: 'vendor-a', kind: 'XLSX', fileName: 'vendor-a-nexora.xlsx' },
  { id: 'artifact-vendor-b', vendorId: 'vendor-b', kind: 'PDF', fileName: 'vendor-b-bluepeak.pdf' },
  { id: 'artifact-vendor-c', vendorId: 'vendor-c', kind: 'DOCX', fileName: 'vendor-c-vertex.docx' },
  { id: 'artifact-vendor-d', vendorId: 'vendor-d', kind: 'IMAGE', fileName: 'vendor-d-kaveri-rate-card.jpg' },
  { id: 'artifact-vendor-e', vendorId: 'vendor-e', kind: 'EMAIL', fileName: 'vendor-e-orbitedge-email.txt' },
];

function formatCell(value: ExcelJS.CellValue) {
  if (value === null || value === undefined) return '';
  if (typeof value === 'object') {
    if ('text' in value && typeof value.text === 'string') return value.text;
    if ('result' in value) return String(value.result ?? '');
  }
  return String(value);
}

async function extractWorkbook(bytes: Buffer) {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(bytes as unknown as ArrayBuffer);
  const content: string[] = [];
  workbook.eachSheet((sheet) => {
    content.push(`## Sheet: ${sheet.name}`);
    sheet.eachRow({ includeEmpty: false }, (row, rowNumber) => {
      const values = row.values;
      const cells = Array.isArray(values) ? values.slice(1).map(formatCell) : [];
      content.push(`[Sheet: ${sheet.name}, row ${rowNumber}] ${cells.join(' | ')}`);
    });
  });
  return content.join('\n');
}

async function extractDocx(bytes: Buffer) {
  const result = await mammoth.extractRawText({ buffer: bytes });
  return result.value
    .split('\n')
    .map((line, index) => line.trim() ? `[Document paragraph ${index + 1}] ${line.trim()}` : '')
    .filter(Boolean)
    .join('\n');
}

export async function extractSource(artifact: ArtifactDefinition, provider: AiProvider): Promise<ExtractedSource> {
  const filePath = path.join(artifactDirectory, artifact.fileName);
  const bytes = await readFile(filePath);

  if (artifact.kind === 'XLSX') {
    return { artifact, content: await extractWorkbook(bytes), extractionMethod: 'LOCAL_STRUCTURAL' };
  }
  if (artifact.kind === 'DOCX') {
    return { artifact, content: await extractDocx(bytes), extractionMethod: 'LOCAL_STRUCTURAL' };
  }
  if (artifact.kind === 'EMAIL') {
    const content = bytes.toString('utf8').split('\n').map((line, index) => `[Email line ${index + 1}] ${line}`).join('\n');
    return { artifact, content, extractionMethod: 'LOCAL_STRUCTURAL' };
  }

  const mimeType = artifact.kind === 'PDF' ? 'application/pdf' : 'image/jpeg';
  const digitised = await provider.digitiseDocument({ fileName: artifact.fileName, bytes, mimeType });
  return {
    artifact,
    content: JSON.stringify(digitised.result),
    visionJobId: digitised.jobId,
    extractionMethod: 'SARVAM_VISION',
  };
}

export function getArtifactForVendor(vendorId: string) {
  const artifact = artifacts.find((candidate) => candidate.vendorId === vendorId);
  if (!artifact) throw new Error(`No response artifact is configured for ${vendorId}.`);
  return artifact;
}

export async function getArtifactFingerprint(artifact: ArtifactDefinition) {
  const bytes = await readFile(path.join(artifactDirectory, artifact.fileName));
  return createHash('sha256').update(bytes).digest('hex');
}

export function readArtifactBytes(artifact: ArtifactDefinition) {
  return readFile(path.join(artifactDirectory, artifact.fileName));
}
