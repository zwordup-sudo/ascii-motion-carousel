import { adjustChannel, luminance, type AsciiCell, type AsciiSettings } from './ascii';

// Unicode numbers dots down the first three rows, then appends bottom dots 7/8.
export const BRAILLE_BITS = [[1, 8], [2, 16], [4, 32], [64, 128]] as const;
export interface DitherState { current: Float32Array; next: Float32Array }
export function createDitherState(columns: number): DitherState {
  return { current: new Float32Array(columns * 2 + 2), next: new Float32Array(columns * 2 + 2) };
}

/** Four dot-rows (2×4 samples per character), processed left-to-right/top-to-bottom.
 * Keep the error rows across strips: Floyd–Steinberg crosses character boundaries.
 */
export function brailleStripToCells(
  pixels: Uint8ClampedArray, columns: number, settings: AsciiSettings, state = createDitherState(columns), preparedIntensity?: Float32Array,
): AsciiCell[] {
  if (pixels.length !== columns * 32 || state.current.length !== columns * 2 + 2) throw new Error('Muestras Braille inconsistentes.');
  if (!Number.isInteger(settings.brailleThreshold) || settings.brailleThreshold < 0 || settings.brailleThreshold > 255) throw new Error('Umbral Braille inválido.');
  const masks = new Uint8Array(columns);
  const sums = new Float64Array(columns * 3);
  const counts = new Uint8Array(columns);
  const width = columns * 2;
  for (let row = 0; row < 4; row++) {
    for (let x = 0; x < width; x++) {
      const offset = (row * width + x) * 4;
      const alpha = pixels[offset + 3] / 255;
      if (!alpha) continue; // Transparent dots stay off even at threshold zero/with errors.
      const rgb = [0, 1, 2].map(c => adjustChannel(pixels[offset + c] * (preparedIntensity ? 1 : alpha), settings.contrast, settings.brightness));
      const value = Math.max(0, Math.min(255, (preparedIntensity?.[row * width + x] ?? luminance(rgb[0], rgb[1], rgb[2])) + (settings.brailleDither ? state.current[x + 1] : 0)));
      const active = value >= settings.brailleThreshold;
      const column = Math.floor(x / 2);
      if (active) {
        masks[column] |= BRAILLE_BITS[row][x % 2];
        counts[column]++;
        for (let c = 0; c < 3; c++) sums[column * 3 + c] += rgb[c];
      }
      if (settings.brailleDither) {
        const error = value - (active ? 255 : 0);
        state.current[x + 2] += error * 7 / 16;
        state.next[x] += error * 3 / 16;
        state.next[x + 1] += error * 5 / 16;
        state.next[x + 2] += error / 16;
      }
    }
    [state.current, state.next] = [state.next, state.current];
    state.next.fill(0);
  }
  return Array.from(masks, (mask, column) => ({
    character: String.fromCodePoint(0x2800 + mask),
    color: settings.color ? `rgb(${[0, 1, 2].map(c => counts[column] ? Math.round(sums[column * 3 + c] / counts[column]) : 0).join(',')})` : '#c8ff62',
  }));
}
