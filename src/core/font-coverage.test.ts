import { readFileSync } from 'node:fs';
import { expect, it } from 'vitest';

it('la fuente Braille empaquetada contiene los 256 glifos sin recurrir al sistema', () => {
  const bytes = readFileSync(new URL('../../node_modules/dejavu-fonts-ttf/ttf/DejaVuSans.ttf', import.meta.url));
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let cmap = 0;
  for (let i = 0; i < view.getUint16(4); i++) {
    const entry = 12 + i * 16;
    if (bytes.toString('ascii', entry, entry + 4) === 'cmap') cmap = view.getUint32(entry + 8);
  }
  expect(cmap).toBeGreaterThan(0);
  let unicode = 0;
  for (let i = 0; i < view.getUint16(cmap + 2); i++) {
    const offset = cmap + view.getUint32(cmap + 4 + i * 8 + 4);
    if (view.getUint16(offset) === 12) unicode = offset;
  }
  expect(unicode).toBeGreaterThan(0);
  const glyphFor = (codepoint: number) => {
    for (let i = 0; i < view.getUint32(unicode + 12); i++) {
      const group = unicode + 16 + i * 12;
      const start = view.getUint32(group), end = view.getUint32(group + 4);
      if (codepoint >= start && codepoint <= end) return view.getUint32(group + 8) + codepoint - start;
    }
    return 0;
  };
  const glyphs = Array.from({ length: 256 }, (_, mask) => glyphFor(0x2800 + mask));
  expect(glyphs.every(glyph => glyph !== 0)).toBe(true);
  expect(new Set(glyphs).size).toBe(256);
});
