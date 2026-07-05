import type { DocumentStore } from "./DocumentStore";
import type { EditIntent, TextDocument } from "../src/shared/types";
import { applyIntent, createDocument, getText } from "../src/shared/document";
import { transformIntents } from "../src/shared/transform";

const DEFAULT_OP_WINDOW = 500;
const PERSIST_DEBOUNCE_MS = 500;

/**
 * The per-document authority: holds the canonical document and revision,
 * serializes client intents (transforming stale positions past intervening
 * ops), persists with a debounce, and keeps a bounded op log for transforms.
 * One instance is shared by every connection viewing the document.
 */
export class DocumentSession {
  document: TextDocument;
  revision = 0;
  title: string;

  private opLog: { revision: number; intents: EditIntent[]; sourceId: string }[] = [];
  private persistTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(
    private store: DocumentStore,
    private docId: string,
    private opWindow = DEFAULT_OP_WINDOW,
  ) {
    const rec = store.load(docId) ?? store.create(docId);
    this.document = createDocument(rec.content);
    this.title = rec.title;
  }

  /**
   * Transform `intents` past every op since `baseRevision` — except the
   * sender's own in-flight ops, whose effect the client had already applied
   * optimistically when it positioned this intent — then apply the batch
   * atomically, bump the revision, and schedule persistence. Returns the
   * transformed intents (what peers must apply), or null when the baseRevision
   * has fallen out of the op window or any intent fails to apply — in either
   * case the document is untouched and the client should resync.
   */
  applyClientIntents(
    baseRevision: number,
    intents: EditIntent[],
    sourceId: string,
  ): { revision: number; intents: EditIntent[] } | null {
    if (baseRevision > this.revision) return null;
    const missed = this.opLog.filter((op) => op.revision > baseRevision);
    if (missed.length > 0 && missed[0]!.revision !== baseRevision + 1) return null; // window miss
    if (missed.length === 0 && baseRevision !== this.revision) return null; // window miss (log emptied)

    const transformed = transformIntents(
      intents,
      missed.filter((op) => op.sourceId !== sourceId).flatMap((op) => op.intents),
    );

    // All-or-nothing: apply to a scratch document first.
    let scratch = this.document;
    try {
      for (const intent of transformed) scratch = applyIntent(scratch, intent);
    } catch {
      return null;
    }

    this.document = scratch;
    this.revision++;
    this.opLog.push({ revision: this.revision, intents: transformed, sourceId });
    if (this.opLog.length > this.opWindow) this.opLog.splice(0, this.opLog.length - this.opWindow);
    this.schedulePersist();
    return { revision: this.revision, intents: transformed };
  }

  setTitle(title: string): void {
    this.title = title;
    this.store.saveTitle(this.docId, title);
  }

  /** Persist immediately (used on last-connection close and in tests). */
  flush(): void {
    if (this.persistTimer) {
      clearTimeout(this.persistTimer);
      this.persistTimer = null;
    }
    this.store.saveContent(this.docId, getText(this.document));
  }

  private schedulePersist(): void {
    if (this.persistTimer) clearTimeout(this.persistTimer);
    this.persistTimer = setTimeout(() => {
      this.persistTimer = null;
      this.store.saveContent(this.docId, getText(this.document));
    }, PERSIST_DEBOUNCE_MS);
  }
}
