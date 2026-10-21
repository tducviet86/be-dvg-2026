import type { Decimal } from '@prisma/client/runtime/client';

/** VND amounts travel as decimal strings to keep integer precision. */
export const money = (value: bigint | null | undefined) =>
  value === null || value === undefined ? null : value.toString();
export const toBigInt = (value: string | null | undefined) =>
  value === null || value === undefined || value === '' ? null : BigInt(value);
export const decimal = (value: Decimal | null | undefined) =>
  value === null || value === undefined ? null : value.toNumber();
export const isoDate = (value: Date | null | undefined) =>
  value ? value.toISOString().slice(0, 10) : null;
