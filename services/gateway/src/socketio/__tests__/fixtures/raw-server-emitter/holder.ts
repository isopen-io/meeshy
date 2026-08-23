// Fixture du balayage de la TROISIÈME forme — le `Server` NU pris pour émettre.
//
// Rien n'y est réécrit : c'est tout le propos. Les deux balayages frères
// cherchent une signature `emit` trop libre ; ici il n'y en a aucune, et la
// liberté vient du type de la dépendance lui-même (`DefaultEventsMap`).
import type { Server } from 'socket.io';
import type { Server as SocketIOServer } from 'socket.io';

export class RawHolder {
  constructor(private io: Server) {}

  broadcast(): void {
    this.io.to('room').emit('anything:at:all', { whatever: true });
  }
}

export class AliasedHolder {
  private io: SocketIOServer | null = null;

  broadcast(): void {
    this.io?.to('room').emit('anything:at:all', { whatever: true });
  }
}
