import { describe, expect, it } from 'vitest';
import { DEFAULT_SETTINGS } from './ascii';
import { BRAILLE_BITS, brailleStripToCells, createDitherState } from './braille';

const settings = { ...DEFAULT_SETTINGS, ramp: 'true-braille' as const, contrast: 1 };
function samples(columns = 1, value = 0, alpha = 255) {
  return new Uint8ClampedArray(Array.from({ length: columns * 8 }, () => [value, value, value, alpha]).flat());
}
const maskFor = (pixels: Uint8ClampedArray) => brailleStripToCells(pixels, 1, settings)[0].character.codePointAt(0)! - 0x2800;

describe('True Braille 2×4 real', () => {
  it.each(BRAILLE_BITS.flatMap((bits, row) => bits.map((bit, x) => ({ row, x, bit }))))(
    'fila$row columna$x activa bit$bit', ({ row, x, bit }) => {
      const pixels = samples();
      pixels.set([255, 255, 255, 255], (row * 2 + x) * 4);
      expect(maskFor(pixels)).toBe(bit);
    },
  );
  it('construye cada uno de los 256 códigos, incluyendo vacío y completo', () => {
    for (let mask = 0; mask < 256; mask++) {
      const pixels = samples();
      for (let y = 0; y < 4; y++) for (let x = 0; x < 2; x++) {
        if (mask & BRAILLE_BITS[y][x]) pixels.set([255, 255, 255, 255], (y * 2 + x) * 4);
      }
      expect(maskFor(pixels)).toBe(mask);
    }
  });
  it('umbral, brillo y contraste alteran los puntos de manera predecible', () => {
    expect(maskFor(samples(1, 127))).toBe(0);
    expect(maskFor(samples(1, 128))).toBe(255);
    expect(brailleStripToCells(samples(1, 100), 1, { ...settings, brightness: 40 })[0].character).toBe('⣿');
    expect(brailleStripToCells(samples(1, 128), 1, { ...settings, brailleThreshold: 129 })[0].character).toBe('⠀');
    expect(brailleStripToCells(samples(1, 180), 1, { ...settings, contrast: .5, brailleThreshold: 160 })[0].character).toBe('⠀');
  });
  it('promedia solo píxeles activos, respeta monocromo y alpha', () => {
    const pixels = samples();
    pixels.set([255, 0, 0, 255], 0);
    pixels.set([0, 0, 255, 255], 4);
    pixels.set([255, 255, 255, 0], 8);
    expect(brailleStripToCells(pixels, 1, { ...settings, brailleThreshold: 10 })[0]).toEqual({ character: '⠉', color: 'rgb(128,0,128)' });
    expect(brailleStripToCells(samples(1, 255), 1, { ...settings, color: false })[0].color).toBe('#c8ff62');
    for (const brailleDither of [false, true]) {
      expect(brailleStripToCells(samples(1, 255, 0), 1, { ...settings, brailleThreshold: 0, brightness: 80, brailleDither })[0].character).toBe('⠀');
    }
    expect(maskFor(samples(1, 255, 64))).toBe(0);
  });
  it('dithering determinista aproxima medios tonos y difunde entre celdas/tiras', () => {
    const pixels = samples(32, 127);
    const ditherSettings = { ...settings, brailleDither: true };
    const state = createDitherState(32);
    const a = brailleStripToCells(pixels, 32, ditherSettings, state);
    const b = brailleStripToCells(pixels, 32, ditherSettings, state);
    const popcount = (text: string) => [...text].reduce((sum, char) => sum + (char.codePointAt(0)! - 0x2800).toString(2).replaceAll('0', '').length, 0);
    expect(popcount(a.map(cell => cell.character).join(''))).toBeGreaterThan(100);
    expect(popcount(a.map(cell => cell.character).join(''))).toBeLessThan(155);
    expect(a.some(cell => cell.character !== '⠀' && cell.character !== '⣿')).toBe(true);
    const repeat = createDitherState(32);
    expect(brailleStripToCells(pixels, 32, ditherSettings, repeat)).toEqual(a);
    expect(brailleStripToCells(pixels, 32, ditherSettings, repeat)).toEqual(b);
    expect(state.current.some(value => value !== 0)).toBe(true);
  });
  it('no activa transparencias aunque reciban errores del dithering', () => {
    const state = createDitherState(1);
    state.current.fill(1000);
    expect(brailleStripToCells(samples(1, 255, 0), 1, { ...settings, brailleDither: true, brailleThreshold: 0 }, state)[0].character).toBe('⠀');
  });
  it('intensidades preparadas no vuelven a multiplicar el RGB ya compuesto por alpha', () => {
    const pixels = samples(1, 0, 0);
    pixels.set([128, 0, 0, 128], 0);
    const intensities = new Float32Array(8); intensities[0] = 255;
    expect(brailleStripToCells(pixels, 1, settings, createDitherState(1), intensities)[0]).toEqual({ character: '⠁', color: 'rgb(128,0,0)' });
  });
});
