import { averageSamples, gridFor, type AsciiSettings } from './ascii';
import type { MeasuredFont } from './canvas';
import { context2d, yieldToBrowser } from './canvas-context';
import { glyphAtlas } from './glyph-atlas';
import { brailleStripToCells, createDitherState } from './braille';
import { createDiffusion, mapDensityRow, processRaster } from './processing';

export async function renderFidelity(
  image: CanvasImageSource, width: number, height: number, settings: AsciiSettings, size: number,
  font: MeasuredFont, characters: readonly string[], family: string, signal?: AbortSignal,
): Promise<HTMLCanvasElement> {
  const grid = gridFor(settings.columns, width, height, font, size);
  const braille = settings.ramp === 'true-braille';
  const sample = document.createElement('canvas');
  sample.width = grid.columns * 2; sample.height = grid.rows * (braille ? 4 : 2);
  const ctx = context2d(sample, true);
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(image, 0, 0, sample.width, sample.height);
  const rasterWidth = braille ? grid.columns * 2 : grid.columns;
  const rasterHeight = braille ? grid.rows * 4 : grid.rows;
  let pixels = new Uint8ClampedArray(rasterWidth * rasterHeight * 4);
  const output = document.createElement('canvas'); output.width = output.height = size;
  const out = context2d(output); out.fillStyle = '#000'; out.fillRect(0, 0, size, size);
  const tint = document.createElement('canvas');
  const tile = context2d(tint, true);
  const frame = out.createImageData(size, size);
  for (let i = 3; i < frame.data.length; i += 4) frame.data[i] = 255;
  // Native-size alpha tiles are cached per frame. Tinting pixels avoids hundreds
  // of thousands of Canvas state changes, while still using actual glyph masks.
  const scaled = new Map<string, Uint8Array>();
  let lastYield = performance.now();
  const cooperate = async () => { if (performance.now() - lastYield >= 8) { await yieldToBrowser(signal); lastYield = performance.now(); } };
  try {
    for (let row = 0; row < grid.rows; row++) {
      const samples = ctx.getImageData(0, row * (braille ? 4 : 2), sample.width, braille ? 4 : 2).data;
      pixels.set(braille ? samples : averageSamples(samples, grid.columns, 1), row * rasterWidth * (braille ? 4 : 1) * 4);
      await cooperate();
    }
    sample.width = sample.height = 0;
    const processing = processRaster(pixels, rasterWidth, rasterHeight, settings, settings.processing);
    let next = processing.next();
    while (!next.done) { await cooperate(); signal?.throwIfAborted(); next = processing.next(); }
    const raster = next.value;
    pixels = new Uint8ClampedArray(0);
    const atlas = glyphAtlas(characters, family, font, settings.ramp, settings.fontScale);
    const diffusion = createDiffusion(grid.columns);
    const dotDiffusion = createDitherState(grid.columns);
    const dotSettings = { ...settings, brightness: 0, contrast: 1 };
    let contentHash = 2166136261;
    let asciiSample = '';
    for (let row = 0; row < grid.rows; row++) {
      const mapped = !braille ? mapDensityRow(raster, row, atlas.levels, settings.color, settings.processing, diffusion) : null;
      const dotOffset = row * 4 * rasterWidth;
      const intensities = braille ? raster.intensity.slice(dotOffset, dotOffset + rasterWidth * 4) : undefined;
      if (intensities && settings.processing.invert) for (let i = 0; i < intensities.length; i++) intensities[i] = 255 - intensities[i];
      const dots = braille ? brailleStripToCells(raster.rgba.subarray(dotOffset * 4, (dotOffset + rasterWidth * 4) * 4), grid.columns, dotSettings, dotDiffusion, intensities) : null;
      for (let column = 0; column < grid.columns; column++) {
        const index = dots ? dots[column].character.codePointAt(0)! - 0x2800 : mapped!.indices[column];
        const color = dots ? dots[column].color : mapped!.colors[column];
        if (row === Math.floor(grid.rows / 2)) {
          const character = index === 65535 ? ' ' : characters[index];
          if (asciiSample.length + character.length <= 2048) asciiSample += character;
        }
        contentHash = Math.imul(contentHash ^ index, 16777619);
        for (const c of color) contentHash = Math.imul(contentHash ^ c.charCodeAt(0), 16777619);
        if (index === 65535 || !atlas.coverage[index]) continue;
        // Snap shared cell boundaries, so adjacent full blocks have no subpixel seams.
        const x = Math.round(grid.fit.x + column * grid.cellWidth), y = Math.round(grid.fit.y + row * grid.cellHeight);
        const w = Math.round(grid.fit.x + (column + 1) * grid.cellWidth) - x;
        const h = Math.round(grid.fit.y + (row + 1) * grid.cellHeight) - y;
        if (w <= 0 || h <= 0) continue;
        const key = `${index}:${w}:${h}`;
        let alpha = scaled.get(key);
        if (!alpha) {
          tint.width = w; tint.height = h; tile.imageSmoothingQuality = 'high';
          tile.drawImage(atlas.masks[index], 0, 0, w, h);
          const rgba = tile.getImageData(0, 0, w, h).data;
          alpha = new Uint8Array(w * h);
          for (let i = 0; i < alpha.length; i++) alpha[i] = rgba[i * 4 + 3];
          scaled.set(key, alpha);
        }
        const ink = dots ? color === '#c8ff62' ? [200, 255, 98] : color.match(/\d+/g)!.map(Number)
          : mapped!.ink.subarray(column * 3, column * 3 + 3);
        for (let dy = 0; dy < h; dy++) {
          let pixel = ((y + dy) * size + x) * 4;
          for (let dx = 0; dx < w; dx++, pixel += 4) {
            const coverage = alpha[dy * w + dx] / 255;
            frame.data[pixel] = ink[0] * coverage;
            frame.data[pixel + 1] = ink[1] * coverage;
            frame.data[pixel + 2] = ink[2] * coverage;
          }
        }
      }
      await cooperate();
    }
    out.putImageData(frame, 0, 0);
    Object.assign(output.dataset, { columns: String(grid.columns), rows: String(grid.rows), limited: String(grid.limited), style: settings.ramp,
      fontFamily: family, renderVersion: 'v04', contentHash: (contentHash >>> 0).toString(16),
      maxCoverage: String(Math.max(...atlas.coverage)), glyphFit: String(atlas.fits),
      cellWidth: String(grid.cellWidth), cellHeight: String(grid.cellHeight), levels: JSON.stringify(raster.levels), asciiSample });
    signal?.throwIfAborted();
    return output;
  } catch (error) { output.width = output.height = 0; throw error; }
  finally { sample.width = sample.height = 0; tint.width = tint.height = 0; }
}
