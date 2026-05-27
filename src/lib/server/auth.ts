import { randomBytes } from 'crypto';
import Database from 'better-sqlite3';
import { join } from 'path';
import { homedir } from 'os';

const DATA_DIR = join(homedir(), '.local', 'share', 'hffmnn-search');

let db: Database | null = null;
function getDb(): Database {
  if (!db) {
    db = new Database(join(DATA_DIR, 'search.db'));
    initAuthSchema(db);
  }
  return db;
}

function initAuthSchema(db: Database) {
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
  ).get(code) as any;

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
  ).get(token) as any;

  if (!row) return { valid: false };
  return { valid: true, session: row };
}

export function deleteSession(token: string): boolean {
  const db = getDb();
  const result = db.prepare("DELETE FROM sessions WHERE token = ?").run(token);
  return result.changes > 0;
}

export function isTrustedIp(ip: string): boolean {
	if (!ip) return false;
	if (ip === '127.0.0.1' || ip === '::1') return false;

	const parts = ip.split('.').map(Number);
	if (parts.length !== 4 || parts.some(isNaN)) return false;

	const [a, b] = parts;
	// Tailscale 100.64.0.0/10 ONLY
	if (a === 100 && b >= 64 && b <= 127) return true;

	return false;
}

export function isCodeUsed(code: string): boolean {
  const db = getDb();
  const row = db.prepare("SELECT used FROM pairing_codes WHERE code = ?").get(code) as any;
  return row?.used === 1;
}
