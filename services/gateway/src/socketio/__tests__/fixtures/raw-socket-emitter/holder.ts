// Fixture du balayage — le `Socket` NU détenu pour ÉMETTRE, dans les DEUX
// formes d'import. La seconde (valeur) est celle du site réel (#18655) : un
// discriminant recopié de `Server`, qui n'accepte que `import type`, l'aurait
// manquée.
import type { Socket } from 'socket.io';
import { Socket as BareSocket } from 'socket.io';

export function refuse(socket: Socket): void {
  socket.emit('call:error', { code: 'RATE_LIMIT_EXCEEDED' });
}

export function refuseAliased(socket: BareSocket): void {
  socket.emit('whatever:invented', { anything: true });
}
