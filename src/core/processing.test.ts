import { describe, expect, it } from 'vitest';
import { DEFAULT_PROCESSING, createDiffusion, histogramLevels, mapDensityRow, nearestLevel, processRaster, sobelAt, type ProcessingSettings } from './processing';
import { DEFAULT_SETTINGS } from './ascii';
import { applyProcessingPreset, PROCESSING_PRESETS } from './presets';
import { assertGlyphBudget } from './glyph-atlas';

function pixels(values: number[], alpha = 255) { return new Uint8ClampedArray(values.flatMap(value => [value, value, value, alpha])); }
function run(values: Uint8ClampedArray, width: number, overrides: Partial<ProcessingSettings> = {}) {
  const work = processRaster(values, width, values.length / (4 * width), { contrast: 1, brightness: 0 }, { ...DEFAULT_PROCESSING, ...overrides });
  let next = work.next(); while (!next.done) next = work.next(); return next.value;
}

describe('procesamiento independiente de resolución', () => {
  it('neutral conserva sRGB perceptual y compone transparencia una sola vez', () => {
    const image = run(pixels([0, 64, 128, 255]), 4);
    expect(Array.from(image.intensity)).toEqual([0, 64, 128, 255]);
    const alpha = run(new Uint8ClampedArray([200, 100, 0, 128]), 1);
    expect(Array.from(alpha.rgba)).toEqual([100, 50, 0, 128]);
    expect(alpha.base[0]).toBeCloseTo(57.02);
  });
  it('gamma cambia intensidad pero no contamina RGB', () => {
    const input = pixels([64, 128]);
    expect(run(input, 2, { gamma: 2 }).intensity[0]).toBeCloseTo(Math.sqrt(64 / 255) * 255);
    expect(Array.from(run(input, 2, { gamma: 2 }).rgba)).toEqual(Array.from(input));
  });
  it('usa percentiles ponderados por alpha sin incluir invisibles', () => {
    const histogram = new Uint32Array(256); histogram[0] = 1; histogram[80] = 100; histogram[160] = 100; histogram[255] = 1;
    expect(histogramLevels(histogram, 1, 99)).toEqual({ low: 80, high: 160, applied: true });
    const image = run(pixels([80, 100, 120, 160]), 4, { autoContrast: true, lowPercentile: 0, highPercentile: 100 });
    expect(image.intensity[0]).toBe(0); expect(image.intensity[3]).toBe(255);
    expect(Array.from(image.rgba)).toEqual(Array.from(pixels([80, 100, 120, 160])));
    expect(run(pixels([128, 128, 128]), 3, { autoContrast: true }).levels.applied).toBe(false);
    expect(run(pixels([200, 255], 0), 2, { autoContrast: true }).levels.applied).toBe(false);
  });
  it('Sobel responde a contornos pero no a planos ni ruido débil', () => {
    const plane = run(pixels(Array(25).fill(100)), 5);
    expect(sobelAt(plane.intensity, plane.rgba, 5, 5, 2, 2)).toBe(0);
    const step = pixels(Array.from({ length: 25 }, (_, i) => i % 5 < 2 ? 40 : 160));
    const before = run(step, 5), after = run(step, 5, { edgeStrength: 1 });
    expect(after.intensity[2 * 5 + 1]).toBeLessThan(before.intensity[2 * 5 + 1]);
    expect(after.intensity[2 * 5 + 2]).toBeGreaterThan(before.intensity[2 * 5 + 2]);
    expect(after.intensity[2 * 5 + 4]).toBe(before.intensity[2 * 5 + 4]);
    expect(Array.from(after.rgba)).toEqual(Array.from(before.rgba));
    const gradient = pixels(Array.from({ length: 25 }, (_, i) => 30 + i % 5 * 30));
    expect(run(gradient, 5, { edgeStrength: 2 }).intensity[12]).toBe(run(gradient, 5).intensity[12]);
  });
  it('inversión es reversible y dithering opera sobre densidad, nunca RGB', () => {
    const image = run(pixels(Array(32).fill(127)), 32);
    const levels = [0, 1];
    const plain = mapDensityRow(image, 0, levels, true, DEFAULT_PROCESSING, createDiffusion(32));
    const dither = mapDensityRow(image, 0, levels, true, { ...DEFAULT_PROCESSING, dither: true }, createDiffusion(32));
    expect(new Set(dither.indices).size).toBe(2);
    expect(Array.from(dither.indices).reduce((a, b) => a + b, 0)).toBeGreaterThan(12);
    expect(dither.colors).toEqual(plain.colors);
    const ramp = run(pixels([0, 64, 128, 255]), 4);
    const normal = mapDensityRow(ramp, 0, [0, .25, .5, .75, 1], false, DEFAULT_PROCESSING, createDiffusion(4));
    const inverse = mapDensityRow(ramp, 0, [0, .25, .5, .75, 1], false, { ...DEFAULT_PROCESSING, invert: true }, createDiffusion(4));
    expect(Array.from(normal.indices)).toEqual([0, 1, 2, 4]); expect(Array.from(inverse.indices)).toEqual([4, 3, 2, 0]);
    expect(nearestLevel(.49, [0, .51, 1])).toBe(1);
  });
  it('separa cromaticidad y cobertura para no multiplicar dos veces la oscuridad', () => {
    const image = run(new Uint8ClampedArray([64, 128, 32, 255]), 1);
    const mapped = mapDensityRow(image, 0, [0, .25, .5, .75, 1], true, DEFAULT_PROCESSING, createDiffusion(1));
    expect(mapped.indices[0]).toBe(2); expect(mapped.colors[0]).toBe('rgb(128,255,64)');
  });
  it.each(PROCESSING_PRESETS)('$name configura controles sin tocar columnas, resolución ni algoritmo', preset => {
    const result = applyProcessingPreset({ ...DEFAULT_SETTINGS, columns: 300 }, preset.id);
    expect(result.columns).toBe(300); expect(result.processing.legacy).toBe(false);
    expect(result.processing.gamma).toBe(preset.gamma);
  });
  it('rechaza configuraciones fuera de rango', () => {
    expect(() => run(pixels([128]), 1, { gamma: 0 })).toThrow();
    expect(() => run(pixels([128]), 1, { lowPercentile: 99, highPercentile: 1 })).toThrow();
  });
  it('acota atlas de grafemas extremos antes de asignar sus lienzos', () => {
    expect(() => assertGlyphBudget(80, 128, 256)).not.toThrow();
    expect(() => assertGlyphBudget(513, 100, 2)).toThrow('atlas');
    expect(() => assertGlyphBudget(512, 512, 128)).toThrow('atlas');
  });
});
