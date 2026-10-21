/**
 * LA GARDE de l'apparence d'une conversation (#10631, #10632, § 10.1) —
 * module UNIQUE appelé par la route AVANT `writeConversationPreferences`.
 *
 *   0. le lecteur est MEMBRE de la conversation — sinon 403 `not-a-participant`,
 *      AVANT toute autre question (#10651) : un non-membre reçoit la même
 *      réponse quel que soit le fond demandé, ni la forme de l'entrée, ni ses
 *      possessions, ni une pièce jointe ne sont examinées pour lui ;
 *   1. `parseConversationAppearance` strict — sinon 400 `INVALID_APPEARANCE` ;
 *   2. `design` : le pack existe au registre `wallpaper` (non masqué), le modèle
 *      est dans son contrat, et le lecteur le POSSÈDE (`isPackOwned`) — sinon
 *      403 `PACK_NOT_OWNED`, un pack inconnu compris (on ne confirme pas son
 *      existence) ;
 *   3. `photo` : la pièce jointe existe, appartient à un message de CETTE conversation, ni supprimé, ni
 *      éphémère, ni à vue unique, ni flouté (colonnes ET bitfield), c'est
 *      une image non purgée, et le lecteur LIT ce message (`readerMayReadMessage` :
 *      plancher d'historique, message retiré de sa vue, historique vidé) —
 *      sinon 404 `ATTACHMENT_NOT_AVAILABLE`, sans distinguer les causes. Un
 *      fond ne ressuscite pas ce que le fil ne sert plus à ce lecteur, et la
 *      route ne confirme pas l'existence d'une pièce d'avant son arrivée. Le
 *      serveur ne stocke QUE l'identifiant (E2EE compris : la pièce peut être
 *      chiffrée).
 *
 * L'appartenance reste AUSSI vérifiée par l'écrivain unique, pour tout fond.
 */
import type { PrismaClient } from '@meeshy/shared/prisma/client';
import { isPackOwned } from '@meeshy/shared/types/content-pack';
import { ownedPackKeys } from '@meeshy/shared/types/pack-ownership';
import { maskedAttachment } from '@meeshy/shared/utils/attachment-protection';
import { messageProtection } from '@meeshy/shared/utils/message-protection';
import { parseConversationAppearance, type ConversationAppearance } from '@meeshy/shared/types/conversation-appearance';
import type { PackIndex } from '../packs/PackIndex';
import { readerMayReadMessage } from '../messaging/messageReadAccess';

export type AppearanceGuardOutcome =
  | { readonly kind: 'ok'; readonly appearance: ConversationAppearance }
  | { readonly kind: 'invalid' }
  | { readonly kind: 'not-owned' }
  | { readonly kind: 'attachment-unavailable' }
  | { readonly kind: 'not-a-participant' };

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
  const owned = ownedPackKeys(await prisma.userPackOwnership.findMany({ where: { userId }, select: { packKey: true } }));
  return isPackOwned({ domain: 'wallpaper', slug: pack, price: entry.price }, owned);
}

async function isMember({ prisma, userId, conversationId }: AppearanceGuardParams): Promise<boolean> {
  return (await prisma.participant.findFirst({ where: { userId, conversationId, isActive: true }, select: { id: true } })) !== null;
}

/**
 * La protection se lit par les DEUX lois partagées, jamais par une liste de
 * colonnes recopiée : `messageProtection` (colonnes ET bitfield, durée
 * éphémère comprise) au niveau du message, `maskedAttachment` à celui de la
 * pièce. Le chiffrement n'est pas un refus : le serveur ne garde que l'id.
 */
async function photoAvailable({ prisma, conversationId, userId }: AppearanceGuardParams, attachmentId: string): Promise<boolean> {
  const attachment = await prisma.messageAttachment.findUnique({
    where: { id: attachmentId },
    select: {
      mimeType: true,
      isViewOnce: true,
      isBlurred: true,
      effectFlags: true,
      message: { select: { id: true, viewOnceBurnedAt: true, createdAt: true, conversationId: true, deletedAt: true, expiresAt: true, ephemeralDuration: true, isViewOnce: true, isBlurred: true, effectFlags: true } },
    },
  });
  const message = attachment?.message;
  if (!attachment || !message) return false;
  const protection = messageProtection(message);
  const servable =
    message.conversationId === conversationId &&
    message.deletedAt == null &&
    !protection.ephemeral &&
    !protection.viewOnce &&
    !protection.blurred &&
    attachment.mimeType.startsWith('image/') &&
    !maskedAttachment(attachment) &&
    message.viewOnceBurnedAt == null;
  if (!servable) return false;
  return readerMayReadMessage(prisma, { reader: { kind: 'user', userId }, message, now: new Date(), whenHidingUnreadable: 'refuse' });
}

export async function validateConversationAppearance(params: AppearanceGuardParams): Promise<AppearanceGuardOutcome> {
  if (!(await isMember(params))) return { kind: 'not-a-participant' };
  const appearance = parseConversationAppearance(params.input);
  if (appearance === null) return { kind: 'invalid' };
  const { background } = appearance;
  if (background.kind === 'design') return (await designOwned(params, background.pack, background.design)) ? ok(appearance) : { kind: 'not-owned' };
  if (background.kind !== 'photo') return ok(appearance);
  return (await photoAvailable(params, background.attachmentId)) ? ok(appearance) : { kind: 'attachment-unavailable' };
}
