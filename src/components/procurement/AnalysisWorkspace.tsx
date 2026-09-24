"use client";

import { useEffect, useRef, useState } from "react";
import { ArrowUp, Bot, LoaderCircle, Trash2, User } from "lucide-react";

const suggestions = [
  "Which vendors passed qualification?",
  "Show me the cheapest qualified vendor for each line item.",
  "How much do we save with a split award compared with giving everything to the cheapest qualified single vendor?",
];
const money = new Intl.NumberFormat("en-IN", {
  style: "currency",
  currency: "INR",
  maximumFractionDigits: 0,
});

export default function AnalysisWorkspace() {
  const [question, setQuestion] = useState("");
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [restored, setRestored] = useState(false);
  const [contextVersion, setContextVersion] = useState<string | null>(null);
  const [dataChanged, setDataChanged] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const endRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    let disposed = false;
    fetch("/api/demo/analysis", { cache: "no-store" })
      .then(async (response) => { const payload = await response.json(); if (!response.ok) throw new Error(payload.error); return payload as { version: string }; })
      .then(({ version }) => {
        if (disposed) return;
        const previousVersion = localStorage.getItem("aerchain-analysis-current-version");
        const storageKey = `aerchain-analysis-chat-v2-${version}`;
        try { setMessages(JSON.parse(localStorage.getItem(storageKey) ?? "[]")); } catch { setMessages([]); }
        setDataChanged(Boolean(previousVersion && previousVersion !== version));
        setContextVersion(version);
        setRestored(true);
        localStorage.setItem("aerchain-analysis-current-version", version);
        localStorage.removeItem("aerchain-analysis-chat-v1");
      })
      .catch(() => {
        if (disposed) return;
        setContextVersion("current"); setRestored(true);
      });
    return () => { disposed = true; };
  }, []);
  useEffect(() => {
    if (restored && contextVersion) localStorage.setItem(`aerchain-analysis-chat-v2-${contextVersion}`, JSON.stringify(messages));
    endRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }, [messages, restored, contextVersion]);
  async function ask(value = question) {
    if (!value.trim() || loading || !restored) return;
    const asked = value.trim();
    setDataChanged(false);
    setMessages((current) => [...current, { id: crypto.randomUUID(), role: "user", text: asked }]);
    setQuestion("");
    setLoading(true);
    setError(null);
    try {
      const response = await fetch("/api/demo/analysis", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question: asked }),
      });
      const payload = await response.json();
      if (payload.code === "AI_RATE_LIMIT" || payload.rateLimit) {
        window.dispatchEvent(new CustomEvent("aerchain:ai-rate-limit", { detail: { retryAfterSeconds: payload.retryAfterSeconds ?? payload.rateLimit?.retryAfterSeconds ?? 60 } }));
      }
      if (!response.ok) throw new Error(payload.error || "Analysis failed.");
      setMessages((current) => [...current, { id: crypto.randomUUID(), role: "assistant", answer: payload }]);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Analysis failed.");
    } finally {
      setLoading(false);
    }
  }
  return (
    <div className="mx-auto max-w-3xl">
      {dataChanged && <div className="mb-5 rounded-xl border border-blue-200 bg-blue-50 p-4 text-xs leading-5 text-blue-900"><p className="font-semibold">Supplier data has changed</p><p className="mt-1">This is a new analysis conversation. Earlier answers were based on the previous comparison and are not shown as current results.</p></div>}
      {messages.length === 0 ? <div className="flex min-h-[48vh] flex-col justify-center text-center"><div className="mx-auto flex size-10 items-center justify-center rounded-full border border-[var(--line)] bg-white"><Bot size={17} /></div><h1 className="mt-4 text-xl font-semibold sm:text-2xl">What do you want to know?</h1><p className="mx-auto mt-2 max-w-lg text-sm leading-6 text-[var(--muted)]">Ask about suppliers, prices, exceptions, or award scenarios. Calculations use the normalized comparison—not model arithmetic.</p><div className="mx-auto mt-6 grid w-full max-w-2xl gap-2 text-left sm:grid-cols-3">
        {suggestions.map((item) => (
          <button
            key={item}
            onClick={() => void ask(item)}
            className="rounded-xl border border-[var(--line)] bg-white p-3 text-left text-[11px] leading-5 hover:border-[var(--line-strong)]"
          >
            {item}
          </button>
        ))}
      </div></div> : <><div className="flex items-center justify-between gap-4 border-b border-[var(--line)] pb-3"><div><p className="text-sm font-semibold">Analysis</p><p className="mt-0.5 text-[10px] text-[var(--muted)]">Answers from normalized supplier data</p></div><button onClick={() => { setMessages([]); setError(null); }} className="flex shrink-0 items-center gap-1.5 rounded-lg px-2 py-2 text-[10px] font-semibold text-[var(--muted)] hover:bg-white"><Trash2 size={12} /> New conversation</button></div><div className="mt-5 space-y-6" aria-live="polite">{messages.map((message) => message.role === "user" ? <div key={message.id} className="flex justify-end gap-2"><div className="max-w-[88%] rounded-2xl rounded-br-md bg-[var(--ink)] px-4 py-3 text-sm leading-6 text-white sm:max-w-[75%]">{message.text}</div><div className="mt-1 hidden size-7 shrink-0 items-center justify-center rounded-full bg-[var(--ink)] text-white sm:flex"><User size={13} /></div></div> : <div key={message.id} className="flex items-start gap-2 sm:gap-3"><div className="mt-1 flex size-7 shrink-0 items-center justify-center rounded-full border border-[var(--line)] bg-white"><Bot size={13} /></div><ResultCard answer={message.answer} onFollowUp={(value) => void ask(value)} /></div>)}{loading && <div className="flex items-center gap-3 text-xs text-[var(--muted)]"><div className="flex size-7 items-center justify-center rounded-full border border-[var(--line)] bg-white"><LoaderCircle className="animate-spin" size={13} /></div>Calculating from normalized responses…</div>}<div ref={endRef} /></div></>}
      <div className="sticky bottom-3 z-10 mt-5 flex items-end rounded-xl border border-[var(--line-strong)] bg-white p-2 shadow-[0_8px_30px_rgba(31,35,32,0.10)]">
        <textarea
          value={question}
          onChange={(event) => setQuestion(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter" && !event.shiftKey) { event.preventDefault(); void ask(); }
          }}
          placeholder="Ask about qualification, pricing, unresolved items, or award scenarios…"
          rows={1}
          className="max-h-32 min-h-10 min-w-0 flex-1 resize-none bg-transparent px-3 py-2.5 text-sm outline-none"
        />
        <button
          onClick={() => void ask()}
          disabled={loading || !restored}
          className="flex size-10 items-center justify-center rounded-lg bg-[var(--ink)] text-white disabled:opacity-50"
        >
          {loading ? (
            <LoaderCircle className="animate-spin" size={15} />
          ) : (
            <ArrowUp size={15} />
          )}
        </button>
      </div>
      {error && <p className="mt-3 text-xs text-[var(--red)]">{error}</p>}
    </div>
  );
}

function ResultCard({
  answer,
  onFollowUp,
}: {
  answer: AnalysisAnswer;
  onFollowUp: (value: string) => void;
}) {
  const result = answer.result;
  const operation = String(result.operation);
  return (
    <section className="min-w-0 flex-1 py-1">
      {answer.explanation?.answer && <p className="text-sm leading-6 text-[var(--ink)]">{answer.explanation.answer}</p>}
      {!answer.explanation && answer.explanationError && <p className="text-xs text-[var(--muted)]">The calculated result is available below; the AI explanation could not be generated.</p>}
      <div className={`${answer.explanation?.answer ? "mt-4" : ""} text-sm leading-6 text-[var(--muted)]`}>
        {operation === "QUALIFIED_VENDORS" && (
          <SimpleTable headers={["Vendor", "Status"]} rows={((result.vendors as Array<{ vendor: string; status: string }>) ?? []).map((item) => [item.vendor, item.status])} />
        )}
        {operation === "CHEAPEST_OVERALL" && (
          <p>
            {result.cheapest ? (
              <>
                <strong className="text-[var(--ink)]">
                  {(result.cheapest as { vendor: string }).vendor}
                </strong>{" "}
                is the cheapest qualified vendor covering all lines at{" "}
                {money.format((result.cheapest as { total: number }).total)}.
              </>
            ) : (
              String(result.caveat)
            )}
          </p>
        )}
        {operation === "UNRESOLVED_ITEMS" && (
          <><p><strong className="text-[var(--ink)]">{String(result.count)}</strong> vendor-line responses remain unresolved or ineligible.</p><SimpleTable headers={["Line", "Vendor", "Status"]} rows={((result.unresolved as Array<{ lineId: string; item: string; vendor: string; status: string }>) ?? []).slice(0, 5).map((item) => [`${item.lineId} · ${item.item}`, item.vendor, item.status])} /></>
        )}
        {operation === "SPLIT_AWARD_SAVINGS" && (
          <p>
            {result.savings !== null ? (
              <>
                A split award totals{" "}
                <strong className="text-[var(--ink)]">
                  {money.format(Number(result.splitTotal))}
                </strong>{" "}
                and saves{" "}
                <strong className="text-[var(--green)]">
                  {money.format(Number(result.savings))}
                </strong>{" "}
                versus the cheapest qualified complete vendor.
              </>
            ) : (
              String(result.caveat)
            )}
          </p>
        )}
        {operation === "CHEAPEST_QUALIFIED_PER_LINE" && (
          <>
            <p>
              The eligible split award totals{" "}
              <strong className="text-[var(--ink)]">
                {money.format(Number(result.total))}
              </strong>
              . {String(result.unawardedLines)} lines remain unawarded.
            </p>
            <ResultTable
              selections={
                result.selections as Array<{
                  lineId: string;
                  item: string;
                  vendor: string;
                  unitPrice: number;
                } | null>
              }
            />
          </>
        )}
        {operation === "SUMMARY" && (
          <p>
            {String(result.qualified)} qualified vendors;{" "}
            {String(result.unresolved)} unresolved vendor-line responses.
          </p>
        )}
        {(operation === "VENDOR_COMPARISON") && <SimpleTable headers={["Vendor", "Eligible total", "Coverage"]} rows={((result.vendorTotals as Array<{ vendor: string; total: number; coveredLines: number; complete: boolean }>) ?? []).slice(0, 5).map((item) => [item.vendor, money.format(item.total), `${item.coveredLines} lines${item.complete ? " · Complete" : ""}`])} />}
        {operation === "CATEGORY_SUMMARY" && <SimpleTable headers={["Category", "Split spend", "Unawarded"]} rows={((result.categories as Array<{ category: string; eligibleSplitSpend: number; unawardedLines: number }>) ?? []).slice(0, 5).map((item) => [item.category, money.format(item.eligibleSplitSpend), String(item.unawardedLines)])} />}
        {operation === "LINE_DETAIL" && <LineDetail lines={(result.lines as LineDetailResult[]) ?? []} />}
        {operation === "COMMERCIAL_TERMS" && <CommercialTerms vendors={(result.vendors as CommercialVendor[]) ?? []} />}
      </div>
      {answer.explanation?.caveats?.length ? <div className="mt-4 rounded-lg bg-[var(--surface)] p-3 text-[11px] leading-5 text-[var(--muted)]"><strong className="text-[var(--ink)]">Keep in mind:</strong> {answer.explanation.caveats.join(" ")}</div> : null}
      {answer.explanation?.followUps?.length ? <div className="mt-4 flex flex-wrap gap-2">{answer.explanation.followUps.map((item) => <button key={item} onClick={() => onFollowUp(item)} className="rounded-full border border-[var(--line)] px-3 py-2 text-left text-[10px] font-semibold hover:border-[var(--line-strong)]">{item}</button>)}</div> : null}
      <p className="mt-4 border-t border-[var(--line)] pt-3 text-[9px] uppercase tracking-[0.12em] text-[var(--muted)]">{answer.calculatedBy ?? "Deterministic procurement tools"}{answer.cached ? " · Cached" : ""}</p>
    </section>
  );
}

type AnalysisAnswer = { question: string; result: Record<string, unknown>; explanation?: { answer: string; caveats: string[]; followUps: string[] } | null; explanationError?: string; calculatedBy?: string; cached?: boolean };
type ChatMessage = { id: string; role: "user"; text: string } | { id: string; role: "assistant"; answer: AnalysisAnswer };
type LineDetailResult = { lineId: string; item: string; quotes: Array<{ vendor: string; qualification: string; unitPrice: number | null; status: string }> };
type CommercialVendor = { vendor: string; qualification: string; terms: { freight?: string; paymentTerms?: string | null; deliveryLeadTimeDays?: number | null; warrantyMonths?: number | null; discountPercent?: number | null } };

function SimpleTable({ headers, rows }: { headers: string[]; rows: string[][] }) {
  if (!rows.length) return <p className="mt-3 text-xs">No matching records.</p>;
  return <div className="mt-3 overflow-x-auto rounded-lg border border-[var(--line)]"><table className="w-full min-w-[480px] text-left text-[11px]"><thead className="bg-[var(--surface)]"><tr>{headers.map((header) => <th key={header} className="px-3 py-2 font-semibold">{header}</th>)}</tr></thead><tbody>{rows.map((row, index) => <tr key={`${row[0]}-${index}`} className="border-t border-[var(--line)]">{row.map((cell, cellIndex) => <td key={cellIndex} className="px-3 py-2 align-top">{cell}</td>)}</tr>)}</tbody></table></div>;
}

function LineDetail({ lines }: { lines: LineDetailResult[] }) {
  const rows = lines.slice(0, 3).flatMap((line) => line.quotes.slice(0, 5).map((quote) => [`${line.lineId} · ${line.item}`, quote.vendor, quote.unitPrice === null ? "—" : money.format(quote.unitPrice), quote.status]));
  return <SimpleTable headers={["Line", "Vendor", "Unit price", "Status"]} rows={rows} />;
}

function CommercialTerms({ vendors }: { vendors: CommercialVendor[] }) {
  return <SimpleTable headers={["Vendor", "Freight", "Payment", "Delivery", "Warranty"]} rows={vendors.slice(0, 5).map((item) => [item.vendor, item.terms.freight ?? "UNKNOWN", item.terms.paymentTerms ?? "—", item.terms.deliveryLeadTimeDays ? `${item.terms.deliveryLeadTimeDays} days` : "—", item.terms.warrantyMonths ? `${item.terms.warrantyMonths} months` : "—"])} />;
}

function ResultTable({
  selections,
}: {
  selections: Array<{
    lineId: string;
    item: string;
    vendor: string;
    unitPrice: number;
  } | null>;
}) {
  const rows = selections.filter(Boolean).slice(0, 5);
  return (
    <div className="mt-4 overflow-x-auto rounded-lg border border-[var(--line)]">
      <table className="w-full min-w-[520px] text-left text-[11px]">
        <thead className="bg-[var(--surface)]">
          <tr>
            <th className="px-3 py-2">Line</th>
            <th className="px-3 py-2">Selected vendor</th>
            <th className="px-3 py-2 text-right">Unit price</th>
          </tr>
        </thead>
        <tbody>
          {rows.map(
            (item) =>
              item && (
                <tr key={item.lineId} className="border-t border-[var(--line)]">
                  <td className="px-3 py-2">
                    {item.lineId} · {item.item}
                  </td>
                  <td className="px-3 py-2">{item.vendor}</td>
                  <td className="px-3 py-2 text-right">
                    {money.format(item.unitPrice)}
                  </td>
                </tr>
              ),
          )}
        </tbody>
      </table>
      <p className="border-t border-[var(--line)] px-3 py-2 text-[10px] text-[var(--muted)]">
        Showing top {rows.length} lines. The full allocation is retained for the
        award recommendation.
      </p>
    </div>
  );
}
