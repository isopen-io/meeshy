import type { PrismaClient } from '@meeshy/shared/prisma/client';
import type { MentionParticipant } from '@meeshy/shared/utils/mention-parser';

/**
 * Le message tel que la résolution de mentions le lit. Structural et minimal :
 * les routes de lien de partage ne construisent pas un `Message` Prisma
 * complet, et rien ici n'a besoin de plus que ces trois champs.
 *
 * `senderId` alimente `validateMentionPermissions`, qui le compare aux
 * `Participant.userId` de la conversation pour écarter l'auto-mention en
 * `direct` : la valeur ATTENDUE est donc un `User.id`. Le chemin d'édition en
 * passe un ; les chemins d'envoi (socket, REST, lien) passent un
 * `Participant.id`, qui n'égale jamais un `User.id` — l'auto-mention y échappe
 * au filtre. Défaut préexistant, sans autre effet (la comparaison ne sert
 * qu'en `direct`), suivi hors de ce cycle.
 */
export interface MentionTargetMessage {
  readonly id: string;
  readonly conversationId: string;
  readonly senderId: string;
}

/**
 * La seule surface Prisma que la résolution touche. `Pick<PrismaClient, …>`
 * plutôt qu'une interface maison, même raison que `FanOutPrisma` : les
 * délégués générés portent des surcharges que rien de recopié à la main ne
 * satisfait.
 */
export type MentionPrisma = Pick<PrismaClient, 'participant' | 'user' | 'message' | 'mention'>;

/**
 * `'create'` — le message vient de naître : il n'a aucune ligne `Mention`, et un
 * contenu sans `@` n'a rien à écrire (le champ vaut déjà `[]`).
 *
 * `'replace'` — le message existait : l'ensemble de ses mentionnés doit être
 * RÉCONCILIÉ avec son nouveau contenu. Trois différences, et chacune répare un
 * défaut du chemin d'édition qu'il remplace :
 *
 * 1. Le court-circuit « pas de `@` » ne rend plus la main : retirer la dernière
 *    mention d'un message doit la retirer pour de bon.
 * 2. On ne purge PAS pour recréer. `Mention.mentionedAt` est l'axe de tri de
 *    l'inbox : recréer la ligne d'un mentionné inchangé remonterait une mention
 *    de trois jours en tête parce que l'auteur a corrigé une faute de frappe.
 * 3. `newlyMentionedUserIds` isole les entrants, pour que dix corrections
 *    successives n'envoient pas dix pushes à quelqu'un déjà nommé au premier
 *    envoi.
 */
export type MentionResolutionMode = 'create' | 'replace';

/**
 * Les quatre méthodes de `MentionService` que la résolution appelle, en
 * structural pour que le double de test soit trivial et pour qu'une route
 * n'ait pas à importer la classe entière.
 */
export interface MentionResolver {
  extractMentionsWithParticipants(content: string, participants: MentionParticipant[]): string[];
  resolveUsernames(usernames: string[]): Promise<Map<string, { id: string; username: string }>>;
  validateMentionPermissions(
    conversationId: string,
    mentionedUserIds: string[],
    senderId: string
  ): Promise<{ validUserIds: string[] }>;
  createMentions(messageId: string, mentionedUserIds: string[]): Promise<void>;
}

export interface ResolvedMentions {
  /** `User.id` des mentionnés retenus — ce que l'éventail de notifications attend. */
  readonly validatedUserIds: readonly string[];
  /** Leurs `username`, tels que persistés dans `Message.validatedMentions`. */
  readonly validatedUsernames: readonly string[];
  /**
   * Ceux qui n'étaient PAS déjà mentionnés — le seul lot qu'une notification
   * doit atteindre. En `'create'`, c'est l'ensemble complet ; en `'replace'`,
   * la différence avec les lignes `Mention` déjà en base.
   */
  readonly newlyMentionedUserIds: readonly string[];
  /**
   * `true` quand `validatedUsernames` DÉCRIT l'état du message — y compris
   * lorsqu'il est vide parce que plus rien n'y est mentionné.
   *
   * `false` quand l'unité n'a rien pu établir : service absent, ensemble
   * précédent illisible, résolution en échec. La distinction n'est pas
   * cosmétique — sans elle, un appelant qui recopie `validatedUsernames` dans
   * sa réponse et dans sa diffusion socket rejoue au niveau du PAYLOAD
   * l'effacement que cette unité vient d'empêcher en base : le client cache le
   * vide (`staleTime: Infinity` côté web) et la mention disparaît quand même.
   */
  readonly reconciled: boolean;
}

/** Rien à dire sur ce message : l'appelant garde ce que la base porte déjà. */
const UNRESOLVED: ResolvedMentions = {
  validatedUserIds: [],
  validatedUsernames: [],
  newlyMentionedUserIds: [],
  reconciled: false,
};

/** Établi, et vide : ce message ne nomme personne. */
const NO_MENTIONS: ResolvedMentions = { ...UNRESOLVED, reconciled: true };

/**
 * Les participants inscrits d'une conversation, sous la forme que le parseur de
 * mentions attend (il résout `@Display Name` autant que `@username`).
 *
 * Best-effort : une lecture en échec dégrade vers la liste vide, où seuls les
 * `@handle` bruts restent extractibles. Perdre les mentions par nom d'affichage
 * vaut mieux que perdre le message.
 */
async function loadMentionParticipants(
  prisma: Pick<MentionPrisma, 'participant'>,
  conversationId: string,
  onError?: (error: unknown) => void
): Promise<MentionParticipant[]> {
  try {
    const participants = await prisma.participant.findMany({
      where: { conversationId, isActive: true, type: 'user' },
      select: {
        userId: true,
        displayName: true,
        user: { select: { id: true, username: true, displayName: true } },
      },
    });

    return participants
      .filter((p): p is typeof p & { user: NonNullable<typeof p.user> } => p.user !== null)
      .map((p) => ({
        userId: p.user.id,
        username: p.user.username,
        displayName: p.user.displayName ?? p.user.username,
      }));
  } catch (error) {
    onError?.(error);
    return [];
  }
}

/**
 * Ce que TOUT message porteur d'un `@` doit à ceux qu'il nomme : une ligne
 * `Mention`, un `Message.validatedMentions` à jour, et le lot d'ids que
 * l'éventail de notifications transforme en push.
 *
 * Cette unité existe parce que l'obligation vivait dans une méthode PRIVÉE de
 * `MessageProcessor` (`processMentionsInDB` ← `handleMentionsAndNotifications`
 * ← `saveMessage`). Les deux routes de lien de partage contournent
 * `MessagingService.handleMessage`, donc `MessageProcessor` en entier : un
 * `@alice` envoyé par lien ne produisait AUCUNE ligne `Mention` (absent de
 * l'inbox `/mentions`), AUCUN `validatedMentions` (le web surligne depuis ce
 * champ — le texte restait brut) et AUCUNE notification de mention. Même
 * défaut et même remède que `broadcastLinkMessage`,
 * `runMessagePostSaveEffects`, `emitUnreadCountsToRecipients` et
 * `notifyMessageRecipients` : un point d'appel public que tout écrivain peut
 * atteindre.
 *
 * Le court-circuit vit ICI, pas chez l'appelant : un message sans `@` et sans
 * mention explicite ne doit coûter aucune requête, et c'est une garde qu'un
 * nouvel écrivain oublierait. Aucun appelant n'a à la reproduire.
 *
 * Best-effort de bout en bout — ne lève jamais. Une mention perdue ne doit pas
 * transformer un envoi réussi en 500 ; `onError` laisse l'appelant journaliser
 * dans le contexte de sa requête.
 *
 * Les usernames rendus sont ceux des ids RETENUS par la validation, jamais
 * l'extraction brute : `validatedMentions` est lu par le client pour surligner,
 * donc y laisser un mentionné rejeté surlignerait quelqu'un qui n'a reçu ni
 * ligne `Mention` ni notification.
 */
export async function resolveMessageMentions(params: {
  prisma: MentionPrisma;
  mentionService: MentionResolver | null | undefined;
  message: MentionTargetMessage;
  content: string;
  /** Mentions déjà désignées par le client, en `User.id` — court-circuite l'extraction. */
  explicitMentionedUserIds?: readonly string[];
  /** `'create'` (défaut) pour un message neuf, `'replace'` pour une édition. */
  mode?: MentionResolutionMode;
  onError?: (error: unknown) => void;
}): Promise<ResolvedMentions> {
  const { prisma, mentionService, message, content, onError } = params;
  const explicit = params.explicitMentionedUserIds ?? [];
  const replacing = params.mode === 'replace';

  // Sans service, rien n'est résolvable — donc rien n'est réconciliable. Une
  // édition ne DOIT PAS en conclure que le message ne nomme plus personne : le
  // chemin qu'on remplace vidait `validatedMentions` à chaque édition tant que
  // le service n'était pas câblé, et le texte, lui, nommait toujours quelqu'un.
  if (!mentionService) return UNRESOLVED;
  if (!replacing && explicit.length === 0 && !content.includes('@')) return NO_MENTIONS;

  try {
    // L'ensemble précédent est la seule source de « qui est nouveau » et de
    // « qui est parti ». Sa lecture est DANS le try : en échec, la
    // réconciliation ne peut plus garantir qu'elle ne détruit rien, donc elle
    // s'abstient entièrement plutôt que de purger à l'aveugle.
    const previousUserIds = replacing
      ? (await prisma.mention.findMany({
          where: { messageId: message.id },
          select: { mentionedParticipantId: true },
        })).map((row) => row.mentionedParticipantId)
      : [];

    const clearAll = async (): Promise<ResolvedMentions> => {
      if (previousUserIds.length > 0) {
        await prisma.mention.deleteMany({ where: { messageId: message.id } });
        await prisma.message.update({
          where: { id: message.id },
          data: { validatedMentions: [] },
        });
      }
      return NO_MENTIONS;
    };

    if (replacing && explicit.length === 0 && !content.includes('@')) return await clearAll();

    const usernameByUserId = new Map<string, string>();
    let candidateUserIds: string[] = [];

    if (explicit.length > 0) {
      candidateUserIds = Array.from(explicit);
    } else {
      const participants = await loadMentionParticipants(prisma, message.conversationId, onError);
      const extracted = mentionService.extractMentionsWithParticipants(content, participants);
      if (extracted.length === 0) return replacing ? await clearAll() : NO_MENTIONS;

      const userMap = await mentionService.resolveUsernames(extracted);
      for (const [username, user] of userMap.entries()) {
        usernameByUserId.set(user.id, username);
      }
      candidateUserIds = Array.from(usernameByUserId.keys());
    }

    if (candidateUserIds.length === 0) return replacing ? await clearAll() : NO_MENTIONS;

    const { validUserIds } = await mentionService.validateMentionPermissions(
      message.conversationId,
      candidateUserIds,
      message.senderId
    );
    if (validUserIds.length === 0) return replacing ? await clearAll() : NO_MENTIONS;

    // Réconciliation : les partants partent, les restants ne bougent pas, les
    // entrants entrent. En `'create'`, `previousUserIds` est vide, donc les
    // entrants sont l'ensemble complet et rien n'est supprimé — le chemin
    // nominal du cycle 20, inchangé.
    const previous = new Set(previousUserIds);
    const retained = new Set(validUserIds);
    const departedUserIds = previousUserIds.filter((id) => !retained.has(id));
    const newlyMentionedUserIds = validUserIds.filter((id) => !previous.has(id));

    if (departedUserIds.length > 0) {
      await prisma.mention.deleteMany({
        where: { messageId: message.id, mentionedParticipantId: { in: departedUserIds } },
      });
    }

    await mentionService.createMentions(message.id, newlyMentionedUserIds);

    if (explicit.length > 0) {
      const users = await prisma.user.findMany({
        where: { id: { in: validUserIds } },
        select: { id: true, username: true },
      });
      for (const user of users) usernameByUserId.set(user.id, user.username);
    }

    const validatedUsernames = validUserIds
      .map((id) => usernameByUserId.get(id))
      .filter((username): username is string => username !== undefined);

    await prisma.message.update({
      where: { id: message.id },
      data: { validatedMentions: validatedUsernames },
    });

    return { validatedUserIds: validUserIds, validatedUsernames, newlyMentionedUserIds, reconciled: true };
  } catch (error) {
    onError?.(error);
    return UNRESOLVED;
  }
}
