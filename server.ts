import { createServer } from 'http'
import { parse } from 'url'
import path from 'path'
import next from 'next'
import { Server } from 'socket.io'
import { PrismaClient } from './generated/prisma/client'
import { PrismaBetterSqlite3 } from '@prisma/adapter-better-sqlite3'
import { bootstrapDb as runBootstrap } from './lib/bootstrap-db'
import type { CanvasElement, StrokeData } from './types/canvas'
import { applyCanvasEdit, RoomMutationQueue, type CanvasEdit, type EditReply } from './lib/canvas-edits'

const dev = process.env.NODE_ENV !== 'production'
const hostname = 'localhost'
const port = parseInt(process.env.PORT || '3000', 10)

const app = next({ dev, hostname, port })
const handle = app.getRequestHandler()

const dbPath = path.resolve(process.cwd(), 'prisma', 'dev.db')
const adapter = new PrismaBetterSqlite3({ url: dbPath })
const prisma = new PrismaClient({ adapter })
const canvasMutations = new RoomMutationQueue()

function editCanvas(roomId: string, edit: CanvasEdit) {
  return canvasMutations.run(roomId, () => prisma.$transaction(async tx => {
    const room = await tx.room.findUnique({ where: { id: roomId }, include: { layers: true } })
    if (!room) throw new Error('Room unavailable')
    const result = applyCanvasEdit(JSON.parse(room.canvasState || '[]'), room.layers, edit)
    await tx.room.update({ where: { id: roomId }, data: { canvasState: JSON.stringify(result.elements) } })
    return result.delta
  }))
}

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

    const commitEdit = async (roomId: string, edit: CanvasEdit, acknowledge?: (result: EditReply) => void) => {
      const reply = (result: EditReply) => { if (typeof acknowledge === 'function') acknowledge(result) }
      if (!socket.rooms.has(roomId)) { reply({ ok: false, error: 'Join the room before editing' }); return }
      try {
        const delta = await editCanvas(roomId, edit)
        io.to(roomId).emit('canvas:edited', { delta })
        reply({ ok: true, delta })
      } catch (error) {
        reply({ ok: false, error: error instanceof Error ? error.message : 'Could not save the edit' })
      }
    }
    socket.on('canvas:edit', ({ roomId, edit }: { roomId: string; edit: CanvasEdit }, acknowledge) => {
      void commitEdit(roomId, edit, acknowledge)
    })
    // Keep older drawing clients compatible with the same serialized save path.
    socket.on('draw:ink-add', ({ roomId, strokes }: { roomId: string; strokes: StrokeData[] }, acknowledge) => {
      void commitEdit(roomId, { add: strokes }, acknowledge)
    })
    socket.on('draw:stroke-start', ({ roomId, stroke }) => {
      if (socket.rooms.has(roomId)) socket.to(roomId).emit('draw:stroke-start', { stroke, userId: socket.id })
    })
    socket.on('draw:stroke-update', ({ roomId, strokeId, points, pressures }) => {
      if (socket.rooms.has(roomId)) socket.to(roomId).emit('draw:stroke-update', { strokeId, points, pressures, userId: socket.id })
    })
    socket.on('draw:stroke-end', ({ roomId, stroke }, acknowledge) => {
      void commitEdit(roomId, { add: [stroke] }, acknowledge)
    })
    socket.on('draw:shape-add', ({ roomId, shape }, acknowledge) => {
      void commitEdit(roomId, { add: [shape] }, acknowledge)
    })
    socket.on('draw:text-add', ({ roomId, text }, acknowledge) => {
      void commitEdit(roomId, { add: [text] }, acknowledge)
    })
    socket.on('draw:element-move', async ({ roomId, elementId, offsetX, offsetY }) => {
      if (!socket.rooms.has(roomId) || ![offsetX, offsetY].every(Number.isFinite)) return
      try {
        await canvasMutations.run(roomId, () => prisma.$transaction(async tx => {
          const room = await tx.room.findUnique({ where: { id: roomId }, include: { layers: true } })
          if (!room) return
          const state: CanvasElement[] = JSON.parse(room.canvasState || '[]')
          const element = state.find(element => element.id === elementId)
          if (!element || !room.layers.some(layer => layer.id === element.layerId && layer.visible && !layer.locked)) return
          await tx.room.update({ where: { id: roomId }, data: { canvasState: JSON.stringify(state.map(element =>
            element.id === elementId ? { ...element, offsetX, offsetY } : element)) } })
          socket.to(roomId).emit('draw:element-move', { elementId, offsetX, offsetY })
        }))
      } catch (error) { console.error('Error moving element:', error) }
    })
    socket.on('draw:clear', ({ roomId, layerId }, acknowledge) => {
      void commitEdit(roomId, { clear: true, layerId }, acknowledge)
    })
    socket.on('draw:delete', ({ roomId, elementIds }, acknowledge) => {
      void commitEdit(roomId, { deleteIds: elementIds }, acknowledge)
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

    socket.on('layer:delete', async ({ roomId, layerId }: { roomId: string; layerId: string }, acknowledge) => {
      const reply = (result: EditReply) => { if (typeof acknowledge === 'function') acknowledge(result) }
      if (!socket.rooms.has(roomId)) { reply({ ok: false, error: 'Join the room before editing' }); return }
      try {
        const result = await canvasMutations.run(roomId, () => prisma.$transaction(async tx => {
          const room = await tx.room.findUnique({ where: { id: roomId }, include: { layers: true } })
          const layer = room?.layers.find(layer => layer.id === layerId)
          if (!room || !layer) throw new Error('Layer unavailable')
          if (room.layers.length <= 1) throw new Error('Keep at least one layer')
          if (layer.locked) throw new Error('Unlock the layer before deleting it')
          const current: CanvasElement[] = JSON.parse(room.canvasState || '[]')
          const removed = current.filter(element => element.layerId === layerId)
          await tx.layer.delete({ where: { id: layerId } })
          await tx.room.update({ where: { id: roomId }, data: { canvasState: JSON.stringify(current.filter(element => element.layerId !== layerId)) } })
          return { delta: { removed, added: [] }, layers: room.layers.filter(layer => layer.id !== layerId).sort((a, b) => a.order - b.order) }
        }))
        io.to(roomId).emit('canvas:edited', { delta: result.delta })
        io.to(roomId).emit('layer:updated', { layers: result.layers })
        reply({ ok: true, delta: result.delta })
      } catch (error) { reply({ ok: false, error: error instanceof Error ? error.message : 'Could not delete the layer' }) }
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
