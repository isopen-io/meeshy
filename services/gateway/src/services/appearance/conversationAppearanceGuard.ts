/**
 * LA GARDE de l'apparence d'une conversation (#10631, #10632, § 10.1) —
 * module UNIQUE appelé par la route AVANT `writeConversationPreferences`.
 *
 *   1. `parseConversationAppearance` strict — sinon 400 `INVALID_APPEARANCE` ;
 *   2. `design` : le pack existe au registre `wallpaper` (non masqué), le modèle
 *      est dans son contrat, et le lecteur le POSSÈDE (`isPackOwned`) — sinon
 *      403 `PACK_NOT_OWNED`, un pack inconnu compris (on ne confirme pas son
 *      existence) ;
 *   3. `photo` : la pièce jointe existe, appartient à un message de CETTE
 *      conversation, ni supprimé, ni éphémère, ni à vue unique, ni flouté, et
 *      c'est une image non purgée — sinon 404 `ATTACHMENT_NOT_AVAILABLE`, sans
 *      distinguer les causes. Le serveur ne stocke QUE l'identifiant (E2EE
 *      compris : la pièce peut être chiffrée).
 *
 * L'appartenance du lecteur à la conversation reste vérifiée par l'écrivain
 * unique (`not-a-participant`).
 */
import type { PrismaClient } from '@meeshy/shared/prisma/client';
import { isPackOwned } from '@meeshy/shared/types/content-pack';
import { parseConversationAppearance, type ConversationAppearance } from '@meeshy/shared/types/conversation-appearance';
import type { PackIndex } from '../packs/PackIndex';

export type AppearanceGuardOutcome =
  | { readonly kind: 'ok'; readonly appearance: ConversationAppearance }
  | { readonly kind: 'invalid' }
  | { readonly kind: 'not-owned' }
  | { readonly kind: 'attachment-unavailable' };

export type AppearanceGuardParams = {
  readonly prisma: PrismaClient;
  readonly index: PackIndex;
  readonly userId: string;
  readonly conversationId: string;
  readonly input: unknown;
};

const ok = (appearance: ConversationAppearance): AppearanceGuardOutcome => ({ kind: 'ok', appearance });

async function designOwned({ prisma, index, userId }: AppearanceGuardParams, pack: string, design: string): Promise<boolean> {
  const entry = index.entries('wallpaper').find((candidate) => candidate.slug === pack && !candidate.hidden);
  if (entry === undefined || !index.itemKeys(entry).includes(design)) return false;
  if (entry.price === undefined) return true;
  const rows = await prisma.userPackOwnership.findMany({ where: { userId }, select: { packKey: true } });
  return isPackOwned({ domain: 'wallpaper', slug: pack, price: entry.price }, new Set(rows.map((row) => row.packKey)));
}

async function photoAvailable({ prisma, conversationId }: AppearanceGuardParams, attachmentId: string): Promise<boolean> {
  const attachment = await prisma.messageAttachment.findUnique({
    where: { id: attachmentId },
    select: {
      mimeType: true,
      isViewOnce: true,
      isBlurred: true,
      viewOnceBurnedAt: true,
      message: { select: { conversationId: true, deletedAt: true, expiresAt: true, isViewOnce: true, isBlurred: true } },
    },
  });
  const message = attachment?.message;
  if (!attachment || !message) return false;
  return (
    message.conversationId === conversationId &&
    message.deletedAt == null &&
    message.expiresAt == null &&
    !message.isViewOnce &&
    !message.isBlurred &&
    attachment.mimeType.startsWith('image/') &&
    !attachment.isViewOnce &&
    !attachment.isBlurred &&
    attachment.viewOnceBurnedAt == null
  );
}

export async function validateConversationAppearance(params: AppearanceGuardParams): Promise<AppearanceGuardOutcome> {
  const appearance = parseConversationAppearance(params.input);
  if (appearance === null) return { kind: 'invalid' };
  const { background } = appearance;
  if (background.kind === 'design') return (await designOwned(params, background.pack, background.design)) ? ok(appearance) : { kind: 'not-owned' };
  if (background.kind === 'photo') return (await photoAvailable(params, background.attachmentId)) ? ok(appearance) : { kind: 'attachment-unavailable' };
  return ok(appearance);
}
