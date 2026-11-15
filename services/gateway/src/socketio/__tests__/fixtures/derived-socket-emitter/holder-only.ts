// Fixture du balayage — DÉTENIR n'est pas ÉMETTRE. Trois fichiers de production
// déclarent le `Socket` nu pour lire des rooms ou résoudre un utilisateur, et
// n'émettent jamais : ils sortent par CONSTRUCTION, pas par exemption.
import type { Socket } from 'socket.io';

export function roomsOf(socket: Socket): string[] {
  return [...socket.rooms];
}
