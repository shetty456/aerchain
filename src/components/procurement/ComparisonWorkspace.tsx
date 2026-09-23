'use client';

import { useEffect, useMemo, useState } from 'react';
import { AlertCircle, Check, ChevronRight, FileSearch, LoaderCircle, MailQuestion, Send, ShieldAlert, ShieldCheck } from 'lucide-react';
import type { SourceEvidence, VendorResponse } from '@/lib/procurement/schemas';

type ComparisonPayload = {
  event: {
    title: string;
    baseCurrency: 'INR';
    demoExchangeRates: { USD_INR: number };
    lineItems: Array<{ id: string; requestedProduct: string; quantity: number; unit: string }>;
  };
  vendors: Array<{
    vendor: { id: string; name: string; responseFormat: string };
    qualification: { status: 'QUALIFIED' | 'DISQUALIFIED' | 'INCOMPLETE'; failed: string[]; unknown: string[] };
    response: VendorResponse;
    clarification: { status: 'GENERATING' | 'SENT' | 'RESPONSE_RECEIVED' | 'REPROCESSING' | 'COMPLETED' | 'FAILED'; questions?: string[]; resolutions?: Array<{ rfxLineId: string; confirmed: boolean }>; qualificationResolutions?: Array<{ questionId: string; answer: 'YES' | 'NO' | 'UNKNOWN' }>; error?: string } | null;
  }>;
};

type SelectedCell = { vendorName: string; lineName: string; status: string; quotedDescription: string; evidence: SourceEvidence[] };

const money = new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 });
const cleanStatus = (status: string) => status.toLowerCase().replaceAll('_', ' ');

export default function ComparisonWorkspace() {
  const [data, setData] = useState<ComparisonPayload | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [exceptionsOnly, setExceptionsOnly] = useState(false);
  const [selected, setSelected] = useState<SelectedCell | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  async function loadComparison() {
    const response = await fetch('/api/demo/comparison', { cache: 'no-store' });
    const payload = await response.json();
    if (!response.ok) throw new Error(payload.error || 'Comparison could not be loaded.');
    setData(payload);
  }

  useEffect(() => {
    let disposed = false;
    fetch('/api/demo/comparison', { cache: 'no-store' })
      .then(async (response) => {
        const payload = await response.json();
        if (!response.ok) throw new Error(payload.error || 'Comparison could not be loaded.');
        if (!disposed) setData(payload);
      })
      .catch((reason) => { if (!disposed) setError(reason instanceof Error ? reason.message : 'Comparison could not be loaded.'); });
    return () => { disposed = true; };
  }, []);

  const clarificationActive = data?.vendors.some(({ clarification }) => clarification && !['COMPLETED', 'FAILED'].includes(clarification.status)) ?? false;
  useEffect(() => {
    if (!clarificationActive) return;
    const timer = setInterval(() => { void loadComparison().catch(() => undefined); }, 1_500);
    return () => clearInterval(timer);
  }, [clarificationActive]);

  async function clarify(vendorId: string) {
    setActionError(null);
    try {
      const response = await fetch(`/api/demo/clarifications/${vendorId}`, { method: 'POST' });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || 'Clarification could not be started.');
      await loadComparison();
    } catch (reason) {
      setActionError(reason instanceof Error ? reason.message : 'Clarification could not be started.');
    }
  }

  const visibleLines = useMemo(() => {
    if (!data || !exceptionsOnly) return data?.event.lineItems ?? [];
    return data.event.lineItems.filter((line) => data.vendors.some(({ response }) => {
      const quote = response.lineItems.find((item) => item.rfxLineId === line.id);
      return quote && !['VERIFIED', 'NORMALIZED'].includes(quote.status);
    }));
  }, [data, exceptionsOnly]);

  if (error) return <div className="mx-auto max-w-xl rounded-xl border border-[#efcfcc] bg-[var(--red-soft)] p-5 text-sm text-[var(--red)]"><div className="flex gap-2"><AlertCircle className="mt-0.5 shrink-0" size={16} /><div><p className="font-semibold">Comparison unavailable</p><p className="mt-1 text-xs leading-5">{error}</p></div></div></div>;
  if (!data) return <div className="flex min-h-[55vh] items-center justify-center gap-2 text-sm text-[var(--muted)]"><LoaderCircle className="animate-spin" size={16} /> Loading normalized comparison…</div>;

  return <div>
    {actionError && <div role="alert" className="mb-5 flex gap-2 rounded-xl border border-[#efcfcc] bg-[var(--red-soft)] px-4 py-3 text-xs text-[var(--red)]"><AlertCircle className="shrink-0" size={14} />{actionError}</div>}
    <div className="mb-6 flex flex-wrap items-end justify-between gap-4"><div><p className="eyebrow">Normalized comparison</p><h1 className="mt-2 text-2xl font-semibold">Compare decision-ready responses</h1><p className="mt-2 text-sm text-[var(--muted)]">Prices are normalized to INR per requested unit. Exceptions remain visible and are never treated as verified.</p></div><div className="rounded-lg border border-[var(--line)] bg-white px-3 py-2 text-[11px] text-[var(--muted)]">Demo FX assumption · 1 USD = ₹{data.event.demoExchangeRates.USD_INR}</div></div>

    <section className="mb-5 overflow-hidden rounded-xl border border-[var(--line)] bg-white">
      <div className="border-b border-[var(--line)] px-5 py-3"><h2 className="text-xs font-semibold">Supplier qualification</h2></div>
      <div className="grid divide-y divide-[var(--line)] md:grid-cols-5 md:divide-x md:divide-y-0">{data.vendors.map(({ vendor, qualification }) => <div key={vendor.id} className="p-4"><div className="flex items-start justify-between gap-2">{qualification.status === 'QUALIFIED' ? <ShieldCheck size={16} className="text-[var(--green)]" /> : <ShieldAlert size={16} className={qualification.status === 'DISQUALIFIED' ? 'text-[var(--red)]' : 'text-amber-600'} />}<span className={`status-pill ${qualification.status === 'QUALIFIED' ? 'status-ready' : qualification.status === 'DISQUALIFIED' ? 'status-error' : ''}`}>{qualification.status}</span></div><p className="mt-3 text-xs font-semibold leading-4">{vendor.name}</p><p className="mt-2 text-[10px] leading-4 text-[var(--muted)]">{qualification.failed.length ? `Failed: ${qualification.failed.join(', ')}` : qualification.unknown.length ? `Missing: ${qualification.unknown.join(', ')}` : 'All mandatory gates passed'}</p></div>)}</div>
    </section>

    <section className="mb-5 overflow-hidden rounded-xl border border-[var(--line)] bg-white">
      <div className="flex items-center gap-2 border-b border-[var(--line)] px-5 py-3"><MailQuestion size={14} /><div><h2 className="text-xs font-semibold">Factual clarifications</h2><p className="mt-1 text-[10px] text-[var(--muted)]">AI may confirm missing facts. Substitutions and commercial decisions remain with the buyer.</p></div></div>
      <div className="divide-y divide-[var(--line)]">{data.vendors.map(({ vendor, response, qualification, clarification }) => {
        const factualCount = response.lineItems.filter((line) => line.status === 'AWAITING_CLARIFICATION').length;
        const qualificationGapCount = qualification.unknown.length;
        const totalGapCount = factualCount + qualificationGapCount;
        const validLineIds = new Set(response.lineItems.map((line) => line.rfxLineId));
        const clarifiedCount = clarification?.resolutions?.filter((item) => item.confirmed && validLineIds.has(item.rfxLineId)).length ?? 0;
        const clarifiedQualificationCount = clarification?.qualificationResolutions?.filter((item) => item.answer !== 'UNKNOWN').length ?? 0;
        const totalClarified = clarifiedCount + clarifiedQualificationCount;
        const active = clarification && !['COMPLETED', 'FAILED'].includes(clarification.status);
        const label = clarification?.status === 'GENERATING' ? 'Drafting questions' : clarification?.status === 'SENT' ? 'Sent to vendor' : clarification?.status === 'RESPONSE_RECEIVED' ? 'Reply received' : clarification?.status === 'REPROCESSING' ? 'Reprocessing reply' : clarification?.status === 'COMPLETED' ? `${totalClarified} clarified · ${totalGapCount} still awaiting` : clarification?.status === 'FAILED' ? 'Clarification failed' : `${factualCount} line gaps · ${qualificationGapCount} qualification gaps`;
        return <div key={vendor.id} className="flex flex-wrap items-center justify-between gap-3 px-5 py-3"><div><p className="text-xs font-semibold">{vendor.name}</p><p className={`mt-1 text-[10px] ${clarification?.status === 'FAILED' ? 'text-[var(--red)]' : 'text-[var(--muted)]'}`}>{label}</p></div>{totalGapCount > 0 && <button disabled={clarificationActive} onClick={() => clarify(vendor.id)} className="flex items-center gap-1.5 rounded-lg border border-[var(--line-strong)] px-3 py-2 text-[11px] font-semibold disabled:cursor-wait disabled:opacity-55">{active ? <LoaderCircle className="animate-spin" size={12} /> : <Send size={12} />}{active ? 'Working…' : clarification?.status === 'FAILED' ? 'Retry clarification' : totalClarified ? 'Clarify next 3' : 'Send clarification'}</button>}</div>;
      })}</div>
    </section>

    <section className="overflow-hidden rounded-xl border border-[var(--line)] bg-white">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[var(--line)] px-5 py-3"><div><h2 className="text-xs font-semibold">Line-by-line pricing</h2><p className="mt-1 text-[10px] text-[var(--muted)]">{visibleLines.length} of {data.event.lineItems.length} RFx lines shown{exceptionsOnly ? ' · verified cells suppressed' : ''}</p></div><label className="flex cursor-pointer items-center gap-2 text-[11px] font-medium"><input type="checkbox" checked={exceptionsOnly} onChange={(event) => setExceptionsOnly(event.target.checked)} className="size-3.5 accent-[var(--ink)]" /> Focus exceptions</label></div>
      <div className="overflow-x-auto"><table className="min-w-[1180px] w-full border-collapse text-left"><thead><tr className="bg-[var(--surface)]"><th className="sticky left-0 z-20 w-[300px] border-r border-[var(--line)] bg-[var(--surface)] px-5 py-3 text-[10px] uppercase tracking-wider text-[var(--muted)]">Requested item</th>{data.vendors.map(({ vendor }) => <th key={vendor.id} className="min-w-[175px] border-r border-[var(--line)] px-4 py-3 text-[10px] font-semibold text-[var(--ink)] last:border-r-0">{vendor.name}</th>)}</tr></thead><tbody>{visibleLines.map((line) => <tr key={line.id} className="border-t border-[var(--line)] align-top"><td className="sticky left-0 z-10 border-r border-[var(--line)] bg-white px-5 py-4"><p className="font-mono text-[9px] text-[var(--muted-light)]">{line.id}</p><p className="mt-1 text-[11px] font-semibold leading-4">{line.requestedProduct}</p><p className="mt-1 text-[10px] text-[var(--muted)]">{line.quantity} {line.unit}</p></td>{data.vendors.map(({ vendor, response }) => {
          const quote = response.lineItems.find((item) => item.rfxLineId === line.id);
          if (!quote) return <td key={vendor.id} className="border-r border-[var(--line)] px-4 py-4 text-[11px] text-[var(--muted)] last:border-r-0">Not processed</td>;
          const okay = ['VERIFIED', 'NORMALIZED'].includes(quote.status);
          if (exceptionsOnly && okay) return <td key={vendor.id} className="border-r border-[var(--line)] bg-[var(--surface)] px-4 py-4 text-[10px] text-[var(--muted-light)] last:border-r-0">No exception</td>;
          return <td key={vendor.id} className={`border-r border-[var(--line)] px-4 py-4 last:border-r-0 ${okay ? '' : 'bg-[#fffaf2]'}`}><button onClick={() => setSelected({ vendorName: vendor.name, lineName: line.requestedProduct, status: quote.status, quotedDescription: quote.quotedDescription, evidence: quote.evidence })} className="w-full text-left"><p className="text-xs font-semibold">{quote.normalizedUnitPrice === null ? '—' : money.format(quote.normalizedUnitPrice)}</p><div className={`mt-2 flex items-center gap-1.5 text-[9px] font-semibold uppercase tracking-wide ${okay ? 'text-[var(--green)]' : 'text-amber-700'}`}>{okay ? <Check size={10} /> : <AlertCircle size={10} />}{cleanStatus(quote.status)}</div><p className="mt-2 flex items-center gap-1 text-[9px] text-[var(--muted)]">Inspect <ChevronRight size={10} /></p></button></td>;
        })}</tr>)}</tbody></table></div>
    </section>

    {selected && <section className="mt-5 rounded-xl border border-[var(--line-strong)] bg-white p-5"><div className="flex items-start justify-between gap-4"><div><p className="eyebrow">Source inspection</p><h2 className="mt-2 text-sm font-semibold">{selected.vendorName} · {selected.lineName}</h2><p className="mt-1 text-xs text-[var(--muted)]">Quoted as: {selected.quotedDescription}</p></div><button onClick={() => setSelected(null)} className="text-xs font-semibold text-[var(--muted)]">Close</button></div><div className="mt-4 space-y-3">{selected.evidence.length ? selected.evidence.map((evidence, index) => <div key={`${evidence.location}-${index}`} className="rounded-lg bg-[var(--surface)] p-3"><div className="flex items-center gap-2 text-[10px] font-semibold"><FileSearch size={12} /> {evidence.fileName} · {evidence.location}</div><p className="mt-2 text-[11px] leading-5 text-[var(--muted)]">“{evidence.excerpt}”</p></div>) : <p className="text-xs text-[var(--muted)]">No source excerpt was returned for this value. It remains an exception rather than being treated as verified.</p>}</div></section>}
  </div>;
}
