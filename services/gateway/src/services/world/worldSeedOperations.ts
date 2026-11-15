/**
 * Ce qui ENTOURE le seed World Wide (#10000) quand il atteint une base qui a
 * des utilisateurs : le pré-vol, et le retrait.
 *
 * Le seed écrit (une conversation, un lien, des participations, puis celles
 * des invités) : en production, il n'est activé (`WORLD_SEED_ENABLED=true`)
 * qu'avec le feu vert du porteur et après une sauvegarde vérifiée. Ces deux
 * fonctions outillent cette décision — façades : `scripts/world-seed-preflight.ts`
 * et `scripts/world-seed-remove.ts`.
 *
 *  · `inspectWorldSeed` — LECTURE SEULE. Dit si la base est prête : ni `world`
 *    ni `mshy_world` n'existent, et chaque administrateur désigné est présent
 *    et légitime (actif, non supprimé, adresse vérifiée, rôle plateforme
 *    attendu). Une désignation vide (`WORLD_ADMIN_EMAILS` non configuré) est
 *    elle-même un bloquant : le porteur doit être nommé avant d'ouvrir. Et la
 *    garde des pièces jointes d'invité DÉPLOYÉE est mise à l'épreuve de
 *    contenus déguisés en audio (`worldGuestAttachments.ts`) : un seul qui
 *    passe bloque — ouvrir World Wide au monde entier sans compte ne doit pas
 *    ouvrir un hébergement de contenus arbitraires (audit #10000, #10029).
 *    Les risques RÉSIDUELS que la garde laisse encore passer (une charge
 *    arbitraire là où le parcours du conteneur audio ne lit pas, #10045) sont
 *    rendus par leur nom et bloquent chacun tant que le porteur ne l'a pas
 *    accepté (`acceptedResidualRisks`, #10057).
 *
 *  · `removeWorldSeed` — à blanc par défaut. `close` ferme la porte et la
 *    conversation (réversible, rien n'est supprimé : c'est le retour arrière
 *    d'un code retiré). `purge` supprime le lien, les participations et la
 *    conversation, et REFUSE dès qu'un message existe : effacer ce que des
 *    personnes ont écrit est une purge de données, pas un retrait de seed.
 */

import type { PrismaClient } from '@meeshy/shared/prisma/client';
import { WORLD_CONVERSATION_IDENTIFIER, WORLD_SHARE_LINK_IDENTIFIER } from '@meeshy/shared/types/world';
import {
  openWorldGuestAttachmentDoors,
  residualWorldGuestAttachmentDoors,
  type GuestAttachmentGuard,
} from './worldGuestAttachments';
import {
  designateWorldReservedAccounts,
  type DesignatedAccount,
  type WorldReservedIdentities,
} from './worldReservedMembers';

export type WorldPreflightMember =
  | { readonly designation: string; readonly status: 'eligible'; readonly username: string }
  | { readonly designation: string; readonly status: 'ineligible'; readonly username: string; readonly reason: string }
  | { readonly designation: string; readonly status: 'absent' };

export type WorldSeedPreflight = {
  readonly ready: boolean;
  readonly conversation: 'absent' | 'present';
  readonly shareLink: 'absent' | 'present';
  readonly members: readonly WorldPreflightMember[];
  /** Les risques résiduels que la garde des invités laisse passer, acceptés ou non. */
  readonly residualRisks: readonly string[];
  readonly blockers: readonly string[];
};

function presentMember(entry: DesignatedAccount): WorldPreflightMember {
  const { designation } = entry.designation;
  if (entry.status === 'absent') return { designation, status: 'absent' };
  if (entry.status === 'ineligible') return { designation, status: 'ineligible', username: entry.account.username, reason: entry.reason };
  return { designation, status: 'eligible', username: entry.account.username };
}

function memberBlocker(member: WorldPreflightMember): string | null {
  if (member.status === 'eligible') return null;
  return `${member.designation}:${member.status === 'absent' ? 'absent' : member.reason}`;
}

function guestAttachmentBlockers(guard: GuestAttachmentGuard | undefined): readonly string[] {
  const open = openWorldGuestAttachmentDoors(guard);
  return open.length === 0 ? [] : [`guest-attachments-open:${open.join(',')}`];
}

function residualRiskBlockers(residualRisks: readonly string[], accepted: readonly string[]): readonly string[] {
  const unaccepted = residualRisks.filter((risk) => !accepted.includes(risk));
  return unaccepted.length === 0 ? [] : [`guest-attachments-residual-unaccepted:${unaccepted.join(',')}`];
}

export type WorldSeedPreflightOptions = {
  /** La garde des pièces jointes d'invité mise à l'épreuve — celle des chemins d'upload par défaut. */
  readonly guestAttachmentGuard?: GuestAttachmentGuard;
  /** Les risques résiduels que le porteur a acceptés par leur nom (#10057) — aucun par défaut. */
  readonly acceptedResidualRisks?: readonly string[];
};

export async function inspectWorldSeed(
  prisma: PrismaClient,
  identities: WorldReservedIdentities,
  options: WorldSeedPreflightOptions = {},
): Promise<WorldSeedPreflight> {
  const [conversation, shareLink, designated] = await Promise.all([
    prisma.conversation.findFirst({ where: { identifier: WORLD_CONVERSATION_IDENTIFIER }, select: { id: true } }),
    prisma.conversationShareLink.findFirst({ where: { identifier: WORLD_SHARE_LINK_IDENTIFIER }, select: { id: true } }),
    designateWorldReservedAccounts(prisma, identities),
  ]);

  const members = designated.map(presentMember);
  const residualRisks = residualWorldGuestAttachmentDoors(options.guestAttachmentGuard);
  const blockers = [
    ...(conversation ? ['conversation-exists'] : []),
    ...(shareLink ? ['share-link-exists'] : []),
    ...members.map(memberBlocker).filter((blocker): blocker is string => blocker !== null),
    ...(identities.worldAdminEmails.length === 0 ? ['world-admin-not-configured'] : []),
    ...guestAttachmentBlockers(options.guestAttachmentGuard),
    ...residualRiskBlockers(residualRisks, options.acceptedResidualRisks ?? []),
  ];

  return {
    ready: blockers.length === 0,
    conversation: conversation ? 'present' : 'absent',
    shareLink: shareLink ? 'present' : 'absent',
    members,
    residualRisks,
    blockers,
  };
}

export type WorldRemovalMode = 'close' | 'purge';

export type WorldRemovalReport = {
  readonly conversation: 'absent' | 'present';
  readonly messages: number;
  readonly participants: number;
  readonly shareLinks: number;
  readonly outcome: 'nothing-to-do' | 'dry-run' | 'closed' | 'purged' | 'refused-has-messages';
};

export async function removeWorldSeed(
  prisma: PrismaClient,
  options: { readonly mode: WorldRemovalMode; readonly apply: boolean },
): Promise<WorldRemovalReport> {
  const conversation = await prisma.conversation.findFirst({
    where: { identifier: WORLD_CONVERSATION_IDENTIFIER },
    select: { id: true },
  });
  if (!conversation) return { conversation: 'absent', messages: 0, participants: 0, shareLinks: 0, outcome: 'nothing-to-do' };

  const scope = { conversationId: conversation.id };
  const [messages, participants, shareLinks] = await Promise.all([
    prisma.message.count({ where: scope }),
    prisma.participant.count({ where: scope }),
    prisma.conversationShareLink.count({ where: scope }),
  ]);
  const counts = { conversation: 'present' as const, messages, participants, shareLinks };

  if (options.mode === 'purge' && messages > 0) return { ...counts, outcome: 'refused-has-messages' };
  if (!options.apply) return { ...counts, outcome: 'dry-run' };

  if (options.mode === 'close') {
    await prisma.conversationShareLink.updateMany({ where: scope, data: { isActive: false } });
    await prisma.conversation.update({ where: { id: conversation.id }, data: { isActive: false } });
    return { ...counts, outcome: 'closed' };
  }

  await prisma.conversationShareLink.deleteMany({ where: scope });
  await prisma.participant.deleteMany({ where: scope });
  await prisma.conversation.delete({ where: { id: conversation.id } });
  return { ...counts, outcome: 'purged' };
}
