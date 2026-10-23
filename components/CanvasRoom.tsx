'use client'

import React, { useState, useEffect, useRef, useCallback } from 'react'
import { io, Socket } from 'socket.io-client'
import { motion } from 'framer-motion'
import InfiniteCanvas from './InfiniteCanvas'
import ToolBar from './ToolBar'
import CollapsibleSidebar from './CollapsibleSidebar'
import HamburgerMenu from './HamburgerMenu'
import type { ElementMove } from '@/lib/selection'
import { useCanvasHistory } from '@/lib/use-canvas-history'
import { TOOLS, isEditingText } from '@/lib/toolbox'
import { duplicateElements, editableElements, mergeCanvasDelta, type CanvasEdit, type CanvasDelta, type EditReply } from '@/lib/canvas-edits'
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
  const roomReadyRef = useRef(false)
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
  const [brushOpacity, setBrushOpacity] = useState(1)
  const [brushColor, setBrushColor]     = useState('#1a1410')
  const [fontSize, setFontSize]         = useState(24)
  const [shapeFilled, setShapeFilled]   = useState(true)

  useEffect(() => {
    const shortcut = (event: KeyboardEvent) => {
      if (event.defaultPrevented || event.repeat || event.isComposing || event.ctrlKey || event.metaKey || event.altKey || isEditingText(event.target)) return
      const tool = TOOLS.find(tool => tool.key.toLowerCase() === event.key.toLowerCase())
      if (tool) { event.preventDefault(); setSelectedTool(tool.id) }
      if (event.key === '[' || event.key === ']') {
        event.preventDefault()
        setBrushSize(size => Math.max(1, Math.min(80, size + (event.key === ']' ? 1 : -1))))
      }
    }
    document.addEventListener('keydown', shortcut)
    return () => document.removeEventListener('keydown', shortcut)
  }, [])

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
      roomReadyRef.current = false
      setIsConnected(false)
      socket.emit('room:join', { roomId, userName: name })
    })

    socket.on('room:state', ({ canvasState, layers: serverLayers, versions: serverVersions, chat: serverChat, capabilities }) => {
      const supported = capabilities?.canvasEdits === 1
      roomReadyRef.current = supported
      setIsConnected(supported)
      setEditError(supported ? '' : 'The server is running an older version. Restart npm run dev, then reconnect.')
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
      setSelectedElementIds(prev => prev.filter(id => !delta.removed.some(element => element.id === id) || delta.added.some(element => element.id === id)))
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
    socket.on('disconnect', () => { roomReadyRef.current = false; setIsConnected(false) })
    socket.on('connect_error', () => {
      roomReadyRef.current = false
      setIsConnected(false)
      setEditError('Cannot reach the server. Check that npm run dev is running, then reconnect.')
    })

    return () => { socket.disconnect() }
  }, [roomId])

  const commitCanvasEdit = useCallback(async (edit: CanvasEdit): Promise<CanvasDelta | null> => {
    const socket = socketRef.current
    if (!socket?.connected) { setEditError('Reconnect to save your edit.'); return null }
    if (!roomReadyRef.current) {
      setEditError('The editing server is not ready. Restart npm run dev if it is outdated, then reconnect.')
      return null
    }
    setEditPending(count => count + 1)
    setEditError('')
    try {
      const reply: EditReply = await socket.timeout(10000).emitWithAck('canvas:edit', { roomId, edit })
      if (!reply.ok) { setEditError(reply.error); return null }
      setCanvasElements(prev => mergeCanvasDelta(prev, reply.delta))
      return reply.delta
    } catch {
      setEditError('The server did not confirm this save. Reconnect to check the saved canvas before trying again.')
      return null
    } finally { setEditPending(count => count - 1) }
  }, [roomId])

  const { record, reset: resetHistory, undo, redo, canUndo, canRedo, busy: historyBusy } = useCanvasHistory(commitCanvasEdit)
  const runEdit = useCallback(async (edit: CanvasEdit, label: string) => {
    const delta = await commitCanvasEdit(edit)
    if (delta) record(delta, label)
    return delta
  }, [commitCanvasEdit, record])

  const emitStrokeStart = useCallback((stroke: StrokeData) => {
    socketRef.current?.emit('draw:stroke-start', { roomId, stroke })
  }, [roomId])
  const emitStrokeUpdate = useCallback((strokeId: string, points: number[], pressures?: number[]) => {
    socketRef.current?.emit('draw:stroke-update', { roomId, strokeId, points, pressures })
  }, [roomId])
  const emitStrokeEnd = useCallback((stroke: StrokeData) => {
    void runEdit({ add: [stroke] }, 'stroke')
  }, [runEdit])
  const emitInkAdd = useCallback(async (strokes: StrokeData[]) => {
    return (await runEdit({ add: strokes }, 'handwriting')) !== null
  }, [runEdit])
  const emitShapeAdd = useCallback((shape: ShapeData) => {
    void runEdit({ add: [shape] }, 'shape')
  }, [runEdit])
  const emitTextAdd = useCallback((text: TextData) => {
    void runEdit({ add: [text] }, 'text')
  }, [runEdit])
  const emitElementsMove = useCallback((moves: ElementMove[]) => {
    void runEdit({ deleteIds: moves.map(move => move.before.id),
      add: moves.map(move => ({ ...move.before, offsetX: move.offsetX, offsetY: move.offsetY })),
      expected: moves.map(move => move.before) }, 'move').then(delta => {
      if (!delta) socketRef.current?.emit('room:join', { roomId, userName })
    })
  }, [runEdit, roomId, userName])
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
    const delta = await runEdit({ deleteIds: ids }, 'delete')
    if (delta) setSelectedElementIds([])
  }, [runEdit])

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
    const delta = await runEdit({ clear: true, layerId }, 'clear')
    if (delta) setSelectedElementIds([])
  }, [runEdit])

  const editable = editableElements(canvasElements, layers)
  const deletableSelection = editable.filter(element => selectedElementIds.includes(element.id))

  const selectAll = useCallback(() => {
    setSelectedTool('select')
    setSelectedElementIds(editableElements(canvasElements, layers).map(element => element.id))
  }, [canvasElements, layers])
  const duplicateSelection = useCallback(async () => {
    const elements = editableElements(canvasElements, layers).filter(element => selectedElementIds.includes(element.id))
    if (!elements.length) return
    const delta = await runEdit({ add: duplicateElements(elements, () => crypto.randomUUID()) }, 'duplicate')
    if (delta) { setSelectedTool('select'); setSelectedElementIds(delta.added.map(element => element.id)) }
  }, [canvasElements, layers, selectedElementIds, runEdit])

  useEffect(() => {
    const socket = socketRef.current
    const reset = () => resetHistory()
    socket?.on('version:reverted', reset)
    socket?.on('disconnect', reset)
    return () => { socket?.off('version:reverted', reset); socket?.off('disconnect', reset) }
  }, [resetHistory])

  useEffect(() => {
    const keyboardEdit = (event: KeyboardEvent) => {
      if (event.defaultPrevented || event.repeat || event.isComposing || isEditingText(event.target) || editPending || historyBusy) return
      if (!event.ctrlKey && !event.metaKey) return
      const key = event.key.toLowerCase()
      if (key === 'a') { event.preventDefault(); selectAll() }
      if (key === 'd') { event.preventDefault(); void duplicateSelection() }
      if (key === 'z' || key === 'y') {
        event.preventDefault()
        if (key === 'y' || event.shiftKey) void redo(); else void undo()
      }
    }
    document.addEventListener('keydown', keyboardEdit)
    return () => document.removeEventListener('keydown', keyboardEdit)
  }, [selectAll, duplicateSelection, undo, redo, editPending, historyBusy])

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
          brushOpacity={brushOpacity}
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
          onElementsMove={emitElementsMove}
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
        brushOpacity={brushOpacity}
        setBrushOpacity={setBrushOpacity}
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
        editPending={editPending > 0 || historyBusy}
        layerName={layers.find(layer => layer.id === selectedLayer)?.name ?? 'Choose a layer'}
        layerId={selectedLayer}
        layerLocked={!layers.some(layer => layer.id === selectedLayer && !layer.locked && layer.visible)}
        canClearLayer={editable.some(element => element.layerId === selectedLayer)}
        onSelectAll={selectAll}
        onDuplicate={() => { void duplicateSelection() }}
        onUndo={() => { void undo() }}
        onRedo={() => { void redo() }}
        canUndo={canUndo}
        canRedo={canRedo}
        isConnected={isConnected}
        userCount={userCount}
        leftNavOpen={leftNavOpen}
        rightNavOpen={rightNavOpen}
      />

      {editError && <div role="alert" className="fixed bottom-5 left-5 z-40 max-w-sm rounded-xl glass-strong p-3 text-sm text-amber-100">
        {editError}
        <button type="button" onClick={() => {
          roomReadyRef.current = false
          setIsConnected(false)
          setEditError('Reconnecting…')
          socketRef.current?.disconnect().connect()
        }} className="ml-3 underline">Reconnect</button>
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
