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
        search_type TEXT DEFAULT 'web' CHECK(search_type IN ('web', 'news', 'images'))
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

      -- ─── News tables ────────────────────────────────────────────────────
      CREATE TABLE IF NOT EXISTS news_batches (
        id TEXT PRIMARY KEY,
        created_at TEXT,
        total_categories INTEGER,
        total_clusters INTEGER,
        total_articles INTEGER,
        fetched_at INTEGER DEFAULT (unixepoch())
      );

      CREATE TABLE IF NOT EXISTS news_stories (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        batch_id TEXT REFERENCES news_batches(id),
        story_id TEXT NOT NULL,
        category_id TEXT,
        category_name TEXT,
        title TEXT NOT NULL,
        short_summary TEXT,
        talking_points TEXT,
        quote TEXT,
        quote_author TEXT,
        perspectives TEXT,
        international_reactions TEXT,
        business_angle TEXT,
        emoji TEXT,
        articles_json TEXT,
        language TEXT,
        published_at TEXT,
        image_url TEXT,
        image_caption TEXT,
        embedding TEXT,
        fetched_at INTEGER DEFAULT (unixepoch())
      );

      CREATE INDEX IF NOT EXISTS idx_news_stories_batch ON news_stories(batch_id);
      CREATE INDEX IF NOT EXISTS idx_news_stories_story ON news_stories(story_id);
      CREATE INDEX IF NOT EXISTS idx_news_stories_category ON news_stories(category_name);
      CREATE INDEX IF NOT EXISTS idx_news_stories_fetched ON news_stories(fetched_at DESC);
    `);
  }
  return db;
}

export function logSearch(query: string, resultCount: number, type: string = 'web') {
  try {
    const stmt = getDb().prepare(`
      INSERT INTO searches (query, result_count, search_type)
      VALUES (?, ?, ?)
    `);
    return stmt.run(query, resultCount, type);
  } catch (e) {
    // Ignore duplicate timestamp collisions (old schema with UNIQUE constraint)
    return null;
  }
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

// ─── News helpers ─────────────────────────────────────────────────────────────────

export function saveNewsBatch(batch: any) {
  const stmt = getDb().prepare(`
    INSERT OR IGNORE INTO news_batches (id, created_at, total_categories, total_clusters, total_articles)
    VALUES (?, ?, ?, ?, ?)
  `);
  return stmt.run(batch.id, batch.createdAt, batch.totalCategories || 0, batch.totalClusters || 0, batch.totalArticles || 0);
}

export function batchExists(batchId: string): boolean {
  const stmt = getDb().prepare('SELECT 1 FROM news_batches WHERE id = ?');
  return !!stmt.get(batchId);
}

export function saveNewsStory(story: any) {
  const stmt = getDb().prepare(`
    INSERT OR IGNORE INTO news_stories
    (batch_id, story_id, category_id, category_name, title, short_summary, talking_points,
     quote, quote_author, perspectives, international_reactions, business_angle, emoji,
     articles_json, language, published_at, image_url, image_caption, embedding)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  return stmt.run(
    story.batch_id,
    story.story_id,
    story.category_id,
    story.category_name,
    story.title,
    story.short_summary,
    story.talking_points,
    story.quote,
    story.quote_author,
    story.perspectives,
    story.international_reactions,
    story.business_angle,
    story.emoji,
    story.articles_json,
    story.language,
    story.published_at,
    story.image_url,
    story.image_caption,
    story.embedding
  );
}

export function storyExists(storyId: string): boolean {
  const stmt = getDb().prepare('SELECT 1 FROM news_stories WHERE story_id = ?');
  return !!stmt.get(storyId);
}

export function setStoryEmbedding(storyId: string, embedding: string) {
  const stmt = getDb().prepare('UPDATE news_stories SET embedding = ? WHERE story_id = ?');
  return stmt.run(embedding, storyId);
}

export function getStoriesWithoutEmbedding(limit: number = 100) {
  const stmt = getDb().prepare(`
    SELECT * FROM news_stories WHERE embedding IS NULL ORDER BY id LIMIT ?
  `);
  return stmt.all(limit) as any[];
}

export function getLatestNewsStories(limit: number = 50, category?: string, region?: string) {
  let sql = `SELECT * FROM news_stories`;
  const conditions: string[] = [];
  const params: any[] = [];

  if (category) {
    conditions.push('category_name = ?');
    params.push(category);
  }

  if (region === 'us') {
    conditions.push("(category_name LIKE 'USA%' OR category_name IN ('Space', 'NHL', 'NFL', 'NBA', 'Apple', 'Technology', 'Cybersecurity', 'Defense', 'Gaming', 'Climate Change', 'Bay', 'Caribbean'))");
    conditions.push("language = 'en'");
  } else if (region === 'en') {
    conditions.push("language = 'en'");
  }

  if (conditions.length > 0) {
    sql += ' WHERE ' + conditions.join(' AND ');
  }

  sql += ' ORDER BY fetched_at DESC LIMIT ?';
  params.push(limit);

  const stmt = getDb().prepare(sql);
  return stmt.all(...params) as any[];
}

export function getAllEmbeddings() {
  const stmt = getDb().prepare(`
    SELECT story_id, title, short_summary, category_name, embedding FROM news_stories
    WHERE embedding IS NOT NULL
  `);
  return stmt.all() as any[];
}
