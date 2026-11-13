import { glyphsFor, RAMPS, splitCharacters, type StyleId } from './styles';
import { DEFAULT_PROCESSING, type ProcessingSettings } from './processing';
import { adjustChannel, luminance } from './color';
export { adjustChannel, luminance } from './color';
export { RAMPS } from './styles';

export const OUTPUT_SIZE = 320;
export const COLUMN_PRESETS = [16, 48, 96, 160, 300] as const;
export const MAX_ROWS = 2048;

export interface AsciiSettings {
  columns: number;
  fontScale: number;
  contrast: number;
  brightness: number;
  color: boolean;
  ramp: StyleId;
  customRamp: string;
  brailleThreshold: number;
  brailleDither: boolean;
  processing: ProcessingSettings;
}

export const DEFAULT_SETTINGS: AsciiSettings = {
  columns: 96, fontScale: 1, contrast: 1.15, brightness: 0, color: true, ramp: 'standard',
  customRamp: RAMPS.standard, brailleThreshold: 128, brailleDither: false,
  processing: { ...DEFAULT_PROCESSING, dither: true },
};

export function characterFor(value: number, ramp: string | readonly string[] = RAMPS.standard): string {
  const characters = typeof ramp === 'string' ? splitCharacters(ramp) : ramp;
  const normalized = Math.max(0, Math.min(255, value));
  return characters[Math.round((normalized / 255) * (characters.length - 1))];
}

export function containRect(width: number, height: number, size = OUTPUT_SIZE) {
  if (width <= 0 || height <= 0 || !Number.isFinite(width + height)) {
    throw new Error('Dimensiones de imagen inválidas.');
  }
  const scale = Math.min(size / width, size / height);
  const w = width * scale;
  const h = height * scale;
  return { x: (size - w) / 2, y: (size - h) / 2, width: w, height: h };
}

export interface FontGeometry { advance: number; lineHeight: number }

export function gridFor(columns: number, width: number, height: number, font: FontGeometry, size = OUTPUT_SIZE) {
  if (!Number.isInteger(columns) || columns < 16 || columns > 300) throw new Error('Usa entre 16 y 300 columnas.');
  const fit = containRect(width, height, size);
  const naturalRows = Math.max(1, Math.round(columns * height / width * font.advance / font.lineHeight));
  const rows = Math.min(MAX_ROWS, naturalRows);
  return { columns, rows, cellWidth: fit.width / columns, cellHeight: fit.height / rows, fit, limited: rows !== naturalRows };
}

/** Explicit 2×2 area average. Every cell receives its own four source samples. */
export function averageSamples(samples: Uint8ClampedArray, columns: number, rows: number): Uint8ClampedArray {
  if (samples.length !== columns * rows * 16) throw new Error('Muestras de imagen inconsistentes.');
  const result = new Uint8ClampedArray(columns * rows * 4);
  const stride = columns * 2 * 4;
  for (let y = 0; y < rows; y++) {
    for (let x = 0; x < columns; x++) {
      const start = y * 2 * stride + x * 8;
      const offsets = [start, start + 4, start + stride, start + stride + 4];
      const alpha = offsets.reduce((sum, offset) => sum + samples[offset + 3], 0);
      const target = (y * columns + x) * 4;
      // Alpha-weight colors so translucent details are composed on black just once.
      for (let c = 0; c < 3; c++) {
        result[target + c] = alpha ? offsets.reduce((sum, offset) => sum + samples[offset + c] * samples[offset + 3], 0) / alpha : 0;
      }
      result[target + 3] = alpha / 4;
    }
  }
  return result;
}

export interface AsciiCell { character: string; color: string }

/** Each sample is an area-averaged RGBA pixel, never a photographic background. */
export function pixelsToCells(pixels: Uint8ClampedArray, settings: AsciiSettings, preparedGlyphs?: readonly string[]): AsciiCell[] {
  if (settings.ramp === 'true-braille') throw new Error('True Braille requiere ocho muestras por celda, no una rampa.');
  const glyphs = preparedGlyphs ?? glyphsFor(settings.ramp, settings.customRamp);
  const cells: AsciiCell[] = [];
  for (let i = 0; i < pixels.length; i += 4) {
    const alpha = pixels[i + 3] / 255;
    const channels = [0, 1, 2].map(c => adjustChannel(pixels[i + c] * alpha, settings.contrast, settings.brightness));
    cells.push({
      character: alpha === 0 ? ' ' : characterFor(luminance(channels[0], channels[1], channels[2]), glyphs),
      color: settings.color ? `rgb(${channels.map(Math.round).join(',')})` : '#c8ff62',
    });
  }
  return cells;
}
