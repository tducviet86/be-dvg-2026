import { Transform } from 'class-transformer';
import { plainText } from '../utils/text.js';

/** Trims and strips HTML from a string field; empty becomes null. */
export const Clean = () =>
  Transform(({ value }) => {
    if (typeof value !== 'string') return value;
    const cleaned = plainText(value);
    return cleaned === '' ? null : cleaned;
  });
/** Same for string arrays; drops empty entries. */
export const CleanList = () =>
  Transform(({ value }) =>
    Array.isArray(value)
      ? value
          .map((item) => (typeof item === 'string' ? plainText(item) : item))
          .filter((item) => item !== '')
      : value,
  );
