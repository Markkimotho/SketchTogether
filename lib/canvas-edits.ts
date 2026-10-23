import type { CanvasElement, LayerData } from '../types/canvas'

export interface CanvasEdit {
  expected?: CanvasElement[]
  deleteIds?: string[]
  add?: CanvasElement[]
  clear?: boolean
  layerId?: string
}
export interface CanvasDelta { removed: CanvasElement[]; added: CanvasElement[] }
export type EditReply = { ok: true; delta: CanvasDelta } | { ok: false; error: string }

export function isCanvasElement(value: unknown): value is CanvasElement {
  if (!value || typeof value !== 'object') return false
  const element = value as CanvasElement
  if (typeof element.id !== 'string' || !element.id || typeof element.layerId !== 'string'
    || typeof element.color !== 'string' || element.color.length > 100
    || (element.offsetX !== undefined && !Number.isFinite(element.offsetX))
    || (element.offsetY !== undefined && !Number.isFinite(element.offsetY))) return false
  if (element.type === 'stroke') return ['brush', 'pencil', 'pen', 'calligraphy', 'eraser', 'line'].includes(element.tool)
    && Number.isFinite(element.size) && element.size > 0 && Array.isArray(element.points)
    && element.points.length >= 2 && element.points.length % 2 === 0 && element.points.every(Number.isFinite)
    && (element.opacity === undefined || (Number.isFinite(element.opacity) && element.opacity >= 0 && element.opacity <= 1))
    && (element.pressures === undefined || (Array.isArray(element.pressures) && element.pressures.every(Number.isFinite)))
    && (element.tiltAngle === undefined || Number.isFinite(element.tiltAngle))
  if (element.type === 'shape') return ['rectangle', 'circle'].includes(element.tool)
    && [element.x, element.y, element.width, element.height, element.strokeWidth].every(Number.isFinite)
    && typeof element.filled === 'boolean'
  return element.type === 'text' && [element.x, element.y, element.fontSize].every(Number.isFinite)
    && element.fontSize > 0 && typeof element.text === 'string' && typeof element.fontFamily === 'string'
}

export function applyCanvasEdit(elements: CanvasElement[], layers: LayerData[], edit: CanvasEdit) {
  if (!edit || typeof edit !== 'object'
    || (edit.deleteIds !== undefined && (!Array.isArray(edit.deleteIds) || !edit.deleteIds.every(id => typeof id === 'string')))
    || (edit.add !== undefined && (!Array.isArray(edit.add) || !edit.add.every(isCanvasElement)))) throw new Error('Invalid canvas edit')
  if (edit.expected !== undefined && (!Array.isArray(edit.expected) || !edit.expected.every(isCanvasElement))) throw new Error('Invalid expected artwork')
  const fingerprint = (element: CanvasElement) => JSON.stringify(Object.entries(element).filter(([key]) => key !== 'remote' && key !== 'pending').sort(([a], [b]) => a.localeCompare(b)))
  for (const expected of edit.expected ?? []) {
    const current = elements.find(element => element.id === expected.id)
    if (!layers.some(layer => layer.id === expected.layerId && layer.visible && !layer.locked)) throw new Error('Choose a visible, unlocked layer')
    if (!current || fingerprint(current) !== fingerprint(expected)) throw new Error('That artwork has changed. Undo cannot overwrite another edit.')
  }
  const editable = new Set(layers.filter(layer => layer.visible && !layer.locked).map(layer => layer.id))
  const ids = new Set(edit.deleteIds ?? [])
  const removed = elements.filter(element => editable.has(element.layerId)
    && (ids.has(element.id) || (edit.clear && (!edit.layerId || element.layerId === edit.layerId))))
  const removedIds = new Set(removed.map(element => element.id))
  const remaining = elements.filter(element => !removedIds.has(element.id))
  const existing = new Set(remaining.map(element => element.id))
  const added: CanvasElement[] = []
  for (const element of edit.add ?? []) {
    if (!editable.has(element.layerId)) throw new Error('Choose a visible, unlocked layer')
    if (existing.has(element.id)) continue // Retry-safe: never replace another edit.
    existing.add(element.id)
    added.push(element.type === 'stroke' ? { ...element, pending: false, remote: false } : element)
  }
  const delta = { removed, added }
  return { elements: [...remaining, ...added], delta }
}

export function mergeCanvasDelta(elements: CanvasElement[], delta: CanvasDelta): CanvasElement[] {
  const ids = new Set(delta.removed.map(element => element.id))
  return Array.from(new Map([...elements.filter(element => !ids.has(element.id)), ...delta.added].map(element => [element.id, element])).values())
}

export function editableElements(elements: CanvasElement[], layers: LayerData[]) {
  const ids = new Set(layers.filter(layer => layer.visible && !layer.locked).map(layer => layer.id))
  return elements.filter(element => ids.has(element.layerId) && !(element.type === 'stroke' && element.pending))
}

// Serializes all room mutations, including drawing and deleting at the same time.
export class RoomMutationQueue {
  private pending = new Map<string, Promise<unknown>>()
  run<T>(roomId: string, action: () => Promise<T>): Promise<T> {
    const previous = this.pending.get(roomId) ?? Promise.resolve()
    const task = previous.catch(() => {}).then(action)
    this.pending.set(roomId, task)
    void task.finally(() => { if (this.pending.get(roomId) === task) this.pending.delete(roomId) }).catch(() => {})
    return task
  }
}

export function duplicateElements(elements: CanvasElement[], newId: () => string): CanvasElement[] {
  return elements.map(element => ({ ...element, id: newId(), offsetX: (element.offsetX ?? 0) + 24, offsetY: (element.offsetY ?? 0) + 24,
    ...(element.type === 'stroke' ? { points: [...element.points], pending: false, remote: false } : {}) }))
}
