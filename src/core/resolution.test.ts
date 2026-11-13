import { describe, expect, it } from 'vitest';
import { BoundedCache } from './cache';
import { COLUMN_PRESETS } from './ascii';
import { CACHE_BYTES, qualityWarning, resolveSize, rgbaBytes } from './resolution';

describe('resoluciones y presupuestos', () => {
  it.each(['320', '640', '1024'] as const)('respeta salida explícita %s sin cambiar la densidad', resolution => {
    for (const columns of COLUMN_PRESETS) expect(resolveSize(resolution, columns)).toBe(Number(resolution));
  });
  it('automático escala con los presets sin superar 2048', () => {
    expect(COLUMN_PRESETS.map(columns => resolveSize('auto', columns))).toEqual([320, 320, 640, 1024, 2048]);
    expect(rgbaBytes(2048)).toBe(16 * 1024 * 1024);
  });
  it('advierte también cuando el retrato deja poco ancho para los glifos', () => {
    expect(qualityWarning(320, 300)).toContain('insuficiente');
    expect(qualityWarning(2048, 300)).toBeNull();
    expect(qualityWarning(1024, 160, 1, 2)).toContain('insuficiente');
    expect(resolveSize('auto', 160, 1, 2)).toBe(2048);
  });
  it('expulsa el render menos reciente y acota caché incluso con veinte imágenes', () => {
    const cache = new BoundedCache<string>(CACHE_BYTES);
    for (let i = 0; i < 20; i++) cache.set(String(i), 'render', rgbaBytes(1024));
    expect(cache.bytes).toBe(CACHE_BYTES);
    expect(cache.get('0')).toBeUndefined();
    expect(cache.get('16')).toBe('render');
    cache.set('20', 'new', rgbaBytes(1024));
    expect(cache.get('17')).toBeUndefined();
    expect(cache.get('16')).toBe('render');
    cache.clear();
    expect(cache.bytes).toBe(0);
  });
  it('no almacena una entrada que supera el presupuesto ni duplica el tamaño al reemplazar', () => {
    const cache = new BoundedCache<string>(10);
    cache.set('a', 'one', 8);
    cache.set('a', 'two', 5);
    expect(cache.bytes).toBe(5);
    cache.set('large', 'large', 11);
    expect(cache.get('large')).toBeUndefined();
    expect(cache.bytes).toBe(5);
  });
});
