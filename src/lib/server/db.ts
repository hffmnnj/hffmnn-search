import { mkdirSync } from 'fs';
import { join } from 'path';
import { homedir } from 'os';

const DATA_DIR = join(homedir(), '.local', 'share', 'hffmnn-search');
mkdirSync(DATA_DIR, { recursive: true });

// Lazy-load bun:sqlite at runtime — Vite can't analyze this import
let db: any = null;
function getDb() {
  if (!db) {
    // @ts-ignore — runtime-only import for Bun
    const { Database } = require('bun:sqlite');
    db = new Database(join(DATA_DIR, 'search.db'));
    db.exec(`
      CREATE TABLE IF NOT EXISTS searches (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        query TEXT NOT NULL,
        timestamp INTEGER DEFAULT (unixepoch()),
        result_count INTEGER DEFAULT 0,
        has_summary BOOLEAN DEFAULT 0,
        search_type TEXT DEFAULT 'web' CHECK(search_type IN ('web', 'news', 'images')),
        UNIQUE(query, timestamp)
      );

      CREATE INDEX IF NOT EXISTS idx_searches_timestamp ON searches(timestamp DESC);
      CREATE INDEX IF NOT EXISTS idx_searches_query ON searches(query);

      CREATE TABLE IF NOT EXISTS domain_prefs (
        domain TEXT PRIMARY KEY,
        preference TEXT NOT NULL CHECK(preference IN ('pin', 'block', 'normal')) DEFAULT 'normal',
        updated_at INTEGER DEFAULT (unixepoch())
      );

      CREATE TABLE IF NOT EXISTS clicks (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        search_id INTEGER REFERENCES searches(id) ON DELETE CASCADE,
        url TEXT NOT NULL,
        domain TEXT NOT NULL,
        title TEXT,
        timestamp INTEGER DEFAULT (unixepoch())
      );

      CREATE INDEX IF NOT EXISTS idx_clicks_domain ON clicks(domain);

      CREATE TABLE IF NOT EXISTS settings (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL,
        updated_at INTEGER DEFAULT (unixepoch())
      );

      INSERT OR IGNORE INTO settings (key, value) VALUES
        ('theme', 'system'),
        ('results_per_page', '10'),
        ('safe_search', 'moderate'),
        ('default_freshness', ''),
        ('show_ai_summary', 'true'),
        ('show_news_badge', 'true');
    `);
  }
  return db;
}

export function logSearch(query: string, resultCount: number, type: string = 'web') {
  const stmt = getDb().prepare(`
    INSERT INTO searches (query, result_count, search_type)
    VALUES (?, ?, ?)
  `);
  return stmt.run(query, resultCount, type);
}

export function getSearchHistory(limit: number = 50) {
  const stmt = getDb().prepare(`
    SELECT * FROM searches ORDER BY timestamp DESC LIMIT ?
  `);
  return stmt.all(limit) as SearchRecord[];
}

export function getDomainPrefs(): Record<string, 'pin' | 'block' | 'normal'> {
  const stmt = getDb().prepare('SELECT domain, preference FROM domain_prefs');
  const rows = stmt.all() as { domain: string; preference: string }[];
  const prefs: Record<string, 'pin' | 'block' | 'normal'> = {};
  for (const row of rows) {
    prefs[row.domain] = row.preference as 'pin' | 'block' | 'normal';
  }
  return prefs;
}

export function setDomainPref(domain: string, preference: 'pin' | 'block' | 'normal') {
  const stmt = getDb().prepare(`
    INSERT INTO domain_prefs (domain, preference) VALUES (?, ?)
    ON CONFLICT(domain) DO UPDATE SET preference = excluded.preference, updated_at = unixepoch()
  `);
  return stmt.run(domain, preference);
}

export function getSetting(key: string): string | null {
  const stmt = getDb().prepare('SELECT value FROM settings WHERE key = ?');
  const row = stmt.get(key) as { value: string } | undefined;
  return row?.value ?? null;
}

export function setSetting(key: string, value: string) {
  const stmt = getDb().prepare(`
    INSERT INTO settings (key, value) VALUES (?, ?)
    ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = unixepoch()
  `);
  return stmt.run(key, value);
}

export function logClick(searchId: number, url: string, domain: string, title: string) {
  const stmt = getDb().prepare(`
    INSERT INTO clicks (search_id, url, domain, title) VALUES (?, ?, ?, ?)
  `);
  return stmt.run(searchId, url, domain, title);
}

interface SearchRecord {
  id: number;
  query: string;
  timestamp: number;
  result_count: number;
  has_summary: boolean;
  search_type: string;
}
