import { createServer } from 'http'
import { parse } from 'url'
import path from 'path'
import next from 'next'
import { Server } from 'socket.io'
import { PrismaClient } from './generated/prisma/client'
import { PrismaBetterSqlite3 } from '@prisma/adapter-better-sqlite3'
import { bootstrapDb as runBootstrap } from './lib/bootstrap-db'
import type { CanvasElement, StrokeData } from './types/canvas'

const dev = process.env.NODE_ENV !== 'production'
const hostname = 'localhost'
const port = parseInt(process.env.PORT || '3000', 10)

const app = next({ dev, hostname, port })
const handle = app.getRequestHandler()

const dbPath = path.resolve(process.cwd(), 'prisma', 'dev.db')
const adapter = new PrismaBetterSqlite3({ url: dbPath })
const prisma = new PrismaClient({ adapter })

// Bootstrap: ensure the DB tables exist (apply migration SQL if tables are missing)
async function bootstrapDb() {
  const migrationDir = path.resolve(process.cwd(), 'prisma', 'migrations')
  for (const dir of runBootstrap(dbPath, migrationDir)) {
    console.log(`Applied migration: ${dir}`)
  }
}

// In-memory cursor state per room
const roomCursors = new Map<string, Map<string, { userName: string; x: number; y: number }>>()

bootstrapDb().then(() => app.prepare()).then(() => {
  const httpServer = createServer((req, res) => {
    const parsedUrl = parse(req.url!, true)
    handle(req, res, parsedUrl)
  })

  const io = new Server(httpServer, {
    cors: { origin: '*' },
    transports: ['websocket', 'polling'],
  })

  io.on('connection', (socket) => {
    socket.on('room:join', async ({ roomId, userName }: { roomId: string; userName: string }) => {
      socket.join(roomId)
      socket.data.roomId = roomId
      socket.data.userName = userName

      if (!roomCursors.has(roomId)) {
        roomCursors.set(roomId, new Map())
      }

      try {
        const room = await prisma.room.findUnique({
          where: { id: roomId },
          include: {
            layers: { orderBy: { order: 'asc' } },
            versions: { orderBy: { createdAt: 'desc' }, take: 20 },
            chatMessages: { orderBy: { createdAt: 'asc' }, take: 50 },
          },
        })

        if (room) {
          socket.emit('room:state', {
            canvasState: room.canvasState,
            layers: room.layers,
            versions: room.versions,
            chat: room.chatMessages,
          })
        }

        const clients = io.sockets.adapter.rooms.get(roomId)
        const userCount = clients ? clients.size : 1
        socket.to(roomId).emit('room:user-joined', { userName, userCount })
        socket.emit('room:user-count', { userCount })
      } catch (err) {
        console.error('Error on room:join:', err)
      }
    })

    // A handwriting draft can contain many strokes. Persist it in one transaction
    // rather than racing a separate read/modify/write operation for each letter.
    socket.on('draw:ink-add', async (
      { roomId, strokes }: { roomId: string; strokes: StrokeData[] },
      acknowledge?: (result: { ok: boolean }) => void,
    ) => {
      const reply = (ok: boolean) => { if (typeof acknowledge === 'function') acknowledge({ ok }) }
      if (!socket.rooms.has(roomId) || !Array.isArray(strokes) || !strokes.length || strokes.length > 1000
        || strokes.some(stroke => !stroke || stroke.type !== 'stroke' || stroke.tool !== 'pen'
          || typeof stroke.id !== 'string' || typeof stroke.layerId !== 'string'
          || typeof stroke.color !== 'string' || !Number.isFinite(stroke.size) || stroke.size <= 0
          || !Array.isArray(stroke.points) || stroke.points.length < 2 || stroke.points.length % 2 !== 0
          || stroke.points.some(value => !Number.isFinite(value)))) {
        reply(false)
        return
      }
      try {
        await prisma.$transaction(async tx => {
          const room = await tx.room.findUnique({ where: { id: roomId }, include: { layers: true } })
          if (!room) throw new Error('Room unavailable')
          if (strokes.some(stroke => !room.layers.some(layer => layer.id === stroke.layerId && layer.visible && !layer.locked))) {
            throw new Error('Layer unavailable')
          }
          const current: CanvasElement[] = JSON.parse(room.canvasState || '[]')
          const combined = Array.from(new Map([...current, ...strokes].map(element => [element.id, element])).values())
          await tx.room.update({ where: { id: roomId }, data: { canvasState: JSON.stringify(combined) } })
        })
        socket.to(roomId).emit('draw:ink-add', { strokes })
        reply(true)
      } catch (error) {
        console.error('Error persisting handwriting:', error)
        reply(false)
      }
    })

    socket.on('draw:stroke-start', ({ roomId, stroke }: { roomId: string; stroke: any }) => {
      socket.to(roomId).emit('draw:stroke-start', { stroke, userId: socket.id })
    })

    socket.on('draw:stroke-update', ({ roomId, strokeId, points, pressures }: { roomId: string; strokeId: string; points: number[]; pressures?: number[] }) => {
      socket.to(roomId).emit('draw:stroke-update', { strokeId, points, pressures, userId: socket.id })
    })

    socket.on('draw:stroke-end', async ({ roomId, stroke }: { roomId: string; stroke: any }) => {
      socket.to(roomId).emit('draw:stroke-end', { strokeId: stroke.id, userId: socket.id })

      try {
        const room = await prisma.room.findUnique({ where: { id: roomId } })
        if (room) {
          const currentState: any[] = JSON.parse(room.canvasState || '[]')
          // Deduplicate: skip if this stroke ID already persisted
          if (!currentState.some((el: any) => el.id === stroke.id)) {
            currentState.push(stroke)
            await prisma.room.update({
              where: { id: roomId },
              data: { canvasState: JSON.stringify(currentState) },
            })
          }
        }
      } catch (err) {
        console.error('Error persisting stroke:', err)
      }
    })

    socket.on('draw:shape-add', async ({ roomId, shape }: { roomId: string; shape: any }) => {
      socket.to(roomId).emit('draw:shape-add', { shape, userId: socket.id })

      try {
        const room = await prisma.room.findUnique({ where: { id: roomId } })
        if (room) {
          const currentState: any[] = JSON.parse(room.canvasState || '[]')
          if (!currentState.some((el: any) => el.id === shape.id)) {
            currentState.push(shape)
            await prisma.room.update({
              where: { id: roomId },
              data: { canvasState: JSON.stringify(currentState) },
            })
          }
        }
      } catch (err) {
        console.error('Error persisting shape:', err)
      }
    })

    socket.on('draw:text-add', async ({ roomId, text }: { roomId: string; text: any }) => {
      socket.to(roomId).emit('draw:text-add', { text, userId: socket.id })
      try {
        const room = await prisma.room.findUnique({ where: { id: roomId } })
        if (room) {
          const currentState: any[] = JSON.parse(room.canvasState || '[]')
          if (!currentState.some((el: any) => el.id === text.id)) {
            currentState.push(text)
            await prisma.room.update({ where: { id: roomId }, data: { canvasState: JSON.stringify(currentState) } })
          }
        }
      } catch (err) { console.error('Error persisting text:', err) }
    })

    socket.on('draw:element-move', async ({ roomId, elementId, offsetX, offsetY }: { roomId: string; elementId: string; offsetX: number; offsetY: number }) => {
      socket.to(roomId).emit('draw:element-move', { elementId, offsetX, offsetY })
      try {
        const room = await prisma.room.findUnique({ where: { id: roomId } })
        if (room) {
          const currentState: any[] = JSON.parse(room.canvasState || '[]')
          const updated = currentState.map((el: any) =>
            el.id === elementId ? { ...el, offsetX, offsetY } : el
          )
          await prisma.room.update({ where: { id: roomId }, data: { canvasState: JSON.stringify(updated) } })
        }
      } catch (err) { console.error('Error persisting element move:', err) }
    })

    socket.on('draw:clear', async ({ roomId, layerId }: { roomId: string; layerId?: string }) => {
      socket.to(roomId).emit('draw:clear', { layerId })

      try {
        const room = await prisma.room.findUnique({ where: { id: roomId } })
        if (room) {
          let currentState = JSON.parse(room.canvasState || '[]')
          currentState = layerId ? currentState.filter((el: any) => el.layerId !== layerId) : []
          await prisma.room.update({
            where: { id: roomId },
            data: { canvasState: JSON.stringify(currentState) },
          })
        }
      } catch (err) {
        console.error('Error clearing canvas:', err)
      }
    })

    socket.on('draw:delete', async ({ roomId, elementIds }: { roomId: string; elementIds: string[] }) => {
      socket.to(roomId).emit('draw:delete', { elementIds })
      try {
        const room = await prisma.room.findUnique({ where: { id: roomId } })
        if (room) {
          const currentState: any[] = JSON.parse(room.canvasState || '[]')
          const filtered = currentState.filter((el: any) => !elementIds.includes(el.id))
          await prisma.room.update({
            where: { id: roomId },
            data: { canvasState: JSON.stringify(filtered) },
          })
        }
      } catch (err) {
        console.error('Error deleting elements:', err)
      }
    })

    socket.on('cursor:move', ({ roomId, x, y, userName }: { roomId: string; x: number; y: number; userName: string }) => {
      if (!roomCursors.has(roomId)) roomCursors.set(roomId, new Map())
      roomCursors.get(roomId)!.set(socket.id, { userName, x, y })
      socket.to(roomId).emit('cursor:positions', {
        cursors: [{ userName, x, y, userId: socket.id }],
      })
    })

    socket.on('layer:add', async ({ roomId, layer }: { roomId: string; layer: any }) => {
      try {
        await prisma.layer.create({
          data: {
            id: layer.id,
            roomId,
            name: layer.name,
            locked: layer.locked ?? false,
            visible: layer.visible ?? true,
            order: layer.order ?? 0,
          },
        })
        const layers = await prisma.layer.findMany({ where: { roomId }, orderBy: { order: 'asc' } })
        io.to(roomId).emit('layer:updated', { layers })
      } catch (err) {
        console.error('Error adding layer:', err)
      }
    })

    socket.on('layer:update', async ({ roomId, layer }: { roomId: string; layer: any }) => {
      try {
        await prisma.layer.update({
          where: { id: layer.id },
          data: { name: layer.name, locked: layer.locked, visible: layer.visible },
        })
        const layers = await prisma.layer.findMany({ where: { roomId }, orderBy: { order: 'asc' } })
        io.to(roomId).emit('layer:updated', { layers })
      } catch (err) {
        console.error('Error updating layer:', err)
      }
    })

    socket.on('layer:delete', async ({ roomId, layerId }: { roomId: string; layerId: string }) => {
      try {
        await prisma.layer.delete({ where: { id: layerId } })
        const layers = await prisma.layer.findMany({ where: { roomId }, orderBy: { order: 'asc' } })
        io.to(roomId).emit('layer:updated', { layers })
      } catch (err) {
        console.error('Error deleting layer:', err)
      }
    })

    socket.on('version:save', async ({ roomId, label }: { roomId: string; label: string }) => {
      try {
        const room = await prisma.room.findUnique({ where: { id: roomId } })
        if (room) {
          const version = await prisma.version.create({
            data: { roomId, label, canvasState: room.canvasState },
          })
          io.to(roomId).emit('version:saved', { version })
        }
      } catch (err) {
        console.error('Error saving version:', err)
      }
    })

    socket.on('version:revert', async ({ roomId, versionId }: { roomId: string; versionId: string }) => {
      try {
        const version = await prisma.version.findUnique({ where: { id: versionId } })
        if (version) {
          await prisma.room.update({
            where: { id: roomId },
            data: { canvasState: version.canvasState },
          })
          io.to(roomId).emit('version:reverted', {
            canvasState: version.canvasState,
            versionId,
          })
        }
      } catch (err) {
        console.error('Error reverting version:', err)
      }
    })

    socket.on('chat:send', async ({ roomId, text, author }: { roomId: string; text: string; author: string }) => {
      try {
        const message = await prisma.chatMessage.create({
          data: { roomId, text, author },
        })
        io.to(roomId).emit('chat:message', {
          id: message.id,
          author: message.author,
          text: message.text,
          createdAt: message.createdAt,
        })
      } catch (err) {
        console.error('Error sending chat:', err)
      }
    })

    socket.on('disconnect', () => {
      const { roomId, userName } = socket.data
      if (roomId) {
        const cursors = roomCursors.get(roomId)
        if (cursors) cursors.delete(socket.id)
        const clients = io.sockets.adapter.rooms.get(roomId)
        const userCount = clients ? clients.size : 0
        socket.to(roomId).emit('room:user-left', { userName, userCount })
      }
    })
  })

  httpServer.once('error', (err) => {
    console.error(err)
    process.exit(1)
  })

  httpServer.listen(port, () => {
    console.log(`> Ready on http://${hostname}:${port}`)
  })
})
