import type { FastifyReply } from 'fastify';
import type { PrismaClient } from '@meeshy/shared/prisma/client';
import { MemberRole, isGlobalAdmin } from '@meeshy/shared/types/role-types';
import { actorHasMinimumRole, type ConversationActor } from '../../../utils/conversation-authority';
import { isConversationClosed } from '../../../services/messaging/conversationWriteAdmission';
import { resolveConversationId } from '../../../utils/conversation-id-cache';
import { SecuritySanitizer } from '../../../utils/sanitize';
import { logError } from '../../../utils/logger';
import { sendNotFound, sendForbidden, sendError } from '../../../utils/response';
import type { NotificationService } from '../../../services/notifications/NotificationService';
import type { MeeshySocketIOHandler } from '../../../socketio/MeeshySocketIOHandler';
import { generateUniqueShareLinkId, ensureUniqueShareLinkIdentifier, generateConversationIdentifier } from './link-helpers';
import type { CreateLinkInput } from '../types';

/**
 * **La porte UNIQUE de création d'un lien de partage (#4169).**
 *
 * `POST /conversations/:id/new-link` (`routes/conversations/sharing.ts`) et
 * `POST /links` (`routes/links/creation.ts`) fabriquaient chacune leur propre
 * `conversationShareLink.create`, avec les MÊMES valeurs par défaut et des
 * gardes DIFFÉRENTES — la moins gardée étant celle qu'utilise le web
 * (`new-link`, pas de garde 410 sur fil clos, BIGBOSS seul sur `global` là où
 * l'autre acceptait BIGBOSS ou ADMIN, `requireAccount`/`requireBirthday`
 * ignorés). Et surtout : **aucune des deux n'exigeait de rang.** N'importe
 * quel membre actif d'un groupe PRIVÉ fabriquait une URL que quiconque la
 * détient rejoint sans compte, pour lire l'historique complet
 * (`allowViewHistory ?? true`, aucun plancher), écrire et poster des images —
 * alors que TOUTES les routes voisines qui touchent à l'appartenance
 * (`invite`, `add`, `ban`, `rights`, `remove`) exigent au moins MODERATOR.
 *
 * Fermer l'une des deux portes ne protégeait rien : le même membre obtenait
 * le même lien par l'autre. C'était UNE politique écrite DEUX fois, pas une
 * porte orpheline à côté d'une porte gardée — d'où ce module : la politique
 * (`mayMintShareLink`) et le geste qu'elle gouverne (`mintConversationShareLink`)
 * n'existent plus qu'ICI, et les deux routes ne sont plus que des ADAPTATEURS
 * qui traduisent leur forme de requête/réponse propre vers cette porte unique.
 *
 * `POST /links` était déjà la plus complète des deux (garde 410, refus des
 * `direct`, notification aux admins) : c'est elle qui a fourni le corps de ce
 * module, pas l'inverse.
 */

/**
 * L'acteur peut-il fabriquer un lien de partage pour CETTE conversation ?
 *
 * Trois régimes, un seul par type de conversation — c'est tout le prédicat,
 * et c'est voulu : la politique tient en une fonction pure, testable sans
 * base ni Fastify, plutôt qu'en deux copies qui ne peuvent que diverger.
 *
 * - `public` : n'importe quel membre (déjà vérifié en amont — être SERVI ce
 *   prédicat suppose une ligne `Participant` active). Une conversation
 *   publique n'a rien à protéger de plus que son appartenance.
 * - `global` : ADMIN ou BIGBOSS de la PLATEFORME, jamais le rang de
 *   conversation — c'est `user.role`, pas `Participant.role`, qui décide ici,
 *   parce que le salon global n'a pas de hiérarchie de modération propre.
 * - tout le reste (`group`, `direct`, un type futur) : au moins MODERATOR
 *   DANS la conversation — `actorHasMinimumRole` fait aussi bénéficier un
 *   ADMIN/BIGBOSS de plateforme des droits du créateur (§ `conversation-
 *   authority.ts`), donc un administrateur de passage n'est jamais bloqué.
 *   `direct` retombe ici en théorie ; en pratique la conversation directe est
 *   refusée AVANT cet appel (aucune notion de modérateur n'y a de sens), mais
 *   le prédicat reste correct si un jour cet ordre change : rang absent ou
 *   illisible ⇒ `actorRoleLevel` rend 0, donc refus — jamais d'autorisation
 *   par défaut.
 */
export function mayMintShareLink(
  actor: ConversationActor,
  conversation: { readonly type: string }
): boolean {
  if (conversation.type === 'public') return true;
  if (conversation.type === 'global') return isGlobalAdmin(actor.platformRole ?? '');
  return actorHasMinimumRole(actor, MemberRole.MODERATOR);
}

/** Le résultat Prisma d'une création — dérivé du client, jamais recopié à la main. */
type ConversationShareLinkRow = Awaited<ReturnType<PrismaClient['conversationShareLink']['create']>>;

/**
 * Un participant à créer avec la conversation NEUVE d'un lien de partage
 * (branches `newConversation` et legacy ci-dessous). Typé explicitement —
 * `creation.ts` portait ce tableau en `any[]`, ce que CLAUDE.md interdit
 * (« No any types - ever ») et qui masquait `Participant.permissions` derrière
 * un objet sans forme déclarée.
 */
type NewParticipantSeed = {
  readonly userId: string;
  readonly type: 'user';
  readonly displayName: string;
  readonly role: 'creator' | 'member';
  readonly permissions: {
    readonly canSendMessages: boolean;
    readonly canSendFiles: boolean;
    readonly canSendImages: boolean;
    readonly canSendVideos: boolean;
    readonly canSendAudios: boolean;
    readonly canSendLocations: boolean;
    readonly canSendLinks: boolean;
  };
};

export type MintedShareLink = {
  readonly shareLink: ConversationShareLinkRow;
  readonly linkId: string;
  readonly conversationId: string;
};

/**
 * `fastify.log` (Pino) ET le `logger` local à `sharing.ts`
 * (`enhancedLogger.child(...)`) doivent tous deux satisfaire ce type — d'où
 * la forme MÉTHODE plutôt qu'une propriété fléchée : sous
 * `strictFunctionTypes: false` (tsconfig du gateway), seule la syntaxe
 * méthode bénéficie de la vérification bivariante des paramètres. Les deux
 * loggers exposent une signature `error` différente (Pino accepte un objet en
 * tête ; `enhancedLogger` prend `(message, contexte?)`) ; cette interface ne
 * retient que ce que ce module utilise réellement des deux.
 */
export type MintShareLinkLogger = {
  error(...args: unknown[]): void;
};

export type MintShareLinkParams = {
  readonly prisma: PrismaClient;
  readonly reply: FastifyReply;
  readonly log: MintShareLinkLogger;
  /** Absent en test ou avant l'initialisation complète du serveur — best-effort, jamais bloquant. */
  readonly notificationService: NotificationService | undefined;
  readonly socketIOHandler: MeeshySocketIOHandler | undefined;
  /** `User.id` de l'appelant — les deux portes exigent un inscrit. */
  readonly userId: string;
  /** `User.role` (plateforme), déjà résolu par l'appelant — cette fonction ne relit jamais l'acteur. */
  readonly userRole: string;
  readonly input: CreateLinkInput;
};

/**
 * Fabrique un lien de partage, ou répond l'erreur adéquate et rend `null`.
 *
 * `null` signifie « la réponse est déjà partie » : l'appelant n'a plus qu'à
 * `return` sans rien envoyer d'autre. C'est ce qui permet à `new-link` et
 * `/links` de rester des adaptateurs MINCES — aucune des deux décisions
 * (rang, clôture, type) ni aucun des deux messages d'erreur ne sont dupliqués
 * au site d'appel.
 */
export async function mintConversationShareLink(params: MintShareLinkParams): Promise<MintedShareLink | null> {
  const { prisma, reply, log, notificationService, socketIOHandler, userId, userRole, input } = params;

  let conversationId: string;
  let conversationTitle: string | null;

  if (input.conversationId) {
    // ─── Lien sur une conversation EXISTANTE ─────────────────────────────
    //
    // Un seul résolveur d'identifiant pour les deux routes : `new-link`
    // l'utilisait déjà, `/links` réservait un cas spécial à la main pour
    // `"meeshy"` (l'identifiant du salon global) puis relisait la ligne par
    // ObjectId BRUT — `conversation.findUnique({ where: { id: "meeshy" } })`
    // — ce qui aurait levé (ObjectId malformé) si ce chemin avait jamais été
    // exercé avec un identifiant non-ObjectId autre que "meeshy" lui-même
    // laissé tel quel plus bas dans la création du lien. `resolveConversationId`
    // (déjà mis en cache, § CLAUDE.md « ConversationId Cache ») couvre les
    // DEUX formes d'un seul appel et supprime le cas spécial.
    const resolvedId = await resolveConversationId(prisma, input.conversationId);
    if (!resolvedId) {
      sendNotFound(reply, 'Conversation non trouvée');
      return null;
    }

    const [conversation, membership] = await Promise.all([
      prisma.conversation.findUnique({
        where: { id: resolvedId },
        select: { id: true, type: true, title: true, isActive: true, closedAt: true }
      }),
      prisma.participant.findFirst({
        where: { conversationId: resolvedId, userId, isActive: true }
      })
    ]);

    if (!conversation) {
      sendNotFound(reply, 'Conversation non trouvée');
      return null;
    }
    if (!membership) {
      sendForbidden(reply, "Vous n'êtes pas membre de cette conversation");
      return null;
    }

    // Un fil terminé n'admet plus personne (cycle 70 du journal du dépôt) :
    // fabriquer un lien NEUF dessus produirait un lien actif en base — vivant
    // aux yeux des écrans de gestion — dont la seule issue possible est le
    // 410 posé à chacun de ceux qui le suivraient. Cette garde n'existait que
    // sur `/links` ; `new-link` en était totalement dépourvue.
    if (isConversationClosed(conversation)) {
      sendError(reply, 410, 'CONVERSATION_CLOSED', { message: 'Cette conversation est terminée' });
      return null;
    }

    if (conversation.type === 'direct') {
      sendForbidden(reply, 'Cannot create share links for direct conversations');
      return null;
    }

    // La garde qui MANQUAIT sur les deux portes : sans elle, tout membre
    // actif d'un groupe privé — quel que soit son rang — fabriquait un lien
    // vers l'historique complet, quand toutes les routes voisines de gestion
    // de l'appartenance exigent MODERATOR.
    const actor: ConversationActor = { conversationRole: membership.role, platformRole: userRole };
    if (!mayMintShareLink(actor, conversation)) {
      sendForbidden(reply, 'You do not have the necessary rights to perform this operation');
      return null;
    }

    conversationId = conversation.id;
    conversationTitle = conversation.title;
  } else if (input.newConversation) {
    // ─── Lien + conversation NEUVE, avec membres initiaux ────────────────
    // Aucune garde de rang : l'acteur EST le créateur de ce qu'il vient de
    // fabriquer, exactement comme `POST /conversations` ne demande de rang à
    // personne pour la conversation qu'on crée soi-même.
    const defaultPerms = {
      canSendMessages: true, canSendFiles: true, canSendImages: true,
      canSendVideos: false, canSendAudios: false, canSendLocations: false, canSendLinks: false
    };

    const creatorInfo = await prisma.user.findUnique({
      where: { id: userId },
      select: { displayName: true, username: true }
    });
    const participantsToCreate: NewParticipantSeed[] = [
      { userId, type: 'user', displayName: creatorInfo?.displayName || creatorInfo?.username || 'User', role: 'creator', permissions: defaultPerms }
    ];

    if (input.newConversation.memberIds && input.newConversation.memberIds.length > 0) {
      const uniqueMemberIds = [...new Set(input.newConversation.memberIds)]
        .filter((id) => id && id !== userId && id.trim().length > 0);

      const memberUsers = await prisma.user.findMany({
        where: { id: { in: uniqueMemberIds } },
        select: { id: true, displayName: true, username: true }
      });
      const memberMap = new Map(memberUsers.map((u) => [u.id, u]));
      for (const memberId of uniqueMemberIds) {
        const memberUser = memberMap.get(memberId);
        if (memberUser) {
          participantsToCreate.push({
            userId: memberId, type: 'user',
            displayName: memberUser.displayName || memberUser.username || 'User',
            role: 'member', permissions: defaultPerms
          });
        }
      }
    }

    const conversationIdentifier = generateConversationIdentifier(input.newConversation.title);
    const conversation = await prisma.conversation.create({
      data: {
        identifier: conversationIdentifier,
        type: 'public',
        title: input.newConversation.title,
        description: input.newConversation.description || null,
        participants: { create: participantsToCreate }
      }
    });
    conversationId = conversation.id;
    conversationTitle = conversation.title;

    const socketManager = socketIOHandler?.getManager();
    if (socketManager) {
      for (const participant of participantsToCreate) {
        socketManager.joinUserToConversationRoom(participant.userId, conversation.id).catch(
          (err: unknown) => logError(log, 'Failed to auto-join member to new conversation room:', err)
        );
      }
    }
  } else {
    // ─── Repli LEGACY : ni conversation existante, ni `newConversation` ──
    const conversationIdentifier = generateConversationIdentifier(input.name || 'Shared Conversation');
    const legacyCreatorInfo = await prisma.user.findUnique({
      where: { id: userId },
      select: { displayName: true, username: true }
    });
    const conversation = await prisma.conversation.create({
      data: {
        identifier: conversationIdentifier,
        type: 'public',
        title: input.name ? SecuritySanitizer.sanitizeText(input.name) : 'Conversation partagée',
        description: input.description ? SecuritySanitizer.sanitizeText(input.description) : undefined,
        participants: {
          create: [{
            userId, type: 'user',
            displayName: legacyCreatorInfo?.displayName || legacyCreatorInfo?.username || 'User',
            role: 'creator',
            permissions: {
              canSendMessages: true, canSendFiles: true, canSendImages: true,
              canSendVideos: false, canSendAudios: false, canSendLocations: false, canSendLinks: false
            }
          }]
        }
      }
    });
    conversationId = conversation.id;
    conversationTitle = conversation.title;

    const socketManager = socketIOHandler?.getManager();
    if (socketManager) {
      socketManager.joinUserToConversationRoom(userId, conversation.id).catch(
        (err: unknown) => logError(log, 'Failed to auto-join creator to new conversation room:', err)
      );
    }
  }

  // ─── Identifiants + écriture du lien (queue commune aux trois branches) ─
  const linkId = await generateUniqueShareLinkId(prisma);

  let baseIdentifier = '';
  if (input.name) {
    baseIdentifier = `mshy_${input.name.toLowerCase().replace(/[^a-z0-9-]/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '')}`;
  } else if (input.description) {
    baseIdentifier = `mshy_${input.description.toLowerCase().replace(/[^a-z0-9-]/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '').substring(0, 30)}`;
  }
  const uniqueIdentifier = await ensureUniqueShareLinkIdentifier(prisma, baseIdentifier);

  const shareLink = await prisma.conversationShareLink.create({
    data: {
      linkId,
      conversationId,
      createdBy: userId,
      name: input.name ? SecuritySanitizer.sanitizeText(input.name) : input.name,
      description: input.description ? SecuritySanitizer.sanitizeText(input.description) : input.description,
      maxUses: input.maxUses ?? undefined,
      maxConcurrentUsers: input.maxConcurrentUsers ?? undefined,
      maxUniqueSessions: input.maxUniqueSessions ?? undefined,
      expiresAt: input.expiresAt ? new Date(input.expiresAt) : undefined,
      allowAnonymousMessages: input.allowAnonymousMessages ?? true,
      allowAnonymousFiles: input.allowAnonymousFiles ?? false,
      allowAnonymousImages: input.allowAnonymousImages ?? true,
      // #4169 — les deux portes partageaient `?? true` : un anonyme muni de
      // la seule URL lisait l'historique complet d'un groupe, sans qu'aucun
      // admin n'ait rien décidé. Un membre INSCRIT invité par un ADMIN reçoit
      // déjà `canViewHistory: false` par défaut (`sharing.ts`, route
      // `/invite`) — un anonyme ne naît plus plus privilégié que lui.
      allowViewHistory: input.allowViewHistory ?? false,
      requireAccount: input.requireAccount ?? false,
      requireNickname: input.requireNickname ?? true,
      requireEmail: input.requireEmail ?? false,
      requireBirthday: input.requireBirthday ?? false,
      allowedCountries: input.allowedCountries ?? [],
      allowedLanguages: input.allowedLanguages ?? [],
      allowedIpRanges: input.allowedIpRanges ?? [],
      identifier: uniqueIdentifier
    }
  });

  // ─── Notification aux admins / au créateur — best-effort ────────────────
  try {
    const admins = await prisma.participant.findMany({
      where: {
        conversationId,
        isActive: true,
        OR: [{ role: 'admin' }, { role: 'creator' }],
        userId: { not: userId }
      },
      select: { userId: true }
    });

    if (notificationService && admins.length > 0) {
      for (const admin of admins) {
        await notificationService.createSystemNotification({
          recipientUserId: admin.userId,
          content: `Un lien de partage a été créé pour ${conversationTitle || 'la conversation'}${shareLink.name ? ` : ${shareLink.name}` : ''}`,
          priority: 'normal'
        });
      }
    }
  } catch {
    log.error('Error sending share link notification:');
  }

  return { shareLink, linkId, conversationId };
}
