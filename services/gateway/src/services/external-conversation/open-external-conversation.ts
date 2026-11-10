/**
 * OUVRIR UNE CONVERSATION EXTERNE (#17117, chantier #17007) : un tête-à-tête
 * entre un utilisateur Meeshy et un ami d'un réseau tiers, désigné par son
 * numéro E.164.
 *
 * Décision :
 * `services/gateway/decisions/2026-11-10-une-conversation-externe-nait-chiffree-de-bout-en-bout-et-adressee-par-numero.md`.
 *
 * - Le régime est posé PAR la création (`nascentRegime`, mode `e2ee`) : la
 *   conversation n'existe à aucun instant sans chiffrement de bout en bout, donc
 *   les règles vivantes (`assertPlaintextAdmitted`, `switchEncryptionRegime`)
 *   y refusent un clair et toute rétrogradation (#9229, #12949).
 * - Écrire à un réseau tiers exige un numéro VÉRIFIÉ (`User.phoneVerifiedAt`).
 * - Pendant la phase de test, seul un compte qui peut CHOISIR le bout en bout
 *   (`mayChooseEndToEnd`, la même porte que `POST /conversations`) l'ouvre.
 * - Le numéro de l'ami n'est stocké QUE dans `ExternalConversationPeer`, avec
 *   son échéance de conservation ; ni le titre, ni l'identifiant, ni un nom ne
 *   le portent. Rouvrir le même ami rend la même conversation VIVANTE et
 *   repousse l'échéance ; une conversation close, supprimée ou quittée est une
 *   ABSENCE : son adresse est effacée et une neuve s'ouvre.
 * - Un compte garde au plus `EXTERNAL_CONVERSATION_ACTIVE_CAP` adresses.
 * - Ce module ne journalise rien : une erreur de base peut recopier ses
 *   arguments, donc le numéro. L'appelant ne journalise que son code.
 */
import { z } from 'zod';
import type { PrismaClient } from '@meeshy/shared/prisma/client';
import {
  EXTERNAL_CONVERSATION_ACTIVE_CAP,
  EXTERNAL_CONVERSATION_TYPE,
  EXTERNAL_PEER_HANDLE_RETENTION_DAYS,
} from '@meeshy/shared/types/external-conversation';
import { mayChooseEndToEnd } from '@meeshy/shared/utils/conversation-creation-encryption';
import { e164Schema, externalNetworkSchema, type ExternalNetwork } from '../external-peer/external-peer-contract';
import { nascentRegime, type NascentRegimeDeps } from '../conversations/creationRegime';
import { FOUNDING_MEMBER_PERMISSIONS } from '../participantRights';
import { RECIPIENT_LANG_SELECT, recipientLanguage } from '../../utils/recipient-language';

/** La demande d'ouverture : un réseau et un numéro, rien d'autre — un nom posé à côté fait refuser l'appel. */
export const externalConversationRequestSchema = z
  .object({ network: externalNetworkSchema, handle: e164Schema })
  .strict();

export type ExternalConversationRequest = {
  readonly userId: string;
  readonly network: ExternalNetwork;
  readonly handle: string;
};

export type ExternalConversationOpening =
  | { readonly kind: 'opened'; readonly conversationId: string; readonly created: boolean; readonly purgeAfter: Date }
  | { readonly kind: 'refused'; readonly refusal: ExternalConversationRefusal };

export type ExternalConversationRefusal = 'phone-unverified' | 'end-to-end-reserved' | 'limit-reached';

export type ExternalConversationDeps = {
  readonly prisma: Pick<PrismaClient, 'user' | 'conversation' | 'externalConversationPeer'>;
  readonly regime: NascentRegimeDeps;
};

const DAY_MS = 24 * 60 * 60 * 1000;

const UNIQUE_VIOLATION = 'P2002';

const isUniqueViolation = (error: unknown): boolean =>
  typeof error === 'object' && error !== null && (error as { code?: unknown }).code === UNIQUE_VIOLATION;

const retentionDeadline = (at: Date): Date => new Date(at.getTime() + EXTERNAL_PEER_HANDLE_RETENTION_DAYS * DAY_MS);

/** La conversation est-elle encore un fil où l'ouvreur peut écrire ? */
async function isAlive(deps: ExternalConversationDeps, conversationId: string, userId: string): Promise<boolean> {
  const conversation = await deps.prisma.conversation.findUnique({
    where: { id: conversationId },
    select: { isActive: true, closedAt: true, participants: { where: { userId, isActive: true }, select: { id: true } } },
  });
  if (!conversation || conversation.isActive === false || conversation.closedAt) return false;
  return conversation.participants.length > 0;
}

/**
 * La conversation VIVANTE déjà ouverte avec cet ami, échéance repoussée ;
 * `null` s'il n'y en a pas. Une adresse rattachée à un fil mort est effacée :
 * elle ne serait plus qu'une copie du numéro sans usage.
 */
async function reopen(deps: ExternalConversationDeps, request: ExternalConversationRequest): Promise<ExternalConversationOpening | null> {
  const existing = await deps.prisma.externalConversationPeer.findUnique({
    where: { openedByUserId_network_handle: { openedByUserId: request.userId, network: request.network, handle: request.handle } },
    select: { id: true, conversationId: true },
  });
  if (!existing) return null;
  if (!(await isAlive(deps, existing.conversationId, request.userId))) {
    await deps.prisma.externalConversationPeer.deleteMany({ where: { id: existing.id } });
    return null;
  }
  const purgeAfter = retentionDeadline(deps.regime.now());
  await deps.prisma.externalConversationPeer.update({ where: { id: existing.id }, data: { purgeAfter }, select: { id: true } });
  return { kind: 'opened', conversationId: existing.conversationId, created: false, purgeAfter };
}

async function create(
  deps: ExternalConversationDeps,
  request: ExternalConversationRequest,
  opener: { readonly displayName: string; readonly language: string },
): Promise<ExternalConversationOpening> {
  const nascent = await nascentRegime(deps.regime, { mode: 'e2ee', enabledBy: request.userId });
  const purgeAfter = retentionDeadline(deps.regime.now());
  await deps.prisma.conversation.create({
    data: {
      id: nascent.conversationId,
      ...nascent.data,
      identifier: `ext_${nascent.conversationId}`,
      type: EXTERNAL_CONVERSATION_TYPE,
      autoTranslateEnabled: false,
      memberCount: 1,
      participants: {
        create: [
          {
            userId: request.userId,
            type: 'user',
            displayName: opener.displayName,
            role: 'creator',
            language: opener.language,
            permissions: { ...FOUNDING_MEMBER_PERMISSIONS },
          },
        ],
      },
      externalPeer: {
        create: { network: request.network, handle: request.handle, openedByUserId: request.userId, purgeAfter },
      },
    },
    select: { id: true },
  });
  return { kind: 'opened', conversationId: nascent.conversationId, created: true, purgeAfter };
}

export async function openExternalConversation(
  deps: ExternalConversationDeps,
  request: ExternalConversationRequest,
): Promise<ExternalConversationOpening> {
  const user = await deps.prisma.user.findUnique({
    where: { id: request.userId },
    select: { id: true, phoneVerifiedAt: true, role: true, displayName: true, username: true, ...RECIPIENT_LANG_SELECT },
  });
  if (!user?.phoneVerifiedAt) return { kind: 'refused', refusal: 'phone-unverified' };
  if (!mayChooseEndToEnd(user.role)) return { kind: 'refused', refusal: 'end-to-end-reserved' };

  const reopened = await reopen(deps, request);
  if (reopened) return reopened;

  const kept = await deps.prisma.externalConversationPeer.count({ where: { openedByUserId: request.userId } });
  if (kept >= EXTERNAL_CONVERSATION_ACTIVE_CAP) return { kind: 'refused', refusal: 'limit-reached' };

  const opener = { displayName: user.displayName || user.username || 'User', language: recipientLanguage(user, 'fr') };
  try {
    return await create(deps, request, opener);
  } catch (error) {
    if (!isUniqueViolation(error)) throw error;
    const winner = await reopen(deps, request);
    if (!winner) throw error;
    return winner;
  }
}
