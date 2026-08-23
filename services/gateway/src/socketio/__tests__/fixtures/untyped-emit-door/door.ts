// Fixture du balayage — la forme EXACTE que le cycle 104 a retirée huit fois.
// Deux occurrences : la porte avec `to(room)` et la porte vers un socket tenu.
export interface LegacyEmitIO {
  to(room: string): { emit(event: string, payload: unknown): unknown };
}

export interface LegacySocket {
  emit(event: string, payload: unknown): unknown;
  disconnect(close?: boolean): unknown;
}

// Cycle 105 — la porte par ASSERTION DE TYPE, en propriété-flèche. C'est la
// forme qui avait échappé au balayage du cycle 104, sur le chemin de rejeu
// hors ligne (`_drainPendingMessages`).
export function legacyCastDoor(io: { to(room: string): unknown }): void {
  const room = io.to('user:x') as unknown as { emit: (event: string, payload: unknown) => void };
  room.emit('message:new', {});
}
