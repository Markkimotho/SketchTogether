import fs from 'fs'
import path from 'path'
import Database from 'better-sqlite3'

// Ensure the DB tables exist: apply migration SQL only if the Room table is missing.
// Checks sqlite_master directly so unrelated failures (broken install, bad client)
// surface as themselves instead of triggering a re-run of the migration DDL.
export function bootstrapDb(dbPath: string, migrationDir: string): string[] {
  const db = new Database(dbPath)
  try {
    const hasRoom = db
      .prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'Room'")
      .get()
    if (hasRoom) return []

    const applied: string[] = []
    const migrations = fs.readdirSync(migrationDir)
      .filter(d => fs.statSync(path.join(migrationDir, d)).isDirectory())
      .sort()
    for (const dir of migrations) {
      const sqlFile = path.join(migrationDir, dir, 'migration.sql')
      if (fs.existsSync(sqlFile)) {
        db.exec(fs.readFileSync(sqlFile, 'utf8'))
        applied.push(dir)
      }
    }
    return applied
  } finally {
    db.close()
  }
}
