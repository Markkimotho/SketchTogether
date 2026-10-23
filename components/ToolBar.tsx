'use client'

import React, { useEffect, useRef, useState } from 'react'
import {
  Pencil, Pen, Paintbrush, Eraser, Square, Circle, Hand, Minus, Type, MousePointer2,
  Users, Trash2, Feather, PaintBucket, SquareDashed, Undo2, Redo2, Copy,
  SquareMousePointer, ChevronDown, SlidersHorizontal, Lock, Keyboard,
} from 'lucide-react'
import { Popover, PopoverTrigger, PopoverContent } from '@/components/ui/popover'
import { COLORS, INK_PRESETS, TOOLS } from '@/lib/toolbox'

interface ToolBarProps {
  selectedTool: string
  setSelectedTool: (tool: string) => void
  brushSize: number
  setBrushSize: (size: number) => void
  brushColor: string
  setBrushColor: (color: string) => void
  brushOpacity: number
  setBrushOpacity: (opacity: number) => void
  fontSize: number
  setFontSize: (size: number) => void
  shapeFilled: boolean
  setShapeFilled: (filled: boolean) => void
  onClear: (layerId?: string) => void
  onDelete: () => void
  selectedCount: number
  canClear: boolean
  editPending: boolean
  isConnected: boolean
  userCount: number
  layerName: string
  layerId: string
  layerLocked: boolean
  canClearLayer: boolean
  onSelectAll?: () => void
  onDuplicate?: () => void
  onUndo?: () => void
  onRedo?: () => void
  canUndo?: boolean
  canRedo?: boolean
  leftNavOpen?: boolean
  rightNavOpen?: boolean
}

const ICONS = { pencil: Pencil, pen: Pen, brush: Paintbrush, calligraphy: Feather, eraser: Eraser,
  line: Minus, rectangle: Square, circle: Circle, text: Type, select: MousePointer2, hand: Hand }

export default function ToolBar(props: ToolBarProps) {
  const { selectedTool, setSelectedTool, brushSize, setBrushSize, brushColor, setBrushColor,
    brushOpacity, setBrushOpacity, fontSize, setFontSize, shapeFilled, setShapeFilled,
    selectedCount, editPending, isConnected, userCount, layerName, layerLocked } = props
  const [collapsed, setCollapsed] = useState(false)
  const [recentColors, setRecentColors] = useState<string[]>([])
  const toolsRef = useRef<HTMLDivElement | null>(null)
  const active = TOOLS.find(tool => tool.id === selectedTool) ?? TOOLS[2]
  const Icon = ICONS[active.id]
  const isShape = selectedTool === 'rectangle' || selectedTool === 'circle'
  const isInk = active.group === 'draw' || selectedTool === 'line'
  const busy = editPending || !isConnected

  useEffect(() => {
    setRecentColors(previous => previous[0] === brushColor ? previous : [brushColor, ...previous.filter(color => color !== brushColor)].slice(0, 6))
  }, [brushColor])

  return (
    <div className={`toolbox-position ${props.leftNavOpen ? 'toolbox-nav-open' : ''}`}>
      <section className="toolbox glass-strong" aria-label="Artist toolbox">
        <header className="toolbox-header">
          <button type="button" className="toolbox-heading" aria-expanded={!collapsed} aria-controls="toolbox-controls"
            onClick={() => setCollapsed(value => !value)}>
            <Feather size={15} /><span>The toolshed</span><ChevronDown size={13} className={collapsed ? '-rotate-90' : ''} />
          </button>
          <span className="toolbox-current"><Icon size={13} />{active.label}</span>
          <div className="toolbox-connection" role="status" title={isConnected ? 'Connected to the shared room' : 'Reconnecting to the room'}>
            <span className={isConnected ? 'is-connected' : ''} />
            <Users size={12} />{userCount}<span className="hidden sm:inline">{isConnected ? 'in the studio' : '· reconnecting'}</span>
          </div>
        </header>
        {!collapsed && <div id="toolbox-controls">
          <div ref={toolsRef} role="toolbar" aria-label="Drawing tools" className="toolbox-tools"
            onKeyDown={event => {
              if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return
              const buttons = Array.from(toolsRef.current?.querySelectorAll<HTMLButtonElement>('[data-tool]') ?? [])
              const index = buttons.indexOf(document.activeElement as HTMLButtonElement)
              if (index < 0) return
              event.preventDefault()
              const next = event.key === 'Home' ? 0 : event.key === 'End' ? buttons.length - 1
                : (index + (event.key === 'ArrowRight' ? 1 : -1) + buttons.length) % buttons.length
              buttons[next]?.focus()
            }}>
            {(['draw', 'shape', 'navigate'] as const).map(group => <div key={group} role="group"
              aria-label={group === 'draw' ? 'Ink and eraser' : group === 'shape' ? 'Lines and shapes' : 'Text and navigation'} className="toolbox-group">
              {TOOLS.filter(tool => tool.group === group).map(tool => {
                const ToolIcon = ICONS[tool.id]
                return <button key={tool.id} type="button" data-tool={tool.id} aria-label={tool.label}
                  aria-pressed={selectedTool === tool.id} aria-keyshortcuts={tool.key.toLowerCase()}
                  title={`${tool.label} (${tool.key}) — ${tool.hint}`} className="toolbox-tool"
                  onClick={() => setSelectedTool(tool.id)}>
                  <ToolIcon size={18} strokeWidth={1.6} /><span>{tool.label}</span>
                </button>
              })}
            </div>)}
          </div>
          <div className="toolbox-properties" aria-label={`${active.label} settings`}>
            {(isInk || isShape || selectedTool === 'text') && <>
              {selectedTool !== 'eraser' && <Popover>
                <PopoverTrigger asChild><button type="button" className="toolbox-property" aria-label="Choose ink colour" title="Ink colour">
                  <span className="toolbox-swatch" style={{ backgroundColor: brushColor }} /><span className="hidden sm:inline">Ink</span><ChevronDown size={12} />
                </button></PopoverTrigger>
                <PopoverContent className="toolbox-popover glass-panel" align="start">
                  <p className="rustic-label mb-3">Earth &amp; pigment</p>
                  <div className="grid grid-cols-6 gap-2">
                    {COLORS.map(([name, color]) => <button key={color} type="button" aria-label={name} aria-pressed={brushColor === color}
                      title={name} className="toolbox-colour" style={{ backgroundColor: color }} onClick={() => setBrushColor(color)} />)}
                  </div>
                  <p className="rustic-label mt-4 mb-2">Recently used</p>
                  <div className="flex gap-2">{recentColors.map(color => <button key={color} type="button" aria-label={`Recent colour ${color}`}
                    className="toolbox-colour" style={{ backgroundColor: color }} onClick={() => setBrushColor(color)} />)}</div>
                  <label className="mt-4 flex items-center justify-between text-xs">Custom ink
                    <input aria-label="Custom ink colour" type="color" value={brushColor} onChange={event => setBrushColor(event.target.value)} className="h-8 w-12 cursor-pointer bg-transparent" />
                  </label>
                </PopoverContent>
              </Popover>}
              <Popover>
                <PopoverTrigger asChild><button type="button" className="toolbox-property" aria-label="Tool settings">
                  <SlidersHorizontal size={14} /><span>{selectedTool === 'text' ? fontSize : brushSize}px</span><ChevronDown size={12} />
                </button></PopoverTrigger>
                <PopoverContent className="toolbox-popover glass-panel space-y-4" align="start">
                  <div className="toolbox-stroke-preview" aria-hidden="true">
                    <svg viewBox="0 0 220 52"><path d="M12 35 C48 4 70 48 108 26 S164 5 208 28" fill="none" stroke={selectedTool === 'eraser' ? '#a18f68' : brushColor}
                      strokeWidth={Math.min(22, brushSize * 0.6)} strokeLinecap="round" opacity={brushOpacity} /></svg>
                  </div>
                  <label className="toolbox-range">{selectedTool === 'text' ? 'Letter size' : 'Stroke width'}<span>{selectedTool === 'text' ? fontSize : brushSize}px</span>
                    <input type="range" min={selectedTool === 'text' ? 8 : 1} max={selectedTool === 'text' ? 120 : 80}
                      value={selectedTool === 'text' ? fontSize : brushSize} onChange={event => (selectedTool === 'text' ? setFontSize : setBrushSize)(Number(event.target.value))} />
                  </label>
                  {isInk && selectedTool !== 'eraser' && <label className="toolbox-range">Ink opacity<span>{Math.round(brushOpacity * 100)}%</span>
                    <input type="range" min={5} max={100} value={Math.round(brushOpacity * 100)} onChange={event => setBrushOpacity(Number(event.target.value) / 100)} />
                  </label>}
                  {isInk && <div className="flex gap-2">{[2, 5, 12, 28].map(size => <button key={size} type="button" aria-label={`${size}px stroke`}
                    className="toolbox-action" aria-pressed={brushSize === size} onClick={() => setBrushSize(size)}>{size}px</button>)}</div>}
                </PopoverContent>
              </Popover>
              {isShape && <button type="button" className="toolbox-property" aria-label="Fill shapes" aria-pressed={shapeFilled}
                onClick={() => setShapeFilled(!shapeFilled)}>{shapeFilled ? <PaintBucket size={14} /> : <SquareDashed size={14} />}{shapeFilled ? 'Filled' : 'Outline'}</button>}
              {isInk && selectedTool !== 'eraser' && <Popover>
                <PopoverTrigger asChild><button type="button" className="toolbox-property"><Feather size={14} /><span>Presets</span><ChevronDown size={12} /></button></PopoverTrigger>
                <PopoverContent className="toolbox-popover glass-panel space-y-1" align="start">
                  <p className="rustic-label mb-2">Start with a mark</p>
                  {INK_PRESETS.map(preset => <button key={preset.name} type="button" className="toolbox-preset"
                    onClick={() => { setSelectedTool(preset.tool); setBrushSize(preset.size); setBrushOpacity(preset.opacity) }}>
                    <span>{preset.name}</span><span className="text-xs opacity-60">{preset.size}px · {Math.round(preset.opacity * 100)}%</span>
                  </button>)}
                </PopoverContent>
              </Popover>}
            </>}
            {selectedTool === 'select' && <>
              <span className="toolbox-selection">{selectedCount ? `${selectedCount} selected` : 'Select artwork to edit'}</span>
              <Action label="Select all editable objects" icon={SquareMousePointer} disabled={!props.canClear} onClick={props.onSelectAll} />
            </>}
            {selectedTool === 'hand' && <span className="toolbox-selection">Drag to explore your canvas</span>}
            <span className="toolbox-layer" title={`Active layer: ${layerName}${layerLocked ? ' (locked or hidden)' : ''}`}>
              {layerLocked && <Lock size={11} />}<span>{layerName}</span>
            </span>
          </div>
          <div className="toolbox-editbar" role="toolbar" aria-label="Canvas editing">
            <Action label="Undo (Ctrl/⌘ Z)" icon={Undo2} disabled={busy || !props.canUndo} onClick={props.onUndo} />
            <Action label="Redo (Ctrl/⌘ Shift Z)" icon={Redo2} disabled={busy || !props.canRedo} onClick={props.onRedo} />
            <span className="toolbox-rule" />
            <Action label="Duplicate selected (Ctrl/⌘ D)" icon={Copy} disabled={busy || !selectedCount} onClick={props.onDuplicate} text="Duplicate" />
            <Action label="Delete selected objects" icon={Trash2} disabled={busy || !selectedCount} onClick={props.onDelete}
              text={selectedCount ? `Delete ${selectedCount}` : 'Delete'} destructive />
            <div className="ml-auto flex items-center gap-1">
              <ShortcutHelp />
              <ClearMenu {...props} />
            </div>
          </div>
        </div>}
      </section>
    </div>
  )
}

function Action({ label, icon: Icon, disabled, onClick, text, destructive }: {
  label: string; icon: React.ElementType; disabled?: boolean; onClick?: () => void; text?: string; destructive?: boolean
}) {
  return <button type="button" className={`toolbox-action ${destructive ? 'is-destructive' : ''}`} aria-label={label} title={label}
    disabled={disabled || !onClick} onClick={onClick}><Icon size={15} />{text && <span>{text}</span>}</button>
}

function ClearMenu(props: ToolBarProps) {
  const [open, setOpen] = useState(false)
  const [scope, setScope] = useState<'layer' | 'canvas' | null>(null)
  return <Popover open={open} onOpenChange={value => { setOpen(value); setScope(null) }}>
    <PopoverTrigger asChild><button type="button" className="toolbox-action" aria-label="Clear artwork options" title="Clear artwork options"
      disabled={!props.canClear || props.editPending || !props.isConnected}><Trash2 size={14} /><ChevronDown size={12} /></button></PopoverTrigger>
    <PopoverContent className="toolbox-popover glass-panel" align="end">
      {scope ? <div className="space-y-3" role="group" aria-label="Confirm clearing artwork">
        <p className="font-serif text-lg">Clear {scope === 'layer' ? props.layerName : 'the canvas'}?</p>
        <p className="text-xs leading-relaxed opacity-70">Visible, unlocked artwork will be removed for everyone. You can undo this edit.</p>
        <div className="flex gap-2"><button type="button" className="toolbox-action" onClick={() => setScope(null)}>Cancel</button>
          <button type="button" className="toolbox-action is-destructive" onClick={() => {
            props.onClear(scope === 'layer' ? props.layerId : undefined); setOpen(false); setScope(null)
          }}>Clear {scope === 'layer' ? 'layer' : 'canvas'}</button></div>
      </div> : <div className="space-y-1">
        <p className="rustic-label mb-2">Make room</p>
        <button type="button" className="toolbox-preset" disabled={!props.canClearLayer} onClick={() => setScope('layer')}>Clear current layer</button>
        <button type="button" className="toolbox-preset" onClick={() => setScope('canvas')}>Clear editable canvas</button>
        <p className="mt-2 text-xs opacity-60">Locked and hidden layers stay untouched.</p>
      </div>}
    </PopoverContent>
  </Popover>
}

function ShortcutHelp() {
  return <Popover><PopoverTrigger asChild><button type="button" className="toolbox-action" aria-label="Keyboard shortcuts"><Keyboard size={15} /></button></PopoverTrigger>
    <PopoverContent className="toolbox-popover glass-panel" align="end">
      <p className="rustic-label mb-3">At your fingertips</p>
      <div className="grid grid-cols-2 gap-x-5 gap-y-2 text-xs">{TOOLS.map(tool => <div key={tool.id} className="flex justify-between gap-3"><span>{tool.label}</span><kbd>{tool.key}</kbd></div>)}</div>
      <div className="mt-3 space-y-2 border-t border-white/10 pt-3 text-xs">
        <p>W · writing pad</p><p>[ / ] · stroke size</p><p>Delete · selected artwork</p>
        <p>Ctrl/⌘ A · select all</p><p>Ctrl/⌘ D · duplicate</p><p>Ctrl/⌘ Z · undo · Shift Z to redo</p>
      </div>
    </PopoverContent>
  </Popover>
}
