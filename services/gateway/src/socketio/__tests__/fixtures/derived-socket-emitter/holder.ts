// Fixture du balayage — un fichier qui ÉMET le fait par la porte DÉRIVÉE, et
// n'y déclare aucun `Socket` nu : dans un fichier qui émet, c'est le socket
// GOUVERNÉ qu'on manipule de bout en bout.
import type { Socket } from 'socket.io';

export type MeeshySocket = Socket<Record<string, never>, { 'message:new': (p: { id: string }) => void }>;

export function announce(socket: MeeshySocket, id: string): void {
  socket.emit('message:new', { id });
}
