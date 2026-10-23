'use client'

import React, { useState, useEffect, useRef, useCallback } from 'react'
import { io, Socket } from 'socket.io-client'
import { motion } from 'framer-motion'
import InfiniteCanvas from './InfiniteCanvas'
import ToolBar from './ToolBar'
import CollapsibleSidebar from './CollapsibleSidebar'
import HamburgerMenu from './HamburgerMenu'
import type {
  CanvasElement, LayerData, VersionData, ChatMessage,
  CursorData, StrokeData, ShapeData, TextData,
  CanvasType, GridType,
} from '@/types/canvas'

interface CanvasRoomProps {
  roomId: string
  initialCanvasState: string
  initialLayers: LayerData[]
  initialVersions: VersionData[]
  initialChat: ChatMessage[]
}


export default function CanvasRoom({
  roomId, initialCanvasState, initialLayers, initialVersions, initialChat,
}: CanvasRoomProps) {
  const socketRef = useRef<Socket | null>(null)
  const [userName, setUserName]       = useState('')
  const [isConnected, setIsConnected] = useState(false)
  const [userCount, setUserCount]     = useState(1)

  // Canvas elements
  const [canvasElements, setCanvasElements] = useState<CanvasElement[]>(() => {
    try { return JSON.parse(initialCanvasState) } catch { return [] }
  })

  // Tool state
  const [selectedTool, setSelectedTool] = useState('brush')
  const [brushSize, setBrushSize]       = useState(5)
  const [brushColor, setBrushColor]     = useState('#1a1410')
  const [fontSize, setFontSize]         = useState(24)
  const [shapeFilled, setShapeFilled]   = useState(true)

  // Canvas appearance
  const [canvasType, setCanvasType] = useState<CanvasType>('plain')
  const [gridType, setGridType]     = useState<GridType>('none')

  // Layers
  const [layers, setLayers] = useState<LayerData[]>(
    initialLayers.length > 0
      ? initialLayers
      : [{ id: crypto.randomUUID(), name: 'Layer 1', locked: false, visible: true, order: 0 }]
  )
  const [selectedLayer, setSelectedLayer] = useState(() =>
    initialLayers.length > 0 ? initialLayers[0].id : ''
  )

  const [versions, setVersions] = useState<VersionData[]>(initialVersions)
  const [chat, setChat]         = useState<ChatMessage[]>(initialChat)
  const [cursors, setCursors]   = useState<CursorData[]>([])
  const [selectedElementIds, setSelectedElementIds] = useState<string[]>([])

  // Nav open state — shared with ToolBar so it can shift away
  const [leftNavOpen, setLeftNavOpen]   = useState(false)
  const [rightNavOpen, setRightNavOpen] = useState(false)

  // Socket setup
  useEffect(() => {
    let name = localStorage.getItem('artCollab_userName')
    if (!name) {
      name = 'Artist ' + Math.floor(Math.random() * 9000 + 1000)
      localStorage.setItem('artCollab_userName', name)
    }
    setUserName(name)

    const socket = io(window.location.origin, { transports: ['websocket', 'polling'] })
    socketRef.current = socket

    socket.on('connect', () => {
      setIsConnected(true)
      socket.emit('room:join', { roomId, userName: name })
    })

    socket.on('room:state', ({ canvasState, layers: serverLayers, versions: serverVersions, chat: serverChat }) => {
      try {
        const parsed: CanvasElement[] = JSON.parse(canvasState)
        const deduped = Array.from(new Map(parsed.map(el => [el.id, el])).values())
        setCanvasElements(deduped)
      } catch {}
      if (serverLayers.length > 0) {
        setLayers(serverLayers)
        setSelectedLayer(serverLayers[0].id)
      }
      setVersions(serverVersions.map((v: VersionData) => ({ ...v, createdAt: new Date(v.createdAt as string).toISOString() })))
      setChat(serverChat.map((m: ChatMessage) => ({ ...m, createdAt: new Date(m.createdAt as string).toISOString() })))
    })

    socket.on('room:user-joined', ({ userCount }: { userName: string; userCount: number }) => setUserCount(userCount))
    socket.on('room:user-count',  ({ userCount }: { userCount: number }) => setUserCount(userCount))
    socket.on('room:user-left',   ({ userCount }: { userCount: number }) => setUserCount(userCount))

    socket.on('draw:stroke-start', ({ stroke }: { stroke: StrokeData }) => {
      setCanvasElements(prev =>
        prev.some(el => el.id === stroke.id) ? prev : [...prev, { ...stroke, remote: true, pending: true }]
      )
    })
    socket.on('draw:stroke-update', ({ strokeId, points, pressures }: { strokeId: string; points: number[]; pressures?: number[] }) => {
      setCanvasElements(prev =>
        prev.map(el => (el.id === strokeId ? { ...el, points, ...(pressures ? { pressures } : {}) } as StrokeData : el))
      )
    })
    socket.on('draw:stroke-end', ({ strokeId }: { strokeId: string }) => {
      setCanvasElements(prev =>
        prev.map(el => (el.id === strokeId ? { ...el, pending: false } as StrokeData : el))
      )
    })
    socket.on('draw:ink-add', ({ strokes }: { strokes: StrokeData[] }) => {
      setCanvasElements(prev => Array.from(new Map([...prev, ...strokes].map(stroke => [stroke.id, stroke])).values()))
    })
    socket.on('draw:shape-add', ({ shape }: { shape: ShapeData }) => {
      setCanvasElements(prev => [...prev, shape])
    })
    socket.on('draw:text-add', ({ text }: { text: TextData }) => {
      setCanvasElements(prev =>
        prev.some(el => el.id === text.id) ? prev : [...prev, text]
      )
    })
    socket.on('draw:element-move', ({ elementId, offsetX, offsetY }: { elementId: string; offsetX: number; offsetY: number }) => {
      setCanvasElements(prev =>
        prev.map(el => el.id === elementId ? { ...el, offsetX, offsetY } : el)
      )
    })
    socket.on('draw:clear', ({ layerId }: { layerId?: string }) => {
      if (layerId) setCanvasElements(prev => prev.filter(el => el.layerId !== layerId))
      else setCanvasElements([])
    })
    socket.on('draw:delete', ({ elementIds }: { elementIds: string[] }) => {
      setCanvasElements(prev => prev.filter(el => !elementIds.includes(el.id)))
    })
    socket.on('cursor:positions', ({ cursors: incoming }: { cursors: CursorData[] }) => {
      setCursors(prev => {
        const filtered = prev.filter(c => !incoming.find(ic => ic.userId === c.userId))
        return [...filtered, ...incoming]
      })
    })
    socket.on('layer:updated', ({ layers: serverLayers }: { layers: LayerData[] }) => {
      setLayers(serverLayers)
    })
    socket.on('version:saved', ({ version }: { version: VersionData }) => {
      setVersions(prev => [{ ...version, createdAt: new Date(version.createdAt as string).toISOString() }, ...prev])
    })
    socket.on('version:reverted', ({ canvasState }: { canvasState: string }) => {
      try { setCanvasElements(JSON.parse(canvasState)) } catch {}
    })
    socket.on('chat:message', (message: ChatMessage) => {
      setChat(prev => [...prev, { ...message, createdAt: new Date(message.createdAt as string).toISOString() }])
    })
    socket.on('disconnect', () => setIsConnected(false))

    return () => { socket.disconnect() }
  }, [roomId])

  const emitStrokeStart  = useCallback((stroke: StrokeData) => {
    socketRef.current?.emit('draw:stroke-start', { roomId, stroke })
  }, [roomId])
  const emitStrokeUpdate = useCallback((strokeId: string, points: number[], pressures?: number[]) => {
    socketRef.current?.emit('draw:stroke-update', { roomId, strokeId, points, pressures })
  }, [roomId])
  const emitStrokeEnd    = useCallback((stroke: StrokeData) => {
    socketRef.current?.emit('draw:stroke-end', { roomId, stroke })
  }, [roomId])
  const emitInkAdd = useCallback(async (strokes: StrokeData[]): Promise<boolean> => {
    const socket = socketRef.current
    if (!socket?.connected) return false
    try {
      const result: { ok: boolean } = await socket.timeout(10000).emitWithAck('draw:ink-add', { roomId, strokes })
      if (!result.ok) return false
      setCanvasElements(prev => Array.from(new Map([...prev, ...strokes].map(stroke => [stroke.id, stroke])).values()))
      return true
    } catch { return false }
  }, [roomId])
  const emitShapeAdd     = useCallback((shape: ShapeData) => {
    socketRef.current?.emit('draw:shape-add', { roomId, shape })
  }, [roomId])
  const emitTextAdd      = useCallback((text: TextData) => {
    socketRef.current?.emit('draw:text-add', { roomId, text })
  }, [roomId])
  const emitElementMove  = useCallback((elementId: string, offsetX: number, offsetY: number) => {
    socketRef.current?.emit('draw:element-move', { roomId, elementId, offsetX, offsetY })
  }, [roomId])
  const emitCursorMove   = useCallback((x: number, y: number) => {
    socketRef.current?.emit('cursor:move', { roomId, x, y, userName })
  }, [roomId, userName])

  // Clear selection when switching away from the select tool
  useEffect(() => {
    if (selectedTool !== 'select') setSelectedElementIds([])
  }, [selectedTool])

  const handleElementSelect = useCallback((id: string, addToSelection: boolean) => {
    if (id === '') { setSelectedElementIds([]); return }
    setSelectedElementIds(prev => {
      if (addToSelection) {
        return prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]
      }
      return [id]
    })
  }, [])

  const handleElementsDelete = useCallback((ids: string[]) => {
    if (ids.length === 0) return
    setCanvasElements(prev => prev.filter(el => !ids.includes(el.id)))
    socketRef.current?.emit('draw:delete', { roomId, elementIds: ids })
    setSelectedElementIds([])
  }, [roomId])

  const handleLayerAdd    = useCallback(() => {
    const layer: LayerData = {
      id: crypto.randomUUID(), name: `Layer ${layers.length + 1}`,
      locked: false, visible: true, order: layers.length,
    }
    socketRef.current?.emit('layer:add', { roomId, layer })
  }, [roomId, layers.length])
  const handleLayerUpdate = useCallback((layer: LayerData) => {
    socketRef.current?.emit('layer:update', { roomId, layer })
  }, [roomId])
  const handleLayerDelete = useCallback((layerId: string) => {
    socketRef.current?.emit('layer:delete', { roomId, layerId })
  }, [roomId])
  const handleSaveVersion   = useCallback((label: string) => {
    socketRef.current?.emit('version:save', { roomId, label })
  }, [roomId])
  const handleRevertVersion = useCallback((versionId: string) => {
    socketRef.current?.emit('version:revert', { roomId, versionId })
  }, [roomId])
  const handleSendMessage   = useCallback((text: string) => {
    socketRef.current?.emit('chat:send', { roomId, text, author: userName })
  }, [roomId, userName])
  const handleClearCanvas   = useCallback((layerId?: string) => {
    socketRef.current?.emit('draw:clear', { roomId, layerId })
    if (layerId) setCanvasElements(prev => prev.filter(el => el.layerId !== layerId))
    else setCanvasElements([])
  }, [roomId])

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.4 }}
      className="relative w-full h-screen overflow-hidden"
    >
      <div className="absolute inset-0">
        <InfiniteCanvas
          isConnected={isConnected}
          selectedTool={selectedTool}
          brushSize={brushSize}
          brushColor={brushColor}
          fontSize={fontSize}
          shapeFilled={shapeFilled}
          selectedLayer={selectedLayer}
          canvasElements={canvasElements}
          setCanvasElements={setCanvasElements}
          cursors={cursors}
          onStrokeStart={emitStrokeStart}
          onStrokeUpdate={emitStrokeUpdate}
          onStrokeEnd={emitStrokeEnd}
          onInkAdd={emitInkAdd}
          onShapeAdd={emitShapeAdd}
          onTextAdd={emitTextAdd}
          onElementMove={emitElementMove}
          onCursorMove={emitCursorMove}
          layers={layers}
          canvasType={canvasType}
          gridType={gridType}
          selectedElementIds={selectedElementIds}
          onElementSelect={handleElementSelect}
          onElementsDelete={handleElementsDelete}
        />
      </div>

      <HamburgerMenu roomId={roomId} onOpenChange={setLeftNavOpen} />

      <ToolBar
        selectedTool={selectedTool}
        setSelectedTool={setSelectedTool}
        brushSize={brushSize}
        setBrushSize={setBrushSize}
        brushColor={brushColor}
        setBrushColor={setBrushColor}
        fontSize={fontSize}
        setFontSize={setFontSize}
        shapeFilled={shapeFilled}
        setShapeFilled={setShapeFilled}
        onClear={handleClearCanvas}
        isConnected={isConnected}
        userCount={userCount}
        leftNavOpen={leftNavOpen}
        rightNavOpen={rightNavOpen}
      />

      <CollapsibleSidebar
        layers={layers}
        selectedLayer={selectedLayer}
        setSelectedLayer={setSelectedLayer}
        versions={versions}
        chat={chat}
        onLayerAdd={handleLayerAdd}
        onLayerUpdate={handleLayerUpdate}
        onLayerDelete={handleLayerDelete}
        onSaveVersion={handleSaveVersion}
        onRevertVersion={handleRevertVersion}
        onSendMessage={handleSendMessage}
        userName={userName}
        onOpenChange={setRightNavOpen}
        canvasType={canvasType}
        setCanvasType={setCanvasType}
        gridType={gridType}
        setGridType={setGridType}
      />
    </motion.div>
  )
}
