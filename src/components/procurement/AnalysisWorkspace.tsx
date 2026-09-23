"use client";

import { useEffect, useRef, useState } from "react";
import { ArrowUp, Bot, Download, LoaderCircle, Trash2, User } from "lucide-react";

const suggestions = [
  "Which vendors passed qualification?",
  "Which vendor is cheapest overall?",
  "Show me the cheapest qualified vendor for each line item.",
  "What items are still unresolved?",
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
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const endRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    queueMicrotask(() => {
      try { setMessages(JSON.parse(localStorage.getItem("aerchain-analysis-chat-v1") ?? "[]")); } catch { setMessages([]); }
      setRestored(true);
    });
  }, []);
  useEffect(() => {
    if (restored) localStorage.setItem("aerchain-analysis-chat-v1", JSON.stringify(messages));
    endRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }, [messages, restored]);
  async function ask(value = question) {
    if (!value.trim() || loading) return;
    const asked = value.trim();
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
      if (!response.ok) throw new Error(payload.error || "Analysis failed.");
      setMessages((current) => [...current, { id: crypto.randomUUID(), role: "assistant", answer: payload }]);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Analysis failed.");
    } finally {
      setLoading(false);
    }
  }
  return (
    <div className="mx-auto max-w-5xl">
      <div>
        <div className="flex items-start justify-between gap-4"><div><p className="eyebrow">Procurement analyst</p><h1 className="mt-2 text-xl font-semibold sm:text-2xl">Ask about this sourcing event</h1><p className="mt-2 text-sm text-[var(--muted)]">Ask naturally. Every number is calculated from normalized supplier responses.</p></div>{messages.length > 0 && <button onClick={() => { setMessages([]); setError(null); }} className="flex shrink-0 items-center gap-1.5 rounded-lg border border-[var(--line)] px-3 py-2 text-[10px] font-semibold text-[var(--muted)]"><Trash2 size={12} /> Clear</button>}</div>
      </div>
      {messages.length === 0 && <><p className="eyebrow mt-6">Try a common question</p><div className="mt-3 flex gap-2 overflow-x-auto pb-1 sm:flex-wrap">
        {suggestions.map((item) => (
          <button
            key={item}
            onClick={() => void ask(item)}
            className="shrink-0 rounded-full border border-[var(--line)] bg-white px-3 py-2 text-[11px] hover:border-[var(--line-strong)]"
          >
            {item}
          </button>
        ))}
      </div></>}
      {messages.length > 0 && <div className="mt-6 space-y-5" aria-live="polite">{messages.map((message) => message.role === "user" ? <div key={message.id} className="flex justify-end gap-2"><div className="max-w-[88%] rounded-2xl rounded-br-md bg-[var(--ink)] px-4 py-3 text-sm leading-6 text-white sm:max-w-[75%]">{message.text}</div><div className="mt-1 hidden size-7 shrink-0 items-center justify-center rounded-full bg-[var(--ink)] text-white sm:flex"><User size={13} /></div></div> : <div key={message.id} className="flex items-start gap-2 sm:gap-3"><div className="mt-1 flex size-7 shrink-0 items-center justify-center rounded-full border border-[var(--line)] bg-white"><Bot size={13} /></div><ResultCard answer={message.answer} onFollowUp={(value) => void ask(value)} /></div>)}{loading && <div className="flex items-center gap-3 text-xs text-[var(--muted)]"><div className="flex size-7 items-center justify-center rounded-full border border-[var(--line)] bg-white"><LoaderCircle className="animate-spin" size={13} /></div>Calculating from normalized responses…</div>}<div ref={endRef} /></div>}
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
          disabled={loading}
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
      <AwardPanel />
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
    <section className="min-w-0 flex-1 rounded-xl border border-[var(--line)] bg-white p-4 sm:p-5">
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

type Award = {
  status: "DRAFT" | "ACCEPTED";
  totalSpend: number;
  savings?: number;
  unawardedLines: number;
  unawardedLineIds?: string[];
  spendByVendor: Array<{ vendor: string; spend: number; lines: number }>;
};
function AwardPanel() {
  const [award, setAward] = useState<Award | null>(null);
  const [busy, setBusy] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    fetch("/api/demo/award")
      .then((response) => response.json())
      .then((payload) => setAward(payload.award))
      .catch(() => undefined);
  }, []);
  async function mutate(method: "POST" | "PUT") {
    setBusy(true);
    setError(null);
    try {
      const response = await fetch("/api/demo/award", { method });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error);
      setAward(payload.award);
    } catch (reason) {
      setError(
        reason instanceof Error ? reason.message : "Award action failed.",
      );
    } finally {
      setBusy(false);
    }
  }
  async function exportPdf() {
    setExporting(true);
    setError(null);
    try {
      const response = await fetch("/api/demo/award/pdf");
      if (!response.ok) { const payload = await response.json(); throw new Error(payload.error || "PDF export failed."); }
      const url = URL.createObjectURL(await response.blob());
      const link = document.createElement("a");
      link.href = url; link.download = "windows-hardware-fy27-award-recommendation.pdf"; link.click();
      URL.revokeObjectURL(url);
    } catch (reason) { setError(reason instanceof Error ? reason.message : "PDF export failed."); }
    finally { setExporting(false); }
  }
  return (
    <section className="mt-6 rounded-xl border border-[var(--line-strong)] bg-white p-5">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="eyebrow">Buyer decision</p>
          <h2 className="mt-2 text-lg font-semibold">Award recommendation</h2>
          <p className="mt-1 text-xs leading-5 text-[var(--muted)]">
            Create a deterministic split-award draft, review its caveats, then
            explicitly accept it before export.
          </p>
        </div>
        <div className="flex w-full flex-wrap gap-2 sm:w-auto">
          {award?.status === "DRAFT" && (
            <button
              disabled={busy}
              onClick={() => void mutate("POST")}
              className="rounded-lg border border-[var(--line-strong)] px-4 py-2.5 text-xs font-semibold disabled:opacity-50"
            >
              Recalculate
            </button>
          )}
          {!award ? (
            <button
              disabled={busy}
              onClick={() => void mutate("POST")}
              className="rounded-lg bg-[var(--ink)] px-4 py-2.5 text-xs font-semibold text-white disabled:opacity-50"
            >
              {busy ? "Creating…" : "Create recommendation"}
            </button>
          ) : award.status === "DRAFT" ? (
            <button
              title={
                award.unawardedLines > 0
                  ? "Recalculate after resolving the listed lines."
                  : undefined
              }
              disabled={busy || award.unawardedLines > 0}
              onClick={() => void mutate("PUT")}
              className="rounded-lg bg-[var(--ink)] px-4 py-2.5 text-xs font-semibold text-white disabled:opacity-50"
            >
              {busy ? "Working…" : "Accept recommendation"}
            </button>
          ) : (
            <button
              disabled={exporting}
              onClick={() => void exportPdf()}
              className="flex items-center gap-2 rounded-lg bg-[var(--ink)] px-4 py-2.5 text-xs font-semibold text-white"
            >
              {exporting ? <LoaderCircle className="animate-spin" size={13} /> : <Download size={13} />} {exporting ? "Generating PDF…" : "Export PDF"}
            </button>
          )}
        </div>
      </div>
      {error && <p className="mt-3 text-xs text-[var(--red)]">{error}</p>}
      {award && (
        <div className="mt-5 grid gap-4 border-t border-[var(--line)] pt-5 sm:grid-cols-3">
          <div>
            <p className="eyebrow">Recommended spend</p>
            <p className="mt-1 text-base font-semibold">
              {money.format(award.totalSpend)}
            </p>
          </div>
          <div>
            <p className="eyebrow">Savings</p>
            <p className="mt-1 text-base font-semibold">
              {award.savings === undefined
                ? "No baseline"
                : money.format(award.savings)}
            </p>
          </div>
          <div>
            <p className="eyebrow">Unawarded lines</p>
            <p className="mt-1 text-base font-semibold">
              {award.unawardedLines}
            </p>
          </div>
          <div className="sm:col-span-3">
            <table className="w-full text-left text-[11px]">
              <thead>
                <tr className="bg-[var(--surface)]">
                  <th className="px-3 py-2">Vendor</th>
                  <th className="px-3 py-2">Lines</th>
                  <th className="px-3 py-2 text-right">Spend</th>
                </tr>
              </thead>
              <tbody>
                {award.spendByVendor.slice(0, 5).map((item) => (
                  <tr
                    key={item.vendor}
                    className="border-t border-[var(--line)]"
                  >
                    <td className="px-3 py-2">{item.vendor}</td>
                    <td className="px-3 py-2">{item.lines}</td>
                    <td className="px-3 py-2 text-right">
                      {money.format(item.spend)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {award.unawardedLines > 0 && (
            <p className="text-xs text-amber-700 sm:col-span-3">
              Blocked by:{" "}
              {(award.unawardedLineIds?.length
                ? award.unawardedLineIds
                : [`${award.unawardedLines} lines in this older draft`]
              ).join(", ")}
              . Recalculate after clarifications to refresh eligibility.
            </p>
          )}
        </div>
      )}
    </section>
  );
}
