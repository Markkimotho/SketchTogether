import type { CanvasElement } from '../types/canvas'
export interface ElementMove { before: CanvasElement; offsetX: number; offsetY: number }
export interface Point { x: number; y: number }
export interface Bounds extends Point { w: number; h: number }
export function getElementBounds(element: CanvasElement): Bounds | null {
  const ox = element.offsetX ?? 0, oy = element.offsetY ?? 0
  if (element.type === 'stroke') {
    if (element.points.length < 2) return null
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity
    for (let i = 0; i < element.points.length; i += 2) {
      minX = Math.min(minX, element.points[i]); maxX = Math.max(maxX, element.points[i])
      minY = Math.min(minY, element.points[i + 1]); maxY = Math.max(maxY, element.points[i + 1])
    }
    const pad = element.size / 2 + 4
    return { x: minX + ox - pad, y: minY + oy - pad, w: maxX - minX + 2 * pad, h: maxY - minY + 2 * pad }
  }
  if (element.type === 'shape' && element.tool === 'circle') {
    const radius = Math.max(Math.abs(element.width), Math.abs(element.height)) / 2
    return { x: element.x + ox + element.width / 2 - radius, y: element.y + oy + element.height / 2 - radius, w: radius * 2, h: radius * 2 }
  }
  if (element.type === 'shape') return { x: element.x + ox + Math.min(0, element.width), y: element.y + oy + Math.min(0, element.height), w: Math.abs(element.width), h: Math.abs(element.height) }
  const lines = element.text.split('\n')
  return { x: element.x + ox, y: element.y + oy, w: Math.max(...lines.map(line => line.length), 1) * element.fontSize * 0.65, h: lines.length * element.fontSize * 1.3 }
}
export function boxBetween(start: Point, end: Point): Bounds {
  return { x: Math.min(start.x, end.x), y: Math.min(start.y, end.y), w: Math.abs(end.x - start.x), h: Math.abs(end.y - start.y) }
}
export function intersects(a: Bounds, b: Bounds) {
  return a.x <= b.x + b.w && a.x + a.w >= b.x && a.y <= b.y + b.h && a.y + a.h >= b.y
}
export function hitTestElement(elements: CanvasElement[], point: Point, tolerance: number) {
  return [...elements].reverse().find(element => {
    if (element.type === 'stroke') {
      const points = element.points, x = point.x - (element.offsetX ?? 0), y = point.y - (element.offsetY ?? 0)
      if (element.tool === 'eraser') return false
      for (let i = 0; i < points.length; i += 2) {
        const ax = points[i], ay = points[i + 1], bx = points[i + 2] ?? ax, by = points[i + 3] ?? ay
        const dx = bx - ax, dy = by - ay
        const t = Math.max(0, Math.min(1, ((x - ax) * dx + (y - ay) * dy) / (dx * dx + dy * dy || 1)))
        if (Math.hypot(x - ax - t * dx, y - ay - t * dy) <= tolerance + element.size / 2) return true
      }
      return false
    }
    const bounds = getElementBounds(element)
    return bounds && point.x >= bounds.x - tolerance && point.x <= bounds.x + bounds.w + tolerance
      && point.y >= bounds.y - tolerance && point.y <= bounds.y + bounds.h + tolerance
  })
}
