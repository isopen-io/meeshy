// Fixture du balayage — la forme EXACTE que le cycle 104 a retirée huit fois.
// Deux occurrences : la porte avec `to(room)` et la porte vers un socket tenu.
export interface LegacyEmitIO {
  to(room: string): { emit(event: string, payload: unknown): unknown };
}

export interface LegacySocket {
  emit(event: string, payload: unknown): unknown;
  disconnect(close?: boolean): unknown;
}
