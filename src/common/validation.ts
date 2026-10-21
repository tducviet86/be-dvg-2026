import { HttpStatus, type ValidationError } from '@nestjs/common';
import { AppError } from './errors.js';

export type FieldError = {
  /** Dotted path of the field, e.g. `banner.title` or `highlights.0.text`. */
  field: string;
  /** class-validator constraint names, e.g. `maxLength`, `matches`. */
  constraints: string[];
  messages: string[];
};

function flatten(errors: ValidationError[], parent = ''): FieldError[] {
  return errors.flatMap((error) => {
    const field = parent ? `${parent}.${error.property}` : error.property;
    const own: FieldError[] = error.constraints
      ? [{ field, constraints: Object.keys(error.constraints), messages: Object.values(error.constraints) }]
      : [];
    return [...own, ...flatten(error.children ?? [], field)];
  });
}

/** 400 with one entry per invalid field, so clients can mark the fields. */
export const validationError = (errors: ValidationError[]) =>
  new AppError(HttpStatus.BAD_REQUEST, 'VALIDATION_FAILED', 'Dữ liệu gửi lên chưa hợp lệ.', flatten(errors));

/** 409 for a slug already used by another record, tied to the `slug` field. */
export const slugTaken = () =>
  new AppError(HttpStatus.CONFLICT, 'CONFLICT', 'Đường dẫn này đã được sử dụng. Hãy chọn đường dẫn khác.', [
    { field: 'slug', constraints: ['unique'], messages: ['Đường dẫn đã được sử dụng.'] },
  ]);
