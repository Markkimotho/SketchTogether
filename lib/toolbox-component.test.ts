import assert from 'node:assert/strict'
import test from 'node:test'
import { act, createElement, useState } from 'react'
import { setupDom } from './testing/dom'

test('toolbox selects tools, supports arrow navigation and confirms clear separately from delete', async () => {
  const { dom, container, cleanup } = setupDom()
  const { createRoot } = await import('react-dom/client')
  const { default: ToolBar } = await import('../components/ToolBar')
  const root = createRoot(container)
  let deletes = 0
  const clears: (string | undefined)[] = []
  const presets: number[] = []
  function Harness({ connected = true }: { connected?: boolean }) {
    const [tool, setTool] = useState('brush')
    const [colour, setColour] = useState('#1a1410')
    return createElement(ToolBar, { selectedTool: tool, setSelectedTool: setTool, brushSize: 5, setBrushSize: size => { presets.push(size) },
      brushColor: colour, setBrushColor: setColour, brushOpacity: 1, setBrushOpacity: () => {}, fontSize: 24, setFontSize: () => {},
      shapeFilled: false, setShapeFilled: () => {}, onClear: id => { clears.push(id) }, onDelete: () => { deletes++ },
      selectedCount: 2, canClear: true, editPending: false, isConnected: connected, userCount: 2,
      layerName: 'Sketches', layerId: 'layer', layerLocked: false, canClearLayer: true })
  }
  const button = (label: string) => {
    const found = dom.window.document.querySelector<HTMLButtonElement>(`button[aria-label="${label}"]`)
    assert.ok(found, `Missing ${label}`)
    return found
  }
  const click = async (label: string) => act(async () => { button(label).click() })
  const clickText = async (text: string) => act(async () => {
    const found = [...dom.window.document.querySelectorAll('button')].find(node => node.textContent === text)
    assert.ok(found, `Missing ${text}: ${dom.window.document.body.textContent}`); found.click()
  })
  try {
    await act(async () => root.render(createElement(Harness)))
    await click('Ink pen')
    assert.equal(button('Ink pen').getAttribute('aria-pressed'), 'true')
    await act(async () => {
      button('Ink pen').focus()
      button('Ink pen').dispatchEvent(new dom.window.KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }))
    })
    assert.equal(dom.window.document.activeElement, button('Brush'))
    await click('Delete selected objects')
    assert.equal(deletes, 1)
    assert.equal(clears.length, 0)
    await click('Clear artwork options')
    await clickText('Clear current layer')
    assert.equal(clears.length, 0, 'Choosing a scope must not clear immediately')
    await clickText('Cancel')
    await clickText('Clear editable canvas')
    await clickText('Clear canvas')
    assert.deepEqual(clears, [undefined])
    await act(async () => root.render(createElement(Harness, { connected: false })))
    assert.equal(button('Delete selected objects').disabled, true)
    assert.equal(button('Clear artwork options').disabled, true)
  } finally { await act(async () => root.unmount()); cleanup() }
})
