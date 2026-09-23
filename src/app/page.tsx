import Link from 'next/link';
import { ArrowRight, Clock3, PackageSearch, Plane, RotateCcw, Sparkles } from 'lucide-react';

const templates = [
  { name: 'IT Hardware RFx', description: 'Laptops, displays, workplace accessories', icon: PackageSearch, active: true },
  { name: 'Packaging RFx', description: 'Corrugate, labels, and protective packaging', icon: RotateCcw, active: false },
  { name: 'Freight RFx', description: 'Lane rates, SLAs, and accessorials', icon: Plane, active: false },
];

export default function HomePage() {
  return (
    <main className="min-h-screen bg-[var(--surface)] text-[var(--ink)]">
      <header className="border-b border-[var(--line)] bg-white/90 backdrop-blur">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-6">
          <div className="flex items-center gap-3"><div className="flex size-8 items-center justify-center rounded-lg bg-[var(--ink)] text-sm font-semibold text-white">A</div><span className="text-sm font-semibold tracking-tight">Aerchain</span></div>
          <div className="flex items-center gap-2 text-xs text-[var(--muted)]"><span className="size-2 rounded-full bg-emerald-500" /> Demo workspace</div>
        </div>
      </header>
      <section className="mx-auto max-w-4xl px-6 pb-14 pt-24 text-center">
        <div className="mx-auto mb-7 flex w-fit items-center gap-2 rounded-full border border-[var(--line)] bg-white px-3 py-1.5 text-xs font-medium text-[var(--muted)]"><Sparkles size={13} /> Procurement copilot</div>
        <h1 className="text-balance text-4xl font-semibold tracking-[-0.04em] sm:text-5xl">What are you sourcing?</h1>
        <p className="mx-auto mt-5 max-w-2xl text-base leading-7 text-[var(--muted)]">Turn inconsistent supplier responses into an inspectable comparison—without rebuilding the event in a spreadsheet.</p>
        <div className="mx-auto mt-9 flex max-w-2xl items-center rounded-2xl border border-[var(--line-strong)] bg-white p-2 shadow-[0_14px_40px_rgba(22,28,25,0.07)]"><input aria-label="Describe what you are sourcing" className="min-w-0 flex-1 bg-transparent px-4 py-3 text-sm outline-none placeholder:text-[#9a9d98]" placeholder="Describe the goods or services you need…" /><button className="rounded-xl bg-[var(--ink)] px-4 py-3 text-sm font-medium text-white">Start event</button></div>
        <p className="mt-3 text-xs text-[var(--muted-light)]">Conversational RFx creation is represented by templates in this prototype.</p>
      </section>
      <section className="mx-auto max-w-6xl px-6 pb-16">
        <div className="mb-5 flex items-end justify-between"><div><p className="eyebrow">Start from a template</p><h2 className="mt-2 text-xl font-semibold tracking-tight">Common sourcing events</h2></div><span className="text-xs text-[var(--muted)]">1 template ready</span></div>
        <div className="grid gap-3 md:grid-cols-3">
          {templates.map(({ name, description, icon: Icon, active }) => {
            const body = <><div className="mb-8 flex items-start justify-between"><div className="flex size-10 items-center justify-center rounded-xl border border-[var(--line)] bg-[var(--surface)]"><Icon size={18} /></div>{active ? <span className="status-pill status-ready">Ready</span> : <span className="status-pill">Soon</span>}</div><h3 className="text-sm font-semibold">{name}</h3><p className="mt-2 text-sm leading-6 text-[var(--muted)]">{description}</p>{active && <div className="mt-6 flex items-center gap-1 text-xs font-semibold">Open template <ArrowRight size={13} /></div>}</>;
            return active ? <Link key={name} href="/events/windows-hardware-fy27" className="group rounded-2xl border border-[var(--line-strong)] bg-white p-5 transition hover:-translate-y-0.5 hover:shadow-lg">{body}</Link> : <div key={name} className="rounded-2xl border border-[var(--line)] bg-white/60 p-5 text-[var(--muted)]">{body}</div>;
          })}
        </div>
      </section>
      <section className="mx-auto max-w-6xl px-6 pb-24"><p className="eyebrow mb-4">Recent sourcing events</p><Link href="/events/windows-hardware-fy27" className="flex items-center justify-between rounded-xl border border-[var(--line)] bg-white px-5 py-4 hover:border-[var(--line-strong)]"><div><div className="flex items-center gap-3"><span className="text-sm font-semibold">Windows Hardware FY27</span><span className="status-pill">Draft</span></div><p className="mt-1 text-xs text-[var(--muted)]">30 lines · 5 invited vendors · INR</p></div><div className="flex items-center gap-2 text-xs text-[var(--muted)]"><Clock3 size={14} /> Updated today <ArrowRight size={14} /></div></Link></section>
    </main>
  );
}
