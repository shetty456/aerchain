# Aerchain — Kill the Quote Spreadsheet

Aerchain is an AI-native procurement prototype that converts heterogeneous supplier quotations into trustworthy, comparable data. The demonstration follows one enterprise sourcing event—**Windows Hardware FY27**—from RFx through response ingestion, factual clarification, analysis, award recommendation, and PDF export.

The product principle is simple: **automate clerical work, not buyer judgment**.

## The problem

An IT category buyer receives quotations as spreadsheets, PDFs, Word documents, photographed rate cards, and informal emails. Before choosing a supplier, the buyer must reconstruct those responses in a common spreadsheet, reconcile units and currencies, verify qualification, and chase missing facts. The costly part is not reading text; it is producing comparison data that can be trusted and defended.

This prototype demonstrates:

> Messy supplier responses → normalized procurement data → conversational analysis → defensible award recommendation

## What is included

- One 30-line Windows hardware RFx in INR
- Five fictional suppliers responding through XLSX, PDF, DOCX, JPG, and plain-text email
- Supplier qualification gates with `QUALIFIED`, `DISQUALIFIED`, and `INCOMPLETE` states
- Sarvam Vision document/image extraction and Groq structured reasoning
- Deterministic currency, unit-basis, discount, qualification, total, and award calculations
- Exception-focused comparison with source evidence
- AI-generated factual clarification and simulated supplier reply reprocessing
- Natural-language analysis over normalized data
- Buyer-controlled award recommendation and professional PDF export
- A timestamped decision history
- Token-free showcase replay using previously validated results

## Architecture

```text
Vendor artifact
  → structural extraction or Sarvam Vision
  → Groq schema-constrained mapping
  → Zod validation
  → deterministic TypeScript normalization
  → qualification + ambiguity rules
  → local validated-stage cache
  → comparison / analysis / award / PDF
```

The UI never calls an AI provider directly. Provider credentials and calls stay in server-only modules under `src/lib/ai`. Procurement rules live separately under `src/lib/procurement`; workflow and local persistence live under `src/lib/demo` and `src/lib/storage`.

The analyst sends the model only enough normalized context to classify the buyer's intent. TypeScript performs the actual arithmetic through deterministic analysis operations. No question-specific answer strings are hardcoded.

## Setup

Requirements:

- Node.js 20 or later
- Sarvam API key
- Groq API key

```bash
npm install
cp .env.example .env.local
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

Configure `.env.local`:

```dotenv
SARVAM_API_KEY=
SARVAM_MODEL=sarvam-105b
SARVAM_TIMEOUT_SECONDS=180

GROQ_API_KEY=
GROQ_MODEL=openai/gpt-oss-20b
GROQ_TIMEOUT_SECONDS=120
GROQ_MAPPING_CONCURRENCY=1

PROCUREMENT_LOG_LEVEL=debug
```

`GROQ_MAPPING_CONCURRENCY=1` is deliberate for low token-per-minute limits. Missing keys are surfaced in the workspace; secrets are never sent to the browser. `.env.local` is gitignored.

## Demo flow

For a first live processing run:

1. Open **Windows Hardware FY27**.
2. Review the RFx and qualification gates.
3. Select **Send RFx**.
4. Watch each supplier response progress independently.
5. In **Comparison**, resolve factual clarifications and inspect evidence.
6. In **Analysis**, try the suggested questions or ask another sourcing question.
7. Create, review, and explicitly accept the award recommendation.
8. Export the recommendation as PDF.

For later presentations, select **Replay showcase**. Replay changes only the visible response journey and uses the saved, validated result counts. It makes no Sarvam or Groq requests, preserves clarifications and the accepted award, and logs `aiRequests: 0` on completion.

## Real versus simulated

Real:

- The five source artifacts are genuine XLSX, PDF, DOCX, JPG, and TXT files.
- Sarvam reads document/image sources that require vision or document understanding.
- Groq maps extracted content, interprets ambiguity and clarification replies, and classifies analyst intent.
- Zod validates provider output.
- TypeScript performs normalization, qualification, analysis, and award calculations.
- Evidence shown in the interface comes from extracted source content.

Simulated:

- Email delivery, inboxes, response timing, and the nine-day sourcing window
- Supplier clarification replies (the reply is still reprocessed through the AI pipeline)
- ERP, purchase-order, contract, invoice, and payment systems

The fictional dataset is intentionally designed to include missing items, shorthand, USD pricing, per-100 pricing, buried terms, missing qualification answers, and substitutions needing buyer review.

## Trust model

- **Provenance:** quoted values retain artifact, location, and source excerpt where provided.
- **Exception-based review:** the buyer focuses on unresolved, missing, or deviating cells rather than verifying every cell.
- **No silent assumptions:** unknown qualification answers remain incomplete; unsupported substitutions require buyer review.
- **Auditability:** response, clarification, and award events appear in Decision history.
- **Guardrails:** AI may clarify facts but cannot negotiate, accept judgment-heavy substitutions, make commitments, or award business.

The fixed demonstration exchange rate is visible in Comparison. It is an inspectable normalization assumption, not a live FX rate.

## Persistence and caching

Runtime state is stored under `.demo-runtime/` and is intentionally gitignored. Extraction, mapping batches, canonical mapping, and normalization are cached separately after successful validation. A failed later stage can therefore be retried without paying for successful earlier stages again.

Showcase replay does not delete or rebuild runtime data. To preserve a presentation-ready state, back up `.demo-runtime/` outside the repository before intentionally clearing local data.

Production persistence would use a transactional database and object store. Prototype persistence is deliberately local and single-user.

## Quality checks

```bash
npm run typecheck
npm run lint
npm test
npm run build
```

The test suite covers deterministic normalization, qualification semantics, ambiguity routing, clarification application, strict structured schemas, cache validation, and malformed model-output recovery.

## Known limitations and deliberate scope cuts

- Local filesystem state is unsuitable for multi-instance or serverless production deployment.
- The background workflow is designed for a local interview demo, not a durable production queue.
- The fixed FX rate and fictional supplier replies are demonstration assumptions.
- Analysis intent generation still requires Groq; deterministic results do not.
- The prototype implements one sourcing event and one buyer persona.
- No authentication, RBAC, real SMTP, vendor portal, ERP integration, purchase order, contract, invoice, payment, optimization solver, or Excel export is included.

Conversational RFx creation is represented by a predefined template in the prototype so implementation depth could be concentrated on the higher-risk problems of heterogeneous response understanding, normalization, uncertainty management and analysis.

## Repository map

```text
src/app/                    Next.js pages and server API routes
src/components/procurement Buyer workspace UI
src/data/                   RFx and supplier dataset
src/lib/ai/                 Provider abstraction, Sarvam, Groq, prompts
src/lib/ingestion/          Extraction, mapping, normalization pipeline
src/lib/procurement/        Domain schemas and deterministic rules
src/lib/demo/               Run, clarification, audit, and award workflows
src/lib/storage/            Validated pipeline-stage cache
demo/vendor-responses/      Five heterogeneous source artifacts
tests/                      Domain and recovery tests
```
