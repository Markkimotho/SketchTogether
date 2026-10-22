'use client'

import React, { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { motion, AnimatePresence } from 'framer-motion'
import { Plus, ArrowRight, Clock, Trash2 } from 'lucide-react'

interface RecentRoom {
  id: string
  name: string
  updatedAt: string
}

function timeAgo(date: string): string {
  const d = new Date(date)
  const seconds = Math.floor((Date.now() - d.getTime()) / 1000)
  if (seconds < 60) return 'just now'
  const minutes = Math.floor(seconds / 60)
  if (minutes < 60) return `${minutes}m ago`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours}h ago`
  return `${Math.floor(hours / 24)}d ago`
}

export default function RoomLobby() {
  const router = useRouter()
  const [isCreating, setIsCreating] = useState(false)
  const [joinId, setJoinId] = useState('')
  const [recentRooms, setRecentRooms] = useState<RecentRoom[]>([])
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null)

  useEffect(() => {
    fetch('/api/rooms')
      .then(r => r.json())
      .then(data => setRecentRooms(data.rooms || []))
      .catch(() => {})
  }, [])

  const createRoom = async () => {
    setIsCreating(true)
    try {
      const res = await fetch('/api/rooms', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: 'Untitled Canvas' }),
      })
      const { roomId } = await res.json()
      router.push(`/room/${roomId}`)
    } catch {
      setIsCreating(false)
    }
  }

  const joinRoom = () => {
    const id = joinId.trim()
    if (!id) return
    router.push(`/room/${id}`)
  }

  const deleteRoom = async (roomId: string, e: React.MouseEvent) => {
    e.stopPropagation()
    if (confirmDeleteId !== roomId) {
      setConfirmDeleteId(roomId)
      setTimeout(() => setConfirmDeleteId(id => id === roomId ? null : id), 2500)
      return
    }
    setConfirmDeleteId(null)
    setRecentRooms(prev => prev.filter(r => r.id !== roomId))
    await fetch(`/api/rooms/${roomId}`, { method: 'DELETE' }).catch(() => {})
  }

  const containerVariants = {
    hidden: { opacity: 0 },
    visible: { opacity: 1, transition: { staggerChildren: 0.08, delayChildren: 0.1 } },
  }

  const itemVariants = {
    hidden: { opacity: 0, y: 20 },
    visible: { opacity: 1, y: 0, transition: { type: 'spring', stiffness: 280, damping: 25 } },
  }

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4 relative overflow-hidden">
      {/* Forest ambient glows */}
      <div className="absolute inset-0 pointer-events-none">
        <div className="absolute top-1/4 left-1/3 w-[500px] h-[500px] rounded-full opacity-[0.06] blur-[130px]"
          style={{ background: 'radial-gradient(circle, #5a8a3a, transparent)' }} />
        <div className="absolute bottom-1/3 right-1/4 w-[350px] h-[350px] rounded-full opacity-[0.05] blur-[100px]"
          style={{ background: 'radial-gradient(circle, #8b6914, transparent)' }} />
        <div className="absolute top-2/3 left-1/5 w-[250px] h-[250px] rounded-full opacity-[0.04] blur-[80px]"
          style={{ background: 'radial-gradient(circle, #3d6b2a, transparent)' }} />
      </div>

      {/* Organic noise texture overlay */}
      <div
        className="absolute inset-0 pointer-events-none opacity-[0.035]"
        style={{
          backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='200' height='200'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.55' numOctaves='3' stitchTiles='stitch'/%3E%3CfeColorMatrix type='saturate' values='0'/%3E%3C/filter%3E%3Crect width='200' height='200' filter='url(%23n)'/%3E%3C/svg%3E")`,
          backgroundSize: '200px 200px',
        }}
      />

      <motion.div
        variants={containerVariants}
        initial="hidden"
        animate="visible"
        className="relative z-10 w-full max-w-md"
      >
        {/* Logo / Title */}
        <motion.div variants={itemVariants} className="text-center mb-10">
          <h1 className="text-3xl font-bold tracking-tight mb-2" style={{ color: 'rgba(200, 210, 180, 0.9)' }}>SketchTogether</h1>
          <p className="text-sm" style={{ color: 'rgba(160, 175, 140, 0.5)' }}>Draw together, in the moment</p>
        </motion.div>

        {/* Main card */}
        <motion.div
          variants={itemVariants}
          className="glass-panel rounded-2xl p-6 shadow-2xl mb-4"
          style={{ perspective: 1000 }}
        >
          {/* Create room */}
          <motion.button
            whileHover={{ scale: 1.01, y: -1 }}
            whileTap={{ scale: 0.99 }}
            onClick={createRoom}
            disabled={isCreating}
            className="
              w-full flex items-center justify-center gap-3
              py-3.5 px-5 rounded-xl mb-4
              bg-primary/20 hover:bg-primary/30 border border-primary/30
              text-white font-medium text-sm
              transition-colors disabled:opacity-60 shadow-lg
            "
          >
            <Plus className="h-4 w-4" />
            {isCreating ? 'Creating canvas…' : 'New Canvas'}
          </motion.button>

          <div className="flex items-center gap-3 mb-4">
            <div className="flex-1 h-px bg-white/8" />
            <span className="text-xs text-white/30">or join with link</span>
            <div className="flex-1 h-px bg-white/8" />
          </div>

          {/* Join room */}
          <div className="flex gap-2">
            <input
              type="text"
              value={joinId}
              onChange={(e) => setJoinId(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && joinRoom()}
              placeholder="Paste room ID or link…"
              className="
                flex-1 px-3 py-2.5 rounded-xl text-sm
                bg-white/5 border border-white/8 text-white/80
                placeholder:text-white/25 outline-none
                focus:border-white/20 focus:bg-white/8 transition-colors
              "
            />
            <motion.button
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
              onClick={joinRoom}
              disabled={!joinId.trim()}
              className="
                p-2.5 rounded-xl bg-white/8 hover:bg-white/12 border border-white/10
                text-white/70 hover:text-white transition-colors disabled:opacity-40
              "
            >
              <ArrowRight className="h-4 w-4" />
            </motion.button>
          </div>
        </motion.div>

        {/* Recent rooms */}
        {recentRooms.length > 0 && (
          <motion.div variants={itemVariants} className="glass rounded-2xl p-4">
            <p className="text-xs text-white/35 uppercase tracking-wider mb-3 px-1">Recent</p>
            <div className="flex flex-col gap-1">
              {recentRooms.slice(0, 5).map((room) => (
                <div key={room.id} className="relative group flex items-center">
                  <motion.button
                    whileHover={{ x: 2 }}
                    onClick={() => router.push(`/room/${room.id}`)}
                    className="flex-1 flex items-center justify-between px-3 py-2.5 rounded-xl hover:bg-white/6 transition-colors text-left"
                  >
                    <div className="flex items-center gap-2.5 min-w-0">
                      <div className="w-6 h-6 rounded-lg bg-primary/15 flex items-center justify-center flex-shrink-0">
                        <div className="w-2 h-2 rounded-sm bg-primary/60" />
                      </div>
                      <span className="text-sm text-white/65 group-hover:text-white/85 truncate transition-colors">
                        {room.name}
                      </span>
                    </div>
                    <div className="flex items-center gap-1.5 flex-shrink-0 ml-2 mr-6">
                      <Clock className="h-3 w-3 text-white/25" />
                      <span className="text-xs text-white/30">{timeAgo(room.updatedAt)}</span>
                    </div>
                  </motion.button>

                  {/* Delete button */}
                  <AnimatePresence>
                    <motion.button
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      onClick={(e) => deleteRoom(room.id, e)}
                      title={confirmDeleteId === room.id ? 'Click again to confirm delete' : 'Delete canvas'}
                      className={`
                        absolute right-1 p-1.5 rounded-lg transition-colors
                        opacity-0 group-hover:opacity-100
                        ${confirmDeleteId === room.id
                          ? 'bg-red-500/20 text-red-400 hover:bg-red-500/30 opacity-100'
                          : 'hover:bg-white/8 text-white/30 hover:text-red-400'}
                      `}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </motion.button>
                  </AnimatePresence>
                </div>
              ))}
            </div>
          </motion.div>
        )}
      </motion.div>
    </div>
  )
}
