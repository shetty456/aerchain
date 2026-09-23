'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { AlertCircle, ArrowLeft, Check, CheckCircle2, ChevronDown, Circle, CircleHelp, Clock3, FileText, LoaderCircle, RefreshCw, Send, ShieldCheck } from 'lucide-react';
import type { SourcingEvent } from '@/lib/procurement/schemas';
import ComparisonWorkspace from './ComparisonWorkspace';
import AnalysisWorkspace from './AnalysisWorkspace';
import AuditTrail from './AuditTrail';

type Tab = 'RFx' | 'Responses' | 'Comparison' | 'Analysis';
type VendorState = 'WAITING' | 'PROCESSING' | 'COMPLETE' | 'ERROR';
type VendorProgress = { state: VendorState; stage?: string; normalizedLines?: number; exceptionLines?: number; cached?: boolean; error?: string };
type RunPayload = {
  mode?: 'LIVE' | 'SHOWCASE_REPLAY';
  status: 'RUNNING' | 'COMPLETED' | 'COMPLETED_WITH_ERRORS';
  vendors: Record<string, { status: 'QUEUED' | 'EXTRACTING' | 'MAPPING' | 'NORMALIZING' | 'READY' | 'FAILED'; normalizedLines?: number; exceptionLines?: number; cached?: boolean; error?: string }>;
};

const initialProgress = (event: SourcingEvent) => Object.fromEntries(
  event.invitedVendors.map((vendor) => [vendor.id, { state: 'WAITING' as const }]),
);

export default function EventWorkspace({ event, aiConfigured }: { event: SourcingEvent; aiConfigured: boolean }) {
  const [tab, setTab] = useState<Tab>('RFx');
  const [expanded, setExpanded] = useState<string | null>('HW-001');
  const [runStatus, setRunStatus] = useState<RunPayload['status'] | null>(null);
  const [progress, setProgress] = useState<Record<string, VendorProgress>>(() => initialProgress(event));
  const [actionError, setActionError] = useState<string | null>(null);
  const [runMode, setRunMode] = useState<RunPayload['mode']>();

  function applyRun(run: RunPayload | null) {
    if (!run) return;
    setRunStatus(run.status);
    setRunMode(run.mode);
    setProgress(Object.fromEntries(event.invitedVendors.map((vendor) => {
      const item = run.vendors[vendor.id];
      if (!item || item.status === 'QUEUED') return [vendor.id, { state: 'WAITING' } satisfies VendorProgress];
      if (item.status === 'READY') return [vendor.id, { state: 'COMPLETE', normalizedLines: item.normalizedLines, exceptionLines: item.exceptionLines, cached: item.cached } satisfies VendorProgress];
      if (item.status === 'FAILED') return [vendor.id, { state: 'ERROR', error: item.error } satisfies VendorProgress];
      return [vendor.id, { state: 'PROCESSING', stage: item.status } satisfies VendorProgress];
    })));
  }

  useEffect(() => {
    let disposed = false;
    async function refresh() {
      try {
        const response = await fetch('/api/demo/run', { cache: 'no-store' });
        const payload = await response.json();
        if (!disposed) applyRun(payload.run);
      } catch { /* The empty state remains usable if status restoration fails. */ }
    }
    void refresh();
    return () => { disposed = true; };
  // The event dataset is static for this workspace.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (runStatus !== 'RUNNING') return;
    const timer = setInterval(async () => {
      try {
        const response = await fetch('/api/demo/run', { cache: 'no-store' });
        const payload = await response.json();
        applyRun(payload.run);
      } catch { /* Keep the last known state and try again on the next interval. */ }
    }, 1_500);
    return () => clearInterval(timer);
  // The polling lifecycle is intentionally controlled only by run status.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [runStatus]);

  async function sendRfx() {
    if (runStatus || !aiConfigured) return;
    setActionError(null);
    setRunStatus('RUNNING');
    setTab('Responses');
    setProgress(initialProgress(event));
    try {
      const response = await fetch('/api/demo/run', { method: 'POST' });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || 'Could not start the RFx run.');
      applyRun(payload.run);
    } catch (error) {
      setRunStatus(null);
      setActionError(error instanceof Error ? error.message : 'Could not start the RFx run.');
    }
  }

  async function retryVendor(vendorId: string) {
    setActionError(null);
    try {
      const response = await fetch(`/api/demo/run/${vendorId}`, { method: 'POST' });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || 'Could not retry this vendor.');
      applyRun(payload.run);
    } catch (error) {
      setActionError(error instanceof Error ? error.message : 'Could not retry this vendor.');
    }
  }

  async function replayShowcase() {
    if (runStatus === 'RUNNING') return;
    setActionError(null);
    setTab('Responses');
    try {
      const response = await fetch('/api/demo/run', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'REPLAY_SHOWCASE' }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || 'Could not replay the showcase.');
      applyRun(payload.run);
    } catch (error) {
      setActionError(error instanceof Error ? error.message : 'Could not replay the showcase.');
    }
  }

  const sent = runStatus !== null;
  const running = runStatus === 'RUNNING';
  const completedCount = Object.values(progress).filter((item) => item.state === 'COMPLETE').length;
  const errorCount = Object.values(progress).filter((item) => item.state === 'ERROR').length;

  return <div className="min-h-screen bg-[var(--surface)]">
    <header className="sticky top-0 z-30 border-b border-[var(--line)] bg-white/95 backdrop-blur">
      <div className="flex min-h-14 items-center justify-between gap-2 px-3 py-2 sm:px-5">
        <div className="flex min-w-0 items-center gap-2 sm:gap-4"><Link href="/" aria-label="Back to home" className="shrink-0 rounded-lg p-2 hover:bg-[var(--surface)]"><ArrowLeft size={16} /></Link><div className="hidden h-5 w-px bg-[var(--line)] sm:block" /><div className="min-w-0"><p className="truncate text-xs font-semibold tracking-tight sm:text-sm">{event.title}</p><p className="truncate text-[9px] text-[var(--muted)] sm:text-[10px]">{running ? 'Processing responses' : sent ? 'Responses received' : 'Draft'} <span className="hidden sm:inline">· {event.id}</span></p></div></div>
        <div className="flex shrink-0 items-center gap-2 sm:gap-3"><span className={`status-pill hidden sm:inline-flex ${aiConfigured ? 'status-ready' : 'status-error'}`}>{aiConfigured ? 'AI providers connected' : 'AI keys required'}</span>{sent && !running ? <button onClick={replayShowcase} className="flex items-center gap-2 rounded-lg border border-[var(--line-strong)] bg-white px-3 py-2 text-[11px] font-semibold hover:bg-[var(--surface)] sm:px-3.5 sm:text-xs"><RefreshCw size={13} /> Replay <span className="hidden sm:inline">showcase</span></button> : <button disabled={!aiConfigured || sent || running} onClick={sendRfx} className="flex items-center gap-2 rounded-lg bg-[var(--ink)] px-3 py-2 text-[11px] font-semibold text-white disabled:cursor-not-allowed disabled:opacity-55 sm:px-3.5 sm:text-xs">{running ? <LoaderCircle className="animate-spin" size={13} /> : <Send size={13} />}{running ? `${Math.min(completedCount + errorCount + 1, 5)} of 5` : 'Send RFx'}</button>}</div>
      </div>
      <nav className="flex gap-4 overflow-x-auto px-4 sm:gap-6 sm:px-6">{(['RFx', 'Responses', 'Comparison', 'Analysis'] as Tab[]).map((item) => <button key={item} onClick={() => setTab(item)} className={`flex shrink-0 items-center gap-2 border-b-2 px-1 py-3 text-[11px] font-semibold sm:text-xs ${tab === item ? 'border-[var(--ink)] text-[var(--ink)]' : 'border-transparent text-[var(--muted)]'}`}>{item}{item === 'Responses' && sent && <span className="rounded-full bg-[var(--surface)] px-1.5 py-0.5 text-[9px]">{completedCount}/{event.invitedVendors.length}</span>}</button>)}</nav>
    </header>
    <main className="mx-auto max-w-[1440px] px-3 py-5 sm:px-6 sm:py-7">
      {actionError && <div role="alert" className="mb-5 flex items-start gap-2 rounded-xl border border-[#efcfcc] bg-[var(--red-soft)] px-4 py-3 text-xs text-[var(--red)]"><AlertCircle className="mt-0.5 shrink-0" size={14} />{actionError}</div>}
      {tab === 'RFx' && <RfxView event={event} expanded={expanded} setExpanded={setExpanded} aiConfigured={aiConfigured} sent={sent} sendRfx={sendRfx} />}
      {tab === 'Responses' && <ResponsesView event={event} sent={sent} running={running} replaying={runMode === 'SHOWCASE_REPLAY'} progress={progress} aiConfigured={aiConfigured} sendRfx={sendRfx} retry={retryVendor} />}
      {tab === 'Comparison' && (completedCount ? <ComparisonWorkspace /> : <EmptyTab tab="Comparison" />)}
      {tab === 'Analysis' && (completedCount ? <AnalysisWorkspace /> : <EmptyTab tab="Analysis" />)}
    </main>
  </div>;
}

function RfxView({ event, expanded, setExpanded, aiConfigured, sent, sendRfx }: { event: SourcingEvent; expanded: string | null; setExpanded: (line: string | null) => void; aiConfigured: boolean; sent: boolean; sendRfx: () => void }) {
  return <>
    <section className="mb-6 flex flex-wrap items-center justify-between gap-4 rounded-xl border border-[var(--line-strong)] bg-white px-5 py-4">
      <div><p className="text-sm font-semibold">{sent ? 'RFx sent to five vendors' : 'Ready to send'}</p><p className="mt-1 text-xs text-[var(--muted)]">{sent ? 'Open Responses to follow processing and review any failures.' : '30 line items and five invited vendors are ready for the simulated response journey.'}</p></div>
      {!sent && <button disabled={!aiConfigured} onClick={sendRfx} className="flex items-center gap-2 rounded-lg bg-[var(--ink)] px-4 py-2.5 text-xs font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50"><Send size={14} /> Send RFx to 5 vendors</button>}
    </section>
    <div className="mb-7 flex flex-wrap items-start justify-between gap-5"><div><p className="eyebrow">Request for quotation · {event.fiscalYear}</p><h1 className="mt-2 text-xl font-semibold tracking-[-.025em] sm:text-2xl">{event.title}</h1><p className="mt-2 max-w-2xl text-sm leading-6 text-[var(--muted)]">{event.scope}</p></div><div className="flex w-full justify-between gap-4 rounded-xl border border-[var(--line)] bg-white px-4 py-4 sm:w-auto sm:gap-8 sm:px-5"><Metric label="Lines" value="30" /><Metric label="Vendors" value="5" /><Metric label="Delivery" value="15 Apr 2027" /></div></div>
    <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_320px]">
      <section className="overflow-hidden rounded-xl border border-[var(--line)] bg-white">
        <div className="flex items-center justify-between border-b border-[var(--line)] px-5 py-4"><div><h2 className="text-sm font-semibold">Line items</h2><p className="mt-1 text-xs text-[var(--muted)]">Click a line to inspect its requested specifications</p></div><span className="text-xs text-[var(--muted)]">Base currency · INR</span></div>
        <div className="overflow-x-auto"><table className="w-full border-collapse text-left"><thead><tr className="bg-[var(--surface)] text-[10px] uppercase tracking-wider text-[var(--muted)]"><th className="w-24 px-5 py-3 font-semibold">Line</th><th className="px-3 py-3 font-semibold">Requested item</th><th className="w-32 px-3 py-3 font-semibold">Category</th><th className="w-24 px-5 py-3 text-right font-semibold">Quantity</th></tr></thead><tbody>{event.lineItems.map((line) => <LineRow key={line.id} line={line} open={expanded === line.id} onToggle={() => setExpanded(expanded === line.id ? null : line.id)} />)}</tbody></table></div>
      </section>
      <aside className="space-y-4">
        <section className="rounded-xl border border-[var(--line)] bg-white p-5"><div className="mb-4 flex items-center gap-2"><ShieldCheck size={16} /><h2 className="text-sm font-semibold">Qualification gates</h2></div><div className="space-y-4">{event.qualificationQuestions.map((question) => <div key={question.id} className="flex gap-3"><div className={`mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full ${question.hardGate ? 'bg-[var(--ink)] text-white' : 'border border-[var(--line)] text-[var(--muted)]'}`}>{question.hardGate ? <Check size={12} /> : <CircleHelp size={12} />}</div><div><p className="text-xs font-semibold">{question.label}</p><p className="mt-1 text-[11px] leading-4 text-[var(--muted)]">{question.description}</p></div></div>)}</div><div className="mt-5 rounded-lg bg-[var(--surface)] p-3 text-[11px] leading-5 text-[var(--muted)]">Missing hard-gate answers remain <strong className="text-[var(--ink)]">Incomplete</strong>. They are never treated as failed.</div></section>
        <section className="rounded-xl border border-[var(--line)] bg-white p-5"><h2 className="text-sm font-semibold">Invited vendors</h2><div className="mt-4 divide-y divide-[var(--line)]">{event.invitedVendors.map((vendor) => <div key={vendor.id} className="flex items-center justify-between py-3"><div><p className="text-xs font-semibold">{vendor.name}</p><p className="mt-1 text-[10px] text-[var(--muted)]">{vendor.contactName}</p></div><span className="status-pill">{vendor.responseFormat}</span></div>)}</div></section>
      </aside>
    </div>
  </>;
}

function ResponsesView({ event, sent, running, replaying, progress, aiConfigured, sendRfx, retry }: { event: SourcingEvent; sent: boolean; running: boolean; replaying: boolean; progress: Record<string, VendorProgress>; aiConfigured: boolean; sendRfx: () => void; retry: (vendorId: string) => Promise<void> }) {
  if (!sent) return <div className="mx-auto flex min-h-[62vh] max-w-md items-center justify-center text-center"><div><div className="mx-auto flex size-11 items-center justify-center rounded-full border border-[var(--line)] bg-white"><Send size={18} /></div><h1 className="mt-4 text-xl font-semibold">Send the RFx to begin</h1><p className="mt-2 text-sm leading-6 text-[var(--muted)]">Five simulated vendor responses will arrive and be converted into comparable procurement data.</p><button disabled={!aiConfigured} onClick={sendRfx} className="mt-5 rounded-lg bg-[var(--ink)] px-4 py-2.5 text-xs font-semibold text-white disabled:opacity-50">Send RFx to 5 vendors</button></div></div>;
  const complete = Object.values(progress).filter((item) => item.state === 'COMPLETE').length;
  const errors = Object.values(progress).filter((item) => item.state === 'ERROR').length;
  return <div className="mx-auto max-w-5xl">
    <div className="mb-7 flex flex-wrap items-end justify-between gap-4"><div><p className="eyebrow">Supplier responses</p><h1 className="mt-2 text-2xl font-semibold">{running ? (replaying ? 'Replaying the response journey' : 'Processing vendor responses') : errors ? 'Some responses need attention' : 'Responses processed'}</h1><p className="mt-2 text-sm text-[var(--muted)]">{running ? (replaying ? 'Using saved results only · no AI requests or tokens' : 'Responses are processed one vendor at a time to stay within provider limits.') : `${complete} of ${event.invitedVendors.length} responses are ready for comparison.`}</p></div><div className="text-right"><p className="text-2xl font-semibold">{complete}/{event.invitedVendors.length}</p><p className="text-[10px] uppercase tracking-wider text-[var(--muted)]">Completed</p></div></div>
    <div className="overflow-hidden rounded-xl border border-[var(--line)] bg-white">{event.invitedVendors.map((vendor, index) => <VendorResponseRow key={vendor.id} vendor={vendor} progress={progress[vendor.id]} index={index} retry={() => retry(vendor.id)} retryDisabled={running} />)}</div>
    <AuditTrail active={running} />
    <div className="mt-4 flex items-start gap-3 rounded-xl border border-[var(--line)] bg-white p-4"><ShieldCheck className="mt-0.5 shrink-0 text-[var(--green)]" size={16} /><div><p className="text-xs font-semibold">Each result remains inspectable</p><p className="mt-1 text-[11px] leading-5 text-[var(--muted)]">Original values, normalization assumptions, exceptions, and source evidence will remain attached when these responses enter comparison.</p></div></div>
  </div>;
}

function VendorResponseRow({ vendor, progress, index, retry, retryDisabled }: { vendor: SourcingEvent['invitedVendors'][number]; progress: VendorProgress; index: number; retry: () => void; retryDisabled: boolean }) {
  const status = {
    WAITING: { label: 'Waiting', detail: 'Response queued', icon: <Circle size={15} />, className: 'text-[var(--muted)]' },
    PROCESSING: { label: progress.stage === 'EXTRACTING' ? 'Extracting document' : progress.stage === 'MAPPING' ? 'Mapping response' : 'Normalizing prices', detail: progress.stage === 'EXTRACTING' ? 'Reading the supplier file' : progress.stage === 'MAPPING' ? 'Matching quoted items to RFx lines' : 'Applying deterministic pricing rules', icon: <LoaderCircle className="animate-spin" size={15} />, className: 'text-[var(--ink)]' },
    COMPLETE: { label: 'Ready', detail: `${progress.normalizedLines}/30 lines priced · ${progress.exceptionLines} exceptions${progress.cached ? ' · reused validated results' : ''}`, icon: <CheckCircle2 size={15} />, className: 'text-[var(--green)]' },
    ERROR: { label: 'Needs attention', detail: progress.error || 'Processing failed', icon: <AlertCircle size={15} />, className: 'text-[var(--red)]' },
  }[progress.state];
  return <div className={`grid gap-4 border-t border-[var(--line)] px-5 py-4 first:border-t-0 md:grid-cols-[32px_minmax(0,1fr)_120px_minmax(220px,1fr)_auto] md:items-center ${progress.state === 'PROCESSING' ? 'bg-[#fafbf9]' : ''}`}>
    <div className="hidden size-7 items-center justify-center rounded-full bg-[var(--surface)] text-[10px] font-semibold text-[var(--muted)] md:flex">{index + 1}</div>
    <div><p className="text-xs font-semibold">{vendor.name}</p><p className="mt-1 text-[10px] text-[var(--muted)]">{vendor.contactName}</p></div>
    <div className="flex items-center gap-2 text-[11px] text-[var(--muted)]"><FileText size={13} /> {vendor.responseFormat}</div>
    <div className={`flex items-start gap-2 ${status.className}`}>{status.icon}<div><p className="text-xs font-semibold">{status.label}</p><p className="mt-1 line-clamp-2 text-[10px] leading-4 text-[var(--muted)]">{status.detail}</p></div></div>
    {progress.state === 'ERROR' ? <button disabled={retryDisabled} onClick={retry} className="flex items-center gap-1.5 rounded-lg border border-[var(--line-strong)] px-3 py-2 text-[11px] font-semibold disabled:cursor-not-allowed disabled:opacity-45"><RefreshCw size={12} /> Retry</button> : progress.state === 'WAITING' ? <Clock3 size={14} className="text-[var(--muted-light)]" /> : <span />}
  </div>;
}

function Metric({ label, value }: { label: string; value: string }) { return <div><p className="text-[10px] uppercase tracking-wider text-[var(--muted)]">{label}</p><p className="mt-1 text-sm font-semibold">{value}</p></div>; }

function LineRow({ line, open, onToggle }: { line: SourcingEvent['lineItems'][number]; open: boolean; onToggle: () => void }) {
  return <><tr onClick={onToggle} className="cursor-pointer border-t border-[var(--line)] hover:bg-[#fafbf9]"><td className="px-5 py-4 font-mono text-[11px] text-[var(--muted)]">{line.id}</td><td className="px-3 py-4"><div className="flex items-center gap-2 text-xs font-medium">{line.requestedProduct}<ChevronDown size={13} className={`text-[var(--muted)] transition ${open ? 'rotate-180' : ''}`} /></div></td><td className="px-3 py-4 text-[11px] text-[var(--muted)]">{line.category}</td><td className="px-5 py-4 text-right text-xs font-medium">{line.quantity} {line.unit}</td></tr>{open && <tr className="bg-[var(--surface)]"><td /><td colSpan={3} className="px-3 py-4"><div className="grid gap-5 md:grid-cols-2"><div><p className="eyebrow mb-2">Mandatory</p><ul className="space-y-1.5">{line.mandatorySpecifications.map((spec) => <li key={spec} className="flex gap-2 text-[11px] text-[var(--muted)]"><Check size={12} className="mt-0.5 text-[var(--green)]" />{spec}</li>)}</ul></div><div><p className="eyebrow mb-2">Optional</p><ul className="space-y-1.5">{line.optionalSpecifications.map((spec) => <li key={spec} className="text-[11px] text-[var(--muted)]">{spec}</li>)}</ul></div></div></td></tr>}</>;
}

function EmptyTab({ tab }: { tab: 'Comparison' | 'Analysis' }) { return <div className="flex min-h-[60vh] items-center justify-center"><div className="max-w-sm text-center"><p className="eyebrow">Available after processing</p><h2 className="mt-3 text-xl font-semibold">{tab} workspace</h2><p className="mt-2 text-sm leading-6 text-[var(--muted)]">Process supplier responses first. This workspace will then use their normalized, validated data.</p></div></div>; }
