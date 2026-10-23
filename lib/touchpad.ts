export interface InkStroke {
  id?: string
  points: number[]
  color: string
  size: number
}

// Trackpads emit wheel deltas for two-finger navigation. Mouse wheels may use
// line/page units; Shift + vertical wheel is also a horizontal navigation path.
export function panInkPage(
  page: { x: number; y: number },
  wheel: { deltaX: number; deltaY: number; deltaMode: number; shiftKey: boolean },
  pageHeight: number,
) {
  const unit = wheel.deltaMode === 1 ? 16 : wheel.deltaMode === 2 ? pageHeight : 1
  const horizontal = wheel.shiftKey && wheel.deltaX === 0
  return {
    x: page.x + (horizontal ? wheel.deltaY : wheel.deltaX) * unit,
    y: page.y + (horizontal ? 0 : wheel.deltaY) * unit,
  }
}

// Fit the entire draft as one unit so letters retain their relative positions.
export function placeInk(
  strokes: InkStroke[],
  center: { x: number; y: number },
  viewportScale: number,
): InkStroke[] {
  if (!strokes.length) return []
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity
  for (const stroke of strokes) {
    for (let i = 0; i < stroke.points.length; i += 2) {
      const x = stroke.points[i], y = stroke.points[i + 1]
      if (!Number.isFinite(x) || !Number.isFinite(y)) return []
      minX = Math.min(minX, x); maxX = Math.max(maxX, x)
      minY = Math.min(minY, y); maxY = Math.max(maxY, y)
    }
  }
  if (!Number.isFinite(minX)) return []
  const scale = Math.min(1, 640 / Math.max(1, maxX - minX), 280 / Math.max(1, maxY - minY))
    / Math.max(0.05, viewportScale)
  return strokes.map(stroke => ({
    ...stroke,
    size: stroke.size * scale,
    points: stroke.points.map((value, i) => i % 2 === 0
      ? center.x + (value - (minX + maxX) / 2) * scale
      : center.y + (value - (minY + maxY) / 2) * scale),
  }))
}
