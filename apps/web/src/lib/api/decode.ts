import { trackingLinksOf } from '@meeshy/shared/utils/text-segments';

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
 * #5805). `decodeMessage` défait `null` sur les clés du MESSAGE (#5668,
 * #6086, #6080) mais ne touchait JAMAIS `message.attachments` : chaque pièce
 * jointe traversait BRUTE.
 *
 * Mesuré en direct sur `gate.staging.meeshy.me` (conv
 * `690d64275c50e29d3c0c6f29`) : TOUTE pièce jointe SANS transcription sert
 * `transcription: null`, `translations: null`, `alt: null`,
 * `thumbnailUrl: null` — EXPLICITES, jamais absents. Le type partagé
 * (`packages/shared/types/attachment.ts:166`) déclare ses QUARANTE-CINQ
 * champs optionnels en `?:` SANS `| null` : `tsc` est satisfait pendant que
 * `electDescription`/`electAudio` (`view/media.ts`, via `transcriptionTextOf`,
 * `api/prism.ts`) lèvent sur `transcription.type` — le motif « un `Json?`
 * Prisma sérialise `null` » déjà payé par le dépôt. Sur un fil réel de 12
 * messages, UNE seule rangée survivait.
 *
 * **#6820 — CETTE FRONTIÈRE ÉNUMÉRAIT, ET UNE ÉNUMÉRATION RETIENT EN
 * SILENCE.** Elle défaisait CINQ clés (`transcription`, `translations`,
 * `alt`, `thumbnailUrl`, `thumbHash`) là où `serializeAttachmentForSocket`
 * (`:100-129`) en sert VINGT ET UNE à `null` ; les seize autres repassaient
 * par `...rest`. La liste s'était déjà allongée deux fois — quatre clés à
 * #5805, `thumbHash` à #6221 — une par incident, jamais par relevé.
 *
 * La sixième manquante fut `imageVariants` : servie `null` pour toute image
 * sans variantes WebP (une image chiffrée, `UploadProcessor.ts:491`, ou toute
 * pièce d'avant D4), elle atteignait `attachmentSrcSet` (`media-url.ts:159`)
 * dont la garde ne connaît que `undefined` — « Cannot read properties of null
 * (reading 'length') », et le fil ENTIER par terre. `width`/`height`
 * donnaient le symptôme INVERSE, silencieux : `attachment.width !== undefined`
 * rend `true` sur `null`, d'où un `aspect-ratio: "null / null"` (CSS
 * invalide, ignoré) et un `width={null}` sur l'`<img>`.
 *
 * `sansNull` est le MÊME outil générique que #6080 a posé vingt lignes plus
 * bas pour `decodeMessage`, et pour la même raison, écrite là-bas : « une
 * énumération tenue à la main est un inventaire qui retient en silence chaque
 * champ ajouté en amont ». La leçon avait été apprise et appliquée à UN des
 * deux décodeurs de ce fichier ; elle vaut pour les deux.
 *
 * SOUSTRAIRE UN `null` NE PEUT VIOLER AUCUN TYPE ICI : les quarante-cinq
 * champs sont optionnels, donc `undefined` leur est toujours assignable — y
 * compris au seul qui déclare `| null` (`currentUserConsumption`), dont
 * l'unique lecteur du chantier (`attachment-blocks.tsx:111`) teste déjà
 * `?.` et `!= null`.
 *
 * Aucune clé de la pièce ne demande de TRANSFORMATION (pas de date à revivre :
 * `createdAt` reste la chaîne que le cache tient, D-26) — le décodeur est donc
 * `sansNull` et rien d'autre.
 */
function decodeAttachment(raw: Attachment): Attachment {
  return sansNull(raw);
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
/**
 * Retire les clés dont la valeur est `null` — elles n'existent pas dans le type
 * partagé, où l'absence s'écrit `undefined`. Le cast est le seul moyen de dire
 * en TypeScript « je n'ai enlevé que des clés absentes du type » : le filtre ne
 * peut RIEN produire qui ne soit déjà assignable, puisqu'il ne fait que
 * soustraire des entrées que le type déclare optionnelles.
 *
 * `exceptions` NOMME les clés dont le `null` n'est PAS absent mais SIGNIFIANT
 * — celles que le type déclare `?: T | null` plutôt que `?: T` (#6826). Leur
 * soustraire un `null` violerait le type, puisque lui seul distingue « absent »
 * de « la valeur est explicitement `null` ». `decodeMessage`/`decodeAttachment`
 * n'en ont aucune : leurs champs optionnels ne déclarent jamais `| null`.
 */
function sansNull<T extends object>(valeur: T, exceptions: ReadonlyArray<keyof T> = []): T {
  return Object.fromEntries(
    Object.entries(valeur).filter(([k, v]) => v !== null || (exceptions as readonly string[]).includes(k))
  ) as T;
}

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
    trackingLinks: _rawTrackingLinks,
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
    // **#6080 — l'ÉNUMÉRATION ci-dessus portait deux affirmations, et la
    // seconde était fausse.** « Ces clés sont défaites » : vrai. « Ce sont les
    // clés à défaire » : faux. `Message` compte TRENTE champs optionnels ; dix
    // seulement étaient déballés, et `...rest` reposait les vingt autres à
    // `null` — exactement ce que le commentaire d'en-tête promet d'empêcher.
    //
    // Le premier à mordre fut `reactionSummary` : servi `null` par la
    // passerelle, il atteignait `Object.entries()` dans le label a11y d'une
    // bulle et jetait « Cannot convert undefined or null to object » — un fil
    // ENTIER blanc, pour une réaction absente.
    //
    // Le filtre est GÉNÉRIQUE plutôt qu'une vingt-et-unième ligne d'une liste :
    // une énumération tenue à la main est un inventaire qui retient en silence
    // chaque champ ajouté en amont, et `Message` en gagne à chaque lot. Les
    // champs qui demandent une TRANSFORMATION (les dates, `sender`, `replyTo`,
    // `translations`) gardent leur traitement nominal ci-dessous : eux ne se
    // contentent pas d'être dénullifiés.
    ...sansNull(rest),
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
    /* LES LIENS SUIVIS (#7827) — hissés par le socket, rangés dans
       `metadata` par REST : `trackingLinksOf` lit les deux et écarte toute
       entrée mal formée. Jamais recopiés BRUTS par `...rest` : le token
       finit dans une adresse (`/l/<token>`). */
    ...trackingLinksFieldOf(raw),
  };
}

function trackingLinksFieldOf(raw: Message): Pick<Message, 'trackingLinks'> {
  const links = trackingLinksOf(raw);
  return links.length > 0 ? { trackingLinks: links } : {};
}

export function decodeMessages(raw: readonly Message[]): readonly Message[] {
  return raw.map(decodeMessage);
}

/**
 * `decodeConversation` — revit `createdAt`, `updatedAt`, `lastMessageAt`,
 * `currentUserJoinedAt`, `lastMessage.createdAt` ; NE TOUCHE PAS
 * `userPreferences` (tableau opaque, `preferences.ts` en fait le narrowing)
 * ni `lastMessageTranslations` (déjà des chaînes, jamais des dates).
 *
 * #6826 — `...rest` NE PASSAIT PAR AUCUN `sansNull` : `lastMessage` était le
 * SEUL champ défait, à la main. Les 37 autres champs optionnels de
 * `Conversation` traversaient donc avec leur `null` intact dès que la
 * passerelle en servait un — `title: null` pour un direct sans titre stocké,
 * ou n'importe quel champ optionnel futur. `dateFieldOf('lastMessageAt',
 * null)` rendait `{}`, qui ne RETIRE rien de ce que `...rest` avait déjà
 * écrit trois lignes plus haut — le défaut 4 de #5668, jamais porté ici.
 *
 * `currentUserRole` est l'unique EXCEPTION : le type le déclare
 * `?: string | null` (`conversation.ts:371`), `null` signifiant « le lecteur
 * n'est pas membre » — une valeur, pas une absence. `sansNull` la laisse
 * survivre ; toute AUTRE clé nullable de `Conversation` n'a aujourd'hui aucune
 * signification déclarée pour `null` distincte de « absent » (relevé contre
 * `conversation.ts`, seul champ à porter `| null`).
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
    ...sansNull(rest, ['currentUserRole']),
    ...(rawLastMessage === undefined || rawLastMessage === null
      ? {}
      : { lastMessage: decodeMessage(rawLastMessage) }),
    createdAt: toDate(raw.createdAt),
    updatedAt: toDate(raw.updatedAt),
    ...dateFieldOf('lastMessageAt', raw.lastMessageAt),
    ...dateFieldOf('currentUserJoinedAt', raw.currentUserJoinedAt),
    /**
     * LA FRONTIÈRE DE LECTURE (#7198/#7202, W3) — `lastReadAt` et
     * `lastReadMessageCreatedAt` traversaient BRUTS (chaîne ISO) avant ce
     * lot : `...sansNull(rest, …)` trois lignes plus haut ne DÉCODE rien,
     * il ne fait que retirer les `null`. Même patron que `lastMessageAt` /
     * `currentUserJoinedAt` ci-dessus : re-décodées ICI, elles ÉCRASENT la
     * version brute que `rest` avait déjà posée. `lastReadMessageId` est une
     * chaîne — `sansNull` lui suffit, aucun `dateFieldOf` à lui appliquer.
     */
    ...dateFieldOf('lastReadAt', raw.lastReadAt),
    ...dateFieldOf('lastReadMessageCreatedAt', raw.lastReadMessageCreatedAt),
  };
}

export function decodeConversations(raw: readonly Conversation[]): readonly Conversation[] {
  return raw.map(decodeConversation);
}
