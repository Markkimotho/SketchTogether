'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import type { PointerEvent as ReactPointerEvent } from 'react'
import { Maximize2, Minimize2, Touchpad, Undo2, X } from 'lucide-react'
import { panInkPage, type InkStroke } from '@/lib/touchpad'

interface TouchpadPadProps {
  color: string
  size: number
  disabledReason?: string
  onInsert: (strokes: InkStroke[]) => Promise<boolean>
}

export default function TouchpadPad({ color, size, disabledReason, onInsert }: TouchpadPadProps) {
  const [open, setOpen] = useState(false)
  const [expanded, setExpanded] = useState(false)
  const [enabled, setEnabled] = useState(false)
  const [strokes, setStrokes] = useState<InkStroke[]>([])
  const [draft, setDraft] = useState<InkStroke | null>(null)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [page, setPage] = useState({ x: 0, y: 0 })
  const [surfaceSize, setSurfaceSize] = useState({ width: 800, height: 320 })
  const panelRef = useRef<HTMLElement | null>(null)
  const padRef = useRef<SVGSVGElement | null>(null)
  const draftRef = useRef<InkStroke | null>(null)
  const enabledRef = useRef(false)
  const openRef = useRef(false)
  const savingRef = useRef(false)
  const pageRef = useRef(page)
  const pointerRef = useRef<number | null>(null)
  const idleRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const scrollUntilRef = useRef(0)
  openRef.current = open
  savingRef.current = saving
  pageRef.current = page

  const finish = useCallback(() => {
    if (idleRef.current) clearTimeout(idleRef.current)
    idleRef.current = null
    const stroke = draftRef.current
    draftRef.current = null
    setDraft(null)
    if (stroke) setStrokes(prev => [...prev, stroke])
  }, [])

  const pause = useCallback(() => {
    enabledRef.current = false
    setEnabled(false)
    pointerRef.current = null
    finish()
  }, [finish])

  const toggleWriting = useCallback(() => {
    if (savingRef.current) return
    finish()
    const next = !enabledRef.current
    enabledRef.current = next
    setEnabled(next)
    setOpen(true)
    // Opening the pad mounts the surface; focus after it has rendered.
    requestAnimationFrame(() => padRef.current?.focus())
  }, [finish])

  const close = useCallback(() => {
    pause()
    setOpen(false)
    setExpanded(false)
  }, [pause])

  useEffect(() => {
    const keydown = (event: KeyboardEvent) => {
      const target = event.target
      if (event.isComposing || event.ctrlKey || event.metaKey || event.altKey
        || (target instanceof Element && target.closest('input, textarea, select, [contenteditable]:not([contenteditable="false"]), [role="textbox"]'))) return
      if (event.code === 'KeyW' && !event.shiftKey) {
        event.preventDefault()
        if (!event.repeat) toggleWriting()
      } else if (event.code === 'Escape' && openRef.current) {
        event.preventDefault()
        close()
      }
    }
    const hide = () => { if (document.hidden) pause() }
    document.addEventListener('keydown', keydown)
    window.addEventListener('blur', pause)
    document.addEventListener('visibilitychange', hide)
    return () => {
      document.removeEventListener('keydown', keydown)
      window.removeEventListener('blur', pause)
      document.removeEventListener('visibilitychange', hide)
      if (idleRef.current) clearTimeout(idleRef.current)
    }
  }, [toggleWriting, close, pause])

  useEffect(() => {
    const pad = padRef.current
    if (!pad || !open) return
    // One page unit equals one CSS pixel in either layout, so expanding reveals
    // more paper instead of stretching existing handwriting.
    const resize = new ResizeObserver(([entry]) => {
      setSurfaceSize({ width: Math.max(1, entry.contentRect.width), height: Math.max(1, entry.contentRect.height) })
      finish()
    })
    resize.observe(pad)
    const wheel = (event: WheelEvent) => {
      event.preventDefault()
      event.stopPropagation()
      if (savingRef.current) return
      finish()
      pointerRef.current = null
      // Trackpad momentum is part of navigation, never part of a new ink stroke.
      scrollUntilRef.current = performance.now() + 180
      if (event.ctrlKey) return // A trackpad pinch must not become a pan.
      setPage(previous => panInkPage(previous, event, pad.clientHeight))
    }
    pad.addEventListener('wheel', wheel, { passive: false })
    return () => { resize.disconnect(); pad.removeEventListener('wheel', wheel) }
  }, [open, finish])

  function point(event: ReactPointerEvent<SVGSVGElement>) {
    const rect = event.currentTarget.getBoundingClientRect()
    return { x: pageRef.current.x + event.clientX - rect.left,
      y: pageRef.current.y + event.clientY - rect.top }
  }

  function draw(at: { x: number; y: number }, autoLift = false) {
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
    // Browsers do not expose touchpad finger-up. A short pause separates strokes
    // in hands-free mode; drag, pen and screen touch still use real pointer-up.
    if (idleRef.current) clearTimeout(idleRef.current)
    if (autoLift) idleRef.current = setTimeout(finish, 180)
  }

  function endPointer(event: ReactPointerEvent<SVGSVGElement>) {
    if (pointerRef.current !== event.pointerId) return
    pointerRef.current = null
    finish()
  }

  const hasInk = strokes.length > 0 || draft !== null
  const buttonClass = 'rounded-lg border border-white/15 px-3 py-2 text-xs hover:bg-white/10 disabled:opacity-40 disabled:cursor-not-allowed'
  const lines = Array.from({ length: Math.ceil(surfaceSize.height / 80) + 1 }, (_, index) => Math.floor(page.y / 80) * 80 + index * 80)

  return (
    <div className={expanded && open
      ? 'fixed inset-0 z-50 bg-black/50 p-3 sm:p-6 cursor-default'
      : 'absolute bottom-16 right-4 z-20 max-w-[calc(100vw-6rem)] cursor-default'}>
      {!expanded && <button type="button" aria-expanded={open} aria-controls="touchpad-panel" aria-keyshortcuts="W"
        onClick={() => { if (open) close(); else toggleWriting() }}
        className="ml-auto flex items-center gap-2 rounded-xl glass-strong px-4 py-3 text-sm text-white shadow-xl">
        <Touchpad size={18} /> Writing pad <kbd className="text-xs text-white/60">W</kbd>
      </button>}
      {open && (
        <section ref={panelRef} id="touchpad-panel" aria-label="Touchpad writing pad"
          className={`${expanded ? 'h-full w-full' : 'mt-2 w-[540px] max-w-full max-h-[calc(100dvh-9rem)]'} flex flex-col overflow-y-auto rounded-2xl glass-strong p-4 text-white shadow-2xl`}>
          <div className="flex shrink-0 items-start justify-between gap-3">
            <div>
              <h2 className="font-medium">Your touchpad. Your handwriting.</h2>
              <p id="touchpad-help" className="mt-1 text-xs leading-relaxed text-white/70">
                Press W once to write, again to pause. Glide with one finger; scroll with two fingers
                to move the page up, down or sideways. Escape closes the pad.
              </p>
            </div>
            <div className="flex gap-1">
              <button type="button" aria-label={expanded ? 'Collapse writing pad' : 'Expand writing pad'}
                aria-pressed={expanded} onClick={() => { finish(); setExpanded(value => !value) }}
                className="p-2 rounded hover:bg-white/10">
                {expanded ? <Minimize2 size={18} /> : <Maximize2 size={18} />}
              </button>
              <button type="button" aria-label="Close writing pad" onClick={close}
                className="p-2 rounded hover:bg-white/10"><X size={18} /></button>
            </div>
          </div>
          <svg ref={padRef} viewBox={`${page.x} ${page.y} ${surfaceSize.width} ${surfaceSize.height}`} tabIndex={0}
            role="application" aria-label="Handwriting surface" aria-describedby="touchpad-help"
            className={`mt-3 w-full ${expanded ? 'flex-1 min-h-[140px]' : 'h-[200px] sm:h-[220px] shrink-0'} rounded-xl bg-[#f4ebd8] outline-none focus:ring-2 focus:ring-amber-400 touch-none`}
            style={{ cursor: enabled ? 'crosshair' : 'default' }}
            onBlur={event => {
              if (!panelRef.current?.contains(event.relatedTarget as Node | null)) pause()
            }}
            onPointerDown={event => {
              if (saving || !event.isPrimary || event.button !== 0) return
              event.preventDefault()
              event.currentTarget.focus()
              event.currentTarget.setPointerCapture(event.pointerId)
              pointerRef.current = event.pointerId
              finish()
              draw(point(event))
            }}
            onPointerMove={event => {
              if (saving || !event.isPrimary || performance.now() < scrollUntilRef.current) return
              const dragging = pointerRef.current === event.pointerId
              if (pointerRef.current !== null && !dragging) return
              const rect = event.currentTarget.getBoundingClientRect()
              if (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) { finish(); return }
              if (dragging || (event.pointerType === 'mouse' && enabledRef.current)) draw(point(event), !dragging)
            }}
            onPointerUp={endPointer} onPointerCancel={endPointer} onLostPointerCapture={endPointer}
            onPointerLeave={() => { if (pointerRef.current === null) finish() }}>
            {lines.map(y => <line key={y} x1={page.x} x2={page.x + surfaceSize.width} y1={y} y2={y} stroke="#c8baa0" strokeWidth="1" />)}
            {[...strokes, ...(draft ? [draft] : [])].map((stroke, index) => stroke.points.length === 2
              ? <circle key={stroke.id ?? index} cx={stroke.points[0]} cy={stroke.points[1]} r={stroke.size / 2} fill={stroke.color} />
              : <polyline key={stroke.id ?? index} points={stroke.points.join(' ')} fill="none" stroke={stroke.color}
                  strokeWidth={stroke.size} strokeLinecap="round" strokeLinejoin="round" />)}
          </svg>
          <p className="mt-2 shrink-0 text-xs text-amber-200" role="status">
            {saving ? 'Saving handwriting…' : enabled ? 'Writing on — glide to write. Press W to pause.'
              : 'Writing paused — press W to resume. Click-and-drag, touch and pen also work.'}
          </p>
          <div className="mt-3 flex shrink-0 flex-wrap items-center gap-2">
            <button type="button" className={buttonClass} aria-pressed={enabled} disabled={saving}
              onClick={toggleWriting}>{enabled ? 'Pause writing (W)' : 'Resume writing (W)'}</button>
            <button type="button" className={buttonClass} disabled={!hasInk || saving}
              onClick={() => {
                if (draftRef.current) { draftRef.current = null; setDraft(null); if (idleRef.current) clearTimeout(idleRef.current) }
                else setStrokes(prev => prev.slice(0, -1))
              }}><Undo2 size={14} className="inline mr-1" />Undo</button>
            <button type="button" className={buttonClass} disabled={!hasInk || saving}
              onClick={() => { pause(); setStrokes([]) }}>Clear draft</button>
            <button type="button" className={buttonClass} onClick={() => { finish(); setPage({ x: 0, y: 0 }) }}>Reset view</button>
            <button type="button" className={`${buttonClass} ml-auto bg-amber-600/30`}
              disabled={!hasInk || saving || !!disabledReason} onClick={async () => {
                const ink = [...strokes, ...(draftRef.current ? [draftRef.current] : [])]
                pause()
                setSaving(true)
                setError('')
                try {
                  if (await onInsert(ink)) {
                    setStrokes([])
                    close()
                  } else setError('Could not confirm the save. Your draft is still here; reconnect and try again.')
                } catch {
                  setError('Could not save your handwriting. Your draft is still here.')
                } finally { setSaving(false) }
              }}>{saving ? 'Adding…' : 'Add to shared canvas'}</button>
          </div>
          {disabledReason && <p className="mt-2 shrink-0 text-xs text-amber-200" role="status">{disabledReason}</p>}
          {error && <p className="mt-2 shrink-0 text-xs text-amber-200" role="alert">{error}</p>}
          <p className="mt-3 shrink-0 text-[11px] leading-relaxed text-white/60">
            Handwriting stays as ink. In browser mode, a brief pause separates strokes because finger
            lifts are unavailable. Press W to pause before repositioning if strokes connect.
          </p>
        </section>
      )}
    </div>
  )
}
