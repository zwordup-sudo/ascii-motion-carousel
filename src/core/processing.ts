import { adjustChannel, clamp, luminance } from './color';
const NEIGHBORS = [[-1, 0], [1, 0], [0, -1], [0, 1]] as const;

export interface ProcessingSettings {
  invert: boolean;
  autoContrast: boolean;
  lowPercentile: number;
  highPercentile: number;
  gamma: number;
  edgeStrength: number;
  dither: boolean;
  /** Only for the explicitly labelled V0.3 comparison, never a hidden preset. */
  legacy: boolean;
}
export const DEFAULT_PROCESSING: ProcessingSettings = {
  invert: false, autoContrast: false, lowPercentile: 1, highPercentile: 99,
  gamma: 1, edgeStrength: 0, dither: false, legacy: false,
};
export const LEGACY_PROCESSING: ProcessingSettings = { ...DEFAULT_PROCESSING, legacy: true };
export interface Raster {
  width: number; height: number;
  rgba: Uint8ClampedArray;
  base: Float32Array;
  intensity: Float32Array;
  levels: { low: number; high: number; applied: boolean };
}

export function validateProcessing(p: ProcessingSettings) {
  if (!Number.isFinite(p.gamma) || p.gamma < .5 || p.gamma > 2.5
    || !Number.isFinite(p.edgeStrength) || p.edgeStrength < 0 || p.edgeStrength > 2
    || !Number.isFinite(p.lowPercentile + p.highPercentile) || p.lowPercentile < 0 || p.highPercentile > 100
    || p.lowPercentile >= p.highPercentile) throw new Error('Ajustes de procesamiento inválidos.');
}

export function histogramLevels(histogram: Uint32Array, low: number, high: number) {
  const total = histogram.reduce((sum, count) => sum + count, 0);
  if (!total) return { low: 0, high: 255, applied: false };
  const percentile = (percent: number) => {
    const target = Math.max(1, total * percent / 100);
    let cumulative = 0;
    for (let i = 0; i < 256; i++) { cumulative += histogram[i]; if (cumulative >= target) return i; }
    return 255;
  };
  const lo = percentile(low), hi = percentile(high);
  return { low: lo, high: hi, applied: hi - lo >= 16 };
}

export function sobelAt(values: Float32Array, alpha: Uint8ClampedArray, width: number, height: number, x: number, y: number): number {
  const center = values[y * width + x];
  const sample = (dx: number, dy: number) => {
    const index = clamp(y + dy, 0, height - 1) * width + clamp(x + dx, 0, width - 1);
    return alpha[index * 4 + 3] ? values[index] : center;
  };
  const gx = -sample(-1, -1) - 2 * sample(-1, 0) - sample(-1, 1) + sample(1, -1) + 2 * sample(1, 0) + sample(1, 1);
  const gy = -sample(-1, -1) - 2 * sample(0, -1) - sample(1, -1) + sample(-1, 1) + 2 * sample(0, 1) + sample(1, 1);
  return Math.max(0, Math.hypot(gx, gy) / 4 - 8); // Suppress small tonal noise.
}

/** Pure incremental pipeline; adapters may yield between strips without changing results. */
export function* processRaster(
  pixels: Uint8ClampedArray, width: number, height: number,
  tone: { brightness: number; contrast: number }, p: ProcessingSettings,
): Generator<void, Raster> {
  validateProcessing(p);
  if (pixels.length !== width * height * 4) throw new Error('Raster de procesamiento inconsistente.');
  const rgba = new Uint8ClampedArray(pixels.length);
  const base = new Float32Array(width * height);
  const intensity = new Float32Array(base.length);
  const histogram = new Uint32Array(256);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = y * width + x, offset = i * 4, alpha = pixels[offset + 3];
      rgba[offset + 3] = alpha;
      if (!alpha) continue;
      for (let c = 0; c < 3; c++) rgba[offset + c] = pixels[offset + c] * alpha / 255;
      base[i] = luminance(rgba[offset], rgba[offset + 1], rgba[offset + 2]);
      intensity[i] = 255 * Math.pow(adjustChannel(base[i], tone.contrast, tone.brightness) / 255, 1 / p.gamma);
      histogram[Math.round(intensity[i])] += alpha;
    }
    if (y % 16 === 15) yield;
  }
  const levels = p.autoContrast ? histogramLevels(histogram, p.lowPercentile, p.highPercentile) : { low: 0, high: 255, applied: false };
  if (levels.applied) {
    const middle = (levels.low + levels.high) / 2;
    const gain = Math.min(4, 255 / (levels.high - levels.low));
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const i = y * width + x;
        if (rgba[i * 4 + 3]) intensity[i] = clamp((intensity[i] - middle) * gain + 127.5);
      }
      if (y % 16 === 15) yield;
    }
  }
  if (p.edgeStrength) {
    const original = intensity.slice();
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const i = y * width + x;
        if (!rgba[i * 4 + 3]) continue;
        const edge = sobelAt(original, rgba, width, height, x, y);
        if (!edge) continue;
        let average = 0;
        for (const [dx, dy] of NEIGHBORS) {
          const neighbor = clamp(y + dy, 0, height - 1) * width + clamp(x + dx, 0, width - 1);
          average += rgba[neighbor * 4 + 3] ? original[neighbor] : original[i];
        }
        const detail = original[i] - average / 4;
        // Sobel gates a signed local-contrast correction, rather than whitening
        // both sides of an edge. Linear gradients/flat areas are not boosted.
        intensity[i] = clamp(original[i] + Math.sign(detail) * p.edgeStrength * Math.min(64, edge * .5) * Math.min(1, Math.abs(detail) / 8));
      }
      if (y % 8 === 7) yield;
    }
  }
  return { width, height, rgba, base, intensity, levels };
}

export interface Diffusion { current: Float32Array; next: Float32Array }
export function createDiffusion(width: number): Diffusion { return { current: new Float32Array(width + 2), next: new Float32Array(width + 2) }; }
export function nearestLevel(value: number, levels: readonly number[]): number {
  let best = 0;
  for (let i = 1; i < levels.length; i++) if (Math.abs(levels[i] - value) < Math.abs(levels[best] - value)) best = i;
  return best;
}

/** Density and chroma are separate: no dark ink × dark character double attenuation. */
export function mapDensityRow(raster: Raster, row: number, levels: readonly number[], color: boolean, p: ProcessingSettings, state: Diffusion) {
  const indices = new Uint16Array(raster.width);
  const ink = new Uint8ClampedArray(raster.width * 3);
  const colors: string[] = [];
  for (let x = 0; x < raster.width; x++) {
    const i = row * raster.width + x, offset = i * 4;
    if (!raster.rgba[offset + 3]) { indices[x] = 65535; colors.push('#000'); continue; }
    const rgb = [raster.rgba[offset], raster.rgba[offset + 1], raster.rgba[offset + 2]];
    const maximum = Math.max(...rgb);
    const base = raster.base[i];
    const ratio = base > .001 ? raster.intensity[i] / base : raster.intensity[i] / 255;
    let density = color && maximum ? maximum / 255 * ratio : raster.intensity[i] / 255;
    density = clamp(density, 0, 1);
    if (p.invert) density = 1 - density;
    const value = clamp(density + (p.dither ? state.current[x + 1] : 0), 0, 1);
    const index = nearestLevel(value, levels);
    indices[x] = index;
    const channels = color ? rgb.map(channel => maximum ? Math.round(channel * 255 / maximum) : 255) : [200, 255, 98];
    ink.set(channels, x * 3);
    colors.push(color ? `rgb(${channels.join(',')})` : '#c8ff62');
    if (p.dither) {
      const error = value - levels[index];
      state.current[x + 2] += error * 7 / 16;
      state.next[x] += error * 3 / 16;
      state.next[x + 1] += error * 5 / 16;
      state.next[x + 2] += error / 16;
    }
  }
  [state.current, state.next] = [state.next, state.current];
  state.next.fill(0);
  return { indices, colors, ink };
}
