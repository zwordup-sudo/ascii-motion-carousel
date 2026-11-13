// Historical IDs are preserved. Classic gains its three missing symbols: ' < >.
export const RAMPS = {
  standard: ' .:-=+*#%@',
  detailed: " .`^'\",:;Il!i~<>+_-?][}{1)(|\\/tfjrxnuvczXYUJCLQ0OZmwqpdbkhao*#MW&8%B@$",
  blocks: ' .:+*#@',
} as const;
export const DEFAULT_CUSTOM = ' .:-=+*#%@';

export const CHARACTER_STYLES = [
  { id: 'detailed', name: 'Detailed / Classic ASCII', characters: RAMPS.detailed, kind: 'ramp', description: 'Rampa clásica de 70 caracteres; máxima variedad de texturas.' },
  { id: 'standard', name: 'Standard', characters: RAMPS.standard, kind: 'ramp', description: 'Equilibrio clásico de detalle y legibilidad.' },
  { id: 'blocks', name: 'Simple', characters: RAMPS.blocks, kind: 'ramp', description: 'La paleta simple original, de espacio a arroba.' },
  { id: 'shading', name: 'Blocks / Shading', characters: ' ░▒▓█', kind: 'ramp', description: 'Tramas y bloques de cobertura creciente.' },
  { id: 'dots', name: 'Braille / Dots', characters: ' ⠁⠃⠇⠏⠟⠿⡿⣿', kind: 'ramp', description: 'Rampa de puntos por luminosidad; no muestrea ocho puntos.' },
  { id: 'hex', name: 'Matrix / Hex', characters: ' c7f1E08', kind: 'ramp', description: 'Textura hexadecimal de tinta creciente.' },
  { id: 'binary', name: 'Binary', characters: ' 10', kind: 'ramp', description: 'Espacio, uno y cero para una textura binaria.' },
  { id: 'slash', name: 'Slash Pattern', characters: ' .:/\\X#', kind: 'ramp', description: 'Trazos diagonales y cruces de intensidad creciente.' },
  { id: 'orbs', name: 'Retro Orbs', characters: ' ·oO0●', kind: 'ramp', description: 'Puntos, anillos y discos con estética retro.' },
  { id: 'minimal', name: 'Minimal', characters: ' .:#', kind: 'ramp', description: 'Cuatro niveles de tinta, sin ruido adicional.' },
  { id: 'true-braille', name: 'True Braille 2×4', characters: '⠁⠂⠄⡀ ⠈⠐⠠⢀ ⣿', kind: 'braille', description: 'Ocho muestras por celda, 256 patrones Unicode reales.' },
  { id: 'custom', name: 'Custom', characters: DEFAULT_CUSTOM, kind: 'custom', description: 'Tu secuencia Unicode, ordenada de oscuro a claro.' },
] as const;
export type CharacterStyle = typeof CHARACTER_STYLES[number];
export type StyleId = CharacterStyle['id'];

const segmenter = new Intl.Segmenter('und', { granularity: 'grapheme' });
export function splitCharacters(text: string): string[] {
  return Array.from(segmenter.segment(text.normalize('NFC')), item => item.segment);
}

export function validateCustom(text: string): { characters: string[]; normalized: string; error: string | null } {
  if (text.length > 2048) return { characters: [], normalized: text, error: 'La secuencia supera 2048 unidades de texto.' };
  const normalized = text.normalize('NFC');
  const characters = splitCharacters(normalized);
  let error: string | null = null;
  if (characters.length < 2 || characters.length > 128) error = 'Usa entre 2 y 128 caracteres Unicode distintos.';
  else if (characters.every(character => character === ' ' || character === '\u2800')) error = 'Incluye al menos un carácter visible.';
  else if (characters.some(character => /[\p{Cc}\p{Cs}\p{Zl}\p{Zp}]/u.test(character)
    || /\p{Cf}/u.test(character.replaceAll('\u200d', ''))
    || /\p{Default_Ignorable_Code_Point}/u.test(character.replace(/[\u200d\ufe0e\ufe0f]/gu, ''))
    || (character.includes('\u200d') && (!/\p{Extended_Pictographic}/u.test(character) || character.startsWith('\u200d') || character.endsWith('\u200d')))
    || /^[\p{M}\u200d\ufe0e\ufe0f]+$/u.test(character)
    || /\p{White_Space}/u.test(character.replaceAll(' ', '')))) error = 'No se permiten controles, saltos de línea ni caracteres invisibles aislados. El espacio normal sí es válido.';
  else if (new Set(characters).size !== characters.length) error = 'Hay caracteres repetidos (también se comparan después de normalizar Unicode).';
  return { characters, normalized, error };
}

export function getStyle(id: StyleId): CharacterStyle {
  const style = CHARACTER_STYLES.find(style => style.id === id);
  if (!style) throw new Error('Conjunto de caracteres desconocido.');
  return style;
}

const fixedGlyphs = new Map(CHARACTER_STYLES.filter(style => style.kind === 'ramp')
  .map(style => [style.id, splitCharacters(style.characters)]));
export const ALL_BRAILLE = Array.from({ length: 256 }, (_, mask) => String.fromCodePoint(0x2800 + mask));

export function glyphsFor(styleId: StyleId, custom: string): readonly string[] {
  if (styleId === 'true-braille') return ALL_BRAILLE;
  if (styleId === 'custom') {
    const result = validateCustom(custom);
    if (result.error) throw new Error(result.error);
    return result.characters;
  }
  return fixedGlyphs.get(styleId)!;
}

export function styleCount(style: CharacterStyle, custom: string): number {
  return style.kind === 'braille' ? 256 : splitCharacters(style.kind === 'custom' ? custom : style.characters).length;
}
