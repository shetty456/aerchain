import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import ExcelJS from 'exceljs';
import { Document, HeadingLevel, Packer, Paragraph, Table, TableCell, TableRow, TextRun, WidthType } from 'docx';
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';
import sharp from 'sharp';
import { windowsHardwareEvent } from '../src/data/windows-hardware-fy27';

const outputDir = path.join(process.cwd(), 'demo', 'vendor-responses');
const lines = windowsHardwareEvent.lineItems;
const basePrices = [
  73500, 69800, 68400, 142000, 238000, 128500, 12400, 16800, 31500, 98500,
  22600, 11900, 720, 4350, 390, 2950, 8250, 16200, 3100, 18400,
  2450, 4600, 2850, 4950, 1750, 4650, 8250, 7850, 1650, 1420,
];

const quotedDescription = (index: number, vendor: string) => {
  const line = lines[index];
  const prefixes: Record<string, string> = {
    A: 'Nexora enterprise supply',
    B: 'BluePeak OEM channel offer',
    C: index === 0 ? 'Dell Latitude 5450, base configuration' : 'Vertex proposed equivalent',
    D: 'KDS trade rate',
  };
  return `${prefixes[vendor]} — ${line.requestedProduct}`;
};

async function createExcel() {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'Nexora Systems Pvt. Ltd.';
  const quote = workbook.addWorksheet('Commercial Offer');
  quote.addRow(['NEXORA SYSTEMS — CORPORATE HARDWARE QUOTE']);
  quote.mergeCells('A1:H1');
  quote.getCell('A1').font = { bold: true, size: 16, color: { argb: 'FFFFFFFF' } };
  quote.getCell('A1').fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF173B34' } };
  quote.addRow(['Ref', 'Our catalogue description', 'Pack / UOM', 'Offered qty', 'Basic rate (INR)', 'GST', 'Lead days', 'Remarks']);
  lines.forEach((line, index) => {
    quote.addRow([
      `NX-${String(index + 1).padStart(3, '0')}`,
      quotedDescription(index, 'A'),
      line.unit === 'each' ? 'EA' : line.unit.toUpperCase(),
      line.quantity,
      Math.round(basePrices[index] * 0.99),
      '18% extra',
      index < 6 ? 24 : 18,
      index === 8 ? 'Includes 96W USB-C PD; equivalent network hub' : 'As specified',
    ]);
  });
  quote.columns = [12, 64, 14, 14, 20, 14, 14, 42].map((width) => ({ width }));
  quote.views = [{ state: 'frozen', ySplit: 2 }];

  const terms = workbook.addWorksheet('Notes & Compliance');
  terms.addRows([
    ['Commercial / qualification response', 'Nexora response'],
    ['OEM authorization', 'Yes — Dell, Lenovo, HP and Logitech authorized enterprise reseller'],
    ['Warranty', 'Yes — minimum 3 years on systems and displays; accessories as RFx specification'],
    ['Delivery deadline', 'Confirmed delivery to Bengaluru by 15 April 2027'],
    ['Bengaluru onsite support', 'Resident service desk and field engineers available'],
    ['Replacement SLA', 'DOA replacement within 2 business days'],
    ['Freight', 'Included to one Bengaluru delivery location'],
    ['GST', 'Excluded from basic rates; 18% extra'],
    ['Payment', '30 days from accepted delivery'],
    ['Quote validity', '45 days'],
    ['Discount', 'Already reflected in unit rates'],
    ['Minimum order', 'None'],
  ]);
  terms.columns = [{ width: 34 }, { width: 86 }];
  await workbook.xlsx.writeFile(path.join(outputDir, 'vendor-a-nexora.xlsx'));
}

function wrapText(text: string, maxChars: number) {
  const words = text.split(' ');
  const result: string[] = [];
  let current = '';
  for (const word of words) {
    if (`${current} ${word}`.trim().length > maxChars) {
      result.push(current);
      current = word;
    } else current = `${current} ${word}`.trim();
  }
  if (current) result.push(current);
  return result;
}

async function createPdf() {
  const pdf = await PDFDocument.create();
  const regular = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  let page = pdf.addPage([595, 842]);
  let y = 790;
  const addHeader = () => {
    page.drawRectangle({ x: 34, y: 778, width: 527, height: 42, color: rgb(0.06, 0.18, 0.31) });
    page.drawText('BLUEPEAK TECHNOLOGIES LTD.', { x: 48, y: 797, size: 15, font: bold, color: rgb(1, 1, 1) });
    page.drawText('Enterprise Systems & Workplace Infrastructure', { x: 48, y: 783, size: 8, font: regular, color: rgb(0.8, 0.88, 0.96) });
    y = 754;
  };
  const ensureSpace = (needed: number) => {
    if (y - needed < 62) {
      page = pdf.addPage([595, 842]);
      addHeader();
    }
  };
  addHeader();
  page.drawText('QUOTATION  BP/FY27/091', { x: 40, y, size: 12, font: bold }); y -= 20;
  page.drawText('To: Strategic Sourcing — Windows Hardware FY27  |  Currency: INR', { x: 40, y, size: 9, font: regular }); y -= 28;
  page.drawText('Line   Description                                      Qty       Unit rate', { x: 40, y, size: 8, font: bold }); y -= 8;
  page.drawLine({ start: { x: 40, y }, end: { x: 555, y }, thickness: 0.7, color: rgb(0.7, 0.7, 0.7) }); y -= 14;
  lines.forEach((line, index) => {
    const description = wrapText(line.requestedProduct, 55);
    ensureSpace(16 + description.length * 9);
    page.drawText(line.id, { x: 40, y, size: 7.5, font: regular });
    description.forEach((text, lineIndex) => page.drawText(text, { x: 82, y: y - lineIndex * 9, size: 7.5, font: regular }));
    page.drawText(String(line.quantity), { x: 465, y, size: 7.5, font: regular });
    page.drawText(`Rs ${Math.round(basePrices[index] * 1.02).toLocaleString('en-IN')}`, { x: 503, y, size: 7.5, font: regular });
    y -= Math.max(16, description.length * 9 + 5);
  });
  ensureSpace(145);
  y -= 8;
  page.drawText('Qualification & commercial terms', { x: 40, y, size: 10, font: bold }); y -= 16;
  [
    'OEM authorization: NO — application for renewed authorization is under review.',
    'Warranty: 3 years onsite for laptops, workstations, docks and monitors.',
    'Delivery: All items by 15 April 2027. Lead time 21–28 days from order.',
    'Service: Bengaluru field support. DOA replacement target: 3 business days.',
    'Freight: Included for delivery to the Bengaluru office receiving bay.',
    'GST: 18% additional. Payment: Net 45 days. Quote validity: 30 days.',
  ].forEach((text) => { page.drawText(text, { x: 40, y, size: 8, font: regular }); y -= 12; });
  y -= 6;
  const footnote = '*Project incentive: deduct 4.5% from every basic unit rate shown above when the complete event is awarded under one purchase instruction.';
  wrapText(footnote, 100).forEach((text) => { page.drawText(text, { x: 40, y, size: 7, font: regular, color: rgb(0.35, 0.35, 0.35) }); y -= 10; });
  await writeFile(path.join(outputDir, 'vendor-b-bluepeak.pdf'), await pdf.save());
}

async function createDocx() {
  const rows = lines.slice(0, 27).map((line, index) => new TableRow({ children: [
    new TableCell({ children: [new Paragraph(line.id)] }),
    new TableCell({ children: [new Paragraph(quotedDescription(index, 'C'))] }),
    new TableCell({ children: [new Paragraph(String(line.quantity))] }),
    new TableCell({ children: [new Paragraph(`INR ${Math.round(basePrices[index] * 0.965).toLocaleString('en-IN')}`)] }),
  ] }));
  const document = new Document({ sections: [{ children: [
    new Paragraph({ text: 'VERTEX OFFICE SOLUTIONS', heading: HeadingLevel.TITLE }),
    new Paragraph({ children: [new TextRun({ text: 'Proposal: Windows Hardware FY27', bold: true }), new TextRun('  |  22 September 2026')] }),
    new Paragraph('Thank you for the opportunity. The following proposal covers 27 lines currently available through our distribution network.'),
    new Table({ width: { size: 100, type: WidthType.PERCENTAGE }, rows: [
      new TableRow({ children: ['RFx ref', 'Description offered', 'Qty', 'Unit price'].map((text) => new TableCell({ children: [new Paragraph({ children: [new TextRun({ text, bold: true })] })] })) }),
      ...rows,
    ] }),
    new Paragraph({ text: 'Commercial notes', heading: HeadingLevel.HEADING_2 }),
    new Paragraph('Prices are exclusive of GST. Freight is additional at actuals, capped at INR 65,000 for one consolidated Bengaluru shipment. Payment is due 50% with order and 50% within 15 days of delivery. Prices remain valid for 21 days. Expected dispatch is within 30 days.'),
    new Paragraph('All laptops are offered with three-year onsite warranty. For HW-001 the quoted Latitude 5450 is the base configuration; final RAM, SSD and Windows edition need confirmation. We may supply an HP equivalent against HW-003 depending on stock.'),
    new Paragraph({ text: 'Qualification response', heading: HeadingLevel.HEADING_2 }),
    new Paragraph('Warranty requirement: Confirmed. Delivery deadline: Confirmed. Bengaluru service: Partner-led onsite support. Replacement SLA: five business days. Authorized reseller status: response not provided.'),
    new Paragraph('Lines HW-028, HW-029 and HW-030 are not quoted and may be added after distributor confirmation.'),
  ] }] });
  await writeFile(path.join(outputDir, 'vendor-c-vertex.docx'), await Packer.toBuffer(document));
}

function escapeXml(value: string) {
  return value.replace(/[<>&'\"]/g, (character) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', "'": '&apos;', '"': '&quot;' }[character]!));
}

async function createPhotographedRateCard() {
  const width = 1800;
  const rowHeight = 52;
  const height = 420 + lines.length * rowHeight;
  const rows = lines.map((line, index) => {
    const perHundred = index >= 28;
    const price = perHundred ? Math.round(basePrices[index] * 100 * 0.94) : Math.round(basePrices[index] * 0.94);
    const basis = perHundred ? 'PER 100 PCS' : 'EACH';
    return `<g transform="translate(0 ${350 + index * rowHeight})">
      <rect x="82" y="0" width="1580" height="${rowHeight}" fill="${index % 2 ? '#f3f0e8' : '#fffdf6'}"/>
      <text x="102" y="33" font-size="22" font-family="Arial">${line.id}</text>
      <text x="230" y="33" font-size="19" font-family="Arial">${escapeXml(line.requestedProduct.slice(0, 72))}</text>
      <text x="1280" y="33" font-size="20" font-family="Arial">${basis}</text>
      <text x="1515" y="33" font-size="22" font-family="Arial" text-anchor="end">₹${price.toLocaleString('en-IN')}</text>
    </g>`;
  }).join('');
  const svg = `<svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">
    <rect width="100%" height="100%" fill="#d8d2c4"/>
    <rect x="70" y="55" width="1600" height="${height - 100}" rx="4" fill="#fffdf6" stroke="#b8af9d" stroke-width="3"/>
    <text x="105" y="120" font-size="43" font-weight="bold" font-family="Arial" fill="#173b34">KAVERI DIGITAL SUPPLIES</text>
    <text x="105" y="164" font-size="24" font-family="Arial" fill="#5c5a53">Dealer rate card — Bengaluru — September 2026</text>
    <text x="105" y="220" font-size="21" font-family="Arial">Auth reseller: YES   |   3yr warranty: YES   |   Delivery by 15-Apr-27: YES</text>
    <text x="105" y="255" font-size="21" font-family="Arial">Freight extra at actuals · GST extra · Net 30 · Valid 14 days · Replacement: 4 working days</text>
    <rect x="82" y="300" width="1580" height="50" fill="#173b34"/>
    <text x="102" y="333" font-size="20" font-family="Arial" fill="white">REF</text><text x="230" y="333" font-size="20" font-family="Arial" fill="white">TRADE DESCRIPTION</text><text x="1280" y="333" font-size="20" font-family="Arial" fill="white">BASIS</text><text x="1515" y="333" font-size="20" font-family="Arial" fill="white" text-anchor="end">RATE</text>
    ${rows}
    <text x="105" y="${height - 62}" font-size="18" font-family="Arial" fill="#605b50">Handwritten note: HW-012 USB-C dock is 65W / dual HDMI. HW-018 model pending confirmation.</text>
  </svg>`;
  await sharp(Buffer.from(svg))
    .rotate(-1.2, { background: '#c8c2b6' })
    .modulate({ brightness: 0.96, saturation: 0.82 })
    .blur(0.3)
    .jpeg({ quality: 86, chromaSubsampling: '4:2:0' })
    .toFile(path.join(outputDir, 'vendor-d-kaveri-rate-card.jpg'));
}

async function createEmail() {
  const email = `From: Kabir Shah <kabir.shah@orbitedge.example>
To: Sourcing Desk <sourcing@buyer.example>
Subject: Re: win hw FY27 numbers
Date: 22 Sep 2026, 18:47 IST

Hi,

Quick numbers below, best I can hold this week:

latitude 5450 72.5k (standard config, 3yr warranty available)
thinkpad e14 68k; probook 440 66.9k
precision 3590 USD 1,615 each, graphics depends on stock
P1 gen7 USD 2,690, elitebook 126k
24in screens 11.8k, 27in 15.9k, QHD usb-c 29.8k, ultrawide 94k
docks same as previous quote; universal usb-c 10.9k
wired kb 675, wireless 4.1k, mouse 350 / ergo 2.7k
brio cam 7.8k, 4k cam 15.5k
usb headset 2.85k, wireless teams 17.2k
bags 2.2k and 4.25k
65w charger 2.6k, 100w 4.6k, spike guard 1.55k
16gb 4.4k, 32gb 7.9k, 1tb ssd 7.45k
usb-c hdmi 1.45k; locks can arrange, no price yet

USD lines can invoice INR at rate on billing date. freight extra, GST extra. Usual payment terms.
We are authorised for Dell and Lenovo; HP paperwork is being renewed. Can meet April if PO by Feb.
Bangalore support yes. Replacement is normally quick. Quote valid till stock moves.

For docks use same specs and price as previous quote — you should have it. Let me know if you need anything else.

Kabir
OrbitEdge Infotech
`;
  await writeFile(path.join(outputDir, 'vendor-e-orbitedge-email.txt'), email);
}

async function main() {
  await mkdir(outputDir, { recursive: true });
  await Promise.all([createExcel(), createPdf(), createDocx(), createPhotographedRateCard(), createEmail()]);
  console.log(`Generated five vendor artifacts in ${outputDir}`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
