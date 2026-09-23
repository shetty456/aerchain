'use client';

import { useEffect, useState } from 'react';
import Image from 'next/image';
import { Check, Download, FileText, LoaderCircle, Minus, Plus, ShieldCheck, X } from 'lucide-react';

export type ArtifactViewerTarget = { vendorId: string; vendorName: string; responseFormat: string };
type Evidence = { location: string; excerpt: string };
type Details = {
  qualification: Array<{ label: string; answer: 'YES' | 'NO' | 'UNKNOWN'; detail?: string | null; evidence: Evidence[] }>;
  commercialTerms: Record<string, unknown> & { evidence?: Evidence[] };
};
type PreviewBase = { fileName: string; details: Details | null };
type Preview =
  | (PreviewBase & { kind: 'XLSX'; sheets: Array<{ name: string; rows: string[][] }> })
  | (PreviewBase & { kind: 'DOCX' | 'EMAIL'; text: string })
  | (PreviewBase & { kind: 'PDF' | 'IMAGE'; rawUrl: string });

export default function ArtifactViewer({ target, onClose }: { target: ArtifactViewerTarget; onClose: () => void }) {
  const [preview, setPreview] = useState<Preview | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [sheet, setSheet] = useState(0);
  const [zoom, setZoom] = useState(1);
  const [view, setView] = useState<'SOURCE' | 'DETAILS'>('SOURCE');

  useEffect(() => {
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const closeOnEscape = (event: KeyboardEvent) => { if (event.key === 'Escape') onClose(); };
    window.addEventListener('keydown', closeOnEscape);
    fetch(`/api/demo/artifacts/${target.vendorId}`, { cache: 'force-cache' })
      .then(async (response) => { const payload = await response.json(); if (!response.ok) throw new Error(payload.error); return payload as Preview; })
      .then(setPreview)
      .catch((reason) => setError(reason instanceof Error ? reason.message : 'Attachment could not be opened.'));
    return () => { document.body.style.overflow = previousOverflow; window.removeEventListener('keydown', closeOnEscape); };
  }, [onClose, target.vendorId]);

  const activeSheet = preview?.kind === 'XLSX' ? preview.sheets[sheet] : null;
  return <div className="fixed inset-0 z-[70] flex flex-col bg-[var(--surface)]" role="dialog" aria-modal="true" aria-label={`${target.vendorName} original response`}>
    <header className="flex min-h-16 items-center justify-between gap-3 border-b border-[var(--line)] bg-white px-3 py-2 sm:px-5">
      <div className="flex min-w-0 items-center gap-3"><div className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-[var(--surface)]"><FileText size={16} /></div><div className="min-w-0"><p className="truncate text-sm font-semibold">{target.vendorName}</p><p className="truncate text-[10px] text-[var(--muted)]">{preview?.fileName ?? target.responseFormat} · Original supplier response</p></div></div>
      <div className="flex shrink-0 items-center gap-2">{preview?.kind === 'IMAGE' && <div className="hidden items-center rounded-lg border border-[var(--line)] bg-white sm:flex"><button aria-label="Zoom out" onClick={() => setZoom((value) => Math.max(.5, value - .25))} className="p-2"><Minus size={14} /></button><span className="min-w-12 text-center text-[10px]">{Math.round(zoom * 100)}%</span><button aria-label="Zoom in" onClick={() => setZoom((value) => Math.min(3, value + .25))} className="p-2"><Plus size={14} /></button></div>}<a href={`/api/demo/artifacts/${target.vendorId}?mode=download`} className="flex items-center gap-1.5 rounded-lg border border-[var(--line-strong)] px-3 py-2 text-[11px] font-semibold"><Download size={13} /><span className="hidden sm:inline">Download original</span></a><button aria-label="Close attachment" onClick={onClose} className="rounded-lg border border-[var(--line-strong)] p-2.5"><X size={14} /></button></div>
    </header>
    {preview?.details && <nav className="flex shrink-0 gap-1 border-b border-[var(--line)] bg-white px-3 sm:px-5" aria-label="Attachment views"><button onClick={() => setView('SOURCE')} className={`border-b-2 px-3 py-3 text-[11px] font-semibold ${view === 'SOURCE' ? 'border-[var(--ink)]' : 'border-transparent text-[var(--muted)]'}`}>Original attachment</button><button onClick={() => setView('DETAILS')} className={`border-b-2 px-3 py-3 text-[11px] font-semibold ${view === 'DETAILS' ? 'border-[var(--ink)]' : 'border-transparent text-[var(--muted)]'}`}>Extracted terms &amp; compliance</button></nav>}
    <main className="min-h-0 flex-1 overflow-auto">
      {!preview && !error && <div className="flex h-full items-center justify-center gap-2 text-sm text-[var(--muted)]"><LoaderCircle className="animate-spin" size={16} /> Loading original response…</div>}
      {error && <div className="mx-auto mt-12 max-w-lg rounded-xl border border-[#efcfcc] bg-[var(--red-soft)] p-5 text-sm text-[var(--red)]">{error}</div>}
      {view === 'DETAILS' && preview?.details ? <ExtractedDetails details={preview.details} /> : <>
        {preview?.kind === 'PDF' && <iframe title={preview.fileName} src={preview.rawUrl} className="h-full min-h-[calc(100vh-7rem)] w-full border-0" />}
        {preview?.kind === 'IMAGE' && <div className="flex min-h-full justify-center overflow-auto p-4 sm:p-8"><Image unoptimized src={preview.rawUrl} alt={preview.fileName} width={1600} height={1200} style={{ transform: `scale(${zoom})`, transformOrigin: 'top center' }} className="h-auto max-w-full self-start rounded-lg shadow-lg" /></div>}
        {(preview?.kind === 'DOCX' || preview?.kind === 'EMAIL') && <article className="mx-auto my-4 min-h-[calc(100vh-10rem)] max-w-4xl whitespace-pre-wrap rounded-xl border border-[var(--line)] bg-white p-5 text-sm leading-7 shadow-sm sm:my-8 sm:p-10">{preview.text}</article>}
        {preview?.kind === 'XLSX' && <div className="flex min-h-full flex-col"><div className="flex gap-1 overflow-x-auto border-b border-[var(--line)] bg-white px-3 pt-2 sm:px-5">{preview.sheets.map((item, index) => <button key={item.name} onClick={() => setSheet(index)} className={`shrink-0 border-b-2 px-3 py-2 text-[11px] font-semibold ${sheet === index ? 'border-[var(--ink)]' : 'border-transparent text-[var(--muted)]'}`}>{item.name}</button>)}</div><div className="flex-1 overflow-auto p-3 sm:p-5"><table className="min-w-full border-collapse bg-white text-left text-[11px] shadow-sm"><tbody>{activeSheet?.rows.map((row, rowIndex) => <tr key={rowIndex} className="border-b border-[var(--line)]">{row.map((cell, cellIndex) => <td key={cellIndex} className={`max-w-[360px] border-r border-[var(--line)] px-3 py-2 align-top ${rowIndex === 0 ? 'bg-[var(--surface)] font-semibold' : ''}`}>{cell}</td>)}</tr>)}</tbody></table></div></div>}
      </>}
    </main>
  </div>;
}

function ExtractedDetails({ details }: { details: Details }) {
  const termLabels: Record<string, string> = { currency: 'Currency', freight: 'Freight', tax: 'Tax / GST', paymentTerms: 'Payment terms', deliveryLeadTimeDays: 'Delivery lead time', warrantyMonths: 'Warranty', quoteValidityDays: 'Quote validity', discountPercent: 'Discount', minimumOrderCondition: 'Minimum order' };
  const terms = Object.entries(details.commercialTerms).filter(([key, value]) => key !== 'evidence' && value !== null && value !== undefined && value !== '');
  return <div className="mx-auto max-w-5xl p-4 sm:p-8"><div className="mb-5"><p className="eyebrow">AI-extracted, source-backed</p><h2 className="mt-2 text-lg font-semibold">Terms &amp; compliance</h2><p className="mt-1 text-xs leading-5 text-[var(--muted)]">Values below come from this supplier response. Missing information remains unknown.</p></div><div className="grid gap-4 lg:grid-cols-2"><section className="rounded-xl border border-[var(--line)] bg-white"><div className="flex items-center gap-2 border-b border-[var(--line)] px-4 py-3"><ShieldCheck size={15} /><h3 className="text-xs font-semibold">Qualification answers</h3></div><div className="divide-y divide-[var(--line)]">{details.qualification.map((item) => <div key={item.label} className="p-4"><div className="flex items-start justify-between gap-3"><p className="text-xs font-medium">{item.label}</p><span className={`status-pill ${item.answer === 'YES' ? 'status-ready' : item.answer === 'NO' ? 'status-error' : ''}`}>{item.answer}</span></div>{item.detail && <p className="mt-1 text-[11px] text-[var(--muted)]">{item.detail}</p>}<Evidence evidence={item.evidence} /></div>)}</div></section><section className="rounded-xl border border-[var(--line)] bg-white"><div className="flex items-center gap-2 border-b border-[var(--line)] px-4 py-3"><Check size={15} /><h3 className="text-xs font-semibold">Commercial terms</h3></div><dl className="divide-y divide-[var(--line)]">{terms.map(([key, value]) => <div key={key} className="flex items-start justify-between gap-4 px-4 py-3 text-xs"><dt className="text-[var(--muted)]">{termLabels[key] ?? key}</dt><dd className="text-right font-medium">{formatTerm(key, value)}</dd></div>)}</dl><div className="p-4"><Evidence evidence={details.commercialTerms.evidence ?? []} /></div></section></div></div>;
}

function Evidence({ evidence }: { evidence: Evidence[] }) {
  if (!evidence.length) return <p className="mt-2 text-[10px] text-[var(--muted)]">No precise source excerpt was returned.</p>;
  const item = evidence[0];
  return <details className="mt-2"><summary className="cursor-pointer text-[10px] font-semibold text-[var(--muted)]">View source evidence</summary><div className="mt-2 rounded-lg bg-[var(--surface)] p-3 text-[10px] leading-4 text-[var(--muted)]"><p className="font-semibold text-[var(--ink)]">{item.location}</p><p className="mt-1">“{item.excerpt}”</p></div></details>;
}

function formatTerm(key: string, value: unknown) {
  if (key === 'deliveryLeadTimeDays') return `${value} days`;
  if (key === 'warrantyMonths') return `${value} months`;
  if (key === 'quoteValidityDays') return `${value} days`;
  if (key === 'discountPercent') return `${value}%`;
  return String(value).replaceAll('_', ' ');
}
