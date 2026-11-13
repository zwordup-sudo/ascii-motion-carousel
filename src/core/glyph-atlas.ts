import type { MeasuredFont } from './canvas';
import { context2d } from './canvas-context';
import { BoundedCache } from './cache';

export interface GlyphAtlas {
  masks: HTMLCanvasElement[];
  coverage: number[];
  levels: number[];
  width: number; height: number;
  fits: boolean;
}
const ATLAS_BYTES = 16 * 1024 * 1024;
const cache = new BoundedCache<GlyphAtlas>(ATLAS_BYTES);
export function assertGlyphBudget(width: number, height: number, count: number) {
  if (width > 512 || height > 512 || width * height * count * 4 > ATLAS_BYTES) {
    throw new Error('El conjunto requiere un atlas de glifos demasiado grande. Reduce la secuencia o los signos combinados.');
  }
}

/** Rasterize real glyphs once at a fixed reference size, independent of export size. */
export function glyphAtlas(characters: readonly string[], family: string, font: MeasuredFont, style: string, fontScale: number): GlyphAtlas {
  const effectiveScale = Math.min(1, fontScale);
  const key = JSON.stringify([characters, family, style, effectiveScale]);
  const cached = cache.get(key);
  if (cached) return cached;
  const blocks = style === 'shading';
  const braille = style === 'true-braille';
  const full = font.glyphs.get(blocks ? '█' : '⣿');
  const width = Math.max(1, Math.ceil(blocks && full ? full.left + full.right : Math.max(font.advance, font.inkWidth)));
  const height = Math.max(1, Math.ceil(blocks && full ? full.ascent + full.descent : Math.max(font.lineHeight, font.inkHeight)));
  assertGlyphBudget(width, height, characters.length);
  const masks: HTMLCanvasElement[] = [];
  const coverage: number[] = [];
  let fits = true;
  for (const character of characters) {
    const mask = document.createElement('canvas'); mask.width = width; mask.height = height;
    const ctx = context2d(mask, true);
    const metric = (blocks || braille) && full ? full : font.glyphs.get(character)!;
    const scale = effectiveScale * (blocks ? 1 : .98);
    const ink = font.glyphs.get(character)!;
    const left = width / 2 + scale * ((metric.left - metric.right) / 2 - ink.left);
    const top = height / 2 + scale * ((metric.ascent - metric.descent) / 2 - ink.ascent);
    fits &&= left >= -.01 && top >= -.01 && left + scale * (ink.left + ink.right) <= width + .01
      && top + scale * (ink.ascent + ink.descent) <= height + .01;
    ctx.translate(width / 2, height / 2); ctx.scale(scale, scale);
    ctx.font = `100px ${family}`; ctx.fillStyle = '#fff';
    ctx.fillText(character, (metric.left - metric.right) / 2, (metric.ascent - metric.descent) / 2);
    const data = ctx.getImageData(0, 0, width, height).data;
    let alpha = 0; for (let i = 3; i < data.length; i += 4) alpha += data[i];
    coverage.push(alpha / (255 * width * height));
    masks.push(mask);
  }
  const maximum = Math.max(...coverage);
  const levels = style === 'custom' ? characters.map((_, i) => i / (characters.length - 1)) : coverage.map(value => maximum ? value / maximum : 0);
  if (!fits) throw new Error('La tinta de un glifo excede su celda de referencia.');
  const atlas = { masks, coverage, levels, width, height, fits };
  cache.set(key, atlas, masks.length * width * height * 4);
  return atlas;
}
