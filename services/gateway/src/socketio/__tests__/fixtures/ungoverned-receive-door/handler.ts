// Fixture — la forme que le balayage doit VOIR : le `Socket` NU de socket.io,
// dans un module qui enregistre des listeners.
import { Socket } from 'socket.io';

export function register(socket: Socket): void {
  socket.on('call:whatever-undeclared', (data: { anything: string }) => { void data; });
}
