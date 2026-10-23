'use client'

import React from 'react'
import { Lock, Unlock, Eye, EyeOff, Trash2, Plus } from 'lucide-react'
import { motion, AnimatePresence } from 'framer-motion'
import { Popover, PopoverTrigger, PopoverContent } from '@/components/ui/popover'
import type { LayerData } from '@/types/canvas'

interface LayerPanelProps {
  layers: LayerData[]
  selectedLayer: string
  setSelectedLayer: React.Dispatch<React.SetStateAction<string>>
  onLayerAdd: () => void
  onLayerUpdate: (layer: LayerData) => void
  onLayerDelete: (layerId: string) => void
}

export default function LayerPanel({
  layers,
  selectedLayer,
  setSelectedLayer,
  onLayerAdd,
  onLayerUpdate,
  onLayerDelete,
}: LayerPanelProps) {
  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-center justify-between mb-2">
        <span className="text-xs font-medium text-white/40 uppercase tracking-wider">Layers</span>
        <motion.button
          whileHover={{ scale: 1.1 }}
          whileTap={{ scale: 0.9 }}
          aria-label="Add layer"
          onClick={onLayerAdd}
          className="p-1.5 rounded-lg text-white/50 hover:text-white hover:bg-white/8 transition-colors"
        >
          <Plus className="h-3.5 w-3.5" />
        </motion.button>
      </div>

      <AnimatePresence>
        {layers.map((layer) => (
          <motion.div
            key={layer.id}
            layout
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, x: 20 }}
            transition={{ duration: 0.18 }}
            onClick={() => setSelectedLayer(layer.id)}
            className={`
              flex items-center justify-between p-2.5 rounded-xl cursor-pointer
              transition-colors group
              ${selectedLayer === layer.id
                ? 'bg-primary/15 border border-primary/25'
                : 'hover:bg-white/5 border border-transparent'
              }
            `}
          >
            <div className="flex items-center gap-2 min-w-0">
              <div
                className={`w-2 h-2 rounded-full flex-shrink-0 ${
                  selectedLayer === layer.id ? 'bg-primary' : 'bg-white/20'
                }`}
              />
              <span className="text-sm text-white/80 truncate">{layer.name}</span>
              {layer.locked && (
                <span className="text-xs text-white/30">(locked)</span>
              )}
            </div>

            <div className="flex items-center gap-0.5 opacity-70 group-hover:opacity-100 focus-within:opacity-100 transition-opacity">
              <button
                aria-label={layer.locked ? `Unlock ${layer.name}` : `Lock ${layer.name}`}
                onClick={(e) => { e.stopPropagation(); onLayerUpdate({ ...layer, locked: !layer.locked }) }}
                className="p-1 rounded-lg text-white/40 hover:text-white/80 hover:bg-white/8 transition-colors"
              >
                {layer.locked ? <Lock className="h-3 w-3" /> : <Unlock className="h-3 w-3" />}
              </button>
              <button
                aria-label={layer.visible ? `Hide ${layer.name}` : `Show ${layer.name}`}
                onClick={(e) => { e.stopPropagation(); onLayerUpdate({ ...layer, visible: !layer.visible }) }}
                className="p-1 rounded-lg text-white/40 hover:text-white/80 hover:bg-white/8 transition-colors"
              >
                {layer.visible ? <Eye className="h-3 w-3" /> : <EyeOff className="h-3 w-3" />}
              </button>
              <Popover>
                <PopoverTrigger asChild>
                  <button type="button" aria-label={`Delete ${layer.name}`} disabled={layers.length <= 1 || layer.locked}
                    onClick={event => event.stopPropagation()}
                    className="p-1 rounded-lg text-white/40 hover:text-red-400 disabled:opacity-25 disabled:cursor-not-allowed">
                    <Trash2 className="h-3 w-3" />
                  </button>
                </PopoverTrigger>
                <PopoverContent className="glass-panel space-y-3 text-sm" onClick={event => event.stopPropagation()}>
                  <p>Delete “{layer.name}” and its artwork?</p>
                  <p className="text-xs text-white/60">This removes the layer for everyone. A saved version keeps a copy of the artwork.</p>
                  <button type="button" onClick={() => onLayerDelete(layer.id)} className="rounded-lg bg-red-900/40 px-3 py-2 text-red-200">Delete layer</button>
                </PopoverContent>
              </Popover>
            </div>
          </motion.div>
        ))}
      </AnimatePresence>

      {layers.length === 0 && (
        <div className="text-center py-6 text-white/30 text-sm">
          No layers yet
        </div>
      )}
    </div>
  )
}
