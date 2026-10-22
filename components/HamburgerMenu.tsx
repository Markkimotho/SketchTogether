'use client'

import React, { useState } from 'react'
import Link from 'next/link'
import { Menu, X, Link2, Home, Check } from 'lucide-react'
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger, SheetClose } from '@/components/ui/sheet'
import { motion } from 'framer-motion'

interface HamburgerMenuProps {
  roomId?: string
  onOpenChange?: (open: boolean) => void
}

export default function HamburgerMenu({ roomId, onOpenChange }: HamburgerMenuProps) {
  const [copied, setCopied] = useState(false)

  const handleCopyLink = () => {
    if (typeof window !== 'undefined') {
      navigator.clipboard.writeText(window.location.href).then(() => {
        setCopied(true)
        setTimeout(() => setCopied(false), 2000)
      })
    }
  }

  return (
    <Sheet onOpenChange={onOpenChange}>
      <SheetTrigger asChild>
        <motion.button
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ delay: 0.05 }}
          whileHover={{ scale: 1.05 }}
          whileTap={{ scale: 0.95 }}
          className="
            fixed top-4 left-4 z-30
            p-2.5 rounded-xl glass-strong shadow-xl
            text-white/60 hover:text-white transition-colors
            min-w-[40px] min-h-[40px] flex items-center justify-center
          "
        >
          <Menu className="h-4 w-4" />
        </motion.button>
      </SheetTrigger>

      <SheetContent
        side="left"
        className="w-[260px] glass-panel border-r border-white/8 p-0 flex flex-col"
      >
        <SheetHeader className="px-5 pt-5 pb-4 border-b border-white/6">
          <div className="flex items-center justify-between">
            <SheetTitle className="font-semibold text-base" style={{ color: 'rgba(200, 210, 180, 0.9)' }}>SketchTogether</SheetTitle>
            <SheetClose asChild>
              <button className="p-1.5 rounded-lg text-white/40 hover:text-white/70 hover:bg-white/5 transition-colors">
                <X className="h-4 w-4" />
              </button>
            </SheetClose>
          </div>
          {roomId && (
            <p className="text-xs text-white/30 font-mono mt-1 truncate">{roomId}</p>
          )}
        </SheetHeader>

        <div className="flex flex-col gap-1 p-3">
          {roomId && (
            <button
              onClick={handleCopyLink}
              className="
                flex items-center gap-3 w-full px-3 py-2.5 rounded-xl text-sm
                text-white/70 hover:text-white hover:bg-white/6 transition-colors text-left
              "
            >
              {copied ? (
                <Check className="h-4 w-4 text-emerald-400 flex-shrink-0" />
              ) : (
                <Link2 className="h-4 w-4 flex-shrink-0" />
              )}
              {copied ? 'Link copied!' : 'Copy share link'}
            </button>
          )}

          <SheetClose asChild>
            <Link
              href="/"
              className="
                flex items-center gap-3 w-full px-3 py-2.5 rounded-xl text-sm
                text-white/70 hover:text-white hover:bg-white/6 transition-colors
              "
            >
              <Home className="h-4 w-4 flex-shrink-0" />
              Back to lobby
            </Link>
          </SheetClose>
        </div>

        <div className="mt-auto px-5 pb-5">
          <p className="text-xs text-white/20 leading-relaxed">
            Share the link above with anyone to collaborate in real time.
          </p>
        </div>
      </SheetContent>
    </Sheet>
  )
}
