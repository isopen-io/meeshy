/**
 * CallEventsHandler — symétrie du contrat d'événements (audit appels
 * 2026-07-11 #6 / reco #2).
 *
 * Chaque événement enregistré via `socket.on('...')` en literal string DOIT
 * exister dans le contrat partagé (`CALL_EVENTS`, `CLIENT_EVENTS` ou
 * `SERVER_EVENTS` de @meeshy/shared) — un literal hors contrat dérive en
 * silence : le client émet un nom que personne n'écoute (ou l'inverse) et
 * aucun compilateur ne le voit. `call:check-active` a déjà glissé sous le
 * sweep rate-limit 2026-07-03 précisément parce qu'il était enregistré en
 * literal.
 *
 * Garde source-scan volontaire : le typage Socket.IO du gateway n'est pas
 * assez strict pour attraper ça à la compilation (handlers enregistrés sur
 * un `Socket` non paramétré par ClientToServerEvents).
 */

import { describe, it, expect } from '@jest/globals';
import { readFileSync } from 'fs';
import { join } from 'path';
import { CALL_EVENTS } from '@meeshy/shared/types/video-call';
import { CLIENT_EVENTS, SERVER_EVENTS } from '@meeshy/shared/types/socketio-events';

const SOCKET_IO_BUILTINS = new Set(['disconnect', 'disconnecting', 'error']);

const sharedContract = new Set<string>([
  ...Object.values(CALL_EVENTS),
  ...Object.values(CLIENT_EVENTS),
  ...Object.values(SERVER_EVENTS),
]);

function literalRegistrations(source: string): string[] {
  return [...source.matchAll(/socket\.on\(\s*(['"])([^'"]+)\1/g)].map((m) => m[2]);
}

describe('CallEventsHandler event contract symmetry', () => {
  const source = readFileSync(
    join(__dirname, '../../../socketio/CallEventsHandler.ts'),
    'utf-8'
  );

  it('registers every literal socket.on event name from the shared contract', () => {
    const literals = literalRegistrations(source);
    expect(literals.length).toBeGreaterThan(0);

    const offContract = literals.filter(
      (name) => !SOCKET_IO_BUILTINS.has(name) && !sharedContract.has(name)
    );

    expect(offContract).toEqual([]);
  });
});
