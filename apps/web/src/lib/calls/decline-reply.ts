import type { ActiveCall } from './call-store';

/**
 * **REFUSER AVEC UN MESSAGE** (#8065, parité C13) — le geste « Je te
 * rappelle » de l'écran entrant : l'appel se termine d'abord (la sonnerie
 * s'arrête à l'instant du toucher, `call:end` rejected), puis le texte part
 * dans la conversation de l'appel par le chemin d'envoi ordinaire — outbox,
 * bulle optimiste, file hors ligne. Il part dans la langue de l'interface du
 * lecteur qui refuse : la passerelle le traduit pour l'appelant (Prisme).
 */

export const DECLINE_REPLY_KEYS = [
  'callDecline.reply.callBack',
  'callDecline.reply.meeting',
  'callDecline.reply.cantTalk',
  'callDecline.reply.writeMe',
] as const;

export const DECLINE_REPLY_MAX_LENGTH = 500;

export type DeclineReplyKey = (typeof DECLINE_REPLY_KEYS)[number];

export type DeclineReplyDeps = {
  readonly decline: () => void;
  readonly send: (message: { readonly conversationId: string; readonly content: string; readonly language: string }) => void;
  /**
   * #13171 — la conversation de l'appel accepte-t-elle un message en clair ?
   * Non dans une conversation vue chiffrée de bout en bout : le web ne scelle
   * pas (#12975), rien n'est refusé ni envoyé, et la feuille le dit.
   */
  readonly canReply?: (conversationId: string) => boolean;
};

export function declineWithReply(params: {
  readonly call: Pick<ActiveCall, 'conversationId'> & { readonly phase: { readonly kind: ActiveCall['phase']['kind'] } } | null;
  readonly text: string;
  readonly language: string;
  readonly deps: DeclineReplyDeps;
}): boolean {
  const { call, language, deps } = params;
  const content = Array.from(params.text.trim()).slice(0, DECLINE_REPLY_MAX_LENGTH).join('');
  if (call === null || call.phase.kind !== 'incoming' || content.length === 0) return false;
  if (deps.canReply?.(call.conversationId) === false) return false;
  deps.decline();
  deps.send({ conversationId: call.conversationId, content, language });
  return true;
}
