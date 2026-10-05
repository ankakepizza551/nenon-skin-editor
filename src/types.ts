export type Tool = 'pen' | 'eraser' | 'fill' | 'eyedropper';

// classic = Steve (4px arms), slim = Alex (3px arms)
export type SkinModel = 'classic' | 'slim';

export const SKIN_W = 64;
export const SKIN_H = 64;

export function hexToRgba(hex: string): [number, number, number, number] {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return [r, g, b, 255];
}

export function rgbaToHex(r: number, g: number, b: number): string {
  return '#' + [r, g, b].map(v => v.toString(16).padStart(2, '0')).join('');
}

export function createEmptySkin(): Uint8ClampedArray {
  return new Uint8ClampedArray(SKIN_W * SKIN_H * 4);
}
