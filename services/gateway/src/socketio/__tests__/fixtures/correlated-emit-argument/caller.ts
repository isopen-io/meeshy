// Fixture du balayage — les formes JUSTES, qu'il ne doit PAS signaler.
//
// La troisième est celle qui a fait narrower le discriminant : un littéral
// casté vers le type que le canal DÉCLARE ne décorrèle rien, et le dépôt en
// porte quarante (`{ code, message } as CallError`). Les compter aurait mesuré
// la popularité d'un idiome au lieu d'une propriété — l'erreur du cycle 107.
type ServerEventName = 'message:new' | 'call:error';
type CallError = { code: string; message: string };
interface TypedTarget {
  emit(event: ServerEventName, payload: unknown, ack?: unknown): unknown;
}

declare const target: TypedTarget;
declare const id: string;
declare const code: string;
declare const message: string;
declare const ack: unknown;

export function noCastAtAll(): void {
  target.emit('message:new', { id });
}

export function castToTheDeclaredType(): void {
  target.emit('call:error', { code, message } as CallError);
}

// Un cast NICHÉ porte sur un CHAMP, pas sur le canal : autre question.
export function castInsideThepayload(): void {
  target.emit('message:new', { id: id as any });
}

// Un troisième argument (ack) n'est ni le canal ni la charge.
export function erasingCastOnTheAck(): void {
  target.emit('message:new', { id }, ack as any);
}
