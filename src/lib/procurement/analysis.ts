import type { RfxLine, VendorResponse } from './schemas';

export type AnalysisVendor = { id: string; name: string; qualification: 'QUALIFIED' | 'DISQUALIFIED' | 'INCOMPLETE'; response: VendorResponse };
export type AnalysisPlan = {
  operation: string;
  vendorNames?: string[];
  categories?: string[];
  lineIds?: string[];
  limit?: number;
};
const eligibleStatuses = new Set(['VERIFIED', 'NORMALIZED']);

export function analyzeProcurement(operationOrPlan: string | AnalysisPlan, allLines: RfxLine[], allVendors: AnalysisVendor[]) {
  const plan = typeof operationOrPlan === 'string' ? { operation: operationOrPlan } : operationOrPlan;
  const operation = plan.operation;
  const requestedVendors = new Set(plan.vendorNames?.map((name) => name.toLowerCase()));
  const requestedCategories = new Set(plan.categories?.map((category) => category.toLowerCase()));
  const requestedLines = new Set(plan.lineIds?.map((id) => id.toUpperCase()));
  const vendors = requestedVendors.size ? allVendors.filter((vendor) => requestedVendors.has(vendor.name.toLowerCase())) : allVendors;
  const lines = allLines.filter((line) => (!requestedCategories.size || requestedCategories.has(line.category.toLowerCase())) && (!requestedLines.size || requestedLines.has(line.id.toUpperCase())));
  const qualified = vendors.filter((vendor) => vendor.qualification === 'QUALIFIED');
  const unresolved = lines.flatMap((line) => vendors.flatMap((vendor) => {
    const quote = vendor.response.lineItems.find((item) => item.rfxLineId === line.id);
    return !quote || !eligibleStatuses.has(quote.status) ? [{ lineId: line.id, item: line.requestedProduct, vendor: vendor.name, status: quote?.status ?? 'MISSING' }] : [];
  }));
  const selections = lines.map((line) => {
    const options = qualified.flatMap((vendor) => {
      const quote = vendor.response.lineItems.find((item) => item.rfxLineId === line.id);
      return quote?.normalizedUnitPrice !== null && quote?.normalizedUnitPrice !== undefined && eligibleStatuses.has(quote.status)
        ? [{ lineId: line.id, item: line.requestedProduct, quantity: line.quantity, vendorId: vendor.id, vendor: vendor.name, unitPrice: quote.normalizedUnitPrice, lineTotal: quote.normalizedUnitPrice * line.quantity }]
        : [];
    });
    return options.sort((a, b) => a.lineTotal - b.lineTotal)[0] ?? null;
  });
  const vendorTotals = qualified.map((vendor) => {
    const priced = lines.flatMap((line) => {
      const quote = vendor.response.lineItems.find((item) => item.rfxLineId === line.id);
      return quote?.normalizedUnitPrice !== null && quote?.normalizedUnitPrice !== undefined && eligibleStatuses.has(quote.status) ? [quote.normalizedUnitPrice * line.quantity] : [];
    });
    return { vendorId: vendor.id, vendor: vendor.name, total: priced.reduce((sum, value) => sum + value, 0), coveredLines: priced.length, complete: priced.length === lines.length };
  }).sort((a, b) => a.total - b.total);
  const splitTotal = selections.reduce((sum, item) => sum + (item?.lineTotal ?? 0), 0);
  const cheapestSingle = vendorTotals.filter((vendor) => vendor.complete)[0] ?? null;
  const scope = { lineCount: lines.length, vendorCount: vendors.length, categories: [...new Set(lines.map((line) => line.category))] };

  if (operation === 'QUALIFIED_VENDORS') return { operation, scope, qualified: qualified.map((vendor) => vendor.name), vendors: vendors.map((vendor) => ({ vendor: vendor.name, status: vendor.qualification })) };
  if (operation === 'CHEAPEST_OVERALL' || operation === 'VENDOR_COMPARISON') return { operation, scope, cheapest: cheapestSingle, vendorTotals, caveat: cheapestSingle ? null : `No qualified vendor has an eligible quote for all ${lines.length} scoped lines.` };
  if (operation === 'CHEAPEST_QUALIFIED_PER_LINE') return { operation, scope, selections, unawardedLines: selections.filter((item) => !item).length, total: splitTotal };
  if (operation === 'UNRESOLVED_ITEMS') return { operation, scope, unresolved, count: unresolved.length };
  if (operation === 'SPLIT_AWARD_SAVINGS') return { operation, scope, splitTotal, cheapestSingle, savings: cheapestSingle ? cheapestSingle.total - splitTotal : null, selections, caveat: cheapestSingle ? null : 'Savings cannot be calculated because no qualified single vendor covers every eligible line.' };
  if (operation === 'LINE_DETAIL') return { operation, scope, lines: lines.slice(0, plan.limit ?? 10).map((line) => ({ lineId: line.id, item: line.requestedProduct, category: line.category, quantity: line.quantity, quotes: vendors.map((vendor) => { const quote = vendor.response.lineItems.find((item) => item.rfxLineId === line.id); return { vendor: vendor.name, qualification: vendor.qualification, unitPrice: quote?.normalizedUnitPrice ?? null, status: quote?.status ?? 'MISSING' }; }) })) };
  if (operation === 'COMMERCIAL_TERMS') return { operation, scope, vendors: vendors.map((vendor) => ({ vendor: vendor.name, qualification: vendor.qualification, terms: vendor.response.commercialTerms })) };
  if (operation === 'CATEGORY_SUMMARY') return { operation, scope, categories: [...new Set(lines.map((line) => line.category))].map((category) => { const categoryLines = lines.filter((line) => line.category === category); const chosen = selections.filter((selection) => selection && categoryLines.some((line) => line.id === selection.lineId)); return { category, lines: categoryLines.length, eligibleSplitSpend: chosen.reduce((sum, item) => sum + (item?.lineTotal ?? 0), 0), unawardedLines: categoryLines.length - chosen.length }; }) };
  return { operation: 'SUMMARY', scope, qualified: qualified.length, unresolved: unresolved.length, vendorTotals, splitTotal };
}
