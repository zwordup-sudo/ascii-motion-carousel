import { describe, expect, it } from 'vitest';
import { MAX_FILE_BYTES, validateDimensions, validateFile } from './files';

describe('validación de archivos', () => {
  const file = { name: 'foto.png', type: 'image/png', size: 100 };
  it.each(['image/png', 'image/jpeg', 'image/webp'])('acepta %s', type => {
    expect(validateFile({ ...file, type })).toBeNull();
  });
  it.each(['image/svg+xml', 'image/gif', 'text/plain', ''])('rechaza %s', type => {
    expect(validateFile({ ...file, type })).toContain('JPG, PNG o WebP');
  });
  it('rechaza vacíos y archivos demasiado grandes', () => {
    expect(validateFile({ ...file, size: 0 })).toContain('vacío');
    expect(validateFile({ ...file, size: MAX_FILE_BYTES + 1 })).toContain('10 MiB');
    expect(validateFile({ ...file, size: MAX_FILE_BYTES })).toBeNull();
  });
  it('limita las dimensiones decodificadas', () => {
    expect(() => validateDimensions(4000, 4000)).not.toThrow();
    expect(() => validateDimensions(4001, 4000)).toThrow();
    expect(() => validateDimensions(0, 10)).toThrow();
    expect(() => validateDimensions(NaN, 10)).toThrow();
  });
});
