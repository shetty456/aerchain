export interface ScaleParams {
  origW: number;
  origH: number;
  displayW: number;
  displayH: number;
}

export function computeScale({ origW, origH, displayW, displayH }: ScaleParams): number {
  return Math.min(displayW / origW, displayH / origH, 1);
}

export function toDisplayCoords(
  bbox: { x0: number; y0: number; x1: number; y1: number },
  scale: number
) {
  return {
    x: bbox.x0 * scale,
    y: bbox.y0 * scale,
    width: (bbox.x1 - bbox.x0) * scale,
    height: (bbox.y1 - bbox.y0) * scale,
  };
}

export function toOriginalCoords(point: { x: number; y: number }, scale: number) {
  return {
    x: point.x / scale,
    y: point.y / scale,
  };
}
