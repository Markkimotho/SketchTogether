'use client'

import React, { useState, useEffect, useRef, useCallback } from 'react'
import { io, Socket } from 'socket.io-client'
import { motion } from 'framer-motion'
import InfiniteCanvas from './InfiniteCanvas'
import ToolBar from './ToolBar'
import CollapsibleSidebar from './CollapsibleSidebar'
import HamburgerMenu from './HamburgerMenu'
import { editableElements, mergeCanvasDelta, type CanvasEdit, type CanvasDelta, type EditReply } from '@/lib/canvas-edits'
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

  const [editPending, setEditPending] = useState(0)
  const [editError, setEditError] = useState('')

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
    socket.on('canvas:edited', ({ delta }: { delta: CanvasDelta }) => {
      setCanvasElements(prev => mergeCanvasDelta(prev, delta))
      setSelectedElementIds(prev => prev.filter(id => !delta.removed.some(element => element.id === id)))
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
      setSelectedLayer(current => serverLayers.some(layer => layer.id === current) ? current : serverLayers[0]?.id ?? '')
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

  const commitCanvasEdit = useCallback(async (edit: CanvasEdit): Promise<CanvasDelta | null> => {
    const socket = socketRef.current
    if (!socket?.connected) { setEditError('Reconnect to save your edit.'); return null }
    setEditPending(count => count + 1)
    setEditError('')
    try {
      const reply: EditReply = await socket.timeout(10000).emitWithAck('canvas:edit', { roomId, edit })
      if (!reply.ok) { setEditError(reply.error); return null }
      setCanvasElements(prev => mergeCanvasDelta(prev, reply.delta))
      return reply.delta
    } catch {
      setEditError('Could not confirm the save. Reconnect before trying again.')
      return null
    } finally { setEditPending(count => count - 1) }
  }, [roomId])

  const emitStrokeStart = useCallback((stroke: StrokeData) => {
    socketRef.current?.emit('draw:stroke-start', { roomId, stroke })
  }, [roomId])
  const emitStrokeUpdate = useCallback((strokeId: string, points: number[], pressures?: number[]) => {
    socketRef.current?.emit('draw:stroke-update', { roomId, strokeId, points, pressures })
  }, [roomId])
  const emitStrokeEnd = useCallback((stroke: StrokeData) => {
    void commitCanvasEdit({ add: [stroke] })
  }, [commitCanvasEdit])
  const emitInkAdd = useCallback(async (strokes: StrokeData[]) => {
    return (await commitCanvasEdit({ add: strokes })) !== null
  }, [commitCanvasEdit])
  const emitShapeAdd = useCallback((shape: ShapeData) => {
    void commitCanvasEdit({ add: [shape] })
  }, [commitCanvasEdit])
  const emitTextAdd = useCallback((text: TextData) => {
    void commitCanvasEdit({ add: [text] })
  }, [commitCanvasEdit])
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

  const handleElementsDelete = useCallback(async (ids: string[]) => {
    if (!ids.length) return
    const delta = await commitCanvasEdit({ deleteIds: ids })
    if (delta) setSelectedElementIds([])
  }, [commitCanvasEdit])

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
    const socket = socketRef.current
    if (!socket?.connected) { setEditError('Reconnect to delete the layer.'); return }
    void socket.timeout(10000).emitWithAck('layer:delete', { roomId, layerId }).then((reply: EditReply) => {
      if (!reply.ok) setEditError(reply.error)
    }).catch(() => setEditError('Could not confirm the layer deletion. Reconnect and try again.'))
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
  const handleClearCanvas = useCallback(async (layerId?: string) => {
    const delta = await commitCanvasEdit({ clear: true, layerId })
    if (delta) setSelectedElementIds([])
  }, [commitCanvasEdit])

  const editable = editableElements(canvasElements, layers)
  const deletableSelection = editable.filter(element => selectedElementIds.includes(element.id))

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
        onDelete={() => { void handleElementsDelete(deletableSelection.map(element => element.id)) }}
        selectedCount={deletableSelection.length}
        canClear={editable.length > 0}
        editPending={editPending > 0}
        isConnected={isConnected}
        userCount={userCount}
        leftNavOpen={leftNavOpen}
        rightNavOpen={rightNavOpen}
      />

      {editError && <div role="alert" className="fixed bottom-5 left-5 z-40 max-w-sm rounded-xl glass-strong p-3 text-sm text-amber-100">
        {editError}
        <button type="button" aria-label="Dismiss save error" onClick={() => setEditError('')} className="ml-3 underline">Dismiss</button>
      </div>}

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
