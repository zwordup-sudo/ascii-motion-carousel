import { CHARACTER_STYLES, validateCustom, type StyleId } from './core/styles';
import type { AsciiSettings } from './core/ascii';

export const PREFERENCES_KEY = 'ascii-motion-carousel:characters:v1';
type Preferences = Pick<AsciiSettings, 'ramp' | 'customRamp' | 'brailleThreshold' | 'brailleDither'>;
interface LocalPreferencesStorage { getItem(key: string): string | null; setItem(key: string, value: string): void }
function browserStorage(): LocalPreferencesStorage | null {
  try { return typeof window !== 'undefined' ? window.localStorage : null; } catch { return null; }
}

export function loadCharacterPreferences(storage = browserStorage()): Partial<Preferences> {
  try {
    const raw = storage?.getItem(PREFERENCES_KEY);
    if (!raw || raw.length > 8192) return {};
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {};
    const value = parsed as Record<string, unknown>;
    const result: Partial<Preferences> = {};
    if (typeof value.ramp === 'string' && CHARACTER_STYLES.some(style => style.id === value.ramp)) result.ramp = value.ramp as StyleId;
    if (typeof value.customRamp === 'string' && !validateCustom(value.customRamp).error) result.customRamp = value.customRamp.normalize('NFC');
    if (typeof value.brailleThreshold === 'number' && Number.isInteger(value.brailleThreshold) && value.brailleThreshold >= 0 && value.brailleThreshold <= 255) result.brailleThreshold = value.brailleThreshold;
    if (typeof value.brailleDither === 'boolean') result.brailleDither = value.brailleDither;
    return result;
  } catch { return {}; }
}

export function saveCharacterPreferences(settings: Preferences, storage = browserStorage()): boolean {
  try {
    if (!storage) return false;
    const { ramp, customRamp, brailleThreshold, brailleDither } = settings;
    storage.setItem(PREFERENCES_KEY, JSON.stringify({ ramp, customRamp, brailleThreshold, brailleDither }));
    return true;
  } catch { return false; }
}
