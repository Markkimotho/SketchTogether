'use client'

import { useEffect, useRef, useState } from 'react'
import type { PointerEvent as ReactPointerEvent } from 'react'
import { Touchpad, Undo2, X } from 'lucide-react'
import type { InkStroke } from '@/lib/touchpad'

interface TouchpadPadProps {
  color: string
  size: number
  disabledReason?: string
  onInsert: (strokes: InkStroke[]) => Promise<boolean>
}

export default function TouchpadPad({ color, size, disabledReason, onInsert }: TouchpadPadProps) {
  const [open, setOpen] = useState(false)
  const [strokes, setStrokes] = useState<InkStroke[]>([])
  const [draft, setDraft] = useState<InkStroke | null>(null)
  const [inking, setInking] = useState(false)
  const [focused, setFocused] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const padRef = useRef<SVGSVGElement | null>(null)
  const draftRef = useRef<InkStroke | null>(null)
  const spaceRef = useRef(false)
  const pointerRef = useRef<number | null>(null)
  const lastPointRef = useRef<{ x: number; y: number } | null>(null)

  function finish() {
    const stroke = draftRef.current
    draftRef.current = null
    setDraft(null)
    if (stroke) setStrokes(prev => [...prev, stroke])
  }

  function stop() {
    spaceRef.current = false
    pointerRef.current = null
    lastPointRef.current = null
    setInking(false)
    finish()
  }

  useEffect(() => {
    // Releasing Space outside the pad or switching windows must lift the ink.
    const release = (event: KeyboardEvent) => {
      if (event.code === 'Space') stop()
    }
    const hide = () => { if (document.hidden) stop() }
    window.addEventListener('keyup', release)
    window.addEventListener('blur', stop)
    document.addEventListener('visibilitychange', hide)
    return () => {
      window.removeEventListener('keyup', release)
      window.removeEventListener('blur', stop)
      document.removeEventListener('visibilitychange', hide)
    }
    // stop only uses stable setters and refs.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  function point(event: ReactPointerEvent<SVGSVGElement>) {
    const rect = event.currentTarget.getBoundingClientRect()
    return { x: (event.clientX - rect.left) * 800 / rect.width,
      y: (event.clientY - rect.top) * 320 / rect.height }
  }

  function draw(at: { x: number; y: number }) {
    const current = draftRef.current
    if (current) {
      const p = current.points
      if (Math.hypot(at.x - p[p.length - 2], at.y - p[p.length - 1]) < 0.5) return
    }
    const next = current
      ? { ...current, points: [...current.points, at.x, at.y] }
      : { id: crypto.randomUUID(), points: [at.x, at.y], color, size: Math.max(1.5, Math.min(10, size * 0.38)) }
    draftRef.current = next
    setDraft(next)
  }

  const buttonClass = 'rounded-lg border border-white/15 px-3 py-2 text-xs hover:bg-white/10 disabled:opacity-40 disabled:cursor-not-allowed'

  return (
    <div className="absolute bottom-16 right-4 z-20 max-w-[calc(100vw-6rem)] cursor-default">
      <button type="button" aria-expanded={open} aria-controls="touchpad-panel"
        onClick={() => { stop(); setOpen(value => !value) }}
        className="ml-auto flex items-center gap-2 rounded-xl glass-strong px-4 py-3 text-sm text-white shadow-xl">
        <Touchpad size={18} /> Writing pad
      </button>
      {open && (
        <section id="touchpad-panel" aria-label="Touchpad writing pad"
          className="mt-2 w-[540px] max-w-full rounded-2xl glass-strong p-4 text-white shadow-2xl">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h2 className="font-medium">Your touchpad. Your handwriting.</h2>
              <p id="touchpad-help" className="mt-1 text-xs leading-relaxed text-white/70">
                Click the pad once. Hold Space and glide to write; release Space between strokes.
                You can also click and drag, or use touch or a pen.
              </p>
            </div>
            <button type="button" aria-label="Close writing pad" onClick={() => { stop(); setOpen(false) }}
              className="p-1 rounded hover:bg-white/10"><X size={18} /></button>
          </div>
          <svg ref={padRef} viewBox="0 0 800 320" preserveAspectRatio="none" tabIndex={0}
            role="application" aria-label="Handwriting surface" aria-describedby="touchpad-help"
            className="mt-3 w-full h-[200px] sm:h-[220px] rounded-xl bg-[#f4ebd8] outline-none focus:ring-2 focus:ring-amber-400 touch-none"
            style={{ cursor: 'crosshair' }}
            onFocus={() => setFocused(true)} onBlur={() => { setFocused(false); stop() }}
            onKeyDown={event => {
              if (saving) return
              if (event.code === 'Escape') { stop(); setOpen(false); return }
              if (event.code !== 'Space' || event.ctrlKey || event.metaKey || event.altKey) return
              event.preventDefault()
              if (spaceRef.current || event.repeat) return
              spaceRef.current = true
              setInking(true)
              if (lastPointRef.current) draw(lastPointRef.current)
            }}
            onPointerDown={event => {
              if (saving) return
              if (!event.isPrimary || event.button !== 0) return
              event.preventDefault()
              event.currentTarget.focus()
              event.currentTarget.setPointerCapture(event.pointerId)
              pointerRef.current = event.pointerId
              setInking(true)
              const at = point(event)
              lastPointRef.current = at
              draw(at)
            }}
            onPointerMove={event => {
              if (saving) return
              if (!event.isPrimary || (pointerRef.current !== null && pointerRef.current !== event.pointerId)) return
              const at = point(event)
              if (at.x < 0 || at.x > 800 || at.y < 0 || at.y > 320) { stop(); return }
              lastPointRef.current = at
              if (spaceRef.current || pointerRef.current === event.pointerId) draw(at)
            }}
            onPointerUp={event => {
              if (pointerRef.current !== event.pointerId) return
              pointerRef.current = null
              if (!spaceRef.current) { finish(); setInking(false) }
            }}
            onPointerCancel={stop} onLostPointerCapture={stop}
            onPointerLeave={() => { if (pointerRef.current === null) stop() }}>
            {[80, 160, 240].map(y => <line key={y} x1="0" x2="800" y1={y} y2={y} stroke="#c8baa0" strokeWidth="1" />)}
            {[...strokes, ...(draft ? [draft] : [])].map((stroke, index) => stroke.points.length === 2
              ? <circle key={index} cx={stroke.points[0]} cy={stroke.points[1]} r={stroke.size / 2} fill={stroke.color} />
              : <polyline key={index} points={stroke.points.join(' ')} fill="none" stroke={stroke.color}
                  strokeWidth={stroke.size} strokeLinecap="round" strokeLinejoin="round" />)}
          </svg>
          <p className="mt-2 text-xs text-amber-200" role="status">
            {inking ? 'Ink down — release Space to move to the next stroke.' : focused
              ? 'Ready — hold Space to write.' : 'Click the pad to start writing.'}
          </p>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <button type="button" className={buttonClass} disabled={!strokes.length || inking || saving}
              onClick={() => setStrokes(prev => prev.slice(0, -1))}><Undo2 size={14} className="inline mr-1" />Undo</button>
            <button type="button" className={buttonClass} disabled={!strokes.length || inking || saving}
              onClick={() => setStrokes([])}>Clear draft</button>
            <button type="button" className={`${buttonClass} ml-auto bg-amber-600/30`}
              disabled={!strokes.length || inking || saving || !!disabledReason} onClick={async () => {
                setSaving(true)
                setError('')
                try {
                  if (await onInsert(strokes)) {
                    setStrokes([])
                    stop()
                    setOpen(false)
                  } else setError('Could not confirm the save. Your draft is still here; reconnect and try again.')
                } catch {
                  setError('Could not save your handwriting. Your draft is still here.')
                } finally { setSaving(false) }
              }}>{saving ? 'Adding…' : 'Add to shared canvas'}</button>
          </div>
          {disabledReason && <p className="mt-2 text-xs text-amber-200" role="status">{disabledReason}</p>}
          {error && <p className="mt-2 text-xs text-amber-200" role="alert">{error}</p>}
          <p className="mt-3 text-[11px] leading-relaxed text-white/60">
            Handwriting stays as ink. Browser mode uses cursor movement; release Space before lifting
            or repositioning your finger. Some laptops suppress touchpad movement while typing.
          </p>
        </section>
      )}
    </div>
  )
}
