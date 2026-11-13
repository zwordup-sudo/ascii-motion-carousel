import { useEffect, useRef, useState } from 'react';
import { COLUMN_PRESETS, DEFAULT_SETTINGS, type AsciiSettings } from './core/ascii';
import { context2d } from './core/canvas';
import { MAX_FILES } from './core/files';
import { markdownFor } from './core/gif';
import { INTERVALS, moveItem, nextIndex, type Interval } from './core/timeline';
import { qualityWarning, resolveSize, type Resolution } from './core/resolution';
import { exportInWorker, loadImage, renderCache, renderSource, type ExportProgress, type ExportStats, type SourceImage } from './browser';
import CharacterSelector from './CharacterSelector';
import { validateCustom } from './core/styles';
import { loadCharacterPreferences, saveCharacterPreferences } from './preferences';
import ProcessingControls from './ProcessingControls';
import Comparison from './Comparison';

const FILENAME = 'ascii-motion.gif';

export default function App() {
  const [images, setImages] = useState<SourceImage[]>([]);
  const [settings, setSettings] = useState(() => ({ ...DEFAULT_SETTINGS, ...loadCharacterPreferences() }));
  const [customDraft, setCustomDraft] = useState(settings.customRamp);
  const [preferencesAvailable, setPreferencesAvailable] = useState(true);
  const [seconds, setSeconds] = useState<Interval>(5);
  const [resolution, setResolution] = useState<Resolution>('320');
  const [progress, setProgress] = useState<ExportProgress | null>(null);
  const [notice, setNotice] = useState('');
  const [rendering, setRendering] = useState(false);
  const [completedRenderKey, setCompletedRenderKey] = useState('');
  const [failedRenderKey, setFailedRenderKey] = useState('');
  const [zoom, setZoom] = useState('fit');
  const [comparing, setComparing] = useState(false);
  const [index, setIndex] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [busy, setBusy] = useState('');
  const [errors, setErrors] = useState<string[]>([]);
  const [result, setResult] = useState<{ url: string; size: number; stats: ExportStats } | null>(null);
  const [copied, setCopied] = useState(false);
  const preview = useRef<HTMLCanvasElement>(null);
  const directory = useRef<HTMLInputElement>(null);
  const exportController = useRef<AbortController | null>(null);
  const previousSettings = useRef(settings);
  const selected = images[index];
  const customError = settings.ramp === 'custom' ? validateCustom(customDraft).error : null;
  const outputSize = images.reduce<number>((size, image) => Math.max(size,
    resolveSize(resolution, settings.columns, image.width, image.height)), resolveSize(resolution, settings.columns));
  const warning = images.map(image => qualityWarning(outputSize, settings.columns, image.width, image.height)).find(Boolean)
    ?? qualityWarning(outputSize, settings.columns);
  const requestedRenderKey = selected ? JSON.stringify([selected.id, settings, outputSize]) : '';
  const previewFailed = !!selected && failedRenderKey === requestedRenderKey;
  const previewPending = !!selected && !customError && !previewFailed && completedRenderKey !== requestedRenderKey;

  useEffect(() => { directory.current?.setAttribute('webkitdirectory', ''); }, []);
  useEffect(() => { setPreferencesAvailable(saveCharacterPreferences(settings)); }, [settings.ramp, settings.customRamp, settings.brailleThreshold, settings.brailleDither]);
  useEffect(() => () => { if (result) URL.revokeObjectURL(result.url); }, [result]);
  useEffect(() => { setResult(null); setCopied(false); setNotice(''); }, [images, settings, seconds, resolution]);
  useEffect(() => () => { exportController.current?.abort(); renderCache.clear(); }, []);
  useEffect(() => {
    if (!playing || images.length < 2) return;
    const timer = window.setInterval(() => setIndex(current => nextIndex(current, images.length)), seconds * 1000);
    return () => clearInterval(timer);
  }, [playing, images.length, seconds]);
  useEffect(() => {
    const canvas = preview.current;
    if (!canvas) return;
    if (!selected) { context2d(canvas).clearRect(0, 0, outputSize, outputSize); setRendering(false); setCompletedRenderKey(''); return; }
    if (busy || customError) { setRendering(false); return; }
    const controller = new AbortController();
    setFailedRenderKey('');
    const delay = previousSettings.current.processing.invert !== settings.processing.invert ? 0 : 160;
    previousSettings.current = settings;
    setRendering(true);
    // The slider value updates immediately; expensive work waits for a quiet 160 ms.
    const timer = setTimeout(async () => {
      try {
        const rendered = await renderSource(selected, settings, outputSize, controller.signal);
        controller.signal.throwIfAborted();
        context2d(canvas).drawImage(rendered, 0, 0);
        Object.assign(canvas.dataset, rendered.dataset);
        setCompletedRenderKey(requestedRenderKey);
      } catch (error) {
        if (!controller.signal.aborted) { setErrors([error instanceof Error ? error.message : 'No se pudo renderizar.']); setFailedRenderKey(requestedRenderKey); }
      } finally { if (!controller.signal.aborted) setRendering(false); }
    }, delay);
    return () => { clearTimeout(timer); controller.abort(); };
  }, [selected, settings, outputSize, busy, customError]);

  function change<K extends keyof AsciiSettings>(key: K, value: AsciiSettings[K]) {
    setSettings(current => ({ ...current, [key]: value }));
  }

  function changeCustom(text: string) {
    setCustomDraft(text);
    setResult(null);
    const result = validateCustom(text);
    if (!result.error) change('customRamp', result.normalized);
  }

  async function loadReference() {
    if (busy || images.length >= MAX_FILES) return;
    setBusy('Cargando referencia local…'); setPlaying(false);
    try {
      const response = await fetch(`${import.meta.env.BASE_URL}reference-v04.png`);
      if (!response.ok) throw new Error('No se encontró la referencia local.');
      const image = await loadImage(new File([await response.blob()], 'reference-v04.png', { type: 'image/png' }));
      setImages(current => [...current, image]); setIndex(images.length);
    } catch (error) { setErrors([error instanceof Error ? error.message : 'No se pudo cargar la referencia.']); }
    finally { setBusy(''); }
  }

  async function importFiles(files: FileList | null) {
    if (!files || busy) return;
    setBusy('Importando imágenes…');
    setPlaying(false);
    setComparing(false);
    const failures: string[] = [];
    const available = MAX_FILES - images.length;
    const input = Array.from(files);
    if (input.length > available) failures.push(`Máximo ${MAX_FILES} imágenes. Solo se procesaron las primeras ${available}.`);
    const imported: SourceImage[] = [];
    for (const file of input.slice(0, available)) {
      try { imported.push(await loadImage(file)); }
      catch (error) { failures.push(`${file.name}: ${error instanceof Error ? error.message : 'Imagen dañada o no compatible.'}`); }
    }
    setImages(current => [...current, ...imported]);
    setErrors(failures);
    setBusy('');
  }

  function remove(at: number) {
    setPlaying(false);
    setImages(current => current.filter((_, i) => i !== at));
    setIndex(current => Math.max(0, Math.min(current - (at < current ? 1 : 0), images.length - 2)));
  }

  function move(from: number, to: number) {
    setPlaying(false);
    setImages(current => moveItem(current, from, to));
    setIndex(to);
  }

  async function exportGif() {
    if (exportController.current || !images.length || customError) return;
    const controller = new AbortController();
    exportController.current = controller;
    setBusy('Codificando GIF localmente…');
    setPlaying(false);
    setComparing(false);
    setErrors([]);
    setNotice('');
    setResult(null);
    setProgress({ completed: 0, total: images.length, phase: 'render' });
    try {
      const { blob, stats } = await exportInWorker(images, settings, outputSize, seconds, controller.signal, setProgress);
      setResult({ url: URL.createObjectURL(blob), size: blob.size, stats });
    } catch (error) {
      if (controller.signal.aborted) setNotice('Exportación cancelada. Puedes seguir editando.');
      else setErrors([error instanceof Error ? error.message : 'No se pudo exportar.']);
    } finally { exportController.current = null; setProgress(null); setBusy(''); }
  }

  return <div className="app">
    <header className="topbar">
      <div className="brand"><span className="logo" aria-hidden="true">[a]</span><div><h1>ASCII Motion <span>Carousel</span></h1><p>IMÁGENES → CARACTERES → MOVIMIENTO</p></div></div>
      <span className="version">V0.4 <span className="local">● LOCAL & PRIVADO</span></span>
    </header>

    <main className="editor">
      <section className="panel sources" aria-labelledby="sources-title">
        <div className="panel-title"><h2 id="sources-title"><span>01</span> Imágenes</h2><span className="badge">{images.length} / {MAX_FILES}</span></div>
        <p className="muted">Tu secuencia empieza aquí.</p>
        <fieldset disabled={!!busy}>
          <label className="upload">+ Añadir imágenes<input aria-label="Seleccionar imágenes" type="file" accept="image/jpeg,image/png,image/webp" multiple onChange={event => { void importFiles(event.target.files); event.target.value = ''; }} /></label>
          <label className="folder">↳ Seleccionar carpeta<input ref={directory} aria-label="Seleccionar carpeta" type="file" accept="image/jpeg,image/png,image/webp" multiple onChange={event => { void importFiles(event.target.files); event.target.value = ''; }} /></label>
          <p className="file-hint">JPG · PNG · WebP / hasta 10 MiB por archivo</p>
          <button className="reference-button" disabled={images.length >= MAX_FILES} onClick={() => void loadReference()}>Cargar referencia local</button>
          <ol className="image-list">
            {images.map((image, i) => <li key={image.id} className={i === index ? 'active' : ''}>
              <button className="image-select" aria-label={`Ver ${image.name}`} aria-pressed={i === index} onClick={() => { setIndex(i); setPlaying(false); }}>
                <img src={image.thumbnail} alt="" /><span className="image-name"><small>{String(i + 1).padStart(2, '0')}</small>{image.name}</span>
              </button>
              <div className="image-actions">
                <button aria-label={`Subir ${image.name}`} disabled={i === 0} onClick={() => move(i, i - 1)}>↑</button>
                <button aria-label={`Bajar ${image.name}`} disabled={i === images.length - 1} onClick={() => move(i, i + 1)}>↓</button>
                <button aria-label={`Eliminar ${image.name}`} onClick={() => remove(i)}>×</button>
              </div>
            </li>)}
          </ol>
        </fieldset>
        {!images.length && <div className="empty-list"><span>01 / 02 / 03</span><p>Añade tres imágenes para crear<br />tu primer carrusel.</p></div>}
        <div className="privacy"><span aria-hidden="true">◇</span><p>Solo en tu navegador.<br /><span>Sin subidas. Sin cuentas. Sin tokens.</span></p></div>
      </section>

      <section className="preview-panel" aria-labelledby="preview-title">
        <div className="panel-title"><h2 id="preview-title"><span>02</span> Vista previa</h2><span className="badge">{outputSize} × {outputSize}</span></div>
        <div className="stage">
          <div className="canvas-viewport"><div className="canvas-wrap" style={zoom === 'fit' ? undefined : { width: outputSize * Number(zoom) / 100, height: outputSize * Number(zoom) / 100, maxWidth: 'none', boxSizing: 'content-box' }}>
            <canvas ref={preview} data-testid="main-preview" data-request-key={requestedRenderKey} style={{ imageRendering: zoom === '200' ? 'pixelated' : 'auto' }} width={outputSize} height={outputSize} aria-busy={rendering || previewPending} aria-label={selected ? `ASCII de ${selected.name}` : 'Vista previa ASCII vacía'} />
            {!selected && <div className="empty-preview"><pre aria-hidden="true">{'   .:-=+*#%@\n  .:-=+*#%@ \n .:-=+*#%@  \n.:-=+*#%@   '}</pre><h3>De píxeles a caracteres.</h3><p>Importa imágenes para comenzar.</p></div>}
          </div></div>
          <div className="stage-caption"><span className="dot" /> {selected ? selected.name : 'ESPERANDO IMÁGENES'} <span>{settings.color ? 'MULTICOLOR' : 'MONOCROMO'}</span></div>
          <p className="render-status" data-testid="render-status" role="status">{customError ? 'Corrige la secuencia personalizada. Se conserva la última preview válida.' : previewFailed ? 'No se pudo renderizar. Revisa el aviso de procesamiento.' : rendering || previewPending ? 'Actualizando ASCII…' : selected ? `${settings.columns} columnas · vista reducida, archivo a resolución completa` : ''}</p>
          <div className="preview-tools"><label>Zoom <select aria-label="Zoom de vista previa" value={zoom} onChange={event => setZoom(event.target.value)}><option value="fit">Ajustar</option><option value="100">100% · píxel real</option><option value="200">200%</option></select></label>
            <label><input type="checkbox" disabled={!selected || !!busy || !!customError} checked={comparing} onChange={event => setComparing(event.target.checked)} /> Comparar antes/después</label></div>
          {settings.columns >= 160 && zoom === 'fit' && <p className="render-status">Ajustar reduce visualmente los glifos; usa 100% para inspeccionar trazos sin reducción. No cambia el GIF.</p>}
        </div>
        <div className="transport">
          <button aria-label="Imagen anterior" disabled={!images.length || !!busy} onClick={() => { setPlaying(false); setIndex(current => (current - 1 + images.length) % images.length); }}>←</button>
          <button className="play" disabled={images.length < 2 || !!busy} onClick={() => setPlaying(current => !current)}>{playing ? 'Ⅱ Pausar' : '▶ Reproducir'}</button>
          <button aria-label="Imagen siguiente" disabled={!images.length || !!busy} onClick={() => { setPlaying(false); setIndex(current => nextIndex(current, images.length)); }}>→</button>
          <span className="counter" data-testid="frame-counter">{images.length ? index + 1 : 0} / {images.length}</span>
          <span className="loop">↻ Bucle infinito</span>
        </div>
      </section>

      <section className="panel settings" aria-labelledby="settings-title">
        <div className="panel-title"><h2 id="settings-title"><span>03</span> Ajustes</h2><button className="text-button" disabled={!!busy} onClick={() => { setSettings(DEFAULT_SETTINGS); setCustomDraft(DEFAULT_SETTINGS.customRamp); setSeconds(5); setResolution('320'); setZoom('fit'); setComparing(false); }}>Restablecer</button></div>
        <fieldset disabled={!!busy}>
          <label className="control">Modo de color<select value={settings.color ? 'color' : 'mono'} onChange={event => change('color', event.target.value === 'color')}><option value="color">Multicolor original</option><option value="mono">Monocromo lima</option></select></label>
          <CharacterSelector value={settings.ramp} custom={customDraft} onSelect={style => change('ramp', style)} onCustom={changeCustom} />
          {!preferencesAvailable && <p className="resolution-hint">Preferencias locales no disponibles: se conservarán solo durante esta sesión.</p>}
          {settings.ramp === 'true-braille' && <div className="braille-controls">
            <label className="control">Umbral Braille <output>{settings.brailleThreshold}</output><input aria-label="Umbral Braille" type="range" min={0} max={255} step={1} value={settings.brailleThreshold} onChange={event => change('brailleThreshold', +event.target.value)} /></label>
            <label className="dither-control"><input type="checkbox" checked={settings.brailleDither} onChange={event => change('brailleDither', event.target.checked)} /> Dithering Floyd–Steinberg</label>
          </div>}
          <label className="control">Densidad <output data-testid="columns-value">{settings.columns} columnas</output><input aria-label="Densidad" type="range" min={16} max={300} step={1} value={settings.columns} onChange={event => change('columns', +event.target.value)} /></label>
          <div className="density-presets" role="group" aria-label="Presets de columnas">{COLUMN_PRESETS.map(columns => <button key={columns} aria-label={`${columns} columnas`} aria-pressed={settings.columns === columns} onClick={() => change('columns', columns)}>{columns}</button>)}</div>
          <label className="control">Tamaño de carácter <output>{settings.fontScale.toFixed(2)}×</output><input aria-label="Tamaño de carácter" type="range" min={0.65} max={1.25} step={0.05} value={settings.fontScale} onChange={event => change('fontScale', +event.target.value)} /></label>
          <label className="control">Contraste <output>{settings.contrast.toFixed(2)}×</output><input aria-label="Contraste" type="range" min={0.5} max={2} step={0.05} value={settings.contrast} onChange={event => change('contrast', +event.target.value)} /></label>
          <label className="control">Brillo <output>{settings.brightness > 0 ? '+' : ''}{settings.brightness}</output><input aria-label="Brillo" type="range" min={-80} max={80} step={1} value={settings.brightness} onChange={event => change('brightness', +event.target.value)} /></label>
          <ProcessingControls settings={settings} onChange={setSettings} />
          <div className="divider" />
          <label className="control">Resolución de exportación<select value={resolution} onChange={event => setResolution(event.target.value as Resolution)}><option value="320">320 × 320</option><option value="640">640 × 640</option><option value="1024">1024 × 1024</option><option value="auto">Automática</option></select></label>
          {warning && <p className="quality-warning" role="note">{warning}</p>}
          <p className="resolution-hint">Automática: hasta 2048 × 2048. Máximo 32 MiB por GIF.</p>
          <label className="control">Intervalo por imagen<select value={seconds} onChange={event => setSeconds(+event.target.value as Interval)}>{INTERVALS.map(value => <option key={value} value={value}>{value} segundos</option>)}</select></label>
          <div className="stats"><span>Dimensiones <strong>{outputSize} × {outputSize} px</strong></span><span>Duración del bucle <strong>{images.length * seconds} s</strong></span><span>Formato <strong>GIF · ∞</strong></span></div>
        </fieldset>
      </section>
    </main>

    {comparing && selected && !customError && <Comparison image={selected} settings={settings} size={outputSize} />}

    <footer className="export-panel">
      <div><span className="eyebrow">LISTO PARA TU README</span><h2>Un archivo. Movimiento infinito.</h2><p>GIF autónomo, sin JavaScript ni dependencias en GitHub.</p></div>
      <div className="export-actions"><button className="primary" disabled={!images.length || !!busy || !!customError} onClick={() => void exportGif()}>{busy || '↓ Exportar GIF'}</button>
        {progress && <><progress aria-label="Progreso de exportación" max={progress.total + 1} value={progress.completed} /><button onClick={() => exportController.current?.abort()}>Cancelar exportación</button></>}
        <span role="status" data-testid="export-status">{progress ? `${progress.phase === 'finish' ? 'Finalizando' : progress.phase === 'render' ? 'Renderizando' : 'Codificando'} · ${progress.completed} / ${progress.total}` : busy || notice || (result ? `${(result.size / 1024).toFixed(1)} KiB · GIF generado` : 'Procesado íntegramente en tu dispositivo')}</span></div>
    </footer>
    {!!errors.length && <div className="errors" role="alert"><strong>Avisos de procesamiento:</strong><ul>{errors.map((error, i) => <li key={i}>{error}</li>)}</ul><button onClick={() => setErrors([])}>Cerrar avisos</button></div>}
    {result && <section className="result" aria-label="Resultado de exportación" data-peak-rgba-bytes={result.stats.peakRgbaBytes} data-encoded-frames={result.stats.encodedFrames}>
      <img src={result.url} alt="GIF ASCII exportado" width={160} height={160} />
      <div><h2>Tu carrusel está listo.</h2><p>Descarga el archivo y guárdalo junto al README de tu repositorio.</p><a className="primary" href={result.url} download={FILENAME}>Descargar GIF</a><label className="markdown-label">Markdown para GitHub<input readOnly value={markdownFor(FILENAME)} onFocus={event => event.target.select()} /></label><button onClick={async () => { try { await navigator.clipboard.writeText(markdownFor(FILENAME)); setCopied(true); } catch { setErrors(['No se pudo copiar: selecciona y copia el Markdown manualmente.']); } }}>{copied ? 'Copiado' : 'Copiar Markdown'}</button></div>
    </section>}
    <div className="bottom-note"><span>ASCII MOTION CAROUSEL / 0.4</span><span>Hecho de caracteres, no de filtros.</span></div>
  </div>;
}
