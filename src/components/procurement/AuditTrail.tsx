'use client';

import { useEffect, useState } from 'react';
import { CheckCircle2, ChevronDown, Clock3, LoaderCircle } from 'lucide-react';
import type { AuditEvent } from '@/lib/demo/audit-trail';

export default function AuditTrail({ active }: { active: boolean }) {
  const [events, setEvents] = useState<AuditEvent[]>([]);
  const [expanded, setExpanded] = useState(false);

  useEffect(() => {
    let disposed = false;
    async function load() {
      const response = await fetch('/api/demo/audit', { cache: 'no-store' });
      if (!response.ok) return;
      const payload = await response.json() as { events: AuditEvent[] };
      if (!disposed) setEvents(payload.events);
    }
    void load();
    if (!active) return () => { disposed = true; };
    const timer = setInterval(() => void load(), 1_500);
    return () => { disposed = true; clearInterval(timer); };
  }, [active]);

  if (!events.length) return null;
  const shown = expanded ? events : events.slice(0, 5);
  return <section className="mt-5 overflow-hidden rounded-xl border border-[var(--line)] bg-white">
    <div className="flex items-center justify-between border-b border-[var(--line)] px-4 py-3 sm:px-5"><div><h2 className="text-xs font-semibold">Decision history</h2><p className="mt-1 text-[10px] text-[var(--muted)]">What happened, when, and who retained control</p></div>{active && <span className="flex items-center gap-1.5 text-[10px] text-[var(--muted)]"><LoaderCircle className="animate-spin" size={11} /> Updating</span>}</div>
    <ol className="divide-y divide-[var(--line)]">{shown.map((event) => <li key={event.id} className="flex gap-3 px-4 py-3 sm:px-5"><div className="mt-0.5 text-[var(--green)]">{event.kind === 'DECISION' ? <CheckCircle2 size={14} /> : <Clock3 size={14} />}</div><div className="min-w-0 flex-1"><div className="flex flex-wrap items-baseline justify-between gap-1"><p className="text-[11px] font-semibold">{event.title}</p><time className="text-[9px] text-[var(--muted-light)]">{new Intl.DateTimeFormat('en-IN', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }).format(new Date(event.at))}</time></div><p className="mt-1 text-[10px] leading-4 text-[var(--muted)]">{event.detail}</p></div></li>)}</ol>
    {events.length > 5 && <button onClick={() => setExpanded((value) => !value)} className="flex w-full items-center justify-center gap-1.5 border-t border-[var(--line)] px-4 py-3 text-[10px] font-semibold text-[var(--muted)] hover:bg-[var(--surface)]">{expanded ? 'Show recent only' : `Show all ${events.length} events`}<ChevronDown size={11} className={expanded ? 'rotate-180' : ''} /></button>}
  </section>;
}
