/**
 * WORLD WIDE (#10000) — la conversation dans laquelle le monde entier entre
 * depuis meeshy.me, semée à CHAQUE démarrage et servie à la landing.
 *
 * Invariant de CHAQUE boot, jamais derrière `shouldInitialize()` : cette porte
 * ne s'ouvre que sur une base VIDE, et la production — qui n'a pas World Wide —
 * n'est justement pas vide (`database-bootstrap.ts` en tient la séquence).
 *
 * Trois écritures, chacune créée UNE fois et relue ensuite :
 *  1. la conversation `world` (type `global`, titre « World Wide ») ;
 *  2. ses trois membres réservés — `meeshy` créateur, `admin` et `jcnm`
 *     administrateurs. Aucun compte n'est CRÉÉ ici : `jcnm` est promu s'il
 *     existe, journalisé sinon (aucun mot de passe en dur) ;
 *  3. le lien de partage `mshy_world`, ouvert aux invités sans compte, créé par
 *     `meeshy`.
 *
 * Ce que le seed ne fait JAMAIS sur une ligne existante : renommer la
 * conversation, réactiver un lien qu'un administrateur a fermé, réveiller une
 * participation quittée (même loi que `ensureGlobalConversationMembership`,
 * #4010). Le seed POSE un état initial ; il ne réécrit pas les décisions prises
 * depuis.
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
  WORLD_SHARE_LINK_IDENTIFIER,
  type WorldEntry,
} from '@meeshy/shared/types/world';
import { presentMemberCount } from '@meeshy/shared/utils/member-visibility';
import { generateUniqueShareLinkId } from '../../routes/links/utils/link-helpers';
import { FOUNDING_MEMBER_PERMISSIONS } from '../participantRights';
import { isShareLinkOpen } from '../conversationCard';
import { RECIPIENT_LANG_SELECT, recipientLanguage } from '../../utils/recipient-language';

export type WorldSeedLogger = {
  info(message: string): void;
  warn(message: string): void;
  error(message: string): void;
};

export type WorldSeedDeps = {
  readonly prisma: PrismaClient;
  readonly logger: WorldSeedLogger;
};

export type WorldMemberOutcome = 'joined' | 'promoted' | 'already-member' | 'left' | 'absent';

export type WorldSeedReport = {
  readonly conversation: 'created' | 'existing';
  readonly shareLink: 'created' | 'existing' | 'identifier-taken' | 'skipped-no-creator';
  readonly members: readonly { readonly username: string; readonly outcome: WorldMemberOutcome }[];
};

/** Le créateur du salon et du lien — le compte BIGBOSS semé par `InitService`. */
const WORLD_CREATOR_USERNAME = 'meeshy';

/**
 * Les rangs réservés DANS World Wide. Distincts du rôle PLATEFORME
 * (`User.role`) : `jcnm` y est administrateur quel que soit son rôle global.
 */
const WORLD_RESERVED_MEMBERS: readonly { readonly username: string; readonly role: MemberRoleType }[] = [
  { username: WORLD_CREATOR_USERNAME, role: 'creator' },
  { username: 'admin', role: 'admin' },
  { username: 'jcnm', role: 'admin' },
];

/**
 * Les termes du lien d'entrée publique. Un INVITÉ écrit, et joint du texte
 * `.txt` ou de l'audio — rien d'autre (décision porteur sur #10001) :
 * `allowAnonymousFiles` ouvre la porte que la garde de SIGNATURE de contenu
 * (#10001) restreint ensuite aux seuls types permis ; `allowAnonymousImages`
 * reste fermé. `allowViewHistory: false` : un invité lit le salon depuis son
 * arrivée, comme tout anonyme (#4169) — la planche « Onboarding » montre
 * d'ailleurs un fil qui commence à « {nom} a rejoint World Wide ».
 */
const WORLD_SHARE_LINK_TERMS = {
  name: WORLD_CONVERSATION_TITLE,
  description: 'Entrée publique de World Wide depuis meeshy.me',
  isActive: true,
  allowAnonymousMessages: true,
  allowAnonymousFiles: true,
  allowAnonymousImages: false,
  allowViewHistory: false,
  requireAccount: false,
  requireNickname: true,
  requireEmail: false,
  requireBirthday: false,
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

type ReservedAccount = {
  readonly id: string;
  readonly username: string;
  readonly displayName: string | null;
  readonly systemLanguage: string | null;
  readonly regionalLanguage: string | null;
  readonly customDestinationLanguage: string | null;
  readonly deviceLocale: string | null;
};

async function ensureMember(
  prisma: PrismaClient,
  conversationId: string,
  account: ReservedAccount,
  role: MemberRoleType,
): Promise<WorldMemberOutcome> {
  const find = () => prisma.participant.findFirst({ where: { conversationId, userId: account.id } });
  const existing = await find();
  if (existing) {
    if (!existing.isActive) return 'left';
    if (existing.role === role) return 'already-member';
    await prisma.participant.update({ where: { id: existing.id }, data: { role } });
    return 'promoted';
  }

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

async function ensureShareLink(
  deps: WorldSeedDeps,
  conversationId: string,
  creatorId: string | undefined,
): Promise<WorldSeedReport['shareLink']> {
  const { prisma, logger } = deps;
  const find = () =>
    prisma.conversationShareLink.findFirst({
      where: { identifier: WORLD_SHARE_LINK_IDENTIFIER },
      select: { id: true, conversationId: true },
    });
  const existing = await find();
  if (existing) {
    if (existing.conversationId === conversationId) return 'existing';
    logger.error(
      `[WORLD] l'identifiant de lien "${WORLD_SHARE_LINK_IDENTIFIER}" désigne une AUTRE conversation — aucun lien World Wide créé, la landing n'aura pas d'entrée tant que ce conflit n'est pas tranché`,
    );
    return 'identifier-taken';
  }

  if (!creatorId) {
    logger.warn(
      `[WORLD] compte "${WORLD_CREATOR_USERNAME}" introuvable — le lien "${WORLD_SHARE_LINK_IDENTIFIER}" sera créé au prochain démarrage qui le trouve`,
    );
    return 'skipped-no-creator';
  }

  const { created } = await createOrReread(
    async () =>
      prisma.conversationShareLink.create({
        data: {
          ...WORLD_SHARE_LINK_TERMS,
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
 * Sème World Wide — idempotent, sans effet sur ce qui existe déjà au-delà de
 * la mise à niveau des rangs réservés. Rend ce qu'il a constaté, pour le
 * journal du démarrage et les témoins.
 */
export async function ensureWorldConversation(deps: WorldSeedDeps): Promise<WorldSeedReport> {
  const { prisma, logger } = deps;
  const conversation = await ensureConversation(prisma);

  const accounts: readonly ReservedAccount[] = await prisma.user.findMany({
    where: { username: { in: WORLD_RESERVED_MEMBERS.map((member) => member.username) } },
    select: { id: true, username: true, displayName: true, ...RECIPIENT_LANG_SELECT },
  });
  const accountByUsername = new Map(accounts.map((account) => [account.username, account]));

  const members = await Promise.all(
    WORLD_RESERVED_MEMBERS.map(async ({ username, role }) => {
      const account = accountByUsername.get(username);
      if (!account) {
        logger.warn(`[WORLD] compte "${username}" introuvable — non créé par le seed, il sera ${role} de World Wide au premier démarrage qui le trouve`);
        return { username, outcome: 'absent' as const };
      }
      return { username, outcome: await ensureMember(prisma, conversation.id, account, role) };
    }),
  );

  const shareLink = await ensureShareLink(deps, conversation.id, accountByUsername.get(WORLD_CREATOR_USERNAME)?.id);

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
