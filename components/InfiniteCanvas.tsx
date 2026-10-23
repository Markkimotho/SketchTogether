'use client'

import React, { useRef, useState, useEffect, useCallback } from 'react'
import { Stage, Layer, Line, Rect, Text, Circle as KonvaCircle, Shape } from 'react-konva'
import { motion, AnimatePresence } from 'framer-motion'
import { Crosshair } from 'lucide-react'
import type Konva from 'konva'
import type {
  CanvasElement, StrokeData, ShapeData, TextData,
  LayerData, CursorData, CanvasType, GridType, DrawTool,
} from '@/types/canvas'
import { CANVAS_TYPE_CONFIG } from '@/types/canvas'
import TouchpadPad from './TouchpadPad'
import { editableElements } from '@/lib/canvas-edits'
import { getElementBounds, hitTestElement, boxBetween, intersects, type Point, type Bounds, type ElementMove } from '@/lib/selection'
import { placeInk, type InkStroke } from '@/lib/touchpad'

interface InfiniteCanvasProps {
  isConnected: boolean
  selectedTool: string
  brushOpacity: number
  brushSize: number
  brushColor: string
  fontSize: number
  shapeFilled: boolean
  selectedLayer: string
  canvasElements: CanvasElement[]
  setCanvasElements: React.Dispatch<React.SetStateAction<CanvasElement[]>>
  cursors: CursorData[]
  onStrokeStart: (stroke: StrokeData) => void
  onStrokeUpdate: (strokeId: string, points: number[], pressures?: number[]) => void
  onStrokeEnd: (stroke: StrokeData) => void
  onInkAdd: (strokes: StrokeData[]) => Promise<boolean>
  onShapeAdd: (shape: ShapeData) => void
  onTextAdd: (text: TextData) => void
  onElementsMove: (moves: ElementMove[]) => void
  onCursorMove: (x: number, y: number) => void
  layers: LayerData[]
  canvasType: CanvasType
  gridType: GridType
  selectedElementIds: string[]
  onElementSelect: (id: string, addToSelection: boolean) => void
  onElementsDelete: (ids: string[]) => void
}

// ── Cursor colors ────────────────────────────────────────────────────────────
const CURSOR_COLORS = ['#4f7df3', '#a855f7', '#ec4899', '#f59e0b', '#10b981', '#f97316']
function getCursorColor(name: string) {
  let h = 0
  for (let i = 0; i < name.length; i++) h = name.charCodeAt(i) + ((h << 5) - h)
  return CURSOR_COLORS[Math.abs(h) % CURSOR_COLORS.length]
}

// ── Grid overlay ─────────────────────────────────────────────────────────────
function GridOverlay({ scale, position, stageSize, gridType, dark }: {
  scale: number; position: { x: number; y: number }
  stageSize: { width: number; height: number }; gridType: GridType; dark: boolean
}) {
  if (gridType === 'none') return null
  let spacing = 50
  if (scale < 0.4) spacing = 200
  else if (scale < 0.8) spacing = 100
  else if (scale > 4) spacing = 20
  const buf = spacing * 2
  const left   = -position.x / scale - buf
  const right  = -position.x / scale + stageSize.width  / scale + buf
  const top    = -position.y / scale - buf
  const bottom = -position.y / scale + stageSize.height / scale + buf
  const lineColor = dark ? 'rgba(255,255,255,0.12)' : 'rgba(80,55,20,0.14)'
  const dotColor  = dark ? 'rgba(255,255,255,0.22)' : 'rgba(80,55,20,0.32)'
  const startX = Math.floor(left  / spacing) * spacing
  const startY = Math.floor(top   / spacing) * spacing
  const els: React.ReactElement[] = []
  if (gridType === 'lines' || gridType === 'grid') {
    for (let y = startY; y <= bottom; y += spacing)
      els.push(<Line key={`h${y}`} points={[left, y, right, y]} stroke={lineColor} strokeWidth={1 / scale} listening={false} />)
  }
  if (gridType === 'grid') {
    for (let x = startX; x <= right; x += spacing)
      els.push(<Line key={`v${x}`} points={[x, top, x, bottom]} stroke={lineColor} strokeWidth={1 / scale} listening={false} />)
  }
  if (gridType === 'dotgrid') {
    for (let y = startY; y <= bottom; y += spacing)
      for (let x = startX; x <= right; x += spacing)
        els.push(<KonvaCircle key={`d${x},${y}`} x={x} y={y} radius={1.5 / scale} fill={dotColor} listening={false} />)
  }
  return <Layer listening={false}>{els}</Layer>
}

// ── Brush stroke renderer (painterly filled-path ribbon) ────────────────────
function RibbonStroke({ stroke, opacity }: { stroke: StrokeData; opacity?: number }) {
  const pts = stroke.points
  const pressures = stroke.pressures
  const nibAngle = stroke.tiltAngle ?? Math.PI / 4
  const totalSegs = Math.max(1, (pts.length - 2) / 2)

  return (
    <Shape
      x={stroke.offsetX ?? 0}
      y={stroke.offsetY ?? 0}
      listening={false}
      opacity={opacity}
      sceneFunc={(ctx) => {
        if (pts.length < 4) return
        const savedAlpha = ctx.globalAlpha
        const savedComposite = ctx.globalCompositeOperation
        ctx.globalAlpha = stroke.opacity ?? 1
        if (stroke.tool === 'eraser') ctx.globalCompositeOperation = 'destination-out'
        ctx.fillStyle = stroke.tool === 'eraser' ? 'rgba(0,0,0,1)' : stroke.color

        for (let i = 0; i < pts.length - 2; i += 2) {
          const x1 = pts[i],     y1 = pts[i + 1]
          const x2 = pts[i + 2], y2 = pts[i + 3]
          const dx = x2 - x1, dy = y2 - y1
          const len = Math.hypot(dx, dy)
          if (len < 0.3) continue

          let w1: number, w2: number
          const segIdx = i / 2

          if (pressures && pressures.length > segIdx + 1) {
            // Stylus pressure → dynamic width
            const p1 = Math.max(0.05, pressures[segIdx]     ?? 0.5)
            const p2 = Math.max(0.05, pressures[segIdx + 1] ?? 0.5)
            w1 = stroke.size * p1 * 2.2
            w2 = stroke.size * p2 * 2.2
          } else if (stroke.tool === 'calligraphy') {
            // Nib angle vs stroke direction → thick/thin contrast
            const strokeAngle = Math.atan2(dy, dx)
            const diff = strokeAngle - nibAngle
            const factor = 0.15 + 0.85 * Math.abs(Math.sin(diff * 2))
            w1 = w2 = Math.max(0.5, stroke.size * factor)
          } else {
            // Brush (mouse/touch): taper at stroke ends for a natural look
            const t = segIdx / totalSegs
            const taper = 0.55 + 0.45 * Math.sin(Math.PI * t)
            w1 = w2 = stroke.size * taper
          }

          const nx = -dy / len, ny = dx / len
          ctx.beginPath()
          ctx.moveTo(x1 + nx * w1 / 2, y1 + ny * w1 / 2)
          ctx.lineTo(x2 + nx * w2 / 2, y2 + ny * w2 / 2)
          ctx.lineTo(x2 - nx * w2 / 2, y2 - ny * w2 / 2)
          ctx.lineTo(x1 - nx * w1 / 2, y1 - ny * w1 / 2)
          ctx.closePath()
          ctx.fill()
        }
        ctx.globalAlpha = savedAlpha
        ctx.globalCompositeOperation = savedComposite
      }}
    />
  )
}

// ── Pencil stroke renderer (rough multi-pass, sketch texture) ────────────────
function PencilStroke({ stroke, opacity }: { stroke: StrokeData; opacity?: number }) {
  const pts = stroke.points
  return (
    <Shape
      x={stroke.offsetX ?? 0}
      y={stroke.offsetY ?? 0}
      listening={false}
      opacity={opacity}
      sceneFunc={(ctx) => {
        if (pts.length < 4) return
        ctx.lineCap = 'round'
        ctx.lineJoin = 'round'
        ctx.strokeStyle = stroke.color
        const baseAlpha = stroke.opacity ?? 1

        const drawPass = (jx: number, jy: number, alpha: number, w: number) => {
          ctx.globalAlpha = alpha * baseAlpha
          ctx.lineWidth = w
          ctx.beginPath()
          ctx.moveTo(pts[0] + jx, pts[1] + jy)
          for (let i = 2; i < pts.length - 2; i += 2) {
            const mx = (pts[i] + pts[i + 2]) / 2 + jx
            const my = (pts[i + 1] + pts[i + 3]) / 2 + jy
            ctx.quadraticCurveTo(pts[i] + jx, pts[i + 1] + jy, mx, my)
          }
          ctx.lineTo(pts[pts.length - 2] + jx, pts[pts.length - 1] + jy)
          ctx.stroke()
        }

        // Three overlapping passes: main + two offset ghost lines = pencil grain
        drawPass(0,    0,    0.60, stroke.size)
        drawPass(0.6,  0.3,  0.22, stroke.size * 0.65)
        drawPass(-0.5, 0.55, 0.18, stroke.size * 0.45)
        ctx.globalAlpha = 1
      }}
    />
  )
}

// ── Custom SVG cursors ───────────────────────────────────────────────────────
const _cur = (svg: string, hx: number, hy: number) =>
  `url("data:image/svg+xml,${encodeURIComponent(svg)}") ${hx} ${hy}, auto`

const TOOL_CURSORS: Record<string, string> = {
  pencil: _cur(
    `<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20"><path d="M15 2L18 5 5 18 2 18 3 15Z" fill="#f5f0e0" stroke="#222" stroke-width="1.2" stroke-linejoin="round"/><path d="M13 4L18 5 15 2Z" fill="#d4a4a4" stroke="#555" stroke-width="0.7"/><line x1="13" y1="5" x2="4" y2="16" stroke="#ccc" stroke-width="0.7"/><circle cx="2.5" cy="18" r="1" fill="#333"/></svg>`,
    2, 18,
  ),
  pen: _cur(
    `<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20"><path d="M16 1L19 4 5 18 1 19 3 15Z" fill="#1a1a1a" stroke="white" stroke-width="1" stroke-linejoin="round"/><line x1="14" y1="3" x2="17" y2="6" stroke="rgba(255,255,255,0.4)" stroke-width="0.8"/><circle cx="2" cy="18" r="1.4" fill="white"/></svg>`,
    2, 18,
  ),
  brush: _cur(
    `<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20"><line x1="14" y1="1" x2="9" y2="10" stroke="#8b6240" stroke-width="2.5" stroke-linecap="round"/><rect x="7" y="9" width="4" height="3" rx="0.5" fill="#bbb" stroke="#555" stroke-width="0.7"/><path d="M5 12L10 12 7 19Z" fill="#5a3520" stroke="#222" stroke-width="0.8"/><circle cx="7" cy="19" r="1.2" fill="#e04040"/></svg>`,
    7, 19,
  ),
  calligraphy: _cur(
    `<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20"><line x1="18" y1="2" x2="3" y2="17" stroke="#c8a84b" stroke-width="1.5" stroke-linecap="round"/><path d="M7 13L2 18 4 19 10 15Z" fill="#2a2a2a" stroke="#111" stroke-width="0.8" stroke-linejoin="round"/><circle cx="2.5" cy="18" r="1" fill="#111"/></svg>`,
    2, 18,
  ),
  eraser: _cur(
    `<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20"><rect x="1" y="5" width="18" height="12" rx="2" fill="#ffbdc5" stroke="#333" stroke-width="1.2"/><rect x="1" y="5" width="8" height="12" rx="2" fill="#ff8fa0"/><line x1="1" y1="16" x2="19" y2="16" stroke="#555" stroke-width="0.8"/></svg>`,
    10, 11,
  ),
  line:      'crosshair',
  rectangle: 'crosshair',
  circle:    'crosshair',
  text:      'text',
  select:    'default',
  hand:      'grab',
}

// ── Main component ────────────────────────────────────────────────────────────
const InfiniteCanvas: React.FC<InfiniteCanvasProps> = ({
  isConnected,
  selectedTool, brushOpacity, brushSize, brushColor, fontSize, shapeFilled, selectedLayer,
  canvasElements, setCanvasElements,
  cursors, onStrokeStart, onStrokeUpdate, onStrokeEnd, onInkAdd,
  onShapeAdd, onTextAdd, onElementsMove, onCursorMove,
  layers, canvasType, gridType,
  selectedElementIds, onElementSelect, onElementsDelete,
}) => {
  const stageRef    = useRef<Konva.Stage | null>(null)
  const wrapperRef  = useRef<HTMLDivElement | null>(null)
  const [scale, setScale]         = useState(1)
  const [position, setPosition]   = useState({ x: 0, y: 0 })
  const [stageSize, setStageSize] = useState({ width: 800, height: 600 })

  // Mutable refs that shadow props — safe to read inside pointer event callbacks
  const toolRef         = useRef(selectedTool)
  const colorRef        = useRef(brushColor)
  const opacityRef      = useRef(brushOpacity)
  opacityRef.current = brushOpacity
  const sizeRef         = useRef(brushSize)
  const shapeFilledRef  = useRef(shapeFilled)
  const layerRef        = useRef(selectedLayer)
  const fontSizeRef     = useRef(fontSize)
  const scaleRef        = useRef(scale)
  const positionRef     = useRef(position)
  useEffect(() => { toolRef.current       = selectedTool },  [selectedTool])
  useEffect(() => { colorRef.current      = brushColor },    [brushColor])
  useEffect(() => { sizeRef.current       = brushSize },     [brushSize])
  shapeFilledRef.current = shapeFilled
  useEffect(() => { layerRef.current      = selectedLayer }, [selectedLayer])
  useEffect(() => { fontSizeRef.current   = fontSize },      [fontSize])
  useEffect(() => { scaleRef.current      = scale },         [scale])
  useEffect(() => { positionRef.current   = position },      [position])

  // Drawing state refs
  const currentStrokeRef      = useRef<StrokeData | null>(null)
  const currentPressuresRef   = useRef<number[]>([])
  const currentShapeRef = useRef<ShapeData | null>(null)
  const currentShapeStartRef  = useRef<{ x: number; y: number } | null>(null)
  const currentShapeIdRef     = useRef<string | null>(null)
  const lineStartRef          = useRef<{ x: number; y: number } | null>(null)
  const isDrawingRef          = useRef(false)

  // Pointer tracking for multi-touch pinch-zoom and palm rejection
  const activePointersRef  = useRef<Map<number, { x: number; y: number; type: string }>>(new Map())
  const lastPinchDistRef   = useRef<number | null>(null)
  const lastPinchMidRef    = useRef<{ x: number; y: number } | null>(null)
  const penActiveTimerRef  = useRef<ReturnType<typeof setTimeout> | null>(null)
  const isPenActiveRef     = useRef(false)  // palm rejection flag
  const isPanningRef       = useRef(false)  // panning with hand tool / 2 fingers
  const panStartPosRef     = useRef<{ x: number; y: number } | null>(null)
  const panStartStageRef   = useRef<{ x: number; y: number } | null>(null)
  const lastCursorEmitRef  = useRef(0)

  // Shift-key tracking for multi-select
  const shiftKeyRef = useRef(false)

  // Refs so pointer-event handlers always see current props/state without re-registering
  const canvasElementsRef   = useRef(canvasElements)
  const layersRef           = useRef(layers)
  const onElementSelectRef  = useRef(onElementSelect)
  useEffect(() => { canvasElementsRef.current  = canvasElements },  [canvasElements])
  useEffect(() => { layersRef.current          = layers },          [layers])
  useEffect(() => { onElementSelectRef.current = onElementSelect }, [onElementSelect])

  const selectionRef = useRef(selectedElementIds)
  selectionRef.current = selectedElementIds
  const selectionDragRef = useRef<{ start: Point; elements: CanvasElement[]; dx: number; dy: number } | null>(null)
  const marqueeRef = useRef<{ start: Point; end: Point; additive: boolean } | null>(null)
  const [marquee, setMarquee] = useState<Bounds | null>(null)

  // Pending text input
  const [pendingText, setPendingText] = useState<{ viewX: number; viewY: number; worldX: number; worldY: number } | null>(null)
  const [textValue, setTextValue]     = useState('')
  const textInputRef = useRef<HTMLTextAreaElement | null>(null)

  const config = CANVAS_TYPE_CONFIG[canvasType]
  const isDark = config.dark

  // ── Stage size ──────────────────────────────────────────────────────────────
  useEffect(() => {
    const update = () => setStageSize({ width: window.innerWidth, height: window.innerHeight })
    update()
    window.addEventListener('resize', update)
    return () => window.removeEventListener('resize', update)
  }, [])

  // Focus text input when shown
  useEffect(() => {
    if (pendingText) setTimeout(() => textInputRef.current?.focus(), 30)
  }, [pendingText])

  // Keyboard: Delete/Backspace → delete selected elements; Escape → deselect
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      shiftKeyRef.current = e.shiftKey
      if (pendingText) return
      const active = document.activeElement
      if (active instanceof Element && active.closest('input, textarea, select, [contenteditable]:not([contenteditable="false"]), #touchpad-panel')) return
      if ((e.key === 'Delete' || e.key === 'Backspace') && selectedElementIds.length > 0) {
        e.preventDefault()
        onElementsDelete(selectedElementIds)
      }
      if (e.key === 'Escape') onElementSelect('', false)
    }
    const onKeyUp = (e: KeyboardEvent) => { shiftKeyRef.current = e.shiftKey }
    document.addEventListener('keydown', onKeyDown)
    document.addEventListener('keyup',   onKeyUp)
    return () => {
      document.removeEventListener('keydown', onKeyDown)
      document.removeEventListener('keyup',   onKeyUp)
    }
  }, [pendingText, selectedElementIds, onElementsDelete, onElementSelect])

  // ── Coordinate helpers ──────────────────────────────────────────────────────
  const toWorld = useCallback((vx: number, vy: number) => ({
    x: (vx - positionRef.current.x) / scaleRef.current,
    y: (vy - positionRef.current.y) / scaleRef.current,
  }), [])

  const containerRect = useCallback(() =>
    stageRef.current?.container().getBoundingClientRect() ?? null
  , [])

  const eventToViewport = useCallback((cx: number, cy: number) => {
    const r = containerRect()
    if (!r) return { x: cx, y: cy }
    return { x: cx - r.left, y: cy - r.top }
  }, [containerRect])

  // ── Tool helpers ─────────────────────────────────────────────────────────────
  const isStrokeTool = (t: string) =>
    ['brush', 'pencil', 'pen', 'calligraphy', 'eraser', 'line'].includes(t)

  const strokeOpacity = (t: string) => t === 'pencil' ? 0.42 : 1
  const strokeSizeMultiplier = (t: string) => t === 'pen' ? 0.38 : t === 'pencil' ? 0.60 : 1
  const usesPressure = (t: string) => ['brush', 'pencil', 'eraser'].includes(t)
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const usesRibbon   = (t: string) => ['brush', 'calligraphy'].includes(t) || usesPressure(t)

  // ── Stroke start ─────────────────────────────────────────────────────────────
  const startStroke = useCallback((
    vx: number, vy: number, pressure: number,
    tiltX = 0, tiltY = 0, pointerType = 'mouse'
  ) => {
    const tool  = toolRef.current
    const layer = layersRef.current.find(layer => layer.id === layerRef.current)
    if (!layer || layer.locked || !layer.visible) return
    const world = toWorld(vx, vy)

    if (tool === 'text') {
      setPendingText({ viewX: vx, viewY: vy, worldX: world.x, worldY: world.y })
      setTextValue('')
      return
    }

    if (isStrokeTool(tool)) {
      // Nib angle from stylus tilt (falls back to 45° for non-stylus)
      const nibAngle = pointerType === 'pen'
        ? Math.atan2(tiltY, tiltX)
        : Math.PI / 4

      const initPts = tool === 'line'
        ? [world.x, world.y, world.x, world.y]
        : [world.x, world.y]

      const stroke: StrokeData = {
        id: crypto.randomUUID(), type: 'stroke',
        tool: tool as DrawTool,
        points: initPts,
        pressures: (pointerType === 'pen' && usesPressure(tool)) ? [pressure] : undefined,
        tiltAngle: tool === 'calligraphy' ? nibAngle : undefined,
        color: colorRef.current,
        size: sizeRef.current * strokeSizeMultiplier(tool),
        layerId: layerRef.current,
        opacity: tool === 'eraser' ? 1 : strokeOpacity(tool) * opacityRef.current,
      }
      currentStrokeRef.current  = stroke
      currentPressuresRef.current = [pressure]
      if (tool === 'line') lineStartRef.current = world
      setCanvasElements(prev => [...prev, stroke])
      onStrokeStart(stroke)
      isDrawingRef.current = true
    } else if (tool === 'rectangle' || tool === 'circle') {
      const id = crypto.randomUUID()
      currentShapeIdRef.current   = id
      currentShapeStartRef.current = world
      const shape: ShapeData = {
        id, type: 'shape', tool: tool as 'rectangle' | 'circle',
        x: world.x, y: world.y, width: 0, height: 0,
        color: colorRef.current,
        filled: shapeFilledRef.current,
        strokeWidth: sizeRef.current,
        layerId: layerRef.current,
      }
      currentShapeRef.current = shape
      setCanvasElements(prev => [...prev, shape])
      isDrawingRef.current = true
    }
  }, [toWorld, setCanvasElements, onStrokeStart])

  // ── Stroke update ─────────────────────────────────────────────────────────────
  const updateStroke = useCallback((vx: number, vy: number, pressure: number) => {
    const world = toWorld(vx, vy)

    // Throttled cursor broadcast
    const now = Date.now()
    if (now - lastCursorEmitRef.current > 33) {
      onCursorMove(world.x, world.y)
      lastCursorEmitRef.current = now
    }

    if (!isDrawingRef.current) return

    if (currentStrokeRef.current) {
      const stroke  = currentStrokeRef.current
      currentPressuresRef.current.push(pressure)
      let newPoints: number[]

      if (stroke.tool === 'line' && lineStartRef.current) {
        newPoints = [lineStartRef.current.x, lineStartRef.current.y, world.x, world.y]
      } else {
        newPoints = [...stroke.points, world.x, world.y]
      }

      const newPressures = stroke.pressures ? [...currentPressuresRef.current] : undefined
      const updated: StrokeData = { ...stroke, points: newPoints, pressures: newPressures }
      currentStrokeRef.current = updated

      setCanvasElements(prev =>
        prev.map(el => el.id === stroke.id ? updated : el)
      )
      onStrokeUpdate(stroke.id, newPoints, newPressures)
    } else if (currentShapeIdRef.current && currentShapeStartRef.current) {
      const start = currentShapeStartRef.current
      const shape = currentShapeRef.current
      if (!shape) return
      const updated = { ...shape, width: world.x - start.x, height: world.y - start.y }
      currentShapeRef.current = updated
      setCanvasElements(prev => prev.map(element => element.id === updated.id ? updated : element))
    }
  }, [toWorld, onCursorMove, setCanvasElements, onStrokeUpdate])

  // ── Stroke end ───────────────────────────────────────────────────────────────
  const endStroke = useCallback(() => {
    if (!isDrawingRef.current) return
    isDrawingRef.current = false
    lineStartRef.current = null

    if (currentStrokeRef.current) {
      const stroke = currentStrokeRef.current
      currentStrokeRef.current    = null
      currentPressuresRef.current = []
      onStrokeEnd(stroke)
    } else if (currentShapeIdRef.current) {
      const shape = currentShapeRef.current
      currentShapeIdRef.current = null
      currentShapeStartRef.current = null
      currentShapeRef.current = null
      if (shape) onShapeAdd(shape)
    }
  }, [onStrokeEnd, onShapeAdd])

  // ── Pointer event handler (unified mouse + touch + pen) ──────────────────────
  useEffect(() => {
    const el = stageRef.current?.container()
    if (!el) return

    // ── Pan helpers ─────────────────────────────────────────────────────────
    const startPan = (cx: number, cy: number) => {
      isPanningRef.current    = true
      panStartPosRef.current  = { x: cx, y: cy }
      panStartStageRef.current = { ...positionRef.current }
    }
    const movePan = (cx: number, cy: number) => {
      if (!panStartPosRef.current || !panStartStageRef.current) return
      setPosition({
        x: panStartStageRef.current.x + (cx - panStartPosRef.current.x),
        y: panStartStageRef.current.y + (cy - panStartPosRef.current.y),
      })
    }
    const endPan = () => {
      isPanningRef.current     = false
      panStartPosRef.current   = null
      panStartStageRef.current = null
    }

    // ── Pinch helpers ───────────────────────────────────────────────────────
    const getPinchInfo = () => {
      const pts = Array.from(activePointersRef.current.values()).filter(pointer => pointer.type === 'touch')
      if (pts.length < 2) return null
      const [a, b] = pts
      return {
        dist: Math.hypot(a.x - b.x, a.y - b.y),
        mid: { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 },
      }
    }

    // ── pointerdown ─────────────────────────────────────────────────────────
    const onDown = (e: PointerEvent) => {
      // Palm rejection: if pen is active, ignore all touch input
      if (e.pointerType === 'touch' && isPenActiveRef.current) {
        e.preventDefault()
        return
      }

      const tool = toolRef.current

      e.preventDefault()

      // Mark pen as active (persists 500ms after last pen event to reject palms)
      if (e.pointerType === 'pen') {
        isPenActiveRef.current = true
        if (penActiveTimerRef.current) clearTimeout(penActiveTimerRef.current)
        penActiveTimerRef.current = setTimeout(() => {
          isPenActiveRef.current = false
        }, 500)
      }

      const vp = eventToViewport(e.clientX, e.clientY)
      activePointersRef.current.set(e.pointerId, { x: e.clientX, y: e.clientY, type: e.pointerType })

      const touchCount = Array.from(activePointersRef.current.values())
        .filter(p => p.type === 'touch').length

      // Two-finger touch → switch to pinch/pan regardless of tool
      if (touchCount >= 2) {
        const drag = selectionDragRef.current
        if (drag) {
          const originals = new Map(drag.elements.map(element => [element.id, element]))
          setCanvasElements(previous => previous.map(element => originals.get(element.id) ?? element))
        }
        selectionDragRef.current = null
        marqueeRef.current = null
        setMarquee(null)
        if (isDrawingRef.current) endStroke()
        isPanningRef.current = false
        const pinch = getPinchInfo()
        if (pinch) {
          lastPinchDistRef.current = pinch.dist
          lastPinchMidRef.current  = pinch.mid
        }
        return
      }

      if (tool === 'select') {
        const world = toWorld(vp.x, vp.y)
        const editable = editableElements(canvasElementsRef.current, layersRef.current)
        const hit = hitTestElement(editable, world, 6 / scaleRef.current)
        if (hit) {
          const selected = selectionRef.current.includes(hit.id)
          const ids = e.shiftKey ? (selected ? selectionRef.current.filter(id => id !== hit.id) : [...selectionRef.current, hit.id])
            : selected ? selectionRef.current : [hit.id]
          if (e.shiftKey || !selected) onElementSelectRef.current(hit.id, e.shiftKey)
          selectionDragRef.current = { start: world, elements: editable.filter(element => ids.includes(element.id)), dx: 0, dy: 0 }
        } else {
          if (!e.shiftKey) onElementSelectRef.current('', false)
          marqueeRef.current = { start: world, end: world, additive: e.shiftKey }
          setMarquee(boxBetween(world, world))
        }
        el.setPointerCapture(e.pointerId)
      } else if (tool === 'hand') {
        el.setPointerCapture(e.pointerId)
        startPan(e.clientX, e.clientY)
      } else if (tool !== 'select') {
        el.setPointerCapture(e.pointerId)
        startStroke(vp.x, vp.y, e.pressure || 0.5, e.tiltX, e.tiltY, e.pointerType)
      }
    }

    // ── pointermove ─────────────────────────────────────────────────────────
    const onMove = (e: PointerEvent) => {
      if (e.pointerType === 'touch' && isPenActiveRef.current) return
      e.preventDefault()

      // Refresh pen-active timer
      if (e.pointerType === 'pen') {
        isPenActiveRef.current = true
        if (penActiveTimerRef.current) clearTimeout(penActiveTimerRef.current)
        penActiveTimerRef.current = setTimeout(() => { isPenActiveRef.current = false }, 500)
      }

      activePointersRef.current.set(e.pointerId, { x: e.clientX, y: e.clientY, type: e.pointerType })

      const touchCount = Array.from(activePointersRef.current.values())
        .filter(p => p.type === 'touch').length

      // Pinch-zoom gesture (2 fingers)
      if (touchCount >= 2 && lastPinchDistRef.current !== null && lastPinchMidRef.current !== null) {
        const pinch = getPinchInfo()
        if (!pinch) return
        const scaleFactor = pinch.dist / lastPinchDistRef.current
        const newScale = Math.max(0.05, Math.min(20, scaleRef.current * scaleFactor))
        const r = el.getBoundingClientRect()
        const midVx = pinch.mid.x - r.left
        const midVy = pinch.mid.y - r.top
        const worldAtMid = {
          x: (midVx - positionRef.current.x) / scaleRef.current,
          y: (midVy - positionRef.current.y) / scaleRef.current,
        }
        const newPos = {
          x: midVx - worldAtMid.x * newScale,
          y: midVy - worldAtMid.y * newScale,
        }
        setScale(newScale)
        setPosition(newPos)
        lastPinchDistRef.current = pinch.dist
        lastPinchMidRef.current  = pinch.mid
        return
      }

      if (toolRef.current === 'select' && (selectionDragRef.current || marqueeRef.current)) {
        const vp = eventToViewport(e.clientX, e.clientY)
        const world = toWorld(vp.x, vp.y)
        const drag = selectionDragRef.current
        if (drag) {
          const dx = world.x - drag.start.x, dy = world.y - drag.start.y
          if (Math.hypot(dx, dy) * scaleRef.current < 3 && !drag.dx && !drag.dy) return
          drag.dx = dx; drag.dy = dy
          const originals = new Map(drag.elements.map(element => [element.id, element]))
          setCanvasElements(previous => previous.map(element => {
            const original = originals.get(element.id)
            return original ? { ...element, offsetX: (original.offsetX ?? 0) + dx, offsetY: (original.offsetY ?? 0) + dy } : element
          }))
        } else if (marqueeRef.current) {
          marqueeRef.current.end = world
          setMarquee(boxBetween(marqueeRef.current.start, world))
        }
        return
      }

      if (isPanningRef.current) {
        movePan(e.clientX, e.clientY)
        return
      }

      const vp = eventToViewport(e.clientX, e.clientY)
      updateStroke(vp.x, vp.y, e.pressure || 0.5)
    }

    // ── pointerup / pointercancel ───────────────────────────────────────────
    const onUp = (e: PointerEvent) => {
      if (e.pointerType === 'touch' && isPenActiveRef.current) {
        activePointersRef.current.delete(e.pointerId)
        return
      }

      const tool = toolRef.current

      if (tool === 'select') {
        activePointersRef.current.delete(e.pointerId)
        const drag = selectionDragRef.current
        selectionDragRef.current = null
        if (drag && (drag.dx || drag.dy)) {
          if (e.type === 'pointercancel') {
            const originals = new Map(drag.elements.map(element => [element.id, element]))
            setCanvasElements(previous => previous.map(element => originals.get(element.id) ?? element))
          } else onElementsMove(drag.elements.map(before => ({ before,
            offsetX: (before.offsetX ?? 0) + drag.dx, offsetY: (before.offsetY ?? 0) + drag.dy })))
        }
        const area = marqueeRef.current
        marqueeRef.current = null
        setMarquee(null)
        if (area && e.type !== 'pointercancel') {
          if (!area.additive) onElementSelectRef.current('', false)
          const box = boxBetween(area.start, area.end)
          if (box.w * scaleRef.current > 3 || box.h * scaleRef.current > 3) {
            for (const element of editableElements(canvasElementsRef.current, layersRef.current)) {
              const bounds = getElementBounds(element)
              if (bounds && intersects(box, bounds) && (!area.additive || !selectionRef.current.includes(element.id))) onElementSelectRef.current(element.id, true)
            }
          }
        }
        return
      }

      e.preventDefault()
      activePointersRef.current.delete(e.pointerId)

      const touchCount = Array.from(activePointersRef.current.values())
        .filter(p => p.type === 'touch').length

      if (touchCount < 2) {
        lastPinchDistRef.current = null
        lastPinchMidRef.current  = null
      }

      if (isPanningRef.current && touchCount === 0) {
        endPan()
        return
      }

      if (activePointersRef.current.size === 0 || e.pointerType === 'pen') {
        endStroke()
      }
    }

    el.addEventListener('pointerdown',   onDown,  { passive: false })
    el.addEventListener('pointermove',   onMove,  { passive: false })
    el.addEventListener('pointerup',     onUp,    { passive: false })
    el.addEventListener('pointercancel', onUp,    { passive: false })

    return () => {
      el.removeEventListener('pointerdown',   onDown)
      el.removeEventListener('pointermove',   onMove)
      el.removeEventListener('pointerup',     onUp)
      el.removeEventListener('pointercancel', onUp)
    }
  }, [startStroke, updateStroke, endStroke, eventToViewport, toWorld, setCanvasElements, onElementsMove])

  // ── Wheel zoom ───────────────────────────────────────────────────────────────
  const handleWheel = useCallback((e: Konva.KonvaEventObject<WheelEvent>) => {
    e.evt.preventDefault()
    const stage = stageRef.current
    if (!stage) return
    const oldScale = scale
    const pointer  = stage.getPointerPosition()
    if (!pointer) return
    const scaleBy  = 1.08
    const newScale = Math.max(0.05, Math.min(20,
      e.evt.deltaY < 0 ? oldScale * scaleBy : oldScale / scaleBy
    ))
    const mp = { x: (pointer.x - position.x) / oldScale, y: (pointer.y - position.y) / oldScale }
    setScale(newScale)
    setPosition({ x: pointer.x - mp.x * newScale, y: pointer.y - mp.y * newScale })
  }, [scale, position])

  // ── Reset / find content ─────────────────────────────────────────────────────
  const resetView = useCallback(() => {
    const pts: number[] = []
    canvasElements.forEach(el => {
      if (el.type === 'stroke') {
        const s = el as StrokeData
        const ox = s.offsetX ?? 0, oy = s.offsetY ?? 0
        for (let i = 0; i < s.points.length - 1; i += 2)
          pts.push(s.points[i] + ox, s.points[i + 1] + oy)
      } else if (el.type === 'shape') {
        const sh = el as ShapeData
        pts.push(sh.x + (sh.offsetX ?? 0), sh.y + (sh.offsetY ?? 0))
        pts.push(sh.x + sh.width + (sh.offsetX ?? 0), sh.y + sh.height + (sh.offsetY ?? 0))
      } else if (el.type === 'text') {
        const t = el as TextData
        pts.push(t.x + (t.offsetX ?? 0), t.y + (t.offsetY ?? 0))
      }
    })
    if (pts.length === 0) { setScale(1); setPosition({ x: 0, y: 0 }); return }
    const xs = pts.filter((_, i) => i % 2 === 0)
    const ys = pts.filter((_, i) => i % 2 === 1)
    const pad = 80
    const minX = Math.min(...xs), maxX = Math.max(...xs)
    const minY = Math.min(...ys), maxY = Math.max(...ys)
    const cW = maxX - minX + pad * 2, cH = maxY - minY + pad * 2
    const s  = Math.min(stageSize.width / cW, stageSize.height / cH, 3)
    setScale(s)
    setPosition({
      x: (stageSize.width  - cW * s) / 2 - (minX - pad) * s,
      y: (stageSize.height - cH * s) / 2 - (minY - pad) * s,
    })
  }, [canvasElements, stageSize])

  // ── Text commit ──────────────────────────────────────────────────────────────
  const commitText = useCallback(() => {
    if (!pendingText || !textValue.trim()) { setPendingText(null); setTextValue(''); return }
    const textEl: TextData = {
      id: crypto.randomUUID(), type: 'text',
      x: pendingText.worldX, y: pendingText.worldY,
      text: textValue.trim(), fontSize: fontSizeRef.current,
      color: colorRef.current, fontFamily: 'serif',
      layerId: layerRef.current,
    }
    setCanvasElements(prev => [...prev, textEl])
    onTextAdd(textEl)
    setPendingText(null)
    setTextValue('')
  }, [pendingText, textValue, setCanvasElements, onTextAdd])

  // ── Cursor style ─────────────────────────────────────────────────────────────
  const cursor = TOOL_CURSORS[selectedTool] ?? 'crosshair'

  const writingLayer = layers.find(layer => layer.id === selectedLayer)
  const writingDisabledReason = !isConnected ? 'Reconnect before adding your draft. You can keep writing here.'
    : !writingLayer || writingLayer.locked || !writingLayer.visible
      ? 'Select a visible, unlocked layer before adding your draft.' : undefined

  const insertHandwriting = async (draft: InkStroke[]) => {
    if (writingDisabledReason) return false
    const center = toWorld(stageSize.width / 2, stageSize.height / 2)
    const strokes: StrokeData[] = placeInk(draft, center, scaleRef.current).map(ink => ({
      ...ink, id: ink.id ?? crypto.randomUUID(), type: 'stroke', tool: 'pen', layerId: selectedLayer,
    }))
    return onInkAdd(strokes)
  }

  // ── Render ───────────────────────────────────────────────────────────────────
  return (
    <div
      ref={wrapperRef}
      className={`w-full h-full touch-none select-none relative overflow-hidden ${isDark ? 'paper-grain-dark' : 'paper-grain paper-vignette'}`}
      style={{ backgroundColor: config.bg, cursor }}
    >
      <TouchpadPad color={brushColor} size={brushSize}
        disabledReason={writingDisabledReason} onInsert={insertHandwriting} />
      <Stage
        ref={stageRef}
        width={stageSize.width}
        height={stageSize.height}
        scaleX={scale}
        scaleY={scale}
        x={position.x}
        y={position.y}
        onWheel={handleWheel}
        // All drawing handled by native pointer events above; Stage only needs wheel
        listening={true}
      >
        <GridOverlay scale={scale} position={position} stageSize={stageSize} gridType={gridType} dark={isDark} />

        {layers.map((layer) => {
          if (!layer.visible) return null
          const elements = canvasElements.filter(el => el.layerId === layer.id)
          return (
            <Layer key={layer.id} listening={selectedTool === 'select' && !layer.locked}>
              {elements.map((el) => {
                if (el.type === 'stroke') {
                  const s = el as StrokeData
                  const isSelected = selectedElementIds.includes(s.id)
                  // Brush / calligraphy / stylus-with-pressure → filled ribbon
                  if (s.tool === 'brush' || s.tool === 'calligraphy' || (s.pressures && s.pressures.length > 0)) {
                    return <RibbonStroke key={s.id} stroke={s} opacity={isSelected ? 0.55 : undefined} />
                  }
                  // Pencil → multi-pass sketchy renderer
                  if (s.tool === 'pencil') {
                    return <PencilStroke key={s.id} stroke={s} opacity={isSelected ? 0.55 : undefined} />
                  }
                  // Pen / eraser (mouse) / line → Konva Line primitive
                  return (
                    <Line
                      key={s.id}
                      x={s.offsetX ?? 0}
                      y={s.offsetY ?? 0}
                      points={s.points}
                      stroke={s.color}
                      strokeWidth={s.size}
                      opacity={isSelected ? 0.55 : (s.opacity ?? 1)}
                      tension={s.tool === 'pen' || s.tool === 'line' ? 0 : 0.3}
                      lineCap="round"
                      lineJoin="round"
                      globalCompositeOperation={s.tool === 'eraser' ? 'destination-out' : 'source-over'}
                      draggable={false}
                    />
                  )
                }
                if (el.type === 'shape') {
                  const sh = el as ShapeData
                  const isSelected = selectedElementIds.includes(sh.id)
                  if (sh.tool === 'rectangle') {
                    // Normalise so width/height are always positive — Konva's cornerRadius
                    // arc computation breaks (IndexSizeError) when width or height is negative.
                    const rw = Math.abs(sh.width)
                    const rh = Math.abs(sh.height)
                    if (rw < 1 || rh < 1) return null
                    const rx = sh.x + (sh.offsetX ?? 0) + Math.min(sh.width, 0)
                    const ry = sh.y + (sh.offsetY ?? 0) + Math.min(sh.height, 0)
                    return (
                      <Rect key={sh.id}
                        x={rx} y={ry}
                        width={rw} height={rh}
                        fill={sh.color}
                        fillEnabled={sh.filled}
                        stroke={sh.color}
                        strokeWidth={sh.filled ? 0 : (sh.strokeWidth ?? 2)}
                        strokeEnabled={!sh.filled}
                        opacity={isSelected ? 0.55 : 1}
                        cornerRadius={2}
                        draggable={false}
                      />
                    )
                  }
                  if (sh.tool === 'circle') {
                    const r = Math.max(Math.abs(sh.width), Math.abs(sh.height)) / 2
                    if (r < 1) return null
                    return (
                      <KonvaCircle key={sh.id}
                        x={sh.x + sh.width / 2 + (sh.offsetX ?? 0)}
                        y={sh.y + sh.height / 2 + (sh.offsetY ?? 0)}
                        radius={r}
                        fill={sh.color}
                        fillEnabled={sh.filled}
                        stroke={sh.color}
                        strokeWidth={sh.filled ? 0 : (sh.strokeWidth ?? 2)}
                        strokeEnabled={!sh.filled}
                        opacity={isSelected ? 0.55 : 1}
                        draggable={false}
                      />
                    )
                  }
                }
                if (el.type === 'text') {
                  const t = el as TextData
                  const isSelected = selectedElementIds.includes(t.id)
                  return (
                    <Text key={t.id}
                      x={t.x + (t.offsetX ?? 0)} y={t.y + (t.offsetY ?? 0)}
                      text={t.text} fontSize={t.fontSize}
                      fill={t.color} fontFamily={t.fontFamily ?? 'serif'}
                      opacity={isSelected ? 0.55 : 1}
                      draggable={false}
                    />
                  )
                }
                return null
              })}
            </Layer>
          )
        })}

        {marquee && <Layer listening={false}><Rect x={marquee.x} y={marquee.y} width={marquee.w} height={marquee.h}
          stroke="#6b7b45" fill="rgba(107,123,69,0.1)" strokeWidth={1 / scale} dash={[5 / scale, 3 / scale]} /></Layer>}
        {/* Selection highlight overlay */}
        {selectedElementIds.length > 0 && (
          <Layer listening={false}>
            {canvasElements
              .filter(el => selectedElementIds.includes(el.id))
              .map(el => {
                const b = getElementBounds(el)
                if (!b) return null
                return (
                  <Rect
                    key={`sel-${el.id}`}
                    x={b.x} y={b.y} width={b.w} height={b.h}
                    stroke="#6b7b45"
                    strokeWidth={1.5 / scale}
                    dash={[5 / scale, 3 / scale]}
                    fill="rgba(107,123,69,0.09)"
                    cornerRadius={3 / scale}
                    listening={false}
                  />
                )
              })}
          </Layer>
        )}

        {/* Remote cursors */}
        <Layer listening={false}>
          {cursors.map((c) => {
            const color = c.color || getCursorColor(c.userName)
            return (
              <React.Fragment key={c.userId || c.userName}>
                <KonvaCircle x={c.x} y={c.y} radius={5 / scale} fill={color} opacity={0.85}
                  stroke={isDark ? 'rgba(255,255,255,0.3)' : 'rgba(0,0,0,0.25)'} strokeWidth={1 / scale} />
                <Text x={c.x + 7 / scale} y={c.y - 7 / scale} text={c.userName}
                  fontSize={10 / scale} fill={isDark ? '#e8dcc8' : '#1a1410'}
                  fontStyle="bold"
                  shadowColor={isDark ? 'rgba(0,0,0,0.8)' : 'rgba(255,255,255,0.8)'}
                  shadowBlur={3 / scale} shadowOffset={{ x: 0, y: 0 }} />
              </React.Fragment>
            )
          })}
        </Layer>
      </Stage>

      {/* Text input overlay */}
      <AnimatePresence>
        {pendingText && (
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0 }}
            className="absolute z-10 pointer-events-auto"
            style={{ left: pendingText.viewX, top: pendingText.viewY }}
          >
            <textarea
              ref={textInputRef}
              value={textValue}
              onChange={e => setTextValue(e.target.value)}
              onKeyDown={e => {
                if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); commitText() }
                if (e.key === 'Escape') { setPendingText(null); setTextValue('') }
              }}
              onBlur={commitText}
              rows={1}
              placeholder="Type here…"
              className="min-w-[120px] max-w-[400px] bg-transparent border-0 outline-none resize-none leading-tight"
              style={{
                fontSize: `${fontSize * scale}px`,
                color: brushColor,
                fontFamily: 'Georgia, serif',
                caretColor: brushColor,
              }}
            />
          </motion.div>
        )}
      </AnimatePresence>

      {/* Find / reset view */}
      <motion.button
        initial={{ opacity: 0 }} animate={{ opacity: 1 }}
        whileHover={{ scale: 1.08 }} whileTap={{ scale: 0.92 }}
        onClick={resetView}
        title="Find content · reset view"
        className="absolute bottom-5 right-5 z-10 p-2.5 rounded-lg glass-strong shadow-lg text-white/45 hover:text-white/75 transition-colors"
      >
        <Crosshair className="h-4 w-4" strokeWidth={1.8} />
      </motion.button>
    </div>
  )
}

export default InfiniteCanvas
