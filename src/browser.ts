import { containRect, type AsciiSettings } from './core/ascii';
import { context2d, renderAscii, yieldToBrowser } from './core/canvas';
import { BoundedCache } from './core/cache';
import { validateDimensions, validateFile } from './core/files';
import { CACHE_BYTES, rgbaBytes } from './core/resolution';
import type { Interval } from './core/timeline';

export interface SourceImage {
  id: string;
  name: string;
  file: File;
  width: number;
  height: number;
  thumbnail: string;
}

export async function loadImage(file: File): Promise<SourceImage> {
  const error = validateFile(file);
  if (error) throw new Error(error);
  const bitmap = await createImageBitmap(file);
  try {
    validateDimensions(bitmap.width, bitmap.height);
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = 80;
    const fit = containRect(bitmap.width, bitmap.height, 80);
    context2d(canvas).drawImage(bitmap, fit.x, fit.y, fit.width, fit.height);
    return { id: crypto.randomUUID(), name: file.name, file, width: bitmap.width,
      height: bitmap.height, thumbnail: canvas.toDataURL('image/png') };
  } finally { bitmap.close(); }
}

export const renderCache = new BoundedCache<HTMLCanvasElement>(CACHE_BYTES);

export async function renderSource(image: SourceImage, settings: AsciiSettings, size: number, signal: AbortSignal) {
  signal.throwIfAborted();
  const key = JSON.stringify([image.id, settings, size]);
  const cached = renderCache.get(key);
  if (cached) { cached.dataset.renderKey = key; return cached; }
  // Do not destroy fine detail on import. Decode one original at a time, capped at 2048.
  const scale = Math.min(1, 2048 / Math.max(image.width, image.height));
  const bitmap = await createImageBitmap(image.file, {
    resizeWidth: Math.max(1, Math.round(image.width * scale)),
    resizeHeight: Math.max(1, Math.round(image.height * scale)), resizeQuality: 'high',
  });
  try {
    signal.throwIfAborted();
    const canvas = await renderAscii(bitmap, image.width, image.height, settings, size, signal);
    signal.throwIfAborted();
    canvas.dataset.renderKey = key;
    renderCache.set(key, canvas, rgbaBytes(size));
    return canvas;
  } finally { bitmap.close(); }
}

export interface ExportProgress { completed: number; total: number; phase: 'render' | 'encode' | 'finish' }
export interface ExportStats { peakRgbaBytes: number; encodedFrames: number }

export async function exportInWorker(
  images: SourceImage[], settings: AsciiSettings, size: number, seconds: Interval,
  signal: AbortSignal, onProgress: (progress: ExportProgress) => void,
): Promise<{ blob: Blob; stats: ExportStats }> {
  signal.throwIfAborted();
  const worker = new Worker(new URL('./export.worker.ts', import.meta.url), { type: 'module' });
  let pending: { resolve: (value: Reply) => void; reject: (error: Error) => void } | undefined;
  let timer: ReturnType<typeof setTimeout> | undefined;
  type Reply = { output?: ArrayBuffer; stats?: ExportStats; error?: string };
  const fail = (error: Error) => { pending?.reject(error); pending = undefined; };
  const abort = () => { worker.terminate(); fail(new DOMException('Exportación cancelada.', 'AbortError')); };
  signal.addEventListener('abort', abort, { once: true });
  worker.onerror = () => fail(new Error('Error en el codificador local.'));
  worker.onmessage = (event: MessageEvent<Reply>) => {
    clearTimeout(timer);
    if (event.data.error) fail(new Error(event.data.error));
    else { pending?.resolve(event.data); pending = undefined; }
  };
  function request(message: object, transfer: Transferable[] = []): Promise<Reply> {
    signal.throwIfAborted();
    return new Promise((resolve, reject) => {
      pending = { resolve, reject };
      timer = setTimeout(() => fail(new Error('El codificador no respondió en 120 segundos. Reduce la resolución.')), 120_000);
      worker.postMessage(message, transfer);
    });
  }
  try {
    await request({ type: 'start', size, seconds });
    for (let i = 0; i < images.length; i++) {
      onProgress({ completed: i, total: images.length, phase: 'render' });
      await yieldToBrowser(signal);
      const canvas = await renderSource(images[i], settings, size, signal);
      const data = context2d(canvas, true).getImageData(0, 0, size, size).data;
      onProgress({ completed: i, total: images.length, phase: 'encode' });
      await request({ type: 'frame', data }, [data.buffer]);
      onProgress({ completed: i + 1, total: images.length, phase: 'encode' });
    }
    onProgress({ completed: images.length, total: images.length, phase: 'finish' });
    const result = await request({ type: 'finish' });
    signal.throwIfAborted();
    if (!result.output || !result.stats) throw new Error('Respuesta de exportación inválida.');
    return { blob: new Blob([result.output], { type: 'image/gif' }), stats: result.stats };
  } finally {
    signal.removeEventListener('abort', abort);
    clearTimeout(timer);
    worker.terminate();
  }
}
