/**
 * WORLD WIDE (#10000) — la conversation dans laquelle le monde entier entre
 * depuis meeshy.me, semée à CHAQUE démarrage et servie à la landing.
 *
 * Hors de la porte `shouldInitialize()` (qui ne s'ouvre que sur une base VIDE),
 * mais derrière un interrupteur EXPLICITE : `InitService` ne l'appelle que sur
 * `WORLD_SEED_ENABLED=true`. Promouvoir le code ne doit pas écrire en
 * production — le seed y attend le feu vert du porteur, après le pré-vol en
 * lecture seule (`inspectWorldSeed`) et une sauvegarde vérifiée ; son retrait
 * est `removeWorldSeed` (`world/worldSeedOperations.ts`).
 *
 * Trois écritures, chacune créée UNE fois et relue ensuite :
 *  1. la conversation `world` (type `global`, titre « World Wide ») ;
 *  2. ses membres réservés, désignés par une ADRESSE de configuration et jamais
 *     par un pseudo (`world/worldReservedMembers.ts`) — `meeshy` créateur,
 *     `admin` et les adresses de `WORLD_ADMIN_EMAILS` (le porteur, `jcnm`)
 *     administrateurs. Aucun compte n'est CRÉÉ ici, et un compte inactif,
 *     supprimé ou non vérifié n'est pas promu ;
 *  3. le lien de partage `mshy_world`, ouvert à l'ÉCRITURE des invités sans
 *     compte, créé par `meeshy`.
 *
 * Ce que le seed ne fait JAMAIS sur une ligne existante : renommer la
 * conversation, réactiver un lien qu'un administrateur a fermé, réveiller une
 * participation quittée (même loi que `ensureGlobalConversationMembership`,
 * #4010), ni toucher au RANG d'une participation existante — ni la rétrograder,
 * ni la re-promouvoir : un compte réservé rétrogradé depuis (compromis, retiré)
 * ne redevient pas administrateur au déploiement suivant. Le rang se pose à la
 * création de la participation, une fois. Le seed POSE un état initial ; il ne
 * réécrit pas les décisions prises depuis.
 *
 * Deux instances qui démarrent ensemble convergent : chaque création qui perd
 * la course sur un index unique (P2002) relit la ligne gagnante.
 *
 * « Meeshy Global » (`identifier: 'meeshy'`) n'est pas touchée.
 */

import type { PrismaClient } from '@meeshy/shared/prisma/client';
import type { MemberRoleType } from '@meeshy/shared/types/role-types';
import {
  WORLD_CONVERSATION_IDENTIFIER,
  WORLD_CONVERSATION_TITLE,
  WORLD_GUEST_ATTACHMENT_KINDS,
  WORLD_SHARE_LINK_IDENTIFIER,
  type WorldEntry,
} from '@meeshy/shared/types/world';
import { presentMemberCount } from '@meeshy/shared/utils/member-visibility';
import { generateUniqueShareLinkId } from '../../routes/links/utils/link-helpers';
import { FOUNDING_MEMBER_PERMISSIONS } from '../participantRights';
import { isShareLinkOpen } from '../conversationCard';
import { recipientLanguage } from '../../utils/recipient-language';
import {
  WORLD_CREATOR_DESIGNATION,
  designateWorldReservedAccounts,
  type WorldReservedAccount,
  type WorldReservedIdentities,
} from './worldReservedMembers';

export type WorldSeedLogger = {
  info(message: string): void;
  warn(message: string): void;
  error(message: string): void;
};

export type WorldSeedDeps = {
  readonly prisma: PrismaClient;
  readonly logger: WorldSeedLogger;
  readonly identities: WorldReservedIdentities;
};

export type WorldMemberOutcome = 'joined' | 'already-member' | 'left' | 'absent' | 'ineligible';

export type WorldSeedReport = {
  readonly conversation: 'created' | 'existing';
  readonly shareLink: 'created' | 'existing' | 'identifier-taken' | 'skipped-no-creator';
  readonly members: readonly { readonly designation: string; readonly outcome: WorldMemberOutcome }[];
};

/**
 * Les termes du lien d'entrée publique. Un INVITÉ écrit, et ne joint que du
 * texte `.txt` et de l'audio (#10001, décision porteur du 2026-10-10).
 *
 * `allowedAttachmentKinds` le dit aux clients, qui filtrent leur sélecteur ;
 * ce qui le GARANTIT est la garde de `ContentSignature.ts`
 * (`classifyAnonymousAttachment`), qui décode le contenu ENTIER sur tus et REST
 * et relit la famille de chaque pièce à l'envoi (REST, socket). Elle se décide
 * sur la CONVERSATION (`GUEST_ATTACHMENT_KIND_CEILINGS`, #10029) : un lien qui
 * ne dit rien n'ouvre pas davantage, et ni `allowAnonymousFiles` ni les droits
 * gravés à l'entrée (`link-admission.ts`) n'y entrent. Le pré-vol
 * (`inspectWorldSeed`) la met à l'épreuve de contenus déguisés et bloque si
 * l'un passe.
 *
 * `allowAnonymousFiles` reste semé FERMÉ : la porte des fichiers génériques ne
 * s'ouvre pas, la liste des familles la remplace. `allowViewHistory: false` :
 * un invité lit le salon depuis son arrivée, comme tout anonyme (#4169) — la
 * planche « Onboarding » montre d'ailleurs un fil qui commence à « {nom} a
 * rejoint World Wide ».
 *
 * Le seed ne réécrit jamais ces termes sur un lien existant, à une exception :
 * un lien semé AVANT la colonne `allowedAttachmentKinds` (liste vide) la reçoit
 * — jamais un choix qu'un administrateur a posé depuis.
 */
export const WORLD_SHARE_LINK_TERMS = {
  name: WORLD_CONVERSATION_TITLE,
  description: 'Entrée publique de World Wide depuis meeshy.me',
  isActive: true,
  allowAnonymousMessages: true,
  allowAnonymousFiles: false,
  allowAnonymousImages: false,
  allowViewHistory: false,
  requireAccount: false,
  requireNickname: true,
  requireEmail: false,
  requireBirthday: false,
  allowedAttachmentKinds: [...WORLD_GUEST_ATTACHMENT_KINDS],
} as const;

function isUniqueViolation(error: unknown): boolean {
  return typeof error === 'object' && error !== null && (error as { code?: unknown }).code === 'P2002';
}

/** Crée, ou relit la ligne qu'une instance concurrente vient d'écrire. */
async function createOrReread<T>(create: () => Promise<T>, reread: () => Promise<T | null>): Promise<{ row: T; created: boolean }> {
  try {
    return { row: await create(), created: true };
  } catch (error) {
    if (!isUniqueViolation(error)) throw error;
    const row = await reread();
    if (!row) throw error;
    return { row, created: false };
  }
}

async function ensureConversation(prisma: PrismaClient): Promise<{ id: string; created: boolean }> {
  const find = () =>
    prisma.conversation.findFirst({ where: { identifier: WORLD_CONVERSATION_IDENTIFIER }, select: { id: true } });
  const existing = await find();
  if (existing) return { id: existing.id, created: false };

  const { row, created } = await createOrReread(
    () =>
      prisma.conversation.create({
        data: {
          identifier: WORLD_CONVERSATION_IDENTIFIER,
          title: WORLD_CONVERSATION_TITLE,
          description: 'La conversation du monde entier, traduite dans la langue de chacun',
          type: 'global',
          isActive: true,
        },
        select: { id: true },
      }),
    find,
  );
  return { id: row.id, created };
}

async function ensureMember(
  prisma: PrismaClient,
  conversationId: string,
  account: WorldReservedAccount,
  role: MemberRoleType,
): Promise<WorldMemberOutcome> {
  const find = () =>
    prisma.participant.findFirst({ where: { conversationId, userId: account.id }, select: { id: true, isActive: true } });
  const existing = await find();
  if (existing) return existing.isActive ? 'already-member' : 'left';

  const { created } = await createOrReread(
    () =>
      prisma.participant.create({
        data: {
          conversationId,
          userId: account.id,
          type: 'user',
          displayName: account.displayName || account.username,
          role,
          language: recipientLanguage(account, 'fr'),
          permissions: { ...FOUNDING_MEMBER_PERMISSIONS },
          joinedAt: new Date(),
          isActive: true,
        },
      }),
    find,
  );
  return created ? 'joined' : 'already-member';
}

/**
 * Un lien semé avant la colonne `allowedAttachmentKinds` la reçoit — et lui
 * seul : une liste déjà posée, même par un administrateur, n'est pas touchée.
 */
async function poseGuestAttachmentKinds(
  deps: WorldSeedDeps,
  link: { readonly id: string; readonly allowedAttachmentKinds?: readonly string[] | null },
): Promise<void> {
  if (link.allowedAttachmentKinds && link.allowedAttachmentKinds.length > 0) return;
  await deps.prisma.conversationShareLink.update({
    where: { id: link.id },
    data: { allowedAttachmentKinds: [...WORLD_GUEST_ATTACHMENT_KINDS] },
  });
  deps.logger.info(`[WORLD] lien "${WORLD_SHARE_LINK_IDENTIFIER}" : familles des invités posées (${WORLD_GUEST_ATTACHMENT_KINDS.join(', ')})`);
}

async function ensureShareLink(
  deps: WorldSeedDeps,
  conversationId: string,
  creatorId: string | undefined,
): Promise<WorldSeedReport['shareLink']> {
  const { prisma, logger } = deps;
  const find = () =>
    prisma.conversationShareLink.findFirst({
      where: { identifier: WORLD_SHARE_LINK_IDENTIFIER },
      select: { id: true, conversationId: true, allowedAttachmentKinds: true },
    });
  const existing = await find();
  if (existing) {
    if (existing.conversationId === conversationId) {
      await poseGuestAttachmentKinds(deps, existing);
      return 'existing';
    }
    logger.error(
      `[WORLD] l'identifiant de lien "${WORLD_SHARE_LINK_IDENTIFIER}" désigne une AUTRE conversation — aucun lien World Wide créé, la landing n'aura pas d'entrée tant que ce conflit n'est pas tranché`,
    );
    return 'identifier-taken';
  }

  if (!creatorId) {
    logger.warn(
      `[WORLD] aucun compte "${WORLD_CREATOR_DESIGNATION}" légitime — le lien "${WORLD_SHARE_LINK_IDENTIFIER}" sera créé au prochain démarrage qui le trouve`,
    );
    return 'skipped-no-creator';
  }

  const { created } = await createOrReread(
    async () =>
      prisma.conversationShareLink.create({
        data: {
          ...WORLD_SHARE_LINK_TERMS,
          allowedAttachmentKinds: [...WORLD_SHARE_LINK_TERMS.allowedAttachmentKinds],
          allowedCountries: [],
          allowedLanguages: [],
          allowedIpRanges: [],
          linkId: await generateUniqueShareLinkId(prisma),
          identifier: WORLD_SHARE_LINK_IDENTIFIER,
          conversationId,
          createdBy: creatorId,
        },
        select: { id: true, conversationId: true },
      }),
    find,
  );
  return created ? 'created' : 'existing';
}

/**
 * Sème World Wide — idempotent, sans effet sur ce qui existe déjà : il crée ce
 * qui manque, et rien d'autre. Rend ce qu'il a constaté, pour le journal du
 * démarrage et les témoins.
 */
export async function ensureWorldConversation(deps: WorldSeedDeps): Promise<WorldSeedReport> {
  const { prisma, logger, identities } = deps;
  const conversation = await ensureConversation(prisma);
  const designated = await designateWorldReservedAccounts(prisma, identities);

  const members = await Promise.all(
    designated.map(async (entry) => {
      const { designation, role } = entry.designation;
      if (entry.status === 'absent') {
        logger.warn(`[WORLD] aucun compte pour la désignation "${designation}" — non créé par le seed, il sera ${role} de World Wide au premier démarrage qui le trouve`);
        return { designation, outcome: 'absent' as const };
      }
      if (entry.status === 'ineligible') {
        logger.warn(`[WORLD] compte "${entry.account.username}" désigné "${designation}" écarté (${entry.reason}) — non promu`);
        return { designation, outcome: 'ineligible' as const };
      }
      return { designation, outcome: await ensureMember(prisma, conversation.id, entry.account, role) };
    }),
  );

  const creator = designated.find((entry) => entry.designation.designation === WORLD_CREATOR_DESIGNATION);
  const shareLink = await ensureShareLink(deps, conversation.id, creator?.status === 'eligible' ? creator.account.id : undefined);

  if (conversation.created || shareLink === 'created') {
    logger.info(`[WORLD] World Wide semée — conversation ${conversation.created ? 'créée' : 'existante'}, lien ${shareLink}`);
  }

  return { conversation: conversation.created ? 'created' : 'existing', shareLink, members };
}

/**
 * Ce que `GET /api/v1/world` sert : de quoi entrer, et combien de personnes
 * y sont — rien de plus. `null` quand il n'y a pas de porte ouverte (seed pas
 * encore passé, lien fermé par un administrateur, conversation désactivée) :
 * la landing ne propose pas une entrée qui mènerait à un refus.
 */
export async function loadWorldEntry(prisma: PrismaClient): Promise<WorldEntry | null> {
  const conversation = await prisma.conversation.findFirst({
    where: { identifier: WORLD_CONVERSATION_IDENTIFIER, isActive: true },
    select: { id: true, identifier: true, title: true },
  });
  if (!conversation) return null;

  const link = await prisma.conversationShareLink.findFirst({
    where: { identifier: WORLD_SHARE_LINK_IDENTIFIER, conversationId: conversation.id },
    select: { identifier: true, isActive: true, expiresAt: true, maxUses: true, currentUses: true },
  });
  if (!link || !isShareLinkOpen(link, new Date())) return null;

  const count = await prisma.participant.count({ where: { conversationId: conversation.id, isActive: true } });

  return {
    identifier: conversation.identifier,
    title: conversation.title || WORLD_CONVERSATION_TITLE,
    shareLinkIdentifier: link.identifier,
    ...presentMemberCount(count),
  };
}
