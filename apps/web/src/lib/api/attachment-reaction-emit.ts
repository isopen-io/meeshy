/**
 * LE PORT D'ÉMISSION DES RÉACTIONS À UNE PIÈCE (#6303) — même motif que
 * `typing-emit.ts` : un module SANS dépendance que la visionneuse importe à la
 * place de `api/realtime.ts`, qui s'y ENREGISTRE à son chargement. La
 * visionneuse ne tire donc jamais `socket.io-client` dans son chunk.
 *
 * La passerelle n'expose la réaction à une pièce que par le socket
 * (`attachment:reaction-add|remove`, `AttachmentReactionHandler.ts`), avec un
 * accusé : `ok` confirmé, `refused` refusé (droit, plafond, pièce inconnue),
 * `offline` quand aucune connexion ne peut porter le geste — jamais une
 * promesse rejetée.
 */
export type AttachmentReactionAction = 'add' | 'remove';

export type AttachmentReactionRequest = {
  readonly action: AttachmentReactionAction;
  readonly attachmentId: string;
  readonly messageId: string;
  readonly emoji: string;
};

export type AttachmentReactionAck = 'ok' | 'refused' | 'offline';

export type AttachmentReactionEmitter = (request: AttachmentReactionRequest) => Promise<AttachmentReactionAck>;

let emitter: AttachmentReactionEmitter | null = null;

/** Appelé par `api/realtime.ts` ; `null` désarme. */
export function setAttachmentReactionEmitter(next: AttachmentReactionEmitter | null): void {
  emitter = next;
}

export function emitAttachmentReaction(request: AttachmentReactionRequest): Promise<AttachmentReactionAck> {
  return emitter === null ? Promise.resolve('offline') : emitter(request);
}
