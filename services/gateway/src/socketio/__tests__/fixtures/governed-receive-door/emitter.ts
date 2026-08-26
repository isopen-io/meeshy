// Fixture — un service qui importe le `Server` NU pour ÉMETTRE seulement.
// La porte de RÉCEPTION ne le concerne pas : il n'enregistre aucun listener.
import type { Server as SocketIOServer } from 'socket.io';

export function broadcast(io: SocketIOServer): void {
  io.to('room').emit('message:new', {});
}
