import { describe, expect, it } from 'vitest';
import { INTERVALS, moveItem, nextIndex, planFrames } from './timeline';

describe('secuencia y tiempos', () => {
  it('reordena sin mutar la entrada', () => {
    const images = ['A', 'B', 'C'];
    expect(moveItem(images, 2, 0)).toEqual(['C', 'A', 'B']);
    expect(moveItem(images, 0, 2)).toEqual(['B', 'C', 'A']);
    expect(moveItem(images, 0, -1)).toEqual(images);
    expect(images).toEqual(['A', 'B', 'C']);
  });
  it('vuelve al principio y maneja secuencias vacías', () => {
    expect(nextIndex(0, 3)).toBe(1);
    expect(nextIndex(2, 3)).toBe(0);
    expect(nextIndex(0, 0)).toBe(0);
  });
  it.each(INTERVALS)('mantiene orden y convierte %i segundos en milisegundos', seconds => {
    const pixels = [new Uint8ClampedArray([1]), new Uint8ClampedArray([2]), new Uint8ClampedArray([3])];
    const frames = planFrames(pixels, seconds);
    expect(frames.map(f => f.data[0])).toEqual([1, 2, 3]);
    expect(frames.map(f => f.delay)).toEqual([seconds * 1000, seconds * 1000, seconds * 1000]);
  });
  it('fusiona solo duplicados consecutivos conservando duración', () => {
    const frames = planFrames([1, 1, 2, 1].map(n => new Uint8ClampedArray([n])), 5);
    expect(frames.map(f => [f.data[0], f.delay])).toEqual([[1, 10000], [2, 5000], [1, 5000]]);
  });
});
