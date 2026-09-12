import type { Attachment, Conversation, Message } from './types';

/**
 * LE DÉCODAGE DES DATES DU FIL (#5650, F1) — le cache TanStack tient la forme
 * du FIL (JSON, sérialisable) et `select` la DÉCODE au moment de servir
 * l'écran.
 *
 * La passerelle sert des chaînes ISO là où `@meeshy/shared` déclare `Date`
 * (`packages/shared/types/conversation.ts:189, 380-381, 446-447`) et la loi de
 * tri partagée appelle `.getTime()`
 * (`packages/shared/utils/conversation-sections.ts:122`). Un décodage dans
 * `queryFn` seul serait DÉFAIT par la persistance (JSON) ; un décodage dans
 * `select` (fonction de MODULE, référence stable ⇒ mémorisé par TanStack)
 * tient dans les DEUX cas : réseau et cache restauré. Les fixtures traversent
 * le même `select` sans effet (`toDate` idempotent sur une vraie `Date`).
 */

/**
 * `toDate` — IDEMPOTENT sur une `Date` déjà décodée (rend la MÊME instance,
 * jamais une copie) et TOLÉRANT sur une chaîne invalide (`Invalid Date`,
 * jamais une exception — le champ reste visible plutôt que de faire échouer
 * tout le décodage d'un objet pour une seule valeur corrompue).
 */
export function toDate(value: Date | string): Date {
  return value instanceof Date ? value : new Date(value);
}

/** N'écrit la clé QUE si la valeur source est définie — `exactOptionalPropertyTypes`
 * (`tsconfig.json:15`) : une clé absente doit le RESTER, jamais devenir une
 * clé posée à `undefined`.
 *
 * GÉNÉRIQUE SUR LA VALEUR, et c'est le correctif de #6086 : ce module n'a
 * longtemps eu que `dateFieldOf`, si bien que « défaire le `null` de la
 * passerelle » n'était OUTILLÉ que pour les dates. Les clés nullables d'un
 * autre type — `reactionSummary Json?`, `forwardedFromId String?` — n'avaient
 * aucun moyen d'être défaites, et traversaient intactes malgré la promesse
 * générale du commentaire de `decodeMessage`. `dateFieldOf` en est désormais
 * une projection : la règle a UN site, la conversion reste au sien. */
function fieldOf<K extends string, V>(key: K, value: V | null | undefined): Record<K, V> | Record<string, never> {
  if (value === null || value === undefined) return {};
  return { [key]: value } as Record<K, V>;
}

function dateFieldOf<K extends string>(key: K, value: Date | string | null | undefined): Record<K, Date> | Record<string, never> {
  if (value === null || value === undefined) return {};
  return fieldOf(key, toDate(value));
}

/**
 * `decodeAttachment` — LE DÉCODEUR QUI MANQUAIT (défaut bloquant, revue
 * #5805). `decodeMessage` défait `null` sur ONZE clés du MESSAGE
 * (#5668, #6086) mais ne touchait JAMAIS `message.attachments` : chaque
 * pièce jointe traversait BRUTE.
 *
 * Mesuré en direct sur `gate.staging.meeshy.me` (conv
 * `690d64275c50e29d3c0c6f29`) : TOUTE pièce jointe SANS transcription sert
 * `transcription: null`, `translations: null`, `alt: null`,
 * `thumbnailUrl: null` — EXPLICITES, jamais absents. Le type partagé
 * (`packages/shared/types/attachment.ts:284`) les déclare optionnelles SANS
 * `| null` : `tsc` est satisfait pendant que
 * `electDescription`/`electAudio` (`view/media.ts`, via
 * `transcriptionTextOf`, `api/prism.ts`) lèvent sur `transcription.type` —
 * le motif « un `Json?` Prisma sérialise `null` » déjà payé par le dépôt.
 * Sur un fil réel de 12 messages, UNE seule rangée survivait.
 *
 * Même régime que `decodeMessage` : le `null` est DÉFAIT à LA FRONTIÈRE,
 * jamais reconnu au point d'usage — `fieldOf` est le même outil générique
 * que `#6086` a introduit pour `reactionSummary`/`forwardedFromId`.
 */
function decodeAttachment(raw: Attachment): Attachment {
  const {
    transcription: rawTranscription,
    translations: rawTranslations,
    alt: rawAlt,
    thumbnailUrl: rawThumbnailUrl,
    ...rest
  } = raw as Attachment & {
    readonly transcription?: Attachment['transcription'] | null;
    readonly translations?: Attachment['translations'] | null;
    readonly alt?: Attachment['alt'] | null;
    readonly thumbnailUrl?: Attachment['thumbnailUrl'] | null;
  };
  return {
    ...rest,
    ...fieldOf('transcription', rawTranscription),
    ...fieldOf('translations', rawTranslations),
    ...fieldOf('alt', rawAlt),
    ...fieldOf('thumbnailUrl', rawThumbnailUrl),
  };
}

/**
 * `decodeMessage` — revit `createdAt`, `updatedAt`, `editedAt`, `deletedAt`,
 * `expiresAt`, `pinnedAt`, `deliveredToAllAt`, `readByAllAt`,
 * `translations[].createdAt`, `sender.lastActiveAt`, et `replyTo`
 * (RÉCURSIF — la passerelle n'imbrique qu'un niveau, et l'appel récursif est
 * sans risque : `toDate` est idempotent, il n'y a donc rien à borner).
 * `viewOnceCount`/`isBlurred` traversent INTACTS (jamais des dates).
 *
 * `translations` REÇOIT UNE GARDE (`?? []`) MALGRÉ SON TYPE `required`
 * (#5650, revue-correction contre le staging RÉEL) : `@meeshy/shared`
 * déclare `Message.translations` non-optionnel, mais la charge EMBARQUÉE
 * dans `Conversation.lastMessage` (`GET /conversations`, mesuré en direct
 * sur `gate.staging.meeshy.me`) est un APERÇU allégé qui ne la porte PAS du
 * tout — ni `conversationId`, ni `originalLanguage`, ni `translations`. Le
 * TYPE partagé décrit le `Message` COMPLET (`GET …/messages`) ; ce décodeur
 * sert LES DEUX formes, donc il ne peut faire confiance à AUCUN champ que ce
 * fichier ne garde pas déjà explicitement — fail-closed, jamais une
 * exception qui viderait tout l'écran pour un champ absent.
 */
export function decodeMessage(raw: Message): Message {
  // `null` RETIRÉ, jamais recopié (#5650, revue-correction ; durci défaut 4
  // de la revue #5668 — les SEPT clés de date portaient le même piège que
  // `sender`/`replyTo` sans être défaites de la source). La passerelle sert
  // `sender: null` (`messages-list-query.ts:678`), `replyTo: null` (`:718`,
  // la citation d'un message disparu) et `deletedAt: null` /
  // `expiresAt: null` / … (mesuré en direct sur `gate.staging.meeshy.me`,
  // script diag-deleted.mjs) là où `@meeshy/shared` déclare des champs
  // optionnels. Un simple `{ ...raw }` REPOSERAIT chacune de ces clés à
  // `null` : la garde conditionnelle qui suit (`dateFieldOf` rendant `{}`)
  // ne peut pas RETIRER ce que l'étalement vient d'écrire — un objet vide
  // spreadé après `...rest` ne défait rien. On DÉFAIT donc TOUTES les clés
  // que la passerelle peut servir à `null` avant de recomposer — c'est le
  // seul endroit du chemin de données qui connaît le `null` du fil, et
  // aucune vue n'a plus à le connaître.
  //
  // #6086 — CETTE PHRASE N'ÉTAIT VRAIE QUE DES DATES, et le dire ne suffisait
  // pas à le faire. Les quatre dernières clés ci-dessous ne sont pas des
  // dates ; elles manquaient parce que le seul outil du module était
  // `dateFieldOf`, et qu'une règle qu'aucun outil n'exprime ne s'applique
  // qu'aux cas déjà outillés. `reactionSummary Json?` (`schema.prisma:872`)
  // vaut `null` sur tout message SANS réaction — le cas NOMINAL : ouvrir une
  // conversation jetait `Object.entries(null)` depuis `reactionsSegment`
  // (`lib/view/message-a11y-label.ts`) et le fil ne se rendait pas.
  // `forwardedFromId`/`forwardedFromConversationId` donnaient le symptôme
  // INVERSE, silencieux : `forwardAttributionOf`
  // (`lib/view/message-badges.ts`) rendait `{ kind: 'anonymous' }` sur un
  // message ordinaire — le badge « Transféré » sur ce qui n'est pas un
  // transfert.
  //
  // CES DEUX LOIS TESTENT `=== undefined`, ET C'EST JUSTE : leur contrat est
  // de lire un `Message` DÉCODÉ. Elles dépendent donc de ce module, pas d'une
  // garde locale dupliquée — mais tout nouveau chemin qui construirait un
  // `Message` sans passer par `select: decodeMessage(s)` les remettrait en
  // face du `null`.
  const {
    sender: rawSender,
    replyTo: rawReplyTo,
    updatedAt: rawUpdatedAt,
    editedAt: rawEditedAt,
    deletedAt: rawDeletedAt,
    expiresAt: rawExpiresAt,
    pinnedAt: rawPinnedAt,
    deliveredToAllAt: rawDeliveredToAllAt,
    readByAllAt: rawReadByAllAt,
    reactionSummary: rawReactionSummary,
    forwardedFromId: rawForwardedFromId,
    forwardedFromConversationId: rawForwardedFromConversationId,
    storyReplyToId: rawStoryReplyToId,
    attachments: rawAttachments,
    ...rest
  } = raw as Message & {
    readonly sender?: Message['sender'] | null;
    readonly replyTo?: Message | null;
    readonly updatedAt?: Message['updatedAt'] | null;
    readonly editedAt?: Message['editedAt'] | null;
    readonly deletedAt?: Message['deletedAt'] | null;
    readonly expiresAt?: Message['expiresAt'] | null;
    readonly pinnedAt?: Message['pinnedAt'] | null;
    readonly deliveredToAllAt?: Message['deliveredToAllAt'] | null;
    readonly readByAllAt?: Message['readByAllAt'] | null;
    readonly reactionSummary?: Message['reactionSummary'] | null;
    readonly forwardedFromId?: Message['forwardedFromId'] | null;
    readonly forwardedFromConversationId?: Message['forwardedFromConversationId'] | null;
    readonly storyReplyToId?: Message['storyReplyToId'] | null;
    readonly attachments?: readonly Attachment[] | null;
  };
  const senderLastActiveAt = rawSender?.lastActiveAt;
  const sender =
    rawSender === undefined || rawSender === null
      ? undefined
      : senderLastActiveAt === undefined || senderLastActiveAt === null
        ? rawSender
        : { ...rawSender, lastActiveAt: toDate(senderLastActiveAt) };

  return {
    ...rest,
    ...(sender === undefined ? {} : { sender }),
    translations: (raw.translations ?? []).map((t) => ({ ...t, createdAt: toDate(t.createdAt) })),
    ...(rawReplyTo === undefined || rawReplyTo === null ? {} : { replyTo: decodeMessage(rawReplyTo) }),
    createdAt: toDate(raw.createdAt),
    ...dateFieldOf('updatedAt', rawUpdatedAt),
    ...dateFieldOf('editedAt', rawEditedAt),
    ...dateFieldOf('deletedAt', rawDeletedAt),
    ...dateFieldOf('expiresAt', rawExpiresAt),
    ...dateFieldOf('pinnedAt', rawPinnedAt),
    ...dateFieldOf('deliveredToAllAt', rawDeliveredToAllAt),
    ...dateFieldOf('readByAllAt', rawReadByAllAt),
    ...fieldOf('reactionSummary', rawReactionSummary),
    ...fieldOf('forwardedFromId', rawForwardedFromId),
    ...fieldOf('forwardedFromConversationId', rawForwardedFromConversationId),
    ...fieldOf('storyReplyToId', rawStoryReplyToId),
    ...(rawAttachments === undefined || rawAttachments === null
      ? {}
      : { attachments: rawAttachments.map(decodeAttachment) }),
  };
}

export function decodeMessages(raw: readonly Message[]): readonly Message[] {
  return raw.map(decodeMessage);
}

/**
 * `decodeConversation` — revit `createdAt`, `updatedAt`, `lastMessageAt`,
 * `currentUserJoinedAt`, `lastMessage.createdAt` ; NE TOUCHE PAS
 * `userPreferences` (tableau opaque, `preferences.ts` en fait le narrowing)
 * ni `lastMessageTranslations` (déjà des chaînes, jamais des dates).
 */
export function decodeConversation(raw: Conversation): Conversation {
  /**
   * `lastMessage` DÉFAIT de la source (#5650, revue-correction) : la
   * passerelle sert un `null` EXPLICITE pour une conversation sans premier
   * message (mesuré sur `gate.staging.meeshy.me`) là où le type déclare
   * `Message | undefined`. Le garder derrière un étalement `{ ...raw }`
   * REPOSAIT la clé à `null` — la garde conditionnelle ne retire pas ce que
   * l'étalement vient d'écrire, et chaque vue devait alors connaître un
   * troisième état que son type ne déclare pas. Ici, une fois pour toutes :
   * la clé est ABSENTE (`exactOptionalPropertyTypes`, `tsconfig.json:15`).
   */
  const { lastMessage: rawLastMessage, ...rest } = raw as Conversation & {
    readonly lastMessage?: Conversation['lastMessage'] | null;
  };
  return {
    ...rest,
    ...(rawLastMessage === undefined || rawLastMessage === null
      ? {}
      : { lastMessage: decodeMessage(rawLastMessage) }),
    createdAt: toDate(raw.createdAt),
    updatedAt: toDate(raw.updatedAt),
    ...dateFieldOf('lastMessageAt', raw.lastMessageAt),
    ...dateFieldOf('currentUserJoinedAt', raw.currentUserJoinedAt),
  };
}

export function decodeConversations(raw: readonly Conversation[]): readonly Conversation[] {
  return raw.map(decodeConversation);
}
