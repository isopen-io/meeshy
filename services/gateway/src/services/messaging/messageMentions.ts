import type { PrismaClient } from '@meeshy/shared/prisma/client';
import type { MentionParticipant } from '@meeshy/shared/utils/mention-parser';
import { MAX_MENTIONS_PER_MESSAGE } from '../../validation/mention-list.js';
import { protectedPreview } from '../notifications/NotificationService';

/**
 * Le masque servi quand la relecture des drapeaux ne conclut pas — message
 * introuvable ou lecture en échec. Fail-CLOSED : cf. `loadMessageProtection`.
 */
const PROTECTION_ON_UNKNOWN = { preview: '🔒 💬', locKey: 'notification.hidden_message' } as const;

/**
 * Le message tel que la résolution de mentions le lit. Structural et minimal :
 * les routes de lien de partage ne construisent pas un `Message` Prisma
 * complet, et rien ici n'a besoin de plus que ces trois champs.
 *
 * `senderId` est un `Participant.id` — c'est ce que la colonne `Message.senderId`
 * référence, et c'est donc tout ce que les quatre appelants tiennent. La
 * validation des permissions, elle, raisonne en `User.id` ; la traduction entre
 * les deux vit ICI (cf. `resolveSenderUserId`), une fois, plutôt que dans quatre
 * appelants qui auraient chacun l'occasion de l'oublier.
 */
export interface MentionTargetMessage {
  readonly id: string;
  readonly conversationId: string;
  readonly senderId: string;
  /**
   * Échéance du message, reportée sur la notification de mention : celle-ci
   * DÉSIGNE ce message et ne doit pas lui survivre. Optionnelle parce que les
   * transports d'édition ne construisent pas tous un `Message` Prisma complet
   * — absente, aucune échéance, le comportement d'avant.
   */
  readonly expiresAt?: Date | null;
}

/**
 * La seule surface Prisma que la résolution touche. `Pick<PrismaClient, …>`
 * plutôt qu'une interface maison, même raison que `FanOutPrisma` : les
 * délégués générés portent des surcharges que rien de recopié à la main ne
 * satisfait.
 */
export type MentionPrisma = Pick<PrismaClient, 'participant' | 'user' | 'message' | 'mention'>;

/**
 * L'identité UTILISATEUR derrière le participant expéditeur.
 *
 * `validateMentionPermissions` compare l'expéditeur aux `Participant.userId` des
 * membres — donc à des `User.id`. Lui passer le `Participant.id` que porte
 * `Message.senderId` compare deux espaces disjoints : l'inégalité est toujours
 * vraie, et la règle « on ne se mentionne pas soi-même » d'une conversation
 * directe ne se déclenche jamais.
 *
 * `null` pour un expéditeur anonyme (aucun `User.id`) comme pour une lecture en
 * échec : dans les deux cas l'expéditeur n'est aucun des mentionnés, ce qui est
 * la réponse sûre — au pire une auto-mention passe, jamais un tiers rejeté.
 */
async function resolveSenderUserId(
  prisma: Pick<MentionPrisma, 'participant'>,
  senderParticipantId: string,
  onError?: (error: unknown) => void
): Promise<string | null> {
  try {
    const participant = await prisma.participant.findUnique({
      where: { id: senderParticipantId },
      select: { userId: true },
    });
    return participant?.userId ?? null;
  } catch (error) {
    onError?.(error);
    return null;
  }
}

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
    senderId: string | null
  ): Promise<{ validUserIds: string[] }>;
  createMentions(messageId: string, mentionedUserIds: string[]): Promise<void>;
}

/** Ce que le cœur commun établit. Il n'écrit rien, donc il ne conclut rien. */
interface ComputedMentions {
  readonly validatedUserIds: readonly string[];
  readonly validatedUsernames: readonly string[];
}

export interface ResolvedMentions extends ComputedMentions {
  /**
   * Ceux qui n'étaient PAS déjà mentionnés — le seul lot qu'une notification
   * doit atteindre. À la création, c'est l'ensemble complet ; à l'édition, la
   * différence avec les lignes `Mention` déjà en base.
   *
   * Sans lui, chaque édition renotifie tous les mentionnés : dix corrections de
   * frappe valent dix pushes à quelqu'un déjà nommé au premier envoi.
   */
  readonly newlyMentionedUserIds: readonly string[];
  /**
   * `true` quand `validatedUsernames` DÉCRIT l'état du message — y compris
   * lorsqu'il est vide parce que plus rien n'y est mentionné.
   *
   * `false` quand rien n'a pu être établi : service absent, ensemble précédent
   * illisible, résolution en échec. La distinction n'est pas cosmétique — sans
   * elle, un appelant qui recopie `validatedUsernames` dans sa réponse et dans
   * sa diffusion socket rejoue au niveau du PAYLOAD l'effacement que l'unité
   * vient d'empêcher en base : le client cache le vide (`staleTime: Infinity`
   * côté web) et la mention disparaît quand même.
   */
  readonly reconciled: boolean;
}

const NOTHING: ComputedMentions = { validatedUserIds: [], validatedUsernames: [] };

/** Rien à dire sur ce message : l'appelant garde ce que la base porte déjà. */
const UNRESOLVED: ResolvedMentions = { ...NOTHING, newlyMentionedUserIds: [], reconciled: false };

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
export async function resolveMessageMentions(params: MentionResolutionParams): Promise<ResolvedMentions> {
  const { prisma, mentionService, message, content, onError } = params;
  const explicit = params.explicitMentionedUserIds ?? [];

  if (!mentionService) return UNRESOLVED;
  if (explicit.length === 0 && !content.includes('@')) return NO_MENTIONS;

  try {
    const resolved = await computeValidatedMentions(params, mentionService, explicit);
    if (resolved.validatedUserIds.length === 0) return NO_MENTIONS;

    await mentionService.createMentions(message.id, [...resolved.validatedUserIds]);
    await prisma.message.update({
      where: { id: message.id },
      data: { validatedMentions: [...resolved.validatedUsernames] },
    });

    // Un message neuf ne portait aucune ligne `Mention` : tous ses mentionnés
    // sont des entrants.
    return { ...resolved, newlyMentionedUserIds: resolved.validatedUserIds, reconciled: true };
  } catch (error) {
    onError?.(error);
    return UNRESOLVED;
  }
}

/**
 * La même résolution, mais pour un message qui en portait DÉJÀ : l'édition.
 *
 * Une édition n'est pas une re-création : elle RÉCONCILIE. Trois différences
 * avec `resolveMessageMentions`, et chacune répare un défaut distinct du bloc
 * qui vivait dans la route :
 *
 *  1. **Pas de court-circuit « pas de `@` ».** `validatedMentions` est toujours
 *     réécrit, même vide : un contenu édité qui ne nomme plus personne doit
 *     effacer le champ, là où une création sans `@` ne doit rien écrire.
 *  2. **On ne purge PAS pour recréer.** `Mention.mentionedAt` est l'axe de tri
 *     de l'inbox (`@@index([mentionedUserId, mentionedAt(sort: Desc)])`).
 *     Supprimer puis recréer la ligne d'un mentionné INCHANGÉ lui donne un
 *     horodatage neuf : une mention de trois jours remonte en tête parce que
 *     l'auteur a corrigé une faute de frappe. Seuls les partants sont
 *     supprimés, seuls les entrants sont créés.
 *  3. **`newlyMentionedUserIds` isole les entrants**, qui sont exactement le lot
 *     à notifier. Une purge en bloc détruit l'ensemble précédent et rend la
 *     question insoluble — c'est elle qui forçait à renotifier tout le monde.
 *
 * Ce qu'elle corrige, côté extraction : la route extrayait avec
 * `extractMentions` (handles bruts seulement) là où la création extrait avec
 * `extractMentionsWithParticipants` (qui résout aussi `@Display Name`). Éditer
 * un message contenant `@John Doe` DÉTRUISAIT donc la mention — ligne
 * supprimée, champ remis à `[]` — alors que rien n'avait changé pour elle.
 *
 * Ce qu'elle corrige, côté panne : la route purgeait les lignes AVANT de tenter
 * quoi que ce soit, et remettait `validatedMentions: []` sur service absent
 * comme sur simple exception. Une panne transitoire détruisait des mentions que
 * rien ne reconstruit — personne ne relit le texte après coup. Ici, tout écrit
 * vit dans le chemin de succès : si l'ensemble précédent est illisible ou si la
 * résolution lève, la base reste telle qu'elle était et `reconciled` vaut
 * `false` pour que l'appelant n'efface pas non plus son payload. Préserver une
 * mention périmée vaut mieux que détruire une mention vivante : la première
 * surligne quelqu'un de trop le temps d'une édition, la seconde ne revient
 * jamais.
 */
export async function replaceMessageMentions(params: MentionResolutionParams): Promise<ResolvedMentions> {
  const { prisma, mentionService, message, onError } = params;
  const explicit = params.explicitMentionedUserIds ?? [];

  // Sans service, rien n'est résolvable — donc rien n'est réconciliable. En
  // conclure que le message ne nomme plus personne effacerait les mentions d'un
  // texte qui les porte toujours.
  if (!mentionService) return UNRESOLVED;

  try {
    // L'ensemble précédent est la seule source de « qui est parti » et de « qui
    // est nouveau ». Sa lecture est DANS le try : en échec, la réconciliation
    // ne peut plus garantir qu'elle ne détruit rien, donc elle s'abstient.
    const previousUserIds = (
      await prisma.mention.findMany({
        where: { messageId: message.id },
        select: { mentionedUserId: true },
      })
    ).map((row) => row.mentionedUserId);

    const resolved = await computeValidatedMentions(params, mentionService, explicit);

    const previous = new Set(previousUserIds);
    const retained = new Set(resolved.validatedUserIds);
    const departedUserIds = previousUserIds.filter((id) => !retained.has(id));
    const newlyMentionedUserIds = resolved.validatedUserIds.filter((id) => !previous.has(id));

    if (departedUserIds.length > 0) {
      await prisma.mention.deleteMany({
        where: { messageId: message.id, mentionedUserId: { in: departedUserIds } },
      });
    }

    // La garde du lot vide appartient à `createMentions`, qui la porte déjà.
    await mentionService.createMentions(message.id, newlyMentionedUserIds);

    await prisma.message.update({
      where: { id: message.id },
      data: { validatedMentions: [...resolved.validatedUsernames] },
    });

    return { ...resolved, newlyMentionedUserIds, reconciled: true };
  } catch (error) {
    onError?.(error);
    return UNRESOLVED;
  }
}

/**
 * Ce qu'une édition doit aux gens qu'elle vient de nommer : réconcilier les
 * lignes `Mention` ET prévenir les seuls entrants.
 *
 * Les deux moitiés vont ensemble et n'ont de sens qu'ensemble —
 * `newlyMentionedUserIds` n'existe que pour être notifié, et c'est la seule
 * chose que `replaceMessageMentions` produit sans la consommer. Les laisser
 * séparées, c'est ce qui a permis au chemin socket d'écrire le contenu édité
 * sans jamais toucher une mention : `message:edit` est le transport d'édition
 * PRIMAIRE, et il était le cinquième écrivain de la famille — le seul à n'en
 * appeler aucune des deux. Éditer « salut @alice » en « salut @bob » par socket
 * laissait Alice mentionnée en base et ne nommait jamais Bob, ni dans son inbox
 * `/mentions`, ni par notification, ni dans le `validatedMentions` que le web
 * relit pour surligner.
 *
 * Un seul point d'appel public, donc, plutôt que deux appels que le prochain
 * écrivain aurait la même occasion d'oublier à moitié.
 */
export async function reconcileEditedMentions(params: EditedMentionParams): Promise<ResolvedMentions> {
  const resolved = await replaceMessageMentions(params);
  await notifyNewlyMentioned(params, resolved.newlyMentionedUserIds);
  return resolved;
}

/**
 * Le seul lot qu'un push doit atteindre après une édition : les ENTRANTS.
 *
 * Les destinataires du premier envoi ont déjà été prévenus ; renotifier
 * l'ensemble complet ferait de dix corrections de frappe dix pushes pour
 * quelqu'un nommé une seule fois.
 *
 * Best-effort, comme tout le reste de l'unité : une notification perdue ne doit
 * pas défaire une réconciliation réussie. L'appel est donc APRÈS l'écriture, et
 * son échec ne remonte pas — `reconciled` continue de décrire la base.
 */
/**
 * Le masque de protection d'un message, ou `null` s'il n'en porte pas.
 *
 * Fail-CLOSED : une lecture en échec rend le masque le plus restrictif plutôt
 * que rien. C'est l'inverse de l'arbitrage habituel de cette unité (best-effort
 * partout ailleurs), et c'est délibéré — une notification perdue se rattrape,
 * un secret poussé non. Le pire cas est une bannière qui dit « un message »
 * sans son extrait.
 */
async function loadMessageProtection(
  prisma: MentionPrisma,
  messageId: string,
  onError?: (error: unknown) => void
): Promise<{ preview: string; locKey: string } | null> {
  try {
    const row = await prisma.message.findUnique({
      where: { id: messageId },
      select: {
        messageType: true, isEncrypted: true, isViewOnce: true,
        isBlurred: true, effectFlags: true, expiresAt: true, createdAt: true,
      },
    });
    if (!row) return PROTECTION_ON_UNKNOWN;
    return protectedPreview(row);
  } catch (error) {
    onError?.(error);
    return PROTECTION_ON_UNKNOWN;
  }
}

async function notifyNewlyMentioned(
  params: EditedMentionParams,
  newlyMentionedUserIds: readonly string[]
): Promise<void> {
  const { prisma, notificationService, message, content, editorUserId, onError } = params;
  if (newlyMentionedUserIds.length === 0 || !notificationService) return;

  try {
    const [sender, conversation] = await Promise.all([
      prisma.user.findUnique({
        where: { id: editorUserId },
        select: { username: true, displayName: true, avatar: true },
      }),
      prisma.conversation.findUnique({
        where: { id: message.conversationId },
        select: { participants: { where: { isActive: true }, select: { userId: true } } },
      }),
    ]);
    if (!sender || !conversation) return;

    // Cycle 123 bis — le contenu ÉDITÉ d'un message PROTÉGÉ ne part pas vers un
    // ENTRANT. Ce sont des TIERS : éditer un message à vue unique pour y nommer
    // quelqu'un lui poussait le texte en clair sur son écran verrouillé, alors
    // que l'éventail d'envoi masque exactement ce texte.
    //
    // Les drapeaux se relisent ICI plutôt que de descendre par `params` : une
    // garde de confidentialité qui dépend du câblage de l'appelant échoue en
    // montrant PLUS, et les quatre transports d'édition ne construisent pas
    // tous un `Message` complet (`MentionTargetMessage` ne porte que
    // `expiresAt`). La lecture n'a lieu que lorsqu'il y a des entrants à
    // notifier, cas rare sur le chemin d'édition.
    const protection = await loadMessageProtection(prisma, message.id, onError);

    await notificationService.createMentionNotificationsBatch(
      [...newlyMentionedUserIds],
      {
        senderId: editorUserId,
        senderProfile: sender,
        messageContent: protection ? protection.preview : content,
        // Le masque du TEXTE ne suffit pas : sans base déclarée,
        // `createMentionNotification` retombe sur `message-content` et le
        // Prisme réinjecterait la TRADUCTION du même secret dans le corps.
        ...(protection ? { previewBasis: { kind: 'protected-placeholder' as const } } : {}),
        conversationId: message.conversationId,
        messageId: message.id,
        messageExpiresAt: message.expiresAt ?? null,
      },
      conversation.participants
        .map((participant) => participant.userId)
        .filter((userId): userId is string => userId !== null)
    );
  } catch (error) {
    onError?.(error);
  }
}

/**
 * Le seul créateur que la notification de mention appelle, en structural pour
 * la même raison que `MentionResolver` : le double de test reste trivial et
 * l'unité n'importe pas `NotificationService` en entier.
 */
export interface MentionNotifier {
  createMentionNotificationsBatch(
    mentionedUserIds: string[],
    commonData: {
      senderId: string;
      senderProfile?: { username: string; displayName: string | null; avatar: string | null };
      messageContent: string;
      conversationId: string;
      messageId: string;
      messageExpiresAt?: Date | null;
    },
    memberIds: string[]
  ): Promise<unknown>;
}

interface MentionResolutionParams {
  prisma: MentionPrisma;
  mentionService: MentionResolver | null | undefined;
  message: MentionTargetMessage;
  content: string;
  /** Mentions déjà désignées par le client, en `User.id` — court-circuite l'extraction. */
  explicitMentionedUserIds?: readonly string[];
  onError?: (error: unknown) => void;
}

export interface EditedMentionParams extends MentionResolutionParams {
  /** La liste des membres à notifier se lit sur la conversation. */
  prisma: MentionPrisma & Pick<PrismaClient, 'conversation'>;
  notificationService: MentionNotifier | null | undefined;
  /**
   * L'AUTEUR de l'édition, en `User.id`. C'est lui que la notification nomme,
   * et c'est contre lui que `createMentionNotificationsBatch` filtre l'auto-
   * mention — pas contre `message.senderId`, qui est un `Participant.id`.
   */
  editorUserId: string;
}

/**
 * Le cœur commun : de quoi le contenu parle, qui a le droit d'être nommé.
 * N'écrit RIEN — les deux exports décident de ce qu'ils persistent, parce que
 * c'est précisément là qu'ils diffèrent.
 */
async function computeValidatedMentions(
  params: MentionResolutionParams,
  mentionService: MentionResolver,
  explicit: readonly string[]
): Promise<ComputedMentions> {
  const { prisma, message, content, onError } = params;

  const usernameByUserId = new Map<string, string>();
  let candidateUserIds: string[] = [];

  if (explicit.length > 0) {
    // Le plafond est celui de l'AUTRE source de la même donnée : l'extraction
    // depuis le contenu tronque à `MAX_MENTIONS_PER_MESSAGE` sur ses deux sites
    // (`MentionService`). La liste explicite n'était bornée nulle part — écart
    // sans conséquence tant qu'elle n'était honorée que par REST, et une entrée
    // non bornée de plus le jour où le transport socket la déclare.
    //
    // Elle TRONQUE, comme l'extraction, plutôt que de rejeter l'envoi : les
    // deux sources décrivent la même intention, et un message ne doit pas
    // échouer pour avoir nommé trop de monde là où l'autre chemin se contente
    // d'en retenir cinquante.
    candidateUserIds = Array.from(explicit).slice(0, MAX_MENTIONS_PER_MESSAGE);
  } else {
    const participants = await loadMentionParticipants(prisma, message.conversationId, onError);
    const extracted = mentionService.extractMentionsWithParticipants(content, participants);
    if (extracted.length === 0) return NOTHING;

    const userMap = await mentionService.resolveUsernames(extracted);
    for (const [username, user] of userMap.entries()) {
      usernameByUserId.set(user.id, username);
    }
    candidateUserIds = Array.from(usernameByUserId.keys());
  }

  if (candidateUserIds.length === 0) return NOTHING;

  const senderUserId = await resolveSenderUserId(prisma, message.senderId, onError);

  const { validUserIds } = await mentionService.validateMentionPermissions(
    message.conversationId,
    candidateUserIds,
    senderUserId
  );
  if (validUserIds.length === 0) return NOTHING;

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

  return { validatedUserIds: validUserIds, validatedUsernames };
}
