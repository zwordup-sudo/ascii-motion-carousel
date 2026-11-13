import { describe, expect, it } from 'vitest';
import { adjustChannel, averageSamples, characterFor, COLUMN_PRESETS, containRect, DEFAULT_SETTINGS, gridFor, luminance, pixelsToCells, RAMPS } from './ascii';

describe('motor ASCII puro', () => {
  it('mapea negro a espacio, blanco a carácter denso y limita intensidades', () => {
    expect(characterFor(0)).toBe(' ');
    expect(characterFor(255)).toBe('@');
    expect(characterFor(-30)).toBe(' ');
    expect(characterFor(999)).toBe('@');
    expect(characterFor(128)).toBe('+');
  });
  it('la luminosidad perceptual pondera más el verde', () => {
    expect(luminance(0, 255, 0)).toBeGreaterThan(luminance(255, 0, 0));
    expect(luminance(255, 255, 255)).toBeCloseTo(255);
  });
  it('aplica brillo, contraste y recorte sin salir de 0–255', () => {
    expect(adjustChannel(128, 2, 10)).toBe(138);
    expect(adjustChannel(0, 2, -80)).toBe(0);
    expect(adjustChannel(255, 2, 80)).toBe(255);
  });
  it.each([[640, 320, 320, 160, 0, 80], [200, 400, 160, 320, 80, 0], [50, 50, 320, 320, 0, 0]])(
    'contiene %i × %i sin deformar', (w, h, width, height, x, y) => {
      expect(containRect(w, h)).toEqual({ width, height, x, y });
    },
  );
  it('rechaza dimensiones inválidas', () => {
    expect(() => containRect(0, 100)).toThrow();
    expect(() => containRect(Infinity, 100)).toThrow();
  });
  it('compensa la proporción de caracteres monoespaciados', () => {
    const grid = gridFor(80, 100, 100, { advance: 60, lineHeight: 100 });
    expect(grid.rows).toBe(48);
    expect(grid.cellWidth * grid.columns).toBe(320);
    expect(grid.cellHeight * grid.rows).toBe(320);
  });
  it.each(COLUMN_PRESETS)('%i columnas muestrean la imagen y conservan proporciones en paisaje y retrato', columns => {
    for (const [width, height] of [[1600, 900], [900, 1600], [1000, 1000]]) {
      const grid = gridFor(columns, width, height, { advance: 60, lineHeight: 100 }, 1024);
      expect(grid.columns).toBe(columns);
      expect(grid.rows).toBe(Math.round(columns * height / width * .6));
      expect(grid.cellWidth * columns / (grid.cellHeight * grid.rows)).toBeCloseTo(width / height);
      expect(grid.fit.x).toBeGreaterThanOrEqual(0);
      expect(grid.fit.y).toBeGreaterThanOrEqual(0);
    }
  });
  it('usa las métricas recibidas, valida columnas y limita proporciones extremas', () => {
    expect(gridFor(96, 100, 100, { advance: 80, lineHeight: 100 }).rows).toBe(77);
    expect(gridFor(300, 1, 16000, { advance: 60, lineHeight: 100 }).rows).toBe(2048);
    expect(gridFor(300, 1, 16000, { advance: 60, lineHeight: 100 }).limited).toBe(true);
    for (const columns of [15, 301, 16.5, NaN]) expect(() => gridFor(columns, 1, 1, { advance: 60, lineHeight: 100 })).toThrow();
  });
  it('promedia cuatro muestras independientes por celda y pondera alpha', () => {
    const pixels = new Uint8ClampedArray([
      255, 0, 0, 255, 255, 0, 0, 255, 0, 0, 255, 255, 0, 0, 255, 255,
      255, 0, 0, 0, 255, 0, 0, 0, 0, 0, 255, 255, 0, 0, 255, 255,
    ]);
    expect(Array.from(averageSamples(pixels, 2, 1))).toEqual([255, 0, 0, 128, 0, 0, 255, 255]);
  });
  it('produce caracteres reales y colores; alpha se compone sobre negro', () => {
    const pixels = new Uint8ClampedArray([255, 255, 255, 255, 255, 0, 0, 0, 255, 0, 0, 255]);
    const cells = pixelsToCells(pixels, { ...DEFAULT_SETTINGS, contrast: 1 });
    expect(cells.map(cell => cell.character)).toEqual(['@', ' ', ':']);
    expect(cells[2].color).toBe('rgb(255,0,0)');
    expect(cells.every(cell => RAMPS.standard.includes(cell.character))).toBe(true);
  });
  it('el modo monocromo conserva luminosidad y usa tinta lima', () => {
    const [cell] = pixelsToCells(new Uint8ClampedArray([255, 255, 255, 255]), { ...DEFAULT_SETTINGS, color: false });
    expect(cell).toEqual({ character: '@', color: '#c8ff62' });
  });
  it('el brillo no rellena márgenes transparentes con caracteres', () => {
    const cells = pixelsToCells(new Uint8ClampedArray([0, 0, 0, 0, 0, 0, 0, 255]), {
      ...DEFAULT_SETTINGS, contrast: 1, brightness: 80,
    });
    expect(cells[0].character).toBe(' ');
    expect(cells[1].character).not.toBe(' ');
  });
});
