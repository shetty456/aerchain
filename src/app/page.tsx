import Link from 'next/link';
import { ArrowRight, PackageSearch, ShieldCheck } from 'lucide-react';

export default function HomePage() {
  const proof = ['Messy responses become normalized data', 'Uncertainty remains visible and traceable', 'Qualification gates control eligibility', 'AI clarifies facts; buyers retain judgment', 'Award calculations remain deterministic'];
  return <main className="min-h-screen bg-[var(--surface)] text-[var(--ink)]">
    <header className="border-b border-[var(--line)] bg-white/90"><div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-6"><div className="flex items-center gap-3"><div className="flex size-8 items-center justify-center rounded-lg bg-[var(--ink)] text-sm font-semibold text-white">A</div><span className="text-sm font-semibold">Aerchain</span></div><div className="flex items-center gap-2 text-xs text-[var(--muted)]"><span className="size-2 rounded-full bg-emerald-500" /> Demo workspace</div></div></header>
    <section className="mx-auto max-w-6xl px-6 pb-24 pt-20">
      <div className="max-w-3xl"><p className="eyebrow">AI-native procurement</p><h1 className="mt-4 text-4xl font-semibold tracking-[-0.04em] sm:text-5xl">Turn supplier quotes into a decision you can defend.</h1><p className="mt-5 max-w-2xl text-base leading-7 text-[var(--muted)]">Review a complete sourcing event from heterogeneous vendor responses through normalization, clarification, analysis, and award recommendation.</p></div>
      <div className="mt-12 grid gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
        <Link href="/events/windows-hardware-fy27" className="group rounded-2xl border border-[var(--line-strong)] bg-white p-7 transition hover:border-[var(--ink)] hover:shadow-lg"><div className="flex items-start justify-between"><div className="flex size-11 items-center justify-center rounded-xl bg-[var(--surface)]"><PackageSearch size={20} /></div><span className="status-pill status-ready">Showcase ready</span></div><p className="eyebrow mt-10">IT Hardware RFx</p><h2 className="mt-2 text-xl font-semibold">Windows Hardware FY27</h2><p className="mt-3 max-w-xl text-sm leading-6 text-[var(--muted)]">30 RFx lines · 5 vendors · Excel, PDF, Word, photographed rate card, and email responses · INR normalization.</p><div className="mt-7 flex items-center gap-2 text-sm font-semibold">Open sourcing event <ArrowRight className="transition group-hover:translate-x-1" size={15} /></div></Link>
        <aside className="rounded-2xl border border-[var(--line)] bg-white p-6"><div className="flex items-center gap-2"><ShieldCheck className="text-[var(--green)]" size={17} /><h2 className="text-sm font-semibold">What this demo proves</h2></div><ol className="mt-5 space-y-4">{proof.map((item,index)=><li key={item} className="flex gap-3 text-xs leading-5 text-[var(--muted)]"><span className="flex size-5 shrink-0 items-center justify-center rounded-full bg-[var(--surface)] text-[10px] font-semibold text-[var(--ink)]">{index+1}</span>{item}</li>)}</ol></aside>
      </div>
    </section>
  </main>;
}
