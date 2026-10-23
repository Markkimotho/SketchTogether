import assert from 'node:assert/strict'
import test from 'node:test'
import { act, createElement, useCallback } from 'react'
import { createRoot } from 'react-dom/client'
import { useCanvasHistory } from './use-canvas-history'
import { applyCanvasEdit, duplicateElements, type CanvasEdit } from './canvas-edits'
import type { CanvasElement, LayerData } from '../types/canvas'
import { setupDom } from './testing/dom'

const layer: LayerData = { id: 'layer', name: 'Sketch', locked: false, visible: true, order: 0 }
const mark: CanvasElement = { id: 'a', type: 'stroke', tool: 'pen', color: 'black', size: 2, layerId: 'layer', points: [0, 0, 20, 20] }

test('undo/redo preserves collaborator work, retries a failed undo and records group edits as one action', async () => {
  const { container, cleanup } = setupDom()
  const root = createRoot(container)
  let state: CanvasElement[] = [mark]
  let fail = false
  let history!: ReturnType<typeof useCanvasHistory>
  function Harness() {
    const commit = useCallback(async (edit: CanvasEdit) => {
      if (fail) return null
      const result = applyCanvasEdit(state, [layer], edit)
      state = result.elements
      return result.delta
    }, [])
    history = useCanvasHistory(commit)
    return null
  }
  try {
    await act(async () => root.render(createElement(Harness)))
    const deleted = applyCanvasEdit(state, [layer], { deleteIds: ['a'] })
    state = [...deleted.elements, { ...mark, id: 'collaborator' }]
    await act(async () => history.record(deleted.delta, 'delete'))
    fail = true
    await act(async () => history.undo())
    assert.equal(history.canUndo, true)
    assert.deepEqual(state.map(element => element.id), ['collaborator'])
    fail = false
    await act(async () => history.undo())
    assert.deepEqual(state.map(element => element.id), ['collaborator', 'a'])
    assert.equal(history.canRedo, true)
    await act(async () => history.redo())
    assert.deepEqual(state.map(element => element.id), ['collaborator'])
    const copies = duplicateElements([{ ...mark, id: 'b', offsetX: 10 }, { ...mark, id: 'c' }], (() => { let id = 0; return () => `copy-${++id}` })())
    assert.equal(copies[0].offsetX, 34)
    assert.notEqual((copies[0] as typeof mark).points, mark.points)
    const duplicated = applyCanvasEdit(state, [layer], { add: copies })
    state = duplicated.elements
    await act(async () => history.record(duplicated.delta, 'duplicate'))
    assert.equal(history.canRedo, false, 'New edits invalidate the redo branch')
    await act(async () => history.undo())
    assert.deepEqual(state.map(element => element.id), ['collaborator'])
    await act(async () => history.redo())
    assert.deepEqual(state.map(element => element.id), ['collaborator', 'copy-1', 'copy-2'])
  } finally { await act(async () => root.unmount()); cleanup() }
})
