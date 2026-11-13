export const EXPORT_SIZES = [320, 640, 1024, 2048] as const;
export type OutputSize = typeof EXPORT_SIZES[number];
export type Resolution = 'auto' | '320' | '640' | '1024';
export const MAX_GIF_BYTES = 32 * 1024 * 1024;
export const CACHE_BYTES = 16 * 1024 * 1024;

export function resolveSize(resolution: Resolution, columns: number, width = 1, height = 1): OutputSize {
  if (resolution !== 'auto') {
    const size = Number(resolution);
    if (size !== 320 && size !== 640 && size !== 1024) throw new Error('Resolución no permitida.');
    return size;
  }
  // Portraits have a narrower content rectangle inside the common square output.
  const required = columns * 6 * Math.max(1, height / width);
  return EXPORT_SIZES.find(size => size >= required) ?? 2048;
}

export function qualityWarning(size: number, columns: number, width = 1, height = 1): string | null {
  const pixels = size * Math.min(1, width / height) / columns;
  return pixels < 5
    ? `Resolución insuficiente: ${pixels.toFixed(1)} px por carácter. Los glifos perderán detalle; usa Automática o menos columnas.`
    : null;
}

export function rgbaBytes(size: number): number { return size * size * 4; }
