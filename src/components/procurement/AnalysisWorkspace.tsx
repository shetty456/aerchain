'use client';

import { useState } from 'react';
import { ArrowUp, LoaderCircle } from 'lucide-react';

const suggestions = ['Which vendors passed qualification?', 'Which vendor is cheapest overall?', 'Show me the cheapest qualified vendor for each line item.', 'What items are still unresolved?', 'How much do we save with a split award compared with giving everything to the cheapest qualified single vendor?'];
const money = new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 });

export default function AnalysisWorkspace() {
  const [question, setQuestion] = useState('');
  const [answer, setAnswer] = useState<{ question: string; result: Record<string, unknown> } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  async function ask(value = question) {
    if (!value.trim() || loading) return;
    setQuestion(value); setLoading(true); setError(null);
    try {
      const response = await fetch('/api/demo/analysis', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ question: value }) });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || 'Analysis failed.');
      setAnswer(payload);
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'Analysis failed.'); }
    finally { setLoading(false); }
  }
  return <div className="mx-auto max-w-5xl"><div><p className="eyebrow">Procurement analyst</p><h1 className="mt-2 text-2xl font-semibold">Ask about this sourcing event</h1><p className="mt-2 text-sm text-[var(--muted)]">AI interprets the question. Qualification rules and arithmetic run deterministically over normalized data.</p></div><div className="mt-6 flex flex-wrap gap-2">{suggestions.map((item) => <button key={item} onClick={() => void ask(item)} className="rounded-full border border-[var(--line)] bg-white px-3 py-2 text-[11px] hover:border-[var(--line-strong)]">{item}</button>)}</div><div className="mt-5 flex rounded-xl border border-[var(--line-strong)] bg-white p-2"><input value={question} onChange={(event) => setQuestion(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter') void ask(); }} placeholder="Ask about qualification, pricing, unresolved items, or award scenarios…" className="min-w-0 flex-1 bg-transparent px-3 text-sm outline-none" /><button onClick={() => void ask()} disabled={loading} className="flex size-10 items-center justify-center rounded-lg bg-[var(--ink)] text-white disabled:opacity-50">{loading ? <LoaderCircle className="animate-spin" size={15} /> : <ArrowUp size={15} />}</button></div>{error && <p className="mt-3 text-xs text-[var(--red)]">{error}</p>}{answer && <ResultCard answer={answer} />}</div>;
}

function ResultCard({ answer }: { answer: { question: string; result: Record<string, unknown> } }) {
  const result = answer.result;
  const operation = String(result.operation);
  return <section className="mt-6 rounded-xl border border-[var(--line)] bg-white p-5"><p className="text-xs font-semibold">{answer.question}</p><div className="mt-4 text-sm leading-6 text-[var(--muted)]">{operation === 'QUALIFIED_VENDORS' && <p><strong className="text-[var(--ink)]">Qualified:</strong> {((result.qualified as string[]) ?? []).join(', ') || 'None'}</p>}{operation === 'CHEAPEST_OVERALL' && <p>{result.cheapest ? <><strong className="text-[var(--ink)]">{(result.cheapest as { vendor: string }).vendor}</strong> is the cheapest qualified vendor covering all lines at {money.format((result.cheapest as { total: number }).total)}.</> : String(result.caveat)}</p>}{operation === 'UNRESOLVED_ITEMS' && <p><strong className="text-[var(--ink)]">{String(result.count)}</strong> vendor-line responses remain unresolved or ineligible.</p>}{operation === 'SPLIT_AWARD_SAVINGS' && <p>{result.savings !== null ? <>A split award totals <strong className="text-[var(--ink)]">{money.format(Number(result.splitTotal))}</strong> and saves <strong className="text-[var(--green)]">{money.format(Number(result.savings))}</strong> versus the cheapest qualified complete vendor.</> : String(result.caveat)}</p>}{operation === 'CHEAPEST_QUALIFIED_PER_LINE' && <><p>The eligible split award totals <strong className="text-[var(--ink)]">{money.format(Number(result.total))}</strong>. {String(result.unawardedLines)} lines remain unawarded.</p><ResultTable selections={result.selections as Array<{ lineId: string; item: string; vendor: string; unitPrice: number } | null>} /></>}{operation === 'SUMMARY' && <p>{String(result.qualified)} qualified vendors; {String(result.unresolved)} unresolved vendor-line responses.</p>}</div></section>;
}

function ResultTable({ selections }: { selections: Array<{ lineId: string; item: string; vendor: string; unitPrice: number } | null> }) { return <div className="mt-4 max-h-80 overflow-auto rounded-lg border border-[var(--line)]"><table className="w-full text-left text-[11px]"><thead className="sticky top-0 bg-[var(--surface)]"><tr><th className="px-3 py-2">Line</th><th className="px-3 py-2">Selected vendor</th><th className="px-3 py-2 text-right">Unit price</th></tr></thead><tbody>{selections.filter(Boolean).map((item) => item && <tr key={item.lineId} className="border-t border-[var(--line)]"><td className="px-3 py-2">{item.lineId} · {item.item}</td><td className="px-3 py-2">{item.vendor}</td><td className="px-3 py-2 text-right">{money.format(item.unitPrice)}</td></tr>)}</tbody></table></div>; }
