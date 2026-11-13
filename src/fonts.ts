import licenseUrl from 'dejavu-fonts-ttf/LICENSE?url';
import type { StyleId } from './core/styles';

export { licenseUrl as fontLicenseUrl };
export const BRAILLE_FONT = '"Carousel Braille", monospace';
export const SYMBOL_FONT = '"Carousel Symbols", "Carousel Braille", "Segoe UI Symbol", monospace';
export function fontForStyle(style: StyleId): string {
  if (style === 'true-braille') return BRAILLE_FONT;
  return ['standard', 'detailed', 'blocks'].includes(style) ? 'monospace' : SYMBOL_FONT;
}

let loaded: Promise<void> | undefined;
export async function ensureStyleFont(style: StyleId): Promise<void> {
  if (fontForStyle(style) === 'monospace') return;
  loaded ??= Promise.all([
    document.fonts.load('100px "Carousel Symbols"', '░●'),
    document.fonts.load('100px "Carousel Braille"', '⣿'),
  ]).then(faces => {
    if (faces.some(face => !face.length)) throw new Error('No se pudo cargar la tipografía local de símbolos. Recarga la página.');
  });
  await loaded;
}
