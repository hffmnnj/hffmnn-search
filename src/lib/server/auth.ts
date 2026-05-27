import { randomBytes } from 'crypto';
import { join } from 'path';
import { homedir } from 'os';

const DATA_DIR = join(homedir(), '.local', 'share', 'hffmnn-search');

// Lazy-load bun:sqlite at runtime
let db: any = null;
function getDb() {
  if (!db) {
    // @ts-ignore — runtime-only import for Bun
    const { Database } = require('bun:sqlite');
    db = new Database(join(DATA_DIR, 'search.db'));
    initAuthSchema(db);
  }
  return db;
}

function initAuthSchema(db: any) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS pairing_codes (
      code TEXT PRIMARY KEY,
      created_at INTEGER DEFAULT (unixepoch()),
      expires_at INTEGER DEFAULT (unixepoch() + 300),
      used BOOLEAN DEFAULT 0,
      used_at INTEGER,
      ip TEXT,
      user_agent TEXT
    );

    CREATE TABLE IF NOT EXISTS sessions (
      token TEXT PRIMARY KEY,
      created_at INTEGER DEFAULT (unixepoch()),
      expires_at INTEGER DEFAULT (unixepoch() + 7776000),
      ip TEXT,
      user_agent TEXT,
      paired_code TEXT
    );

    CREATE INDEX IF NOT EXISTS idx_sessions_expires ON sessions(expires_at);
  `);
}

export function generatePairingCode(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = '';
  const bytes = randomBytes(6);
  for (let i = 0; i < 6; i++) {
    code += chars[bytes[i] % chars.length];
  }

  const db = getDb();
  db.prepare("DELETE FROM pairing_codes WHERE expires_at < unixepoch() OR used = 1").run();
  db.prepare("INSERT INTO pairing_codes (code, expires_at) VALUES (?, unixepoch() + 300)").run(code);
  return code;
}

export function validatePairingCode(code: string, ip: string, userAgent: string): { valid: boolean; error?: string } {
  const db = getDb();
  const row = db.prepare(
    "SELECT * FROM pairing_codes WHERE code = ? AND used = 0 AND expires_at > unixepoch()"
  ).get(code);

  if (!row) {
    return { valid: false, error: 'Invalid or expired pairing code' };
  }

  db.prepare("UPDATE pairing_codes SET used = 1, used_at = unixepoch(), ip = ?, user_agent = ? WHERE code = ?")
    .run(ip, userAgent, code);

  return { valid: true };
}

export function createSession(ip: string, userAgent: string, pairedCode?: string): string {
  const token = randomBytes(32).toString('hex');
  const db = getDb();
  db.prepare(
    "INSERT INTO sessions (token, expires_at, ip, user_agent, paired_code) VALUES (?, unixepoch() + 7776000, ?, ?, ?)"
  ).run(token, ip, userAgent, pairedCode || null);
  return token;
}

export function validateSession(token: string): { valid: boolean; session?: any } {
  if (!token) return { valid: false };
  const db = getDb();
  const row = db.prepare(
    "SELECT * FROM sessions WHERE token = ? AND expires_at > unixepoch()"
  ).get(token);

  if (!row) return { valid: false };
  return { valid: true, session: row };
}

export function deleteSession(token: string): boolean {
  const db = getDb();
  const result = db.prepare("DELETE FROM sessions WHERE token = ?").run(token);
  return result.changes > 0;
}

export function isCodeUsed(code: string): boolean {
  const db = getDb();
  const row = db.prepare("SELECT used FROM pairing_codes WHERE code = ?").get(code);
  return row?.used === 1;
}
