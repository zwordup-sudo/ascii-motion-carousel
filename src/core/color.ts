export function clamp(value: number, low = 0, high = 255): number { return Math.max(low, Math.min(high, value)); }
/** Perceptual luma of display-encoded sRGB (not radiometric linear luminance). */
export function luminance(r: number, g: number, b: number): number { return .2126 * r + .7152 * g + .0722 * b; }
export function adjustChannel(value: number, contrast: number, brightness: number): number {
  return clamp((value - 128) * contrast + 128 + brightness);
}
