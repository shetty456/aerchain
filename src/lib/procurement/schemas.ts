import { z } from 'zod';

export const currencySchema = z.enum(['INR', 'USD']);
export const qualificationStatusSchema = z.enum(['QUALIFIED', 'DISQUALIFIED', 'INCOMPLETE']);
export const reviewStatusSchema = z.enum([
  'VERIFIED',
  'NORMALIZED',
  'AWAITING_CLARIFICATION',
  'UNRESOLVED',
  'NEEDS_BUYER_REVIEW',
  'MISSING',
  'SPEC_DEVIATION',
]);

export const sourceEvidenceSchema = z.object({
  artifactId: z.string(),
  fileName: z.string(),
  location: z.string().describe('Human-readable page, sheet, paragraph, or line reference.'),
  excerpt: z.string(),
  providerSource: z.string().optional(),
});

export const rfxLineSchema = z.object({
  id: z.string(),
  category: z.string(),
  requestedProduct: z.string(),
  quantity: z.number().int().positive(),
  unit: z.enum(['each', 'kit', 'pair']),
  mandatorySpecifications: z.array(z.string()).min(1),
  optionalSpecifications: z.array(z.string()),
});

export const qualificationQuestionSchema = z.object({
  id: z.string(),
  label: z.string(),
  description: z.string(),
  hardGate: z.boolean(),
});

export const vendorSchema = z.object({
  id: z.string(),
  name: z.string(),
  responseFormat: z.enum(['XLSX', 'PDF', 'DOCX', 'IMAGE', 'EMAIL']),
  contactName: z.string(),
  contactEmail: z.string().email(),
});

export const qualificationAnswerSchema = z.object({
  questionId: z.string(),
  answer: z.enum(['YES', 'NO', 'UNKNOWN']),
  detail: z.string().optional(),
  evidence: sourceEvidenceSchema.optional(),
});

export const commercialTermsSchema = z.object({
  currency: currencySchema,
  freight: z.enum(['INCLUDED', 'EXCLUDED', 'UNKNOWN']),
  tax: z.enum(['INCLUDED', 'EXCLUDED', 'UNKNOWN']),
  paymentTerms: z.string().nullable(),
  deliveryLeadTimeDays: z.number().int().positive().nullable(),
  warrantyMonths: z.number().int().positive().nullable(),
  quoteValidityDays: z.number().int().positive().nullable(),
  discountPercent: z.number().min(0).max(100).nullable(),
  minimumOrderCondition: z.string().nullable(),
  evidence: z.array(sourceEvidenceSchema),
});

export const vendorLineItemSchema = z.object({
  rfxLineId: z.string().nullable(),
  matchStatus: z.enum(['MATCHED', 'AMBIGUOUS', 'UNMATCHED', 'MISSING']),
  quotedDescription: z.string(),
  quotedQuantity: z.number().positive().nullable(),
  rawPrice: z.number().nonnegative().nullable(),
  normalizedUnitPrice: z.number().nonnegative().nullable(),
  rawCurrency: currencySchema.nullable(),
  normalizedCurrency: z.literal('INR'),
  rawUnit: z.string().nullable(),
  normalizedUnit: z.enum(['each', 'kit', 'pair']).nullable(),
  specificationMatch: z.enum(['MEETS', 'DEVIATES', 'AMBIGUOUS', 'UNKNOWN']),
  specificationDeviations: z.array(z.string()),
  missingInformation: z.array(z.string()),
  status: reviewStatusSchema,
  evidence: z.array(sourceEvidenceSchema),
});

export const ambiguitySchema = z.object({
  id: z.string(),
  lineId: z.string().nullable(),
  type: z.enum(['FACTUAL', 'JUDGMENT']),
  issue: z.string(),
  resolution: z.enum(['CLARIFY_VENDOR', 'BUYER_REVIEW', 'UNRESOLVED']),
});

export const vendorResponseSchema = z.object({
  vendorId: z.string(),
  artifactId: z.string(),
  processedAt: z.string().datetime(),
  lineItems: z.array(vendorLineItemSchema),
  qualificationAnswers: z.array(qualificationAnswerSchema),
  commercialTerms: commercialTermsSchema,
  ambiguities: z.array(ambiguitySchema),
  clarificationRequired: z.boolean(),
});

export const rawExtractedLineSchema = z.object({
  candidateRfxLineId: z.string().nullable(),
  matchStatus: z.enum(['MATCHED', 'AMBIGUOUS', 'UNMATCHED']),
  quotedDescription: z.string(),
  quotedQuantity: z.number().positive().nullable(),
  rawPrice: z.number().nonnegative().nullable(),
  rawCurrency: currencySchema.nullable(),
  priceBasis: z.number().int().positive().nullable().describe('Number of units covered by rawPrice, for example 100 for per-100 pricing.'),
  rawUnit: z.string().nullable(),
  specificationMatch: z.enum(['MEETS', 'DEVIATES', 'AMBIGUOUS', 'UNKNOWN']),
  specificationDeviations: z.array(z.string()),
  missingInformation: z.array(z.string()),
  evidence: z.array(sourceEvidenceSchema),
});

export const rawCommercialTermsSchema = z.object({
  currency: currencySchema.nullable(),
  freight: z.enum(['INCLUDED', 'EXCLUDED', 'UNKNOWN']),
  tax: z.enum(['INCLUDED', 'EXCLUDED', 'UNKNOWN']),
  paymentTerms: z.string().nullable(),
  deliveryLeadTimeDays: z.number().int().positive().nullable(),
  warrantyMonths: z.number().int().positive().nullable(),
  quoteValidityDays: z.number().int().positive().nullable(),
  discountPercent: z.number().min(0).max(100).nullable(),
  minimumOrderCondition: z.string().nullable(),
  evidence: z.array(sourceEvidenceSchema),
});

export const rawExtractedResponseSchema = z.object({
  lineItems: z.array(rawExtractedLineSchema),
  qualificationAnswers: z.array(qualificationAnswerSchema),
  commercialTerms: rawCommercialTermsSchema,
  ambiguities: z.array(ambiguitySchema),
  clarificationRequired: z.boolean(),
});

export const sourcingEventSchema = z.object({
  id: z.string(),
  title: z.string(),
  fiscalYear: z.string(),
  baseCurrency: z.literal('INR'),
  scope: z.string(),
  requiredDeliveryDate: z.string(),
  demoExchangeRates: z.object({ USD_INR: z.number().positive() }),
  lineItems: z.array(rfxLineSchema).length(30),
  qualificationQuestions: z.array(qualificationQuestionSchema),
  requestedCommercialTerms: z.array(z.string()),
  invitedVendors: z.array(vendorSchema).length(5),
});

export type SourcingEvent = z.infer<typeof sourcingEventSchema>;
export type RfxLine = z.infer<typeof rfxLineSchema>;
export type VendorResponse = z.infer<typeof vendorResponseSchema>;
export type SourceEvidence = z.infer<typeof sourceEvidenceSchema>;
export type RawExtractedResponse = z.infer<typeof rawExtractedResponseSchema>;
