import type { Message } from '@/lib/api/types';

/**
 * RÉPONDRE À UNE PIÈCE, PAS SEULEMENT AU MESSAGE (#6303, #6164) — la citation
 * NOMME la pièce qu'on regardait en plein écran. La passerelle l'accepte à
 * l'envoi (`attachmentReplyTo: { attachmentId }`, `messages-send.ts`), la range
 * dans `metadata.attachmentReplyTo` après avoir vérifié qu'elle appartient au
 * message cité, et la RESSERT sur `replyTo.attachmentReplyTo` — le champ que
 * `quotedPreviewOf` lit déjà pour montrer la bonne pièce.
 *
 * Le message cité porte la pièce nommée SUR LUI-MÊME (`withAttachmentReply`) :
 * la bande du composeur, la bulle optimiste et le corps du POST lisent la MÊME
 * valeur, jamais trois.
 */
export type AttachmentReplyTo = { readonly attachmentId: string };

type WithAttachmentReply = Message & { readonly attachmentReplyTo?: AttachmentReplyTo };

export function withAttachmentReply(message: Message, attachmentId: string | null): Message {
  if (attachmentId === null || !(message.attachments ?? []).some((attachment) => attachment.id === attachmentId)) return message;
  const named: WithAttachmentReply = { ...message, attachmentReplyTo: { attachmentId } };
  return named;
}

export function attachmentReplyOf(replyTo: Message | undefined): AttachmentReplyTo | undefined {
  const named: unknown = (replyTo as WithAttachmentReply | undefined)?.attachmentReplyTo;
  if (named === null || typeof named !== 'object') return undefined;
  const id: unknown = (named as { readonly attachmentId?: unknown }).attachmentId;
  return typeof id === 'string' && id !== '' ? { attachmentId: id } : undefined;
}
