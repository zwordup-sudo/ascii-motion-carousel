import { encode } from 'modern-gif';
import { OUTPUT_SIZE } from './ascii';
import { INTERVALS, type Interval } from './timeline';
import { EXPORT_SIZES, MAX_GIF_BYTES } from './resolution';

/** Extract one full GIF image and make its palette local for streaming assembly. */
function localImage(buffer: ArrayBuffer): Uint8Array {
  const bytes = new Uint8Array(buffer);
  const tableLength = (flags: number) => flags & 128 ? 3 * 2 ** ((flags & 7) + 1) : 0;
  const globalLength = tableLength(bytes[10]);
  const global = bytes.subarray(13, 13 + globalLength);
  let offset = 13 + globalLength;
  while (offset < bytes.length) {
    const type = bytes[offset++];
    if (type === 0x21) {
      offset++; // Extension label, then a chain of data sub-blocks.
      while (bytes[offset]) offset += bytes[offset] + 1;
      offset++;
    } else if (type === 0x2c) {
      const descriptor = bytes.slice(offset - 1, offset + 9);
      offset += 9;
      const localLength = tableLength(descriptor[9]);
      const palette = localLength ? bytes.subarray(offset, offset + localLength) : global;
      offset += localLength;
      if (!palette.length) throw new Error('El codificador no generó una paleta.');
      descriptor[9] = (descriptor[9] & 0x78) | 0x80 | (Math.log2(palette.length / 3) - 1);
      const dataStart = offset++; // LZW minimum code size.
      while (bytes[offset]) offset += bytes[offset] + 1;
      offset++;
      const result = new Uint8Array(10 + palette.length + offset - dataStart);
      result.set(descriptor);
      result.set(palette, 10);
      result.set(bytes.subarray(dataStart, offset), 10 + palette.length);
      return result;
    } else break;
  }
  throw new Error('El codificador generó un fotograma GIF inválido.');
}

/** modern-gif retains all RGBA inputs until flush; encode one image at a time instead.
 * Keep only two RGBA frames (pending + incoming), and bounded compressed chunks.
 * Palettes/LZW remain entirely modern-gif's responsibility, not a custom codec.
 */
export class StreamingGifEncoder {
  private chunks: Uint8Array[];
  private pending?: { data: Uint8ClampedArray; delay: number };
  private bytes = 0;
  private count = 0;
  readonly stats = { peakRgbaBytes: 0, encodedFrames: 0 };

  constructor(readonly size: number, readonly seconds: Interval, private limit = MAX_GIF_BYTES) {
    if (!(EXPORT_SIZES as readonly number[]).includes(size)) throw new Error('Resolución no permitida.');
    if (!INTERVALS.includes(seconds)) throw new Error('Intervalo no permitido.');
    this.chunks = [];
    this.append(new Uint8Array([
      ...new TextEncoder().encode('GIF89a'), size & 255, size >> 8, size & 255, size >> 8, 0x70, 0, 0,
      0x21, 0xff, 11, ...new TextEncoder().encode('NETSCAPE2.0'), 3, 1, 0, 0, 0,
    ]));
  }

  private append(chunk: Uint8Array) {
    if (this.bytes + chunk.length + 1 > this.limit) throw new Error('El GIF supera 32 MiB. Reduce la resolución o las imágenes.');
    this.chunks.push(chunk);
    this.bytes += chunk.length;
  }

  async add(data: Uint8ClampedArray) {
    if (++this.count > 20) throw new Error('Selecciona entre 1 y 20 imágenes.');
    if (data.length !== this.size * this.size * 4) throw new Error(`Todos los fotogramas deben medir ${this.size} × ${this.size}.`);
    // modern-gif reads a view's entire backing buffer; normalize nonzero offsets.
    if (data.byteOffset !== 0 || data.byteLength !== data.buffer.byteLength || !(data.buffer instanceof ArrayBuffer)) data = new Uint8ClampedArray(data);
    this.stats.peakRgbaBytes = Math.max(this.stats.peakRgbaBytes, data.byteLength + (this.pending?.data.byteLength ?? 0));
    if (this.pending && data.every((value, i) => value === this.pending!.data[i])) {
      this.pending.delay += this.seconds * 1000;
      return;
    }
    await this.flushPending();
    this.pending = { data, delay: this.seconds * 1000 };
  }

  private async flushPending() {
    if (!this.pending) return;
    const { data, delay } = this.pending;
    const single = await encode({
      width: this.size, height: this.size, looped: false, maxColors: 255,
      frames: [{ data: new Uint8ClampedArray(data.buffer as ArrayBuffer), delay, disposal: 1 }],
    });
    const ticks = delay / 10;
    this.append(new Uint8Array([0x21, 0xf9, 4, 4, ticks & 255, ticks >> 8, 0, 0]));
    this.append(localImage(single));
    this.stats.encodedFrames++;
    this.pending = undefined;
  }

  async finish(): Promise<ArrayBuffer> {
    if (!this.count) throw new Error('Selecciona entre 1 y 20 imágenes.');
    await this.flushPending();
    const output = new Uint8Array(this.bytes + 1);
    let offset = 0;
    for (const chunk of this.chunks) { output.set(chunk, offset); offset += chunk.length; }
    output[offset] = 0x3b;
    this.chunks = [];
    return output.buffer;
  }
}

export async function encodeGif(pixels: Uint8ClampedArray[], seconds: Interval, size = OUTPUT_SIZE): Promise<ArrayBuffer> {
  const encoder = new StreamingGifEncoder(size, seconds);
  for (const data of pixels) await encoder.add(data);
  return encoder.finish();
}

export function markdownFor(filename: string): string {
  return `![Carrusel ASCII animado](./${filename})`;
}
