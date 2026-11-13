import { describe, expect, it } from 'vitest';
import { DEFAULT_SETTINGS } from './core/ascii';
import { loadCharacterPreferences, PREFERENCES_KEY, saveCharacterPreferences } from './preferences';

describe('preferencias locales, nunca imágenes', () => {
  it('guarda y restaura solo campos de estilos validados', () => {
    const data = new Map<string, string>();
    const storage = { getItem: (key: string) => data.get(key) ?? null, setItem: (key: string, value: string) => { data.set(key, value); } };
    expect(saveCharacterPreferences({ ...DEFAULT_SETTINGS, ramp: 'custom', customRamp: ' é⣿' }, storage)).toBe(true);
    expect(loadCharacterPreferences(storage)).toEqual({ ramp: 'custom', customRamp: ' é⣿', brailleThreshold: 128, brailleDither: false });
    expect(Object.keys(JSON.parse(data.get(PREFERENCES_KEY)!)).sort()).toEqual(['brailleDither', 'brailleThreshold', 'customRamp', 'ramp']);
  });
  it('tolera datos corruptos, tipos incorrectos y Storage denegado', () => {
    for (const value of ['{bad', 'null', '[]', 'x'.repeat(9000)]) expect(loadCharacterPreferences({ getItem: () => value, setItem() {} })).toEqual({});
    expect(loadCharacterPreferences({ getItem: () => JSON.stringify({ ramp: 'missing', customRamp: 'aa', brailleThreshold: 999, brailleDither: 'yes' }), setItem() {} })).toEqual({});
    const denied = { getItem() { throw new Error('denied'); }, setItem() { throw new Error('denied'); } };
    expect(loadCharacterPreferences(denied)).toEqual({});
    expect(saveCharacterPreferences(DEFAULT_SETTINGS, denied)).toBe(false);
    expect(saveCharacterPreferences(DEFAULT_SETTINGS, null)).toBe(false);
  });
});
