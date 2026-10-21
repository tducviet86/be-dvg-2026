import { cleanStrings, normalize, plainText, slugify } from './text.js';

describe('text utils', () => {
  it('slugifies Vietnamese text', () => {
    expect(slugify('Căn hộ Đà Nẵng — view sông Hàn!')).toBe('can-ho-da-nang-view-song-han');
    expect(normalize('  Đất Vàng  ')).toBe('dat vang');
  });
  it('strips every tag and handler, keeping text', () => {
    expect(plainText('<p onclick="x()">Xin <b>chào</b></p><script>alert(1)</script>')).toBe('Xin chào');
    expect(plainText('5 < 7 & 8 > 6')).toBe('5 < 7 & 8 > 6');
    expect(cleanStrings({ a: ['<i>x</i>'], b: { c: '<img src=x onerror=1>y' } })).toEqual({ a: ['x'], b: { c: 'y' } });
  });
});
