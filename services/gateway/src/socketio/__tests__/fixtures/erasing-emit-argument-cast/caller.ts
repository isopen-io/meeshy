// Fixture du balayage — les QUATRE cibles qui EFFACENT, chacune au premier
// niveau d'un argument de `.emit(`. Le porteur est volontairement une porte
// JUSTE : c'est tout l'objet du cliquet — la porte est dérivée du contrat, et
// c'est l'argument qui la neutralise (#18649).
type ServerEventName = 'message:new' | 'typing:stop';
interface ServerToClientEvents {
  'message:new': (payload: { id: string }) => void;
  'typing:stop': (payload: { userId: string }) => void;
}
interface TypedTarget {
  emit(event: ServerEventName, payload: unknown): unknown;
}

declare const target: TypedTarget;
declare const event: string;
declare const data: unknown;

export function erasesEverything(): void {
  target.emit(event as never, data as never);
}

export function erasesTheShape(): void {
  target.emit('message:new', data as any);
}

export function erasesFromAbove(): void {
  target.emit('message:new', data as unknown);
}

export function erasesTheCorrelation(): void {
  target.emit(event as keyof ServerToClientEvents, data as any);
}
