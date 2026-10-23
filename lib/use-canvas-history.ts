'use client'
import { useCallback, useRef, useState } from 'react'
import type { CanvasDelta, CanvasEdit } from './canvas-edits'

interface HistoryEntry { delta: CanvasDelta; label: string }
interface History { past: HistoryEntry[]; future: HistoryEntry[] }

// Store only this person's edits, never room-wide snapshots that could erase
// another person's work. Undo and redo use the same acknowledged edit path.
export function useCanvasHistory(commit: (edit: CanvasEdit) => Promise<CanvasDelta | null>) {
  const [history, setHistory] = useState<History>({ past: [], future: [] })
  const current = useRef(history)
  const inFlight = useRef(false)
  const [busy, setBusy] = useState(false)
  const publish = useCallback((next: History) => { current.current = next; setHistory(next) }, [])
  const record = useCallback((delta: CanvasDelta, label: string) => {
    if (!delta.added.length && !delta.removed.length) return
    publish({ past: [...current.current.past, { delta, label }].slice(-50), future: [] })
  }, [publish])
  const reset = useCallback(() => publish({ past: [], future: [] }), [publish])
  const travel = useCallback(async (direction: 'undo' | 'redo') => {
    if (inFlight.current) return
    const stack = direction === 'undo' ? current.current.past : current.current.future
    const entry = stack[stack.length - 1]
    if (!entry) return
    inFlight.current = true
    setBusy(true)
    try {
      const result = await commit({ deleteIds: entry.delta.added.map(element => element.id),
        add: entry.delta.removed, expected: entry.delta.added })
      if (!result) return
      const previous = current.current
      if (direction === 'undo') publish({ past: previous.past.filter(item => item !== entry), future: [...previous.future, { delta: result, label: entry.label }] })
      else publish({ past: [...previous.past, { delta: result, label: entry.label }].slice(-50), future: previous.future.filter(item => item !== entry) })
    } finally { inFlight.current = false; setBusy(false) }
  }, [commit, publish])
  return { record, reset, undo: useCallback(() => travel('undo'), [travel]), redo: useCallback(() => travel('redo'), [travel]),
    canUndo: history.past.length > 0, canRedo: history.future.length > 0, busy }
}
