import type { DocumentStore } from "./DocumentStore";

export class DocumentSession {
  constructor(
    private store: DocumentStore,
    private docId: string,
  ) {}

  /** Load the document, creating an empty one if the id is new. */
  join(): { content: string; title: string } {
    const rec = this.store.load(this.docId) ?? this.store.create(this.docId);
    return { content: rec.content, title: rec.title };
  }

  save(content: string): void {
    this.store.saveContent(this.docId, content);
  }

  setTitle(title: string): void {
    this.store.saveTitle(this.docId, title);
  }
}
