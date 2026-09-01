import { z } from 'zod';

/** Shared primitives. Every data file builds on these. */
export const Id = z.string().regex(/^[a-zA-Z][a-zA-Z0-9_]*$/, 'id must be alphanumeric starting with a letter');
export const I18nKey = z.string().regex(/^[a-z][a-zA-Z0-9_.]*$/, 'i18n key must be dot.case');
export const AssetKey = z.string().regex(/^[a-z][a-zA-Z0-9_]*(\.[a-zA-Z0-9_]+)+$/, 'asset key must be dot.separated');
export const Level = z.number().int().min(1).max(60);
export const NonNegInt = z.number().int().min(0);
export const PosInt = z.number().int().min(1);
export const Ratio = z.number().min(0).max(1);

export const CurrencyId = z.enum(['coins', 'gems']);
export const Price = z.object({ currency: CurrencyId, amount: NonNegInt });
export const Blocks = z.object({ w: PosInt, h: PosInt });

export const FileHeader = {
  version: PosInt,
  tuningStatus: z.string().optional(),
  note: z.string().optional(),
  assetKeyConvention: z.string().optional(),
};
