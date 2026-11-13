import type { AsciiSettings } from './ascii';
import { DEFAULT_PROCESSING } from './processing';

export const PROCESSING_PRESETS = [
  { id: 'classic', name: 'Classic ASCII', ramp: 'detailed', color: true, contrast: 1.1, gamma: 1.15, autoContrast: false, edgeStrength: 0, dither: false },
  { id: 'detail', name: 'High Detail', ramp: 'detailed', color: true, contrast: 1.1, gamma: 1.3, autoContrast: true, edgeStrength: .2, dither: true },
  { id: 'edge', name: 'Edge Enhanced', ramp: 'standard', color: true, contrast: 1.1, gamma: 1.15, autoContrast: true, edgeStrength: .85, dither: true },
  { id: 'color', name: 'Color Fidelity', ramp: 'shading', color: true, contrast: 1, gamma: 1, autoContrast: false, edgeStrength: 0, dither: true },
  { id: 'retro', name: 'Retro Terminal', ramp: 'hex', color: false, contrast: 1.35, gamma: 1.25, autoContrast: true, edgeStrength: .15, dither: false },
] as const;
export function applyProcessingPreset(settings: AsciiSettings, id: string): AsciiSettings {
  const preset = PROCESSING_PRESETS.find(preset => preset.id === id);
  if (!preset) return settings;
  return { ...settings, ramp: preset.ramp, color: preset.color, contrast: preset.contrast, brightness: 0, fontScale: 1,
    processing: { ...DEFAULT_PROCESSING, gamma: preset.gamma, autoContrast: preset.autoContrast, edgeStrength: preset.edgeStrength, dither: preset.dither } };
}
