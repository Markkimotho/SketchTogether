'use client'

import React, { useState } from 'react'
import {
  Pencil, Pen, Paintbrush, Eraser, Square, Circle, Hand,
  Minus, Type, MousePointer2, Users, Trash2, Feather,
  PaintBucket, SquareDashed,
} from 'lucide-react'
import { Popover, PopoverTrigger, PopoverContent } from '@/components/ui/popover'
import { Slider } from '@/components/ui/slider'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
import { motion } from 'framer-motion'

interface ToolBarProps {
  selectedTool: string
  setSelectedTool: React.Dispatch<React.SetStateAction<string>>
  brushSize: number
  setBrushSize: React.Dispatch<React.SetStateAction<number>>
  brushColor: string
  setBrushColor: React.Dispatch<React.SetStateAction<string>>
  fontSize: number
  setFontSize: React.Dispatch<React.SetStateAction<number>>
  shapeFilled: boolean
  setShapeFilled: React.Dispatch<React.SetStateAction<boolean>>
  onClear: () => void
  isConnected: boolean
  userCount: number
  leftNavOpen?: boolean
  rightNavOpen?: boolean
}

const TOOL_GROUPS = [
  [
    { id: 'pencil',      icon: Pencil,        label: 'Pencil'      },
    { id: 'pen',         icon: Pen,           label: 'Ink Pen'     },
    { id: 'brush',       icon: Paintbrush,    label: 'Brush'       },
    { id: 'calligraphy', icon: Feather,       label: 'Calligraphy' },
    { id: 'eraser',      icon: Eraser,        label: 'Eraser'      },
  ],
  [
    { id: 'line',        icon: Minus,         label: 'Line'        },
    { id: 'rectangle',   icon: Square,        label: 'Rectangle'   },
    { id: 'circle',      icon: Circle,        label: 'Circle'      },
  ],
  [
    { id: 'text',        icon: Type,          label: 'Text'        },
    { id: 'select',      icon: MousePointer2, label: 'Select / Move' },
    { id: 'hand',        icon: Hand,          label: 'Pan'         },
  ],
]

const PRESET_COLORS = [
  '#1a1a10', '#2d3a1a',
  '#4a6741', '#8b6914',
  '#6b2d1a', '#3d2b1f',
  '#2a3d32', '#5c3d2e',
  '#1e2f1a', '#c4a35a',
  '#7a5c3a', '#3a4a2a',
]

export default function ToolBar({
  selectedTool, setSelectedTool,
  brushSize, setBrushSize,
  brushColor, setBrushColor,
  fontSize, setFontSize,
  shapeFilled, setShapeFilled,
  onClear, isConnected, userCount,
  leftNavOpen = false, rightNavOpen = false,
}: ToolBarProps) {
  const [showClearConfirm, setShowClearConfirm] = useState(false)

  const handleClear = () => {
    if (showClearConfirm) {
      onClear()
      setShowClearConfirm(false)
    } else {
      setShowClearConfirm(true)
      setTimeout(() => setShowClearConfirm(false), 2500)
    }
  }

  // Shift toolbar away from open panels
  const desktopX = (leftNavOpen ? 130 : 0) + (rightNavOpen ? -160 : 0)

  return (
    <TooltipProvider delayDuration={300}>
      {/* ── Desktop: horizontal pill at top center ── */}
      <div className="fixed z-30 hidden md:flex top-4 left-0 right-0 justify-center pointer-events-none">
        <motion.div
          initial={{ y: -60, opacity: 0 }}
          animate={{ y: 0, opacity: 1, x: desktopX }}
          transition={{ type: 'spring', stiffness: 300, damping: 28, delay: 0.1 }}
          className="studio-toolbar pointer-events-auto flex flex-row items-center gap-0.5 p-1.5 rounded-xl glass-strong shadow-2xl"
        >
          {TOOL_GROUPS.map((group, gi) => (
            <React.Fragment key={gi}>
              {gi > 0 && <div className="w-px h-6 bg-white/10 mx-1" />}
              {group.map(tool => (
                <ToolBtn key={tool.id} tool={tool} selected={selectedTool === tool.id}
                  onSelect={setSelectedTool} layout="row" />
              ))}
            </React.Fragment>
          ))}

          <div className="w-px h-6 bg-white/10 mx-1" />
          <ColorPicker brushColor={brushColor} setBrushColor={setBrushColor} layout="row" />
          <SizePicker
            brushSize={brushSize} setBrushSize={setBrushSize}
            fontSize={fontSize} setFontSize={setFontSize}
            showText={selectedTool === 'text'}
          />
          {(selectedTool === 'rectangle' || selectedTool === 'circle') && (
            <FillToggle filled={shapeFilled} setFilled={setShapeFilled} layout="row" />
          )}

          <div className="w-px h-6 bg-white/10 mx-1" />
          <ClearButton showConfirm={showClearConfirm} onClear={handleClear} />
          <StatusBadge isConnected={isConnected} userCount={userCount} />
        </motion.div>
      </div>

      {/* ── Mobile: vertical pill on left side ── */}
      <div className="fixed z-30 flex md:hidden left-3 top-0 bottom-0 items-center pointer-events-none">
        <motion.div
          initial={{ x: -60, opacity: 0 }}
          animate={{ x: 0, opacity: leftNavOpen ? 0 : 1 }}
          transition={{ type: 'spring', stiffness: 300, damping: 28, delay: 0.15 }}
          className="studio-toolbar pointer-events-auto flex flex-col items-center gap-0.5 p-1.5 rounded-xl glass-strong shadow-2xl"
          style={{ pointerEvents: leftNavOpen ? 'none' : 'auto' }}
        >
          {TOOL_GROUPS.map((group, gi) => (
            <React.Fragment key={gi}>
              {gi > 0 && <div className="h-px w-6 bg-white/10 my-0.5" />}
              {group.map(tool => (
                <ToolBtn key={tool.id} tool={tool} selected={selectedTool === tool.id}
                  onSelect={setSelectedTool} layout="col" />
              ))}
            </React.Fragment>
          ))}

          <div className="h-px w-6 bg-white/10 my-0.5" />
          <ColorPicker brushColor={brushColor} setBrushColor={setBrushColor} layout="col" />
          <SizePicker
            brushSize={brushSize} setBrushSize={setBrushSize}
            fontSize={fontSize} setFontSize={setFontSize}
            showText={selectedTool === 'text'}
          />
          {(selectedTool === 'rectangle' || selectedTool === 'circle') && (
            <FillToggle filled={shapeFilled} setFilled={setShapeFilled} layout="col" />
          )}

          <div className="h-px w-6 bg-white/10 my-0.5" />
          <ClearButton showConfirm={showClearConfirm} onClear={handleClear} />
          <StatusBadge isConnected={isConnected} userCount={userCount} />
        </motion.div>
      </div>
    </TooltipProvider>
  )
}

// ── Sub-components ───────────────────────────────────────────────────────────

function ToolBtn({
  tool, selected, onSelect, layout,
}: {
  tool: { id: string; icon: React.ElementType; label: string }
  selected: boolean
  onSelect: (id: string) => void
  layout: 'row' | 'col'
}) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <motion.button
          whileHover={{ scale: 1.08 }}
          whileTap={{ scale: 0.92 }}
          onClick={() => onSelect(tool.id)}
          className={`
            relative p-2 rounded-lg transition-colors
            min-w-[36px] min-h-[36px] flex items-center justify-center
            ${selected ? 'text-white' : 'text-white/45 hover:text-white/75 hover:bg-white/5'}
          `}
        >
          {selected && (
            <motion.div
              layoutId={`activeTool_${layout}`}
              className="absolute inset-0 rounded-lg bg-primary/25 border border-primary/35"
              transition={{ type: 'spring', stiffness: 400, damping: 30 }}
            />
          )}
          <tool.icon className="h-[15px] w-[15px] relative z-10" strokeWidth={1.8} />
        </motion.button>
      </TooltipTrigger>
      <TooltipContent side={layout === 'col' ? 'right' : 'bottom'} className="text-xs">
        {tool.label}
      </TooltipContent>
    </Tooltip>
  )
}

function ColorPicker({
  brushColor, setBrushColor, layout,
}: {
  brushColor: string
  setBrushColor: (c: string) => void
  layout: 'row' | 'col'
}) {
  return (
    <Popover>
      <Tooltip>
        <TooltipTrigger asChild>
          <PopoverTrigger asChild>
            <motion.button
              whileHover={{ scale: 1.08 }}
              whileTap={{ scale: 0.92 }}
              className="p-2 rounded-lg hover:bg-white/5 transition-colors min-w-[36px] min-h-[36px] flex items-center justify-center"
            >
              <div
                className="w-4 h-4 rounded-full border border-white/25 shadow-inner"
                style={{ backgroundColor: brushColor }}
              />
            </motion.button>
          </PopoverTrigger>
        </TooltipTrigger>
        <TooltipContent side={layout === 'col' ? 'right' : 'bottom'} className="text-xs">Colour</TooltipContent>
      </Tooltip>
      <PopoverContent
        side={layout === 'col' ? 'right' : 'bottom'}
        className="w-52 p-3 glass-panel border-white/8 shadow-2xl"
      >
        <div className="grid grid-cols-6 gap-1.5 mb-3">
          {PRESET_COLORS.map((color) => (
            <button
              key={color}
              onClick={() => setBrushColor(color)}
              className={`w-6 h-6 rounded-full transition-transform hover:scale-110 border-2 ${
                brushColor === color ? 'border-white/80 scale-110' : 'border-transparent'
              }`}
              style={{ backgroundColor: color }}
            />
          ))}
        </div>
        <input
          type="color"
          value={brushColor}
          onChange={(e) => setBrushColor(e.target.value)}
          className="w-full h-7 rounded cursor-pointer bg-transparent"
        />
      </PopoverContent>
    </Popover>
  )
}

function SizePicker({
  brushSize, setBrushSize, fontSize, setFontSize, showText,
}: {
  brushSize: number
  setBrushSize: (s: number) => void
  fontSize: number
  setFontSize: (s: number) => void
  showText: boolean
}) {
  return (
    <Popover>
      <Tooltip>
        <TooltipTrigger asChild>
          <PopoverTrigger asChild>
            <motion.button
              whileHover={{ scale: 1.08 }}
              whileTap={{ scale: 0.92 }}
              className="p-2 rounded-lg hover:bg-white/5 transition-colors min-w-[36px] min-h-[36px] flex items-center justify-center"
            >
              <div
                className="rounded-full bg-foreground/60"
                style={{
                  width:  Math.max(3, Math.min(14, brushSize * 0.5)),
                  height: Math.max(3, Math.min(14, brushSize * 0.5)),
                }}
              />
            </motion.button>
          </PopoverTrigger>
        </TooltipTrigger>
        <TooltipContent className="text-xs">Size</TooltipContent>
      </Tooltip>
      <PopoverContent className="w-52 p-3 glass-panel border-white/8 shadow-2xl space-y-4">
        <div>
          <p className="rustic-label text-white/40 mb-2">Stroke: {brushSize}px</p>
          <Slider
            min={1} max={80} step={1}
            value={[brushSize]}
            onValueChange={(v) => setBrushSize(v[0])}
          />
        </div>
        {showText && (
          <div>
            <p className="rustic-label text-white/40 mb-2">Font size: {fontSize}px</p>
            <Slider
              min={8} max={120} step={2}
              value={[fontSize]}
              onValueChange={(v) => setFontSize(v[0])}
            />
          </div>
        )}
      </PopoverContent>
    </Popover>
  )
}

function ClearButton({ showConfirm, onClear }: { showConfirm: boolean; onClear: () => void }) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <motion.button
          whileHover={{ scale: 1.08 }}
          whileTap={{ scale: 0.92 }}
          onClick={onClear}
          className={`
            p-2 rounded-lg transition-colors min-w-[36px] min-h-[36px] flex items-center justify-center
            ${showConfirm
              ? 'text-red-400 bg-red-500/15 border border-red-500/30'
              : 'text-white/45 hover:text-red-400 hover:bg-red-500/10'
            }
          `}
        >
          <Trash2 className="h-[15px] w-[15px]" strokeWidth={1.8} />
        </motion.button>
      </TooltipTrigger>
      <TooltipContent className="text-xs">
        {showConfirm ? 'Tap again to confirm' : 'Clear canvas'}
      </TooltipContent>
    </Tooltip>
  )
}

function StatusBadge({ isConnected, userCount }: { isConnected: boolean; userCount: number }) {
  return (
    <div className="flex items-center gap-1.5 px-2 py-1.5 rounded-lg bg-white/5 min-h-[36px]">
      <div className={`w-1.5 h-1.5 rounded-full ${isConnected ? 'bg-emerald-400' : 'bg-red-400'}`} />
      <Users className="h-3 w-3 text-white/35" strokeWidth={1.8} />
      <span className="text-xs text-white/45 font-medium tabular-nums">{userCount}</span>
    </div>
  )
}

function FillToggle({
  filled, setFilled, layout,
}: {
  filled: boolean
  setFilled: React.Dispatch<React.SetStateAction<boolean>>
  layout: 'row' | 'col'
}) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <motion.button
          whileHover={{ scale: 1.08 }}
          whileTap={{ scale: 0.92 }}
          onClick={() => setFilled(f => !f)}
          className={`
            relative p-2 rounded-lg transition-colors
            min-w-[36px] min-h-[36px] flex items-center justify-center
            ${filled ? 'text-white' : 'text-white/45 hover:text-white/75 hover:bg-white/5'}
          `}
        >
          {filled && (
            <motion.div
              layoutId={`fillActive_${layout}`}
              className="absolute inset-0 rounded-lg bg-primary/25 border border-primary/35"
              transition={{ type: 'spring', stiffness: 400, damping: 30 }}
            />
          )}
          {filled
            ? <PaintBucket className="h-[15px] w-[15px] relative z-10" strokeWidth={1.8} />
            : <SquareDashed className="h-[15px] w-[15px] relative z-10" strokeWidth={1.8} />
          }
        </motion.button>
      </TooltipTrigger>
      <TooltipContent side={layout === 'col' ? 'right' : 'bottom'} className="text-xs">
        {filled ? 'Filled' : 'Outline only'}
      </TooltipContent>
    </Tooltip>
  )
}
