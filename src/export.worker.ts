import { StreamingGifEncoder } from './core/gif';
import type { Interval } from './core/timeline';

type Request = { type: 'start'; size: number; seconds: Interval }
  | { type: 'frame'; data: Uint8ClampedArray } | { type: 'finish' };
let encoder: StreamingGifEncoder | undefined;

self.onmessage = async (event: MessageEvent<Request>) => {
  try {
    const request = event.data;
    if (request.type === 'start') encoder = new StreamingGifEncoder(request.size, request.seconds);
    else if (!encoder) throw new Error('Exportación no inicializada.');
    else if (request.type === 'frame') await encoder.add(request.data);
    else {
      const output = await encoder.finish();
      self.postMessage({ output, stats: encoder.stats }, { transfer: [output] });
      encoder = undefined;
      return;
    }
    self.postMessage({ ready: true });
  } catch (error) {
    self.postMessage({ error: error instanceof Error ? error.message : 'No se pudo codificar el GIF.' });
  }
};
