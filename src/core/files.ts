export const MAX_FILES = 20;
export const MAX_FILE_BYTES = 10 * 1024 * 1024;
export const MAX_PIXELS = 16_000_000;
const TYPES = new Set(['image/jpeg', 'image/png', 'image/webp']);

export function validateFile(file: Pick<File, 'name' | 'type' | 'size'>): string | null {
  if (!TYPES.has(file.type)) return `${file.name}: usa JPG, PNG o WebP.`;
  if (file.size === 0) return `${file.name}: el archivo está vacío.`;
  if (file.size > MAX_FILE_BYTES) return `${file.name}: supera el límite de 10 MiB.`;
  return null;
}

export function validateDimensions(width: number, height: number) {
  if (!Number.isFinite(width + height) || width <= 0 || height <= 0 || width * height > MAX_PIXELS) {
    throw new Error('La imagen debe tener entre 1 y 16 millones de píxeles.');
  }
}
