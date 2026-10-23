import assert from 'node:assert/strict'
import test from 'node:test'
import { act, createElement, Profiler } from 'react'
import { createRoot } from 'react-dom/client'
import { JSDOM } from 'jsdom'
import TouchpadPad from '../components/TouchpadPad'

test('writing pad measures its HTML viewport and settles after resize and expansion', async () => {
  const dom = new JSDOM('<!doctype html><div id="root"></div>', { pretendToBeVisual: true })
  const replacements: Record<string, unknown> = {
    window: dom.window, document: dom.window.document, Element: dom.window.Element,
    Node: dom.window.Node, IS_REACT_ACT_ENVIRONMENT: true,
    requestAnimationFrame: (callback: FrameRequestCallback) => { callback(0); return 1 },
  }
  const observers = new Set<MockResizeObserver>()
  class MockResizeObserver {
    target: Element | null = null
    constructor(readonly callback: ResizeObserverCallback) { observers.add(this) }
    observe(target: Element) { this.target = target }
    disconnect() { observers.delete(this) }
    notify(width: number, height: number) {
      this.callback([{ target: this.target, contentRect: { width, height } } as ResizeObserverEntry], this as unknown as ResizeObserver)
    }
  }
  replacements.ResizeObserver = MockResizeObserver
  const originals = new Map(Object.keys(replacements).map(key => [key, Object.getOwnPropertyDescriptor(globalThis, key)]))
  for (const [key, value] of Object.entries(replacements)) Object.defineProperty(globalThis, key, { configurable: true, writable: true, value })
  const container = dom.window.document.getElementById('root')!
  const root = createRoot(container)
  let commits = 0
  const click = async (label: string) => {
    const button = container.querySelector(`button[aria-label="${label}"]`)
    assert.ok(button, `Missing button: ${label}`)
    await act(async () => button.dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true })))
  }
  try {
    await act(async () => root.render(createElement(Profiler, { id: 'pad', onRender: () => { commits++ } },
      createElement(TouchpadPad, { color: '#123456', size: 4, onInsert: async () => true }))))
    const key = async () => act(async () => { dom.window.document.dispatchEvent(new dom.window.KeyboardEvent('keydown', { code: 'KeyW', bubbles: true })) })
    await key()
    assert.match(container.textContent!, /Writing on/)
    assert.equal(observers.size, 1)
    const observer = [...observers][0]
    assert.equal(observer.target?.tagName, 'DIV', 'Observing the SVG creates a graphics/measurement feedback loop')
    assert.equal(observer.target, container.querySelector('[data-testid="writing-pad-viewport"]'))
    await act(async () => observer.notify(508, 220))
    assert.equal(container.querySelector('svg[role="application"]')?.getAttribute('viewBox'), '0 0 508 220')
    const settled = commits
    for (let index = 0; index < 60; index++) await act(async () => observer.notify(508, 220))
    assert.equal(commits, settled, 'Identical resize reports must not cause more renders')
    await click('Expand writing pad')
    await act(async () => observer.notify(1200, 700))
    assert.equal(container.querySelector('svg[role="application"]')?.getAttribute('viewBox'), '0 0 1200 700')
    const expanded = commits
    for (let index = 0; index < 60; index++) await act(async () => observer.notify(1200, 700))
    assert.equal(commits, expanded)
    await click('Collapse writing pad')
    await act(async () => observer.notify(508, 220))
    assert.equal(container.querySelector('svg[role="application"]')?.getAttribute('viewBox'), '0 0 508 220')
    await key()
    assert.match(container.textContent!, /Writing paused/)
    await click('Close writing pad')
    assert.equal(observers.size, 0)
  } finally {
    await act(async () => root.unmount())
    for (const [key, descriptor] of originals) {
      if (descriptor) Object.defineProperty(globalThis, key, descriptor)
      else Reflect.deleteProperty(globalThis, key)
    }
    dom.window.close()
  }
})
