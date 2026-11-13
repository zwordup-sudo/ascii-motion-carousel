import { averageSamples, gridFor, pixelsToCells, type AsciiSettings } from './ascii';
import { glyphsFor, splitCharacters } from './styles';
import { brailleStripToCells, createDitherState } from './braille';
import { ensureStyleFont, fontForStyle } from '../fonts';
import { context2d, yieldToBrowser } from './canvas-context';
export { context2d, yieldToBrowser } from './canvas-context';
import { renderFidelity } from './fidelity';

const REFERENCE_PX = 100;
const isColorGlyph = (character: string) => /[\p{Extended_Pictographic}\p{Regional_Indicator}\u20e3]/u.test(character);
export const FONT_FAMILY = 'monospace';
export interface GlyphMetric { left: number; right: number; ascent: number; descent: number }
export interface MeasuredFont {
  advance: number;
  lineHeight: number;
  inkWidth: number;
  inkHeight: number;
  glyphs: Map<string, GlyphMetric>;
}
const fonts = new Map<string, MeasuredFont>();

/** Measure all ramp glyphs once, including their actual bearings and descenders. */
export function measureFont(ramp: string | readonly string[], family = FONT_FAMILY): MeasuredFont {
  const characters = typeof ramp === 'string' ? splitCharacters(ramp) : ramp;
  const key = JSON.stringify([family, characters]);
  const cached = fonts.get(key);
  if (cached) return cached;
  const ctx = context2d(document.createElement('canvas'));
  ctx.font = `${REFERENCE_PX}px ${family}`;
  ctx.textAlign = 'left';
  ctx.textBaseline = 'alphabetic';
  let advance = 0, lineHeight = 0, inkWidth = 0, inkHeight = 0;
  const glyphs = new Map<string, GlyphMetric>();
  for (const character of characters) {
    const metric = ctx.measureText(character);
    const glyph = { left: metric.actualBoundingBoxLeft, right: metric.actualBoundingBoxRight,
      ascent: metric.actualBoundingBoxAscent, descent: metric.actualBoundingBoxDescent };
    glyphs.set(character, glyph);
    advance = Math.max(advance, metric.width);
    inkWidth = Math.max(inkWidth, glyph.left + glyph.right);
    inkHeight = Math.max(inkHeight, glyph.ascent + glyph.descent);
    lineHeight = Math.max(lineHeight, (metric.fontBoundingBoxAscent ?? glyph.ascent) + (metric.fontBoundingBoxDescent ?? glyph.descent));
  }
  const font = { advance, lineHeight: Math.max(lineHeight, inkHeight), inkWidth, inkHeight, glyphs };
  fonts.set(key, font);
  if (fonts.size > 16) fonts.delete(fonts.keys().next().value!);
  return font;
}

/** Shared by preview and export; cooperative slices keep input/cancel responsive. */
export async function renderAscii(
  image: CanvasImageSource, width: number, height: number, settings: AsciiSettings,
  size: number, signal?: AbortSignal,
): Promise<HTMLCanvasElement> {
  signal?.throwIfAborted();
  await ensureStyleFont(settings.ramp);
  signal?.throwIfAborted();
  const characters = glyphsFor(settings.ramp, settings.customRamp);
  const family = fontForStyle(settings.ramp);
  const font = measureFont(characters, family);
  if (!font.inkWidth || !font.inkHeight) throw new Error('El conjunto no contiene glifos visibles en la tipografía disponible.');
  if (!settings.processing.legacy) return renderFidelity(image, width, height, settings, size, font, characters, family, signal);
  const trueBraille = settings.ramp === 'true-braille';
  const grid = gridFor(settings.columns, width, height, font, size);
  const sample = document.createElement('canvas');
  sample.width = grid.columns * 2;
  const stripHeight = trueBraille ? 4 : 2;
  sample.height = grid.rows * stripHeight;
  const sampler = context2d(sample, true);
  sampler.imageSmoothingEnabled = true;
  sampler.imageSmoothingQuality = 'high';
  sampler.drawImage(image, 0, 0, sample.width, sample.height);
  // Process strips: no giant cell-object array, even on extreme portrait inputs.
  const output = document.createElement('canvas');
  output.width = output.height = size;
  output.dataset.columns = String(grid.columns);
  output.dataset.rows = String(grid.rows);
  output.dataset.limited = String(grid.limited);
  output.dataset.style = settings.ramp;
  output.dataset.fontFamily = family;
  const ctx = context2d(output);
  ctx.fillStyle = '#000';
  ctx.fillRect(0, 0, size, size);
  const colorMasks = new Map<string, HTMLCanvasElement>();
  const tint = document.createElement('canvas');
  try {
    // Start with a gutter; tiny-size hinting needs an additional real-size measure.
    let fontSize = Math.min(grid.cellWidth / font.inkWidth, grid.cellHeight / font.inkHeight) * REFERENCE_PX * .76 * settings.fontScale;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'alphabetic';
    let glyphs = new Map<string, GlyphMetric>();
    for (let attempt = 0; attempt < 16; attempt++) {
      ctx.font = `${fontSize}px ${family}`;
      glyphs = new Map(characters.map(character => {
        if (settings.ramp === 'custom' && isColorGlyph(character)) {
          // Some color fonts cannot rasterize below a fixed minimum. Measure at
          // 100px and scale an alpha mask instead of shrinking into a font floor.
          const reference = font.glyphs.get(character)!;
          const scale = fontSize / REFERENCE_PX;
          return [character, { left: reference.left * scale, right: reference.right * scale,
            ascent: reference.ascent * scale, descent: reference.descent * scale }];
        }
        const m = ctx.measureText(character);
        return [character, { left: m.actualBoundingBoxLeft, right: m.actualBoundingBoxRight,
          ascent: m.actualBoundingBoxAscent, descent: m.actualBoundingBoxDescent }];
      }));
      const width = Math.max(...Array.from(glyphs.values(), m => m.left + m.right));
      const height = Math.max(...Array.from(glyphs.values(), m => m.ascent + m.descent));
      if (width <= grid.cellWidth && height <= grid.cellHeight) break;
      fontSize *= Math.min(grid.cellWidth / width, grid.cellHeight / height) * .95;
      if (attempt === 15) throw new Error('La tipografía no cabe en esta resolución. Usa Automática o reduce columnas.');
    }
    output.dataset.fontSize = String(fontSize);
    if (settings.ramp === 'custom' && characters.some(isColorGlyph)) {
      // Color-emoji fonts ignore fillStyle. Use only their alpha, then tint it,
      // so Custom still honors source colors and monochrome like every style.
      tint.width = Math.ceil(font.inkWidth) + 2;
      tint.height = Math.ceil(font.inkHeight) + 2;
      for (const character of characters.filter(isColorGlyph)) {
        const metric = font.glyphs.get(character)!;
        const mask = document.createElement('canvas');
        mask.width = Math.max(1, Math.ceil(metric.left + metric.right) + 2);
        mask.height = Math.max(1, Math.ceil(metric.ascent + metric.descent) + 2);
        const context = context2d(mask);
        context.font = `${REFERENCE_PX}px ${family}`;
        context.fillText(character, metric.left + 1, metric.ascent + 1);
        colorMasks.set(character, mask);
      }
    }
    const dither = trueBraille ? createDitherState(grid.columns) : undefined;
    let sliceStart = performance.now();
    for (let row = 0; row < grid.rows; row++) {
      const samples = sampler.getImageData(0, row * stripHeight, sample.width, stripHeight).data;
      const cells = trueBraille ? brailleStripToCells(samples, grid.columns, settings, dither)
        : pixelsToCells(averageSamples(samples, grid.columns, 1), settings, characters);
      for (let column = 0; column < grid.columns; column++) {
        const cell = cells[column];
        if (cell.character === ' ' || cell.character === '\u2800') continue;
        // All Braille patterns MUST share the full cell's origin: centering each
        // partial ink box would move a top dot to the middle and destroy its bits.
        const metric = glyphs.get(trueBraille ? '\u28ff' : cell.character)!;
        ctx.fillStyle = cell.color;
        const x = grid.fit.x + (column + .5) * grid.cellWidth + (metric.left - metric.right) / 2;
        const y = grid.fit.y + (row + .5) * grid.cellHeight + (metric.ascent - metric.descent) / 2;
        const mask = colorMasks.get(cell.character);
        if (mask) {
          const color = context2d(tint);
          color.clearRect(0, 0, tint.width, tint.height);
          color.drawImage(mask, 0, 0);
          color.globalCompositeOperation = 'source-in';
          color.fillStyle = cell.color;
          color.fillRect(0, 0, tint.width, tint.height);
          color.globalCompositeOperation = 'source-over';
          const scale = fontSize / REFERENCE_PX;
          ctx.drawImage(tint, 0, 0, mask.width, mask.height, x - metric.left - scale, y - metric.ascent - scale, mask.width * scale, mask.height * scale);
        } else ctx.fillText(cell.character, x, y);
      }
      if (performance.now() - sliceStart >= 8) {
        await yieldToBrowser(signal);
        sliceStart = performance.now();
      }
    }
    signal?.throwIfAborted();
    return output;
  } catch (error) {
    output.width = output.height = 0;
    throw error;
  } finally {
    // Also release backing stores on cancellation, before decoding another image.
    sample.width = sample.height = 0;
    tint.width = tint.height = 0;
    for (const mask of colorMasks.values()) mask.width = mask.height = 0;
  }
}
