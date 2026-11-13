import type { AsciiSettings } from './core/ascii';
import { DEFAULT_PROCESSING, type ProcessingSettings } from './core/processing';
import { applyProcessingPreset, PROCESSING_PRESETS } from './core/presets';

export default function ProcessingControls({ settings, onChange }: { settings: AsciiSettings; onChange: (settings: AsciiSettings) => void }) {
  const p = settings.processing;
  function change<K extends keyof ProcessingSettings>(key: K, value: ProcessingSettings[K]) {
    onChange({ ...settings, processing: { ...p, [key]: value } });
  }
  return <div className="processing-controls">
    <label className="control">Preset de procesamiento<select aria-label="Preset de procesamiento" value="" onChange={event => onChange(applyProcessingPreset(settings, event.target.value))}>
      <option value="">Aplicar preset…</option>{PROCESSING_PRESETS.map(preset => <option key={preset.id} value={preset.id}>{preset.name}</option>)}
    </select></label>
    <details><summary>Procesamiento y fidelidad</summary>
      <p className="resolution-hint">Solo se procesa la selección de glifos. No hay fotografía de fondo. Los presets no cambian columnas ni resolución.</p>
      {settings.fontScale > 1 && <p className="resolution-hint">La tinta se limita al tamaño de la celda para evitar recortes; por encima de 1× no se amplía fuera de ella.</p>}
      <label className="dither-control"><input type="checkbox" checked={p.invert} onChange={event => change('invert', event.target.checked)} /> Invert Character Density</label>
      <label className="dither-control"><input type="checkbox" checked={p.autoContrast} onChange={event => change('autoContrast', event.target.checked)} /> Auto Contrast &amp; Levels</label>
      <label className="control">Percentil inferior <output>{p.lowPercentile}%</output><input aria-label="Percentil inferior" type="range" min={0} max={10} step={.1} value={p.lowPercentile} onChange={event => change('lowPercentile', +event.target.value)} /></label>
      <label className="control">Percentil superior <output>{p.highPercentile}%</output><input aria-label="Percentil superior" type="range" min={90} max={100} step={.1} value={p.highPercentile} onChange={event => change('highPercentile', +event.target.value)} /></label>
      <label className="control">Gamma perceptual <output>{p.gamma.toFixed(2)}</output><input aria-label="Gamma perceptual" type="range" min={.5} max={2.5} step={.05} value={p.gamma} onChange={event => change('gamma', +event.target.value)} /></label>
      <label className="control">Edge Enhancement · Sobel <output>{p.edgeStrength.toFixed(2)}</output><input aria-label="Edge Enhancement" type="range" min={0} max={2} step={.05} value={p.edgeStrength} onChange={event => change('edgeStrength', +event.target.value)} /></label>
      <label className="dither-control"><input type="checkbox" disabled={settings.ramp === 'true-braille'} checked={p.dither} onChange={event => change('dither', event.target.checked)} /> Dithering de intensidades</label>
      {settings.ramp === 'true-braille' && <p className="resolution-hint">En True Braille utiliza su control específico Floyd–Steinberg de arriba. Este ajuste general se conserva para las rampas; nunca se difunde dos veces.</p>}
      <button onClick={() => onChange({ ...settings, processing: { ...DEFAULT_PROCESSING } })}>Desactivar procesamiento</button>
    </details>
  </div>;
}
