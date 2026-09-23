import { PDFDocument, StandardFonts, rgb, type PDFPage } from "pdf-lib";
import { windowsHardwareEvent } from "@/data/windows-hardware-fy27";
import { getAward } from "@/lib/demo/award-manager";
export const runtime = "nodejs";
const money = (n: number) => `INR ${Math.round(n).toLocaleString("en-IN")}`;
export async function GET() {
  const a = await getAward();
  if (!a || a.status !== "ACCEPTED")
    return Response.json(
      { error: "Accept the recommendation first." },
      { status: 409 },
    );
  const pdf = await PDFDocument.create(),
    font = await pdf.embedFont(StandardFonts.Helvetica),
    bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  let page!: PDFPage,
    y = 0;
  const fresh = () => {
    page = pdf.addPage([595, 842]);
    page.drawRectangle({
      x: 0,
      y: 772,
      width: 595,
      height: 70,
      color: rgb(0.09, 0.13, 0.11),
    });
    page.drawText("AERCHAIN  |  AWARD RECOMMENDATION", {
      x: 42,
      y: 801,
      size: 15,
      font: bold,
      color: rgb(1, 1, 1),
    });
    y = 742;
  };
  const heading = (s: string) => {
    page.drawText(s, {
      x: 42,
      y,
      size: 10,
      font: bold,
      color: rgb(0.35, 0.4, 0.37),
    });
    y -= 20;
  };
  const tableHead = (labels: string[], xs: number[]) => {
    page.drawRectangle({
      x: 42,
      y: y - 6,
      width: 511,
      height: 22,
      color: rgb(0.09, 0.13, 0.11),
    });
    labels.forEach((v, i) =>
      page.drawText(v, {
        x: xs[i],
        y: y + 2,
        size: 7,
        font: bold,
        color: rgb(1, 1, 1),
      }),
    );
    y -= 23;
  };
  fresh();
  page.drawText(windowsHardwareEvent.title, { x: 42, y, size: 20, font: bold });
  y -= 25;
  page.drawText(`Accepted ${new Date(a.acceptedAt!).toLocaleString("en-IN")}`, {
    x: 42,
    y,
    size: 8,
    font,
    color: rgb(0.4, 0.4, 0.4),
  });
  y -= 32;
  [
    ["Recommended spend", money(a.totalSpend)],
    ["Savings", a.savings === undefined ? "No baseline" : money(a.savings)],
    ["Allocated", `${a.allocations.length} of 30`],
  ].forEach(([l, v], i) => {
    const x = 42 + i * 171;
    page.drawRectangle({
      x,
      y: y - 42,
      width: 159,
      height: 54,
      color: rgb(0.96, 0.97, 0.96),
    });
    page.drawText(l.toUpperCase(), { x: x + 9, y: y - 5, size: 7, font: bold });
    page.drawText(v, { x: x + 9, y: y - 28, size: 11, font: bold });
  });
  y -= 72;
  heading("SPEND BY VENDOR");
  tableHead(["Supplier", "Lines", "Award spend"], [48, 350, 430]);
  for (const r of a.spendByVendor) {
    page.drawText(r.vendor.slice(0, 42), { x: 48, y, size: 8, font });
    page.drawText(String(r.lines), { x: 350, y, size: 8, font });
    page.drawText(money(r.spend), { x: 430, y, size: 8, font });
    y -= 20;
  }
  y -= 18;
  heading("RECOMMENDED LINE ALLOCATION");
  const columns = [48, 92, 255, 392, 430, 492];
  const header = () =>
    tableHead(
      ["Line", "Requested item", "Supplier", "Qty", "Unit", "Total"],
      columns,
    );
  header();
  for (const [i, r] of a.allocations.entries()) {
    if (y < 65) {
      fresh();
      heading("LINE ALLOCATION (CONTINUED)");
      header();
    }
    if (i % 2)
      page.drawRectangle({
        x: 42,
        y: y - 7,
        width: 511,
        height: 21,
        color: rgb(0.96, 0.97, 0.96),
      });
    const vals = [
      r.lineId,
      r.item.slice(0, 26),
      r.vendor.slice(0, 20),
      String(r.quantity),
      money(r.unitPrice),
      money(r.lineTotal),
    ];
    vals.forEach((v, n) =>
      page.drawText(v, { x: columns[n], y, size: 7, font }),
    );
    y -= 22;
  }
  if (y < 130) fresh();
  y -= 15;
  heading("DECISION BASIS AND CAVEATS");
  for (const c of a.caveats) {
    page.drawText(`- ${c.slice(0, 100)}`, {
      x: 48,
      y,
      size: 8,
      font,
      color: rgb(0.35, 0.4, 0.37),
    });
    y -= 16;
  }
  page.drawText(
    `Demo FX: 1 USD = INR ${windowsHardwareEvent.demoExchangeRates.USD_INR}`,
    { x: 42, y: y - 5, size: 8, font: bold },
  );
  const pages = pdf.getPages();
  pages.forEach((p, i) => {
    p.drawLine({
      start: { x: 42, y: 35 },
      end: { x: 553, y: 35 },
      color: rgb(0.85, 0.87, 0.85),
      thickness: 0.5,
    });
    p.drawText(
      `Generated from normalized procurement data  |  Page ${i + 1} of ${pages.length}`,
      { x: 42, y: 20, size: 7, font, color: rgb(0.4, 0.4, 0.4) },
    );
  });
  return new Response(Buffer.from(await pdf.save()), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${windowsHardwareEvent.id}-award-recommendation.pdf"`,
    },
  });
}
