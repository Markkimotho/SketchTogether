import assert from 'node:assert/strict'
import test from 'node:test'
import { applyCanvasEdit, mergeCanvasDelta, RoomMutationQueue } from './canvas-edits'
import type { CanvasElement, LayerData } from '../types/canvas'
const layers: LayerData[] = [
  { id: 'open', name: 'Open', locked: false, visible: true, order: 0 },
  { id: 'locked', name: 'Locked', locked: true, visible: true, order: 1 },
  { id: 'hidden', name: 'Hidden', locked: false, visible: false, order: 2 },
]
const mark = (id: string, layerId = 'open'): CanvasElement => ({ id, layerId, type: 'stroke', tool: 'pen', points: [10, 10, 20, 20], color: '#123456', size: 2 })

test('delete removes only requested, editable objects and returns their snapshots', () => {
  const initial = [mark('a'), mark('b'), mark('c', 'locked'), mark('d', 'hidden')]
  const result = applyCanvasEdit(initial, layers, { deleteIds: ['a', 'c', 'd'] })
  assert.deepEqual(result.elements.map(e => e.id), ['b', 'c', 'd'])
  assert.deepEqual(result.delta.removed, [initial[0]])
  assert.equal(initial.length, 4)
  assert.deepEqual(mergeCanvasDelta(initial, result.delta), result.elements)
})
test('clearing a layer preserves other layers, locked art and hidden art', () => {
  const initial = [mark('a'), mark('b', 'locked'), mark('c', 'hidden')]
  assert.deepEqual(applyCanvasEdit(initial, layers, { clear: true }).elements, initial.slice(1))
  assert.deepEqual(applyCanvasEdit(initial, layers, { clear: true, layerId: 'locked' }).elements, initial)
})
test('restoring a deletion preserves other work and adding the same object twice is idempotent', () => {
  const initial = [mark('a'), mark('b')]
  const deleted = applyCanvasEdit(initial, layers, { deleteIds: ['a'] })
  const restored = applyCanvasEdit([...deleted.elements, mark('collaborator')], layers, { add: deleted.delta.removed })
  assert.deepEqual(restored.elements.map(e => e.id), ['b', 'collaborator', 'a'])
  assert.equal(applyCanvasEdit(restored.elements, layers, { add: deleted.delta.removed }).delta.added.length, 0)
  assert.throws(() => applyCanvasEdit(initial, layers, { add: [mark('locked-write', 'locked')] }), /unlocked/)
  assert.throws(() => applyCanvasEdit(initial, layers, { add: [{ ...mark('bad'), points: [NaN] } as CanvasElement] }), /Invalid/)
})
test('concurrent drawing and deletion are serialized, and failed saves do not block later edits', async () => {
  const queue = new RoomMutationQueue()
  let state = [mark('a')]
  const save = (edit: Parameters<typeof applyCanvasEdit>[2]) => queue.run('room', async () => {
    const current = state
    await new Promise(resolve => setTimeout(resolve, 2))
    state = applyCanvasEdit(current, layers, edit).elements
  })
  await Promise.all([save({ add: [mark('b')] }), save({ deleteIds: ['a'] }), save({ add: [mark('c')] })])
  assert.deepEqual(state.map(e => e.id), ['b', 'c'])
  await assert.rejects(queue.run('room', async () => { throw new Error('failed') }))
  await save({ add: [mark('d')] })
  assert.deepEqual(state.map(e => e.id), ['b', 'c', 'd'])
})

test('undo refuses to erase artwork that a collaborator moved after it was added', () => {
  const original = mark('a')
  assert.throws(() => applyCanvasEdit([{ ...original, offsetX: 50 }], layers,
    { deleteIds: ['a'], expected: [original] }), /changed/)
  assert.throws(() => applyCanvasEdit([mark('a', 'locked')], layers,
    { deleteIds: ['a'], expected: [mark('a', 'locked')] }), /unlocked/)
})
