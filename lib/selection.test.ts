import assert from 'node:assert/strict'
import test from 'node:test'
import { boxBetween, getElementBounds, hitTestElement, intersects } from './selection'
import type { CanvasElement } from '../types/canvas'
const diagonal: CanvasElement = { id: 'ink', layerId: 'a', type: 'stroke', tool: 'brush', points: [0, 0, 100, 100], color: 'black', size: 4, offsetX: 20, offsetY: 10 }

test('select hits actual stroke segments, accounting for offsets, instead of empty bounding-box space', () => {
  assert.equal(hitTestElement([diagonal], { x: 70, y: 60 }, 3)?.id, 'ink')
  assert.equal(hitTestElement([diagonal], { x: 110, y: 15 }, 3), undefined)
  assert.equal(hitTestElement([{ ...diagonal, tool: 'eraser' }], { x: 70, y: 60 }, 3), undefined)
})
test('marquee boxes work in either drag direction, including shapes drawn backwards', () => {
  const shape: CanvasElement = { id: 'shape', type: 'shape', tool: 'rectangle', x: 40, y: 60, width: -30, height: -40, color: 'black', filled: true, strokeWidth: 2, layerId: 'a' }
  assert.deepEqual(getElementBounds(shape), { x: 10, y: 20, w: 30, h: 40 })
  assert.equal(intersects(boxBetween({ x: 80, y: 80 }, { x: 0, y: 0 }), getElementBounds(shape)!), true)
  assert.deepEqual(getElementBounds({ ...shape, tool: 'circle', width: 100, height: 20 }), { x: 40, y: 20, w: 100, h: 100 })
})
