export const INTERVALS = [3, 5, 10, 15] as const;
export type Interval = typeof INTERVALS[number];

export function nextIndex(index: number, count: number): number {
  return count ? (index + 1) % count : 0;
}

export function moveItem<T>(items: readonly T[], from: number, to: number): T[] {
  if (from < 0 || to < 0 || from >= items.length || to >= items.length) return [...items];
  const copy = [...items];
  const [item] = copy.splice(from, 1);
  copy.splice(to, 0, item);
  return copy;
}

export interface PixelFrame { data: Uint8ClampedArray; delay: number }

function equalPixels(a: Uint8ClampedArray, b: Uint8ClampedArray) {
  return a.length === b.length && a.every((value, index) => value === b[index]);
}

/** One frame per image; identical consecutive renders share their display time. */
export function planFrames(pixels: readonly Uint8ClampedArray[], seconds: Interval): PixelFrame[] {
  if (!INTERVALS.includes(seconds)) throw new Error('Intervalo no permitido.');
  const frames: PixelFrame[] = [];
  for (const data of pixels) {
    const previous = frames.at(-1);
    if (previous && equalPixels(previous.data, data)) previous.delay += seconds * 1000;
    else frames.push({ data, delay: seconds * 1000 });
  }
  return frames;
}
