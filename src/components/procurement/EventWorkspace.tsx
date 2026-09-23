'use client';

import { useState } from 'react';
import Link from 'next/link';
import { AlertCircle, ArrowLeft, Check, ChevronDown, CircleHelp, FileSpreadsheet, LoaderCircle, Send, ShieldCheck } from 'lucide-react';
import type { SourcingEvent } from '@/lib/procurement/schemas';

type Tab = 'RFx' | 'Responses' | 'Comparison' | 'Analysis';

export default function EventWorkspace({ event, aiConfigured }: { event: SourcingEvent; aiConfigured: boolean }) {
  const [tab, setTab] = useState<Tab>('RFx');
  const [expanded, setExpanded] = useState<string | null>('HW-001');
  const [processing, setProcessing] = useState(false);
  const [result, setResult] = useState<{ tone: 'success' | 'error'; message: string } | null>(null);

  async function testHardestArtifact() {
    setProcessing(true); setResult(null);
    try {
      const response = await fetch('/api/demo/process/vendor-d', { method: 'POST' });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || 'Processing failed.');
      const count = payload.response.lineItems.filter((line: { normalizedUnitPrice: number | null }) => line.normalizedUnitPrice !== null).length;
      setResult({ tone: 'success', message: `Sarvam processed the photographed rate card: ${count}/30 lines received normalized prices.` });
    } catch (error) {
      setResult({ tone: 'error', message: error instanceof Error ? error.message : 'Processing failed.' });
    } finally { setProcessing(false); }
  }

  return <div className="min-h-screen bg-[var(--surface)]">
    <header className="sticky top-0 z-30 border-b border-[var(--line)] bg-white/95 backdrop-blur">
      <div className="flex h-14 items-center justify-between px-5">
        <div className="flex items-center gap-4"><Link href="/" aria-label="Back to home" className="rounded-lg p-2 hover:bg-[var(--surface)]"><ArrowLeft size={16} /></Link><div className="h-5 w-px bg-[var(--line)]" /><div><p className="text-sm font-semibold tracking-tight">{event.title}</p><p className="text-[10px] text-[var(--muted)]">Draft · {event.id}</p></div></div>
        <div className="flex items-center gap-3"><span className={`status-pill ${aiConfigured ? 'status-ready' : ''}`}>{aiConfigured ? 'Sarvam connected' : 'Sarvam key required'}</span><button className="flex items-center gap-2 rounded-lg bg-[var(--ink)] px-3.5 py-2 text-xs font-semibold text-white"><Send size={13} /> Send RFx</button></div>
      </div>
      <nav className="flex gap-6 px-6">{(['RFx', 'Responses', 'Comparison', 'Analysis'] as Tab[]).map((item) => <button key={item} onClick={() => setTab(item)} className={`border-b-2 px-1 py-3 text-xs font-semibold ${tab === item ? 'border-[var(--ink)] text-[var(--ink)]' : 'border-transparent text-[var(--muted)]'}`}>{item}</button>)}</nav>
    </header>
    <main className="mx-auto max-w-[1440px] px-6 py-7">
      {tab === 'RFx' ? <>
        <div className="mb-7 flex flex-wrap items-start justify-between gap-5"><div><p className="eyebrow">Request for quotation · {event.fiscalYear}</p><h1 className="mt-2 text-2xl font-semibold tracking-[-.025em]">{event.title}</h1><p className="mt-2 max-w-2xl text-sm leading-6 text-[var(--muted)]">{event.scope}</p></div><div className="flex gap-8 rounded-xl border border-[var(--line)] bg-white px-5 py-4"><Metric label="Lines" value="30" /><Metric label="Vendors" value="5" /><Metric label="Delivery" value="15 Apr 2027" /></div></div>
        <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_320px]">
          <section className="overflow-hidden rounded-xl border border-[var(--line)] bg-white">
            <div className="flex items-center justify-between border-b border-[var(--line)] px-5 py-4"><div><h2 className="text-sm font-semibold">Line items</h2><p className="mt-1 text-xs text-[var(--muted)]">Requested specifications and quantities</p></div><span className="text-xs text-[var(--muted)]">Base currency · INR</span></div>
            <div className="overflow-x-auto"><table className="w-full border-collapse text-left"><thead><tr className="bg-[var(--surface)] text-[10px] uppercase tracking-wider text-[var(--muted)]"><th className="w-24 px-5 py-3 font-semibold">Line</th><th className="px-3 py-3 font-semibold">Requested item</th><th className="w-32 px-3 py-3 font-semibold">Category</th><th className="w-24 px-5 py-3 text-right font-semibold">Quantity</th></tr></thead><tbody>{event.lineItems.map((line) => <LineRow key={line.id} line={line} open={expanded === line.id} onToggle={() => setExpanded(expanded === line.id ? null : line.id)} />)}</tbody></table></div>
          </section>
          <aside className="space-y-4">
            <section className="rounded-xl border border-[var(--line)] bg-white p-5"><div className="mb-4 flex items-center gap-2"><ShieldCheck size={16} /><h2 className="text-sm font-semibold">Qualification gates</h2></div><div className="space-y-4">{event.qualificationQuestions.map((question) => <div key={question.id} className="flex gap-3"><div className={`mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full ${question.hardGate ? 'bg-[var(--ink)] text-white' : 'border border-[var(--line)] text-[var(--muted)]'}`}>{question.hardGate ? <Check size={12} /> : <CircleHelp size={12} />}</div><div><p className="text-xs font-semibold">{question.label}</p><p className="mt-1 text-[11px] leading-4 text-[var(--muted)]">{question.description}</p></div></div>)}</div><div className="mt-5 rounded-lg bg-[var(--surface)] p-3 text-[11px] leading-5 text-[var(--muted)]">Missing hard-gate answers remain <strong className="text-[var(--ink)]">Incomplete</strong>. They are never treated as failed.</div></section>
            <section className="rounded-xl border border-[var(--line)] bg-white p-5"><h2 className="text-sm font-semibold">Invited vendors</h2><div className="mt-4 divide-y divide-[var(--line)]">{event.invitedVendors.map((vendor) => <div key={vendor.id} className="flex items-center justify-between py-3"><div><p className="text-xs font-semibold">{vendor.name}</p><p className="mt-1 text-[10px] text-[var(--muted)]">{vendor.contactName}</p></div><span className="status-pill">{vendor.responseFormat}</span></div>)}</div></section>
            <section className="rounded-xl border border-[var(--line)] bg-white p-5"><div className="flex items-center gap-2"><FileSpreadsheet size={16} /><h2 className="text-sm font-semibold">Ingestion proof</h2></div><p className="mt-2 text-xs leading-5 text-[var(--muted)]">Process the photographed rate card through Sarvam Vision and the canonical normalization pipeline.</p><button disabled={processing} onClick={testHardestArtifact} className="mt-4 flex w-full items-center justify-center gap-2 rounded-lg border border-[var(--line-strong)] bg-white px-3 py-2.5 text-xs font-semibold disabled:opacity-50">{processing ? <LoaderCircle className="animate-spin" size={14} /> : <FileSpreadsheet size={14} />} {processing ? 'Processing image…' : 'Test image extraction'}</button>{result && <div className={`mt-3 flex gap-2 rounded-lg p-3 text-[11px] leading-5 ${result.tone === 'error' ? 'bg-[var(--red-soft)] text-[var(--red)]' : 'bg-[var(--green-soft)] text-[var(--green)]'}`}><AlertCircle className="mt-0.5 shrink-0" size={13} />{result.message}</div>}</section>
          </aside>
        </div>
      </> : <EmptyTab tab={tab} />}
    </main>
  </div>;
}

function Metric({ label, value }: { label: string; value: string }) { return <div><p className="text-[10px] uppercase tracking-wider text-[var(--muted)]">{label}</p><p className="mt-1 text-sm font-semibold">{value}</p></div>; }

function LineRow({ line, open, onToggle }: { line: SourcingEvent['lineItems'][number]; open: boolean; onToggle: () => void }) {
  return <><tr onClick={onToggle} className="cursor-pointer border-t border-[var(--line)] hover:bg-[#fafbf9]"><td className="px-5 py-4 font-mono text-[11px] text-[var(--muted)]">{line.id}</td><td className="px-3 py-4"><div className="flex items-center gap-2 text-xs font-medium">{line.requestedProduct}<ChevronDown size={13} className={`text-[var(--muted)] transition ${open ? 'rotate-180' : ''}`} /></div></td><td className="px-3 py-4 text-[11px] text-[var(--muted)]">{line.category}</td><td className="px-5 py-4 text-right text-xs font-medium">{line.quantity} {line.unit}</td></tr>{open && <tr className="bg-[var(--surface)]"><td /><td colSpan={3} className="px-3 py-4"><div className="grid gap-5 md:grid-cols-2"><div><p className="eyebrow mb-2">Mandatory</p><ul className="space-y-1.5">{line.mandatorySpecifications.map((spec) => <li key={spec} className="flex gap-2 text-[11px] text-[var(--muted)]"><Check size={12} className="mt-0.5 text-[var(--green)]" />{spec}</li>)}</ul></div><div><p className="eyebrow mb-2">Optional</p><ul className="space-y-1.5">{line.optionalSpecifications.map((spec) => <li key={spec} className="text-[11px] text-[var(--muted)]">{spec}</li>)}</ul></div></div></td></tr>}</>;
}

function EmptyTab({ tab }: { tab: Exclude<Tab, 'RFx'> }) { return <div className="flex min-h-[60vh] items-center justify-center"><div className="max-w-sm text-center"><p className="eyebrow">Next checkpoint</p><h2 className="mt-3 text-xl font-semibold">{tab} workspace</h2><p className="mt-2 text-sm leading-6 text-[var(--muted)]">This section will become active after the RFx is sent and supplier responses are processed.</p></div></div>; }
