import { useEffect, useRef, useState } from 'react';
import type { AsciiSettings } from './core/ascii';
import { containRect } from './core/ascii';
import { context2d } from './core/canvas';
import { LEGACY_PROCESSING } from './core/processing';
import { renderSource, type SourceImage } from './browser';

export default function Comparison({ image, settings, size }: { image: SourceImage; settings: AsciiSettings; size: number }) {
  const original = useRef<HTMLCanvasElement>(null), before = useRef<HTMLCanvasElement>(null), after = useRef<HTMLCanvasElement>(null);
  const [status, setStatus] = useState('Preparando comparación…');
  const [completedKey, setCompletedKey] = useState('');
  const requestedKey = JSON.stringify([image.id, settings, size]);
  useEffect(() => {
    const controller = new AbortController();
    const timer = setTimeout(async () => {
      try {
        setStatus('Preparando comparación…');
        const scale = Math.min(1, 2048 / Math.max(image.width, image.height));
        const bitmap = await createImageBitmap(image.file, { resizeWidth: Math.max(1, Math.round(image.width * scale)), resizeHeight: Math.max(1, Math.round(image.height * scale)), resizeQuality: 'high' });
        try {
          controller.signal.throwIfAborted();
          const fit = containRect(image.width, image.height, size);
          const ctx = context2d(original.current!); ctx.fillStyle = '#000'; ctx.fillRect(0, 0, size, size);
          ctx.drawImage(bitmap, fit.x, fit.y, fit.width, fit.height);
        } finally { bitmap.close(); }
        const old = await renderSource(image, { ...settings, processing: LEGACY_PROCESSING }, size, controller.signal);
        controller.signal.throwIfAborted();
        context2d(before.current!).drawImage(old, 0, 0);
        const current = await renderSource(image, settings, size, controller.signal);
        controller.signal.throwIfAborted();
        context2d(after.current!).drawImage(current, 0, 0);
        Object.assign(after.current!.dataset, current.dataset);
        setCompletedKey(requestedKey);
        setStatus(`Misma imagen · ${settings.columns} columnas · ${size} × ${size}. Antes = render V0.3, con iguales ajustes base.`);
      } catch (error) { if (!controller.signal.aborted) { setStatus(error instanceof Error ? error.message : 'No se pudo comparar.'); setCompletedKey(requestedKey); } }
    }, 200);
    return () => { clearTimeout(timer); controller.abort(); };
  }, [image, settings, size]);
  useEffect(() => {
    const canvases = [original.current, before.current, after.current];
    return () => { for (const canvas of canvases) if (canvas) canvas.width = canvas.height = 0; };
  }, []);
  return <section className="comparison-panel" aria-label="Comparación de fidelidad">
    <h2>Original / ASCII V0.3 / ASCII mejorado</h2>
    <p role="status" data-testid="comparison-status">{completedKey === requestedKey ? status : 'Preparando comparación…'}</p>
    <div className="comparison-grid">{[
      { title: 'Original', ref: original }, { title: 'ASCII V0.3', ref: before }, { title: 'ASCII mejorado', ref: after },
    ].map(item => <figure key={item.title}><figcaption>{item.title}</figcaption><canvas ref={item.ref} width={size} height={size} aria-label={`${item.title} — comparación`} /></figure>)}</div>
    <p>La comparación es local. Se cierra al exportar para liberar sus lienzos; el archivo exportado siempre utiliza el pipeline mejorado.</p>
  </section>;
}
