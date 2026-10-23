import type { CanvasTool } from '../types/canvas'
export const TOOLS: { id: CanvasTool; label: string; key: string; group: 'draw' | 'shape' | 'navigate'; hint: string }[] = [
  { id: 'pencil', label: 'Pencil', key: 'P', group: 'draw', hint: 'Textured marks for loose ideas' },
  { id: 'pen', label: 'Ink pen', key: 'I', group: 'draw', hint: 'A clean, steady line' },
  { id: 'brush', label: 'Brush', key: 'B', group: 'draw', hint: 'Soft strokes with a natural taper' },
  { id: 'calligraphy', label: 'Nib', key: 'C', group: 'draw', hint: 'Broad strokes with a slanted nib' },
  { id: 'eraser', label: 'Eraser', key: 'E', group: 'draw', hint: 'Erase marks on the active layer' },
  { id: 'line', label: 'Line', key: 'L', group: 'shape', hint: 'Join two points' },
  { id: 'rectangle', label: 'Rectangle', key: 'R', group: 'shape', hint: 'Drag to frame an idea' },
  { id: 'circle', label: 'Circle', key: 'O', group: 'shape', hint: 'Drag to draw a circle' },
  { id: 'text', label: 'Text', key: 'T', group: 'navigate', hint: 'Click to add a note' },
  { id: 'select', label: 'Select', key: 'V', group: 'navigate', hint: 'Click or drag to select; Shift adds objects' },
  { id: 'hand', label: 'Pan', key: 'H', group: 'navigate', hint: 'Move around your canvas' },
]
export const INK_PRESETS = [
  { name: 'Fine ink', tool: 'pen', size: 4, opacity: 1 },
  { name: 'Soft graphite', tool: 'pencil', size: 8, opacity: 0.85 },
  { name: 'Wash', tool: 'brush', size: 28, opacity: 0.25 },
] as const
export const COLORS = [
  ['Ink', '#1a1410'], ['Chalk', '#f3e6c6'], ['Moss', '#4a6741'], ['Fern', '#829667'],
  ['Ochre', '#b99843'], ['Terracotta', '#a9583c'], ['Clay', '#c38c67'], ['Bark', '#5c3d2e'],
  ['Slate', '#586d7a'], ['Indigo', '#424c7a'], ['Mulberry', '#805165'], ['Charcoal', '#3d423b'],
] as const

export function isEditingText(target: EventTarget | null) {
  return target instanceof Element && !!target.closest('input, textarea, select, [contenteditable]:not([contenteditable="false"]), [role="textbox"], #touchpad-panel')
}
