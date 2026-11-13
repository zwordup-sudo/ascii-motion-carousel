import { decode, decodeFrames } from 'modern-gif';
import { describe, expect, it } from 'vitest';
import { encodeGif, markdownFor, StreamingGifEncoder } from './gif';

function solid(r: number, g: number, b: number, size = 320) {
  const pixels = new Uint8ClampedArray(size * size * 4);
  for (let i = 0; i < pixels.length; i += 4) pixels.set([r, g, b, 255], i);
  return pixels;
}

describe('GIF real: codificación y decodificación', () => {
  it('produce GIF89a 320 × 320, tres frames de 5 segundos y bucle infinito', async () => {
    const buffer = await encodeGif([solid(255, 0, 0), solid(0, 255, 0), solid(0, 0, 255)], 5);
    expect(new TextDecoder().decode(buffer.slice(0, 6))).toBe('GIF89a');
    const gif = decode(buffer);
    expect([gif.width, gif.height]).toEqual([320, 320]);
    expect(gif.looped).toBe(true);
    expect(gif.loopCount).toBe(0);
    expect(gif.frames.map(frame => frame.delay)).toEqual([5000, 5000, 5000]);
    const frames = decodeFrames(buffer);
    expect(frames.map(frame => Array.from(frame.data.slice(0, 4)))).toEqual([
      [255, 0, 0, 255], [0, 255, 0, 255], [0, 0, 255, 255],
    ]);
  });
  it('reduce frames redundantes sin perder tiempo de exposición', async () => {
    const pixels = solid(255, 255, 255);
    const gif = decode(await encodeGif([pixels, pixels, pixels], 15));
    expect(gif.frames).toHaveLength(1);
    expect(gif.frames[0].delay).toBe(45000);
  });
  it('rechaza listas vacías y tamaños inconsistentes', async () => {
    await expect(encodeGif([], 5)).rejects.toThrow();
    await expect(encodeGif([new Uint8ClampedArray(4)], 5)).rejects.toThrow('320');
  });
  it('genera Markdown relativo, sin scripts', () => {
    expect(markdownFor('ascii-motion.gif')).toBe('![Carrusel ASCII animado](./ascii-motion.gif)');
  });
  it.each([640, 1024, 2048])('codifica paletas locales y dimensiones %i sin retener la secuencia RGBA', async size => {
    const encoder = new StreamingGifEncoder(size, 5);
    await encoder.add(solid(255, 0, 0, size));
    await encoder.add(solid(0, 255, 0, size));
    const output = await encoder.finish();
    const gif = decode(output);
    expect([gif.width, gif.height]).toEqual([size, size]);
    expect(gif.frames.every(frame => frame.localColorTable)).toBe(true);
    expect(gif.frames.map(frame => frame.delay)).toEqual([5000, 5000]);
    expect(encoder.stats.peakRgbaBytes).toBe(size * size * 4 * 2);
    expect(encoder.stats.encodedFrames).toBe(2);
    const frames = decodeFrames(output);
    expect(Array.from(frames[1].data.slice(0, 4))).toEqual([0, 255, 0, 255]);
  });
  it('limita el tamaño comprimido y rechaza resoluciones arbitrarias', async () => {
    const encoder = new StreamingGifEncoder(320, 5, 100);
    await encoder.add(solid(255, 0, 0));
    await expect(encoder.finish()).rejects.toThrow('32 MiB');
    expect(() => new StreamingGifEncoder(4000, 5)).toThrow('Resolución');
  });
  it('codifica vistas RGBA con offset sin incluir bytes ajenos', async () => {
    const buffer = new Uint8ClampedArray(320 * 320 * 4 + 8);
    buffer.set(solid(0, 255, 0), 4);
    const output = await encodeGif([buffer.subarray(4, buffer.length - 4)], 5);
    expect(Array.from(decodeFrames(output)[0].data.slice(0, 4))).toEqual([0, 255, 0, 255]);
  });
});
