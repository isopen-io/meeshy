// Fixture — la forme JUSTE : le socket dérive du contrat partagé.
import type { MeeshySocket as Socket } from '../../typed-socket';

export function register(socket: Socket): void {
  socket.on('typing:start', (data) => { void data; });
}
