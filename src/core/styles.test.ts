import { describe, expect, it } from 'vitest';
import { CHARACTER_STYLES, glyphsFor, RAMPS, splitCharacters, styleCount, validateCustom } from './styles';
import { characterFor, DEFAULT_SETTINGS, pixelsToCells } from './ascii';

describe('catálogo de caracteres', () => {
  it('conserva los IDs históricos y corrige Classic para tener realmente 70 caracteres', () => {
    expect(RAMPS.standard).toBe(' .:-=+*#%@');
    expect(RAMPS.blocks).toBe(' .:+*#@');
    expect(splitCharacters(RAMPS.detailed)).toHaveLength(70);
    expect(CHARACTER_STYLES).toHaveLength(12);
    expect(new Set(CHARACTER_STYLES.map(style => style.id)).size).toBe(12);
  });
  it.each(CHARACTER_STYLES.filter(style => style.kind !== 'braille'))('$name: mapea de oscuro a claro, sin dividir Unicode', style => {
    const glyphs = glyphsFor(style.id, ' ·é⣿👩‍💻');
    expect(new Set(glyphs).size).toBe(glyphs.length);
    expect(characterFor(0, glyphs)).toBe(glyphs[0]);
    expect(characterFor(255, glyphs)).toBe(glyphs.at(-1));
    const indices = Array.from({ length: 256 }, (_, value) => glyphs.indexOf(characterFor(value, glyphs)));
    expect(indices).toEqual([...indices].sort((a, b) => a - b));
    const settings = { ...DEFAULT_SETTINGS, ramp: style.id, customRamp: ' ·é⣿👩‍💻' };
    const cells = pixelsToCells(new Uint8ClampedArray([0, 0, 0, 255, 255, 255, 255, 255, 255, 0, 0, 0]), settings);
    expect(cells.map(cell => cell.character)).toEqual([glyphs[0], glyphs.at(-1), ' ']);
  });
  it('True Braille no utiliza el conversor de rampa y tiene los 256 patrones', () => {
    expect(() => pixelsToCells(new Uint8ClampedArray(4), { ...DEFAULT_SETTINGS, ramp: 'true-braille' })).toThrow('ocho muestras');
    const style = CHARACTER_STYLES.find(style => style.id === 'true-braille')!;
    expect(styleCount(style, '')).toBe(256);
    expect(glyphsFor('true-braille', '')[255]).toBe('⣿');
  });
});

describe('Unicode y validación Custom', () => {
  it('segmenta grafemas, normaliza NFC e invierte sin romper emojis o acentos', () => {
    const result = validateCustom(' e\u0301⣿👩‍💻');
    expect(result.error).toBeNull();
    expect(result.characters).toEqual([' ', 'é', '⣿', '👩‍💻']);
    expect([...result.characters].reverse().join('')).toBe('👩‍💻⣿é ');
    expect(characterFor(255, ' é👩‍💻')).toBe('👩‍💻');
  });
  it.each(['', 'a', 'aa', 'ée\u0301', 'a\nb', 'a\tb', 'a\u200bb', '\u200da', 'a\u202eb', 'a\ud800', 'a\u0301\u0301\n', 'a\u00a0b', 'a\u200db', ' \u2800', ' a\u3164'])(
    'rechaza secuencia inválida %j', value => expect(validateCustom(value).error).not.toBeNull(),
  );
  it('limita texto y cuenta grafemas, no unidades UTF16', () => {
    expect(validateCustom('😀😃').characters).toHaveLength(2);
    expect(validateCustom('😀😃').error).toBeNull();
    expect(validateCustom(Array.from({ length: 129 }, (_, i) => String.fromCodePoint(0x400 + i)).join('')).error).toContain('128');
    expect(validateCustom('a'.repeat(2049)).error).not.toBeNull();
  });
});
