import assert from 'node:assert/strict'
import test from 'node:test'
import { placeInk } from './touchpad'

test('places handwriting at the visible center and compensates for canvas zoom', () => {
  const draft = [
    { points: [0, 0, 100, 50], color: '#123456', size: 4 },
    { points: [150, 0, 200, 50], color: '#654321', size: 2 },
  ]
  const placed = placeInk(draft, { x: 1000, y: -500 }, 2)
  assert.deepEqual(placed[0].points, [950, -512.5, 1000, -487.5])
  assert.deepEqual(placed[1].points, [1025, -512.5, 1050, -487.5])
  assert.equal(placed[0].size, 2)
  assert.equal(placed[1].color, '#654321')
  assert.deepEqual(draft[0].points, [0, 0, 100, 50])
})

test('fits a large draft without distorting its aspect ratio', () => {
  const [stroke] = placeInk([{ points: [0, 0, 800, 400], color: 'black', size: 4 }], { x: 0, y: 0 }, 1)
  assert.deepEqual(stroke.points, [-280, -140, 280, 140])
  assert.equal(stroke.size, 2.8)
})

test('handles dots and empty drafts without invalid coordinates', () => {
  assert.deepEqual(placeInk([], { x: 0, y: 0 }, 1), [])
  const [dot] = placeInk([{ points: [12, 14], color: 'black', size: 2 }], { x: 40, y: 50 }, 1)
  assert.deepEqual(dot.points, [40, 50])
  assert.deepEqual(placeInk([{ points: [1], color: 'black', size: 2 }], { x: 0, y: 0 }, 1), [])
})
