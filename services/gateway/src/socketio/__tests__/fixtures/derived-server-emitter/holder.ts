// Fixture NÉGATIVE — les deux formes légitimes ne doivent PAS être signalées.
//
// Sans elle, la seule façon de rendre le balayage vert serait de cesser
// d'émettre, et un balayage qui refuse tout ne garde rien.
import { Server as SocketIOServer } from 'socket.io';

type ServerEventName = 'message:new';
type Payload = { id: string };
interface ServerEmitIO {
  to(room: string): { emit(event: ServerEventName, payload: Payload): unknown };
}

// 1. Le CONSTRUCTEUR du serveur — import en VALEUR, seul endroit du dépôt qui
//    puisse instancier socket.io. Lui interdire l'import n'aurait aucun sens.
export function build(httpServer: unknown): SocketIOServer {
  return new SocketIOServer(httpServer as never);
}

// 2. L'émetteur DÉRIVÉ du contrat — la forme juste.
export class DerivedHolder {
  constructor(private io: ServerEmitIO) {}

  broadcast(): void {
    this.io.to('room').emit('message:new', { id: 'x' });
  }
}
