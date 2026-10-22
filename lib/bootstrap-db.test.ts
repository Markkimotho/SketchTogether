import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'fs'
import os from 'os'
import path from 'path'
import Database from 'better-sqlite3'
import { bootstrapDb } from './bootstrap-db'

const migrationDir = path.resolve(__dirname, '..', 'prisma', 'migrations')

function tmpDbPath() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'bootstrap-db-'))
  return path.join(dir, 'test.db')
}

function tables(dbPath: string) {
  const db = new Database(dbPath)
  const rows = db.prepare("SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name").all() as { name: string }[]
  db.close()
  return rows.map(r => r.name)
}

test('creates all tables on an empty database', () => {
  const dbPath = tmpDbPath()
  const applied = bootstrapDb(dbPath, migrationDir)
  assert.ok(applied.length > 0)
  assert.deepEqual(tables(dbPath), ['ChatMessage', 'Layer', 'Room', 'Version'])
})

// Regression: the old bootstrap re-ran migration SQL on any Prisma error and
// crashed with `table "Room" already exists` on a populated database.
test('is a no-op on a database that already has tables', () => {
  const dbPath = tmpDbPath()
  bootstrapDb(dbPath, migrationDir)
  const db = new Database(dbPath)
  db.prepare("INSERT INTO Room (id, updatedAt) VALUES ('r1', CURRENT_TIMESTAMP)").run()
  db.close()

  assert.deepEqual(bootstrapDb(dbPath, migrationDir), [])

  const check = new Database(dbPath)
  const { n } = check.prepare('SELECT COUNT(*) AS n FROM Room').get() as { n: number }
  check.close()
  assert.equal(n, 1)
})

test('applies every migration directory in sorted order', () => {
  const dbPath = tmpDbPath()
  const expected = fs.readdirSync(migrationDir)
    .filter(d => fs.statSync(path.join(migrationDir, d)).isDirectory())
    .sort()
  assert.deepEqual(bootstrapDb(dbPath, migrationDir), expected)
})
