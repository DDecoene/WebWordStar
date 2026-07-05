// This file is part of WebWordStar, an independent reimplementation of the
// WordStar keyboard interface. Copyright (C) 2026 Dennis Decoene.
// SPDX-License-Identifier: AGPL-3.0-only (see LICENSE)

import type { DocumentStore } from "./DocumentStore";
import type { Peer, Position, SnapshotMessage } from "../src/shared/types";
import { getText } from "../src/shared/document";
import { DocumentSession } from "./DocumentSession";
import { randomUUID } from "node:crypto";

const PEER_COLORS = ["#ffb000", "#33ff33", "#00c7c7", "#ff6ec7", "#8888ff", "#ff5533"];

/** A connection abstraction: anything that can receive a serialized message. */
export interface Connection {
  send(data: string): void;
}

interface DocRoom {
  session: DocumentSession;
  peers: Map<Connection, Peer>;
  nextUserNumber: number;
}

/**
 * Tracks connections per document: one shared DocumentSession per open doc,
 * peer identity assignment (USER n + color), fan-out, and cleanup (flush +
 * drop the session when the last connection leaves).
 */
export class SessionManager {
  private rooms = new Map<string, DocRoom>();
  private byConnection = new Map<Connection, string>();

  constructor(private store: DocumentStore) {}

  /** Join `conn` to a document, assigning identity. Returns the snapshot to send. */
  join(conn: Connection, docId: string): SnapshotMessage {
    this.leave(conn); // a connection views one document at a time
    let room = this.rooms.get(docId);
    if (!room) {
      room = { session: new DocumentSession(this.store, docId), peers: new Map(), nextUserNumber: 1 };
      this.rooms.set(docId, room);
    }
    const n = room.nextUserNumber++;
    const peer: Peer = {
      id: randomUUID(),
      name: `USER ${n}`,
      color: PEER_COLORS[(n - 1) % PEER_COLORS.length]!,
      cursor: null,
    };
    room.peers.set(conn, peer);
    this.byConnection.set(conn, docId);
    return this.snapshotFor(docId, conn)!;
  }

  /** The session for the document `conn` has joined, or null. */
  sessionFor(conn: Connection): DocumentSession | null {
    const room = this.roomFor(conn);
    return room ? room.session : null;
  }

  /** The peer identity of `conn`, or null. */
  peerFor(conn: Connection): Peer | null {
    return this.roomFor(conn)?.peers.get(conn) ?? null;
  }

  /** A fresh snapshot for `conn`'s current document (join and resync). */
  snapshotFor(docId: string, conn: Connection): SnapshotMessage | null {
    const room = this.rooms.get(docId);
    const self = room?.peers.get(conn);
    if (!room || !self) return null;
    return {
      type: "snapshot",
      docId,
      revision: room.session.revision,
      content: getText(room.session.document),
      title: room.session.title,
      selfId: self.id,
      selfName: self.name,
      selfColor: self.color,
      peers: this.peerList(room, conn),
    };
  }

  updateCursor(conn: Connection, cursor: Position): void {
    const peer = this.peerFor(conn);
    if (peer) peer.cursor = cursor;
  }

  /** Send `data` to every connection on the document, optionally skipping one. */
  broadcast(docId: string, data: string, except?: Connection): void {
    const room = this.rooms.get(docId);
    if (!room) return;
    for (const conn of room.peers.keys()) {
      if (conn !== except) conn.send(data);
    }
  }

  /** Broadcast the peer list to everyone (each recipient's own entry excluded). */
  broadcastPresence(docId: string): void {
    const room = this.rooms.get(docId);
    if (!room) return;
    for (const conn of room.peers.keys()) {
      conn.send(JSON.stringify({ type: "presence", docId, peers: this.peerList(room, conn) }));
    }
  }

  /** Remove `conn`; flush and drop the session when the room empties. */
  leave(conn: Connection): void {
    const docId = this.byConnection.get(conn);
    if (!docId) return;
    this.byConnection.delete(conn);
    const room = this.rooms.get(docId);
    if (!room) return;
    room.peers.delete(conn);
    if (room.peers.size === 0) {
      room.session.flush();
      this.rooms.delete(docId);
    } else {
      this.broadcastPresence(docId);
    }
  }

  /** Documents that currently have at least one connection. */
  activeDocIds(): Set<string> {
    return new Set(this.rooms.keys());
  }

  private roomFor(conn: Connection): DocRoom | null {
    const docId = this.byConnection.get(conn);
    return docId ? (this.rooms.get(docId) ?? null) : null;
  }

  private peerList(room: DocRoom, exclude: Connection): Peer[] {
    const out: Peer[] = [];
    for (const [conn, peer] of room.peers) {
      if (conn !== exclude) out.push(peer);
    }
    return out;
  }
}
