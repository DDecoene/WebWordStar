import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import Database from "better-sqlite3";

export interface DocRecord {
  title: string;
  content: string;
}

export class DocumentStore {
  private db: Database.Database;

  constructor(path: string) {
    if (path !== ":memory:") mkdirSync(dirname(path), { recursive: true });
    this.db = new Database(path);
    this.db.pragma("journal_mode = WAL");
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS documents (
        id         TEXT PRIMARY KEY,
        title      TEXT NOT NULL DEFAULT 'UNTITLED',
        content    TEXT NOT NULL DEFAULT '',
        updated_at INTEGER NOT NULL
      );
    `);
  }

  load(id: string): DocRecord | null {
    const row = this.db
      .prepare("SELECT title, content FROM documents WHERE id = ?")
      .get(id) as DocRecord | undefined;
    return row ?? null;
  }

  create(id: string): DocRecord {
    this.db
      .prepare("INSERT OR IGNORE INTO documents (id, title, content, updated_at) VALUES (?, 'UNTITLED', '', ?)")
      .run(id, Date.now());
    return { title: "UNTITLED", content: "" };
  }

  saveContent(id: string, content: string): void {
    this.db
      .prepare("UPDATE documents SET content = ?, updated_at = ? WHERE id = ?")
      .run(content, Date.now(), id);
  }

  saveTitle(id: string, title: string): void {
    this.db
      .prepare("UPDATE documents SET title = ?, updated_at = ? WHERE id = ?")
      .run(title, Date.now(), id);
  }

  close(): void {
    this.db.close();
  }
}
