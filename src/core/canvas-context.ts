export function context2d(canvas: HTMLCanvasElement, read = false) {
  const context = canvas.getContext('2d', { willReadFrequently: read });
  if (!context) throw new Error('El navegador no ofrece Canvas 2D.');
  return context;
}
export async function yieldToBrowser(signal?: AbortSignal) {
  signal?.throwIfAborted();
  await new Promise<void>(resolve => setTimeout(resolve, 0));
  signal?.throwIfAborted();
}
