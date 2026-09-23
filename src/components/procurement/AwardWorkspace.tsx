'use client';

import { useEffect, useState } from 'react';
import { Check, Download, LoaderCircle, Scale, ShieldCheck } from 'lucide-react';

const money = new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 });

type Award = {
  status: 'DRAFT' | 'ACCEPTED';
  totalSpend: number;
  baselineVendor?: string;
  baselineSpend?: number;
  savings?: number;
  unawardedLines: number;
  unawardedLineIds: string[];
  spendByVendor: Array<{ vendor: string; spend: number; lines: number }>;
  allocations: Array<{ lineId: string; item: string; quantity: number; vendor: string; unitPrice: number; lineTotal: number }>;
  caveats: string[];
};

export default function AwardWorkspace() {
  const [award, setAward] = useState<Award | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch('/api/demo/award', { cache: 'no-store' })
      .then((response) => response.json())
      .then((payload) => setAward(payload.award))
      .catch(() => setError('The saved recommendation could not be loaded.'))
      .finally(() => setLoading(false));
  }, []);

  async function mutate(method: 'POST' | 'PUT') {
    setBusy(true); setError(null);
    try {
      const response = await fetch('/api/demo/award', { method });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || 'Award action failed.');
      setAward(payload.award);
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'Award action failed.'); }
    finally { setBusy(false); }
  }

  async function exportPdf() {
    setExporting(true); setError(null);
    try {
      const response = await fetch('/api/demo/award/pdf');
      if (!response.ok) { const payload = await response.json(); throw new Error(payload.error || 'PDF export failed.'); }
      const url = URL.createObjectURL(await response.blob());
      const link = document.createElement('a'); link.href = url; link.download = 'windows-hardware-fy27-award-recommendation.pdf'; link.click(); URL.revokeObjectURL(url);
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'PDF export failed.'); }
    finally { setExporting(false); }
  }

  if (loading) return <div className="flex min-h-[55vh] items-center justify-center gap-2 text-xs text-[var(--muted)]"><LoaderCircle className="animate-spin" size={14} /> Loading recommendation…</div>;

  return <div className="mx-auto max-w-5xl">
    <div className="flex flex-wrap items-start justify-between gap-4"><div><p className="eyebrow">Buyer decision</p><h1 className="mt-2 text-xl font-semibold sm:text-2xl">Award recommendation</h1><p className="mt-2 max-w-2xl text-sm leading-6 text-[var(--muted)]">Review how the allocation was calculated and what remains uncertain. Accepting records your decision; it does not create a purchase order.</p></div>{award && <span className={`status-pill ${award.status === 'ACCEPTED' ? 'status-ready' : ''}`}>{award.status}</span>}</div>
    {error && <div className="mt-5 rounded-xl border border-[#efcfcc] bg-[var(--red-soft)] p-4 text-xs text-[var(--red)]">{error}</div>}

    {!award ? <section className="mt-6 rounded-xl border border-[var(--line)] bg-white p-5 sm:p-7"><div className="flex size-10 items-center justify-center rounded-full bg-[var(--surface)]"><Scale size={17} /></div><h2 className="mt-4 text-base font-semibold">Create a reviewable split-award scenario</h2><p className="mt-2 max-w-2xl text-sm leading-6 text-[var(--muted)]">The system will select the lowest normalized price for each RFx line, but only from qualified suppliers whose quote is verified or safely normalized. Missing, ambiguous, and judgment-dependent quotes remain excluded.</p><button disabled={busy} onClick={() => void mutate('POST')} className="mt-5 rounded-lg bg-[var(--ink)] px-4 py-2.5 text-xs font-semibold text-white disabled:opacity-50">{busy ? 'Calculating…' : 'Create recommendation'}</button></section> : <>
      <section className="mt-6 rounded-xl border border-[var(--line-strong)] bg-white p-5 sm:p-6"><div className="grid gap-5 sm:grid-cols-3"><Metric label="Recommended spend" value={money.format(award.totalSpend)} /><Metric label="Savings vs single vendor" value={award.savings === undefined ? 'No baseline' : money.format(award.savings)} emphasis /><Metric label="Lines requiring resolution" value={String(award.unawardedLines)} /></div>{award.baselineVendor && <p className="mt-5 border-t border-[var(--line)] pt-4 text-[11px] leading-5 text-[var(--muted)]">Baseline: awarding all eligible lines to <strong className="text-[var(--ink)]">{award.baselineVendor}</strong> would cost {money.format(award.baselineSpend ?? 0)}.</p>}</section>

      <div className="mt-5 grid gap-5 lg:grid-cols-[minmax(0,1fr)_320px]"><div className="space-y-5"><section className="rounded-xl border border-[var(--line)] bg-white"><div className="border-b border-[var(--line)] p-5"><h2 className="text-sm font-semibold">Why this split</h2><p className="mt-1 text-xs leading-5 text-[var(--muted)]">One rule is applied consistently to every line.</p></div><div className="space-y-4 p-5"><Reason number="1" title="Qualification first" text="Disqualified and incomplete suppliers are not eligible for allocation." /><Reason number="2" title="Trustworthy quotes only" text="Only verified or deterministically normalized prices are considered. Deviations and unresolved facts are excluded." /><Reason number="3" title="Lowest eligible line cost" text="Each line goes to the qualified supplier with the lowest normalized unit price for that specific line." /></div></section>
        <section className="overflow-hidden rounded-xl border border-[var(--line)] bg-white"><div className="border-b border-[var(--line)] p-5"><h2 className="text-sm font-semibold">Recommended allocation</h2><p className="mt-1 text-[11px] leading-5 text-[var(--muted)]">Shown in RFx line order for traceability—not ranked by importance or preference.</p></div><div className="overflow-x-auto"><table className="w-full min-w-[650px] text-left text-[11px]"><thead className="bg-[var(--surface)]"><tr><th className="px-4 py-3">RFx line</th><th className="px-4 py-3">Selected supplier</th><th className="px-4 py-3 text-right">Unit price</th><th className="px-4 py-3 text-right">Line spend</th></tr></thead><tbody>{award.allocations.map((item) => <tr key={item.lineId} className="border-t border-[var(--line)]"><td className="px-4 py-3"><strong>{item.lineId}</strong><span className="ml-2 text-[var(--muted)]">{item.item}</span></td><td className="px-4 py-3">{item.vendor}</td><td className="px-4 py-3 text-right">{money.format(item.unitPrice)}</td><td className="px-4 py-3 text-right font-medium">{money.format(item.lineTotal)}</td></tr>)}</tbody></table></div></section></div>
        <aside className="space-y-5"><section className="rounded-xl border border-[var(--line)] bg-white p-5"><h2 className="text-sm font-semibold">Spend by supplier</h2><div className="mt-4 divide-y divide-[var(--line)]">{award.spendByVendor.map((item) => <div key={item.vendor} className="py-3"><div className="flex items-center justify-between gap-3 text-xs"><span className="font-medium">{item.vendor}</span><span>{money.format(item.spend)}</span></div><p className="mt-1 text-[10px] text-[var(--muted)]">{item.lines} line{item.lines === 1 ? '' : 's'}</p></div>)}</div></section><section className="rounded-xl border border-[var(--line)] bg-white p-5"><div className="flex items-center gap-2"><ShieldCheck size={15} /><h2 className="text-sm font-semibold">Before you decide</h2></div><ul className="mt-4 space-y-3">{award.caveats.map((item) => <li key={item} className="flex gap-2 text-[11px] leading-5 text-[var(--muted)]"><Check className="mt-1 shrink-0" size={11} />{item}</li>)}</ul>{award.unawardedLines > 0 && <div className="mt-4 rounded-lg bg-amber-50 p-3 text-[11px] leading-5 text-amber-800">Resolve {award.unawardedLineIds.join(', ')} before accepting.</div>}</section></aside></div>

      <section className="sticky bottom-3 mt-5 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-[var(--line-strong)] bg-white p-4 shadow-[0_8px_30px_rgba(31,35,32,0.10)]"><div><p className="text-xs font-semibold">{award.status === 'ACCEPTED' ? 'Recommendation accepted' : 'Buyer approval required'}</p><p className="mt-1 text-[10px] text-[var(--muted)]">The system recommends; you retain the decision.</p></div><div className="flex w-full gap-2 sm:w-auto">{award.status === 'DRAFT' ? <><button disabled={busy} onClick={() => void mutate('POST')} className="flex-1 rounded-lg border border-[var(--line-strong)] px-4 py-2.5 text-xs font-semibold disabled:opacity-50 sm:flex-none">Recalculate</button><button disabled={busy || award.unawardedLines > 0} onClick={() => void mutate('PUT')} className="flex-1 rounded-lg bg-[var(--ink)] px-4 py-2.5 text-xs font-semibold text-white disabled:opacity-45 sm:flex-none">{busy ? 'Working…' : 'Accept recommendation'}</button></> : <button disabled={exporting} onClick={() => void exportPdf()} className="flex flex-1 items-center justify-center gap-2 rounded-lg bg-[var(--ink)] px-4 py-2.5 text-xs font-semibold text-white disabled:opacity-50 sm:flex-none">{exporting ? <LoaderCircle className="animate-spin" size={13} /> : <Download size={13} />}{exporting ? 'Generating PDF…' : 'Export PDF'}</button>}</div></section>
    </>}
  </div>;
}

function Metric({ label, value, emphasis = false }: { label: string; value: string; emphasis?: boolean }) {
  return <div><p className="eyebrow">{label}</p><p className={`mt-2 text-lg font-semibold ${emphasis ? 'text-[var(--green)]' : ''}`}>{value}</p></div>;
}

function Reason({ number, title, text }: { number: string; title: string; text: string }) {
  return <div className="flex gap-3"><div className="flex size-6 shrink-0 items-center justify-center rounded-full bg-[var(--ink)] text-[10px] font-semibold text-white">{number}</div><div><p className="text-xs font-semibold">{title}</p><p className="mt-1 text-[11px] leading-5 text-[var(--muted)]">{text}</p></div></div>;
}
