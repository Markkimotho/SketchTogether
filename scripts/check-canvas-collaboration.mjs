// Run after npm run build. All test data lives in a disposable workspace.
import assert from 'node:assert/strict'
import { access, mkdtemp, symlink, mkdir, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { createServer } from 'node:net'
import { spawn } from 'node:child_process'
import { io } from 'socket.io-client'
import Database from 'better-sqlite3'

const root = process.cwd()
await access(path.join(root, '.next/BUILD_ID')).catch(() => { throw new Error('Run npm run build before this check') })
const scratch = await mkdtemp(path.join(tmpdir(), 'sketch-canvas-check-'))
const sockets = []
let child, database
const edit = (socket, roomId, edit) => socket.timeout(5000).emitWithAck('canvas:edit', { roomId, edit })
try {
  for (const name of ['.next', 'node_modules', 'package.json', 'next.config.ts', 'tsconfig.json', 'app', 'components', 'lib', 'types', 'public', 'generated']) {
    await symlink(path.join(root, name), path.join(scratch, name))
  }
  await mkdir(path.join(scratch, 'prisma'))
  await symlink(path.join(root, 'prisma/migrations'), path.join(scratch, 'prisma/migrations'))
  const reservation = createServer()
  await new Promise(resolve => reservation.listen(0, '127.0.0.1', resolve))
  const { port } = reservation.address()
  await new Promise(resolve => reservation.close(resolve))
  child = spawn(process.execPath, [path.join(root, 'node_modules/tsx/dist/cli.mjs'), path.join(root, 'server.ts')], {
    cwd: scratch, env: { ...process.env, NODE_ENV: 'production', PORT: String(port) }, stdio: ['ignore', 'pipe', 'pipe'],
  })
  let output = ''
  await new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(output || 'Server startup timed out')), 20000)
    const onData = data => { output += data; if (output.includes('Ready on')) { clearTimeout(timer); resolve() } }
    child.stdout.on('data', onData)
    child.stderr.on('data', onData)
    child.once('exit', () => { clearTimeout(timer); reject(new Error(output)) })
  })
  const base = `http://localhost:${port}`
  const created = await fetch(base + '/api/rooms', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: 'Disposable collaboration check' }) })
  assert.equal(created.status, 200)
  const { roomId } = await created.json()
  database = new Database(path.join(scratch, 'prisma/dev.db'))
  async function join(name) {
    const socket = io(base, { transports: ['websocket'], reconnection: false })
    sockets.push(socket)
    await new Promise((resolve, reject) => { socket.once('connect', resolve); socket.once('connect_error', reject) })
    const state = new Promise(resolve => socket.once('room:state', resolve))
    socket.emit('room:join', { roomId, userName: name })
    return { socket, state: await state }
  }
  const first = await join('Writer')
  const second = await join('Viewer')
  const layerId = first.state.layers[0].id
  const mark = (id, target = layerId) => ({ id, type: 'stroke', tool: 'pen', points: [10, 10, 50, 40], color: '#123456', size: 2, layerId: target })
  const read = () => JSON.parse(database.prepare('SELECT canvasState FROM Room WHERE id = ?').get(roomId).canvasState)
  const result = await edit(first.socket, roomId, { add: [mark('a'), mark('b'), mark('c')] })
  assert.equal(result.ok, true)
  assert.equal(read().length, 3)
  const broadcastPromise = new Promise((resolve, reject) => {
    const timer = setTimeout(() => { second.socket.off('canvas:edited', receive); reject(new Error('Delete broadcast timed out')) }, 5000)
    const receive = value => {
      if (!value.delta.removed.some(element => element.id === 'b')) return
      clearTimeout(timer); second.socket.off('canvas:edited', receive); resolve(value)
    }
    second.socket.on('canvas:edited', receive)
  })
  const deleted = await edit(first.socket, roomId, { deleteIds: ['b'] })
  const broadcast = await broadcastPromise
  assert.equal(deleted.ok, true)
  assert.deepEqual(read().map(element => element.id), ['a', 'c'])
  assert.deepEqual(broadcast.delta.removed.map(element => element.id), ['b'])
  const restored = await edit(first.socket, roomId, { add: deleted.delta.removed })
  assert.equal(restored.ok, true)
  await edit(first.socket, roomId, { add: deleted.delta.removed })
  assert.equal(read().length, 3, 'Retry must not duplicate restored objects')
  await Promise.all([
    edit(first.socket, roomId, { add: [mark('concurrent-1')] }),
    edit(second.socket, roomId, { deleteIds: ['a'] }),
    edit(first.socket, roomId, { add: [mark('concurrent-2')] }),
  ])
  assert.deepEqual(new Set(read().map(element => element.id)), new Set(['b', 'c', 'concurrent-1', 'concurrent-2']))
  database.prepare('INSERT INTO Layer (id, roomId, name, locked, visible, "order") VALUES (?, ?, ?, ?, ?, ?)').run('protected', roomId, 'Protected', 1, 1, 1)
  const current = read()
  current.push(mark('protected-mark', 'protected'))
  database.prepare('UPDATE Room SET canvasState = ? WHERE id = ?').run(JSON.stringify(current), roomId)
  assert.equal((await edit(first.socket, roomId, { clear: true })).ok, true)
  assert.deepEqual(read().map(element => element.id), ['protected-mark'])
  assert.equal((await edit(first.socket, roomId, { add: [mark('blocked', 'protected')] })).ok, false)
  const reloaded = await join('Reloaded')
  assert.deepEqual(JSON.parse(reloaded.state.canvasState).map(element => element.id), ['protected-mark'])
  assert.equal((await first.socket.timeout(5000).emitWithAck('layer:delete', { roomId, layerId: 'protected' })).ok, false)
  database.prepare('UPDATE Layer SET locked = 0 WHERE id = ?').run('protected')
  assert.equal((await first.socket.timeout(5000).emitWithAck('layer:delete', { roomId, layerId: 'protected' })).ok, true)
  assert.equal(read().length, 0, 'Deleting a layer must remove its artwork too')
  assert.equal((await first.socket.timeout(5000).emitWithAck('layer:delete', { roomId, layerId })).ok, false)
  console.log('PASS: two-client deletion, undo restoration, retry deduplication, concurrent edits, protected clear, reload persistence, layer deletion and last-layer protection.')
} finally {
  sockets.forEach(socket => socket.disconnect())
  database?.close()
  if (child && child.exitCode === null) {
    const exited = new Promise(resolve => child.once('exit', resolve))
    child.kill('SIGTERM')
    await exited
  }
  await rm(scratch, { recursive: true, force: true })
}
