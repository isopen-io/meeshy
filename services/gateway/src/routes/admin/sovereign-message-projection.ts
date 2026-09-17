/**
 * LA FORME QUE LA LECTURE SOUVERAINE SERT — le `select`, le schéma de réponse
 * et la projection GARDÉE de `GET /admin/conversations/:conversationId/messages`
 * (#6862).
 *
 * ## Pourquoi un module, et pas trois cents lignes de plus dans la route
 *
 * Les trois pièces ci-dessous ne sont pas trois sujets : ce sont **trois
 * énoncés de la même forme**, et le dépôt a mesuré ce que coûte de les séparer.
 * Un champ ajouté au `select` et absent du schéma est SUPPRIMÉ par
 * fast-json-stringify sans qu'un témoin rougisse (§ « Un schéma de réponse sans
 * `properties` EFFACE ») ; un champ déclaré au schéma que la requête ne charge
 * pas est la même dérive dans l'autre sens. Les tenir dans un seul fichier rend
 * la divergence LISIBLE — c'est la discipline que `messages-list-query.ts`
 * applique déjà pour la route utilisateur.
 *
 * ## Ce que ce module N'EST PAS
 *
 * Il ne réécrit pas `buildMessageListSelect` / `mapMessageRowForList`
 * (`routes/conversations/messages-list-query.ts`). Il ne les APPELLE pas non
 * plus, et la raison est le sujet même du lot : cette paire sert le contenu
 * **en clair** — c'est son travail, le client non-admin porte la protection à
 * l'affichage. Ici, le serveur la porte lui-même : un contenu protégé ne doit
 * pas QUITTER la passerelle. Deux régimes, deux projections. Ce qui EST
 * réutilisé l'est tel quel : `transformTranslationsToArray` (la carte Mongo →
 * tableau que les trois clients décodent) et les deux prédicats de
 * `media-protection.ts`, jamais une copie.
 *
 * ## La leçon qui gouverne chaque champ ajouté
 *
 * « Une protection de CONTENU se mesure sur tout ce que la charge TRANSPORTE,
 * jamais sur sa seule chaîne » (leçon 275, cycle 125). Élargir une route
 * souveraine, c'est faire voyager plus de données sous un régime de lecture
 * privilégiée : chaque champ passe donc la garde EXISTANTE, et le tableau
 * ci-dessous dit laquelle.
 *
 * | ce qui voyage | garde |
 * |---|---|
 * | `content`, `translations`, `metadata`, `validatedMentions` | `messageContentIsProtected(message)` |
 * | `replyTo.content`, `replyTo.translations`, `replyTo.metadata` | `quotedContentMayNotTravel(replyTo, conversationId)` — **sa propre** protection, PLUS les deux restrictions que le `where` ne peut pas porter sur une relation : message SUPPRIMÉ, message d'une AUTRE conversation |
 * | `fileUrl`, `thumbnailUrl`, `thumbHash`, `imageVariants`, `transcription`, `translations`, `metadata` d'une pièce | `messageContentIsProtected(message) \|\| mediaAttachmentIsProtected(piece)` |
 * | `senderId`, `conversationId`, horloges, compteurs de réaction, colonnes de protection | aucune — ce sont des FAITS, pas du contenu |
 *
 * Trois conséquences que le code seul ne dit pas :
 *
 * 1. **Les traductions d'un message protégé ne partent PAS.** Servir la
 *    traduction en clair du texte qu'on vient de masquer est exactement le
 *    défaut du cycle 123, une couche plus bas. `content: null` impose
 *    `translations: []`.
 * 2. **`metadata` et `validatedMentions` sont DÉRIVÉS du texte.** `metadata`
 *    porte l'instantané d'un post cité, une position géographique, la pièce
 *    visée par une citation ; `validatedMentions` porte qui le texte nommait.
 *    Aucun des deux ne compose la chaîne gardée — c'est précisément ce qui les
 *    rend invisibles au correctif qui garde la chaîne.
 * 3. **`fileName` n'est servi NI chargé.** C'est `path.basename(filePath)`
 *    (`UploadProcessor`), et `fileUrl` vaut
 *    `/attachments/file/${encodeURIComponent(filePath)}` : le servir sur une
 *    pièce masquée rendrait l'URL reconstructible à la main. Ce qu'on ne charge
 *    pas ne peut pas fuir par un spread voisin.
 *
 * ## Ce que ce module ne sert PAS, et pourquoi c'est une décision
 *
 * **Les compteurs de livraison** (`deliveredCount`, `readCount`,
 * `deliveredToAllAt`, `readByAllAt`). Les colonnes dénormalisées de `Message`
 * n'ont plus d'écrivain — `schema.prisma` le dit lui-même — et valent `0` /
 * `null` pour tout message écrit depuis le passage aux curseurs : les servir
 * répondrait « personne n'a reçu, personne n'a lu » à un écran qui lit
 * `readByAllAt != null` comme une preuve. La valeur vraie vit dans
 * `MessageReadStatusService.getConversationReadStatuses`, et elle décrit la
 * relation d'un LECTEUR à ses destinataires — un administrateur n'est ni
 * l'expéditeur ni un destinataire de ce qu'il lit, donc aucune surface de la
 * modale ne rend ces accusés. Un champ calculé que personne n'affiche est le
 * défaut « une LOI qui calcule une valeur que personne ne lit » ; le jour où
 * une surface les demande, l'ajout est d'une ligne (`loadMessageReadStatusMap`,
 * exporté par `messages-list-query.ts`) — et il devra venir avec son lecteur.
 */
import { Prisma } from '@meeshy/shared/prisma/client';
import {
  transformTranslationsToArray,
  type MessageTranslationJSON,
} from '../../utils/translation-transformer';
import {
  attachmentProtectionSelect,
  mediaAttachmentIsProtected,
  messageContentIsProtected,
  messageContentProtectionSelect,
} from './media-protection';

// ---------------------------------------------------------------------------
// LE `select`
// ---------------------------------------------------------------------------

/**
 * L'expéditeur, au même grain que la route utilisateur : le participant PORTE
 * l'identité propre à la conversation (surnom, nom d'affichage local), le
 * compte sert de repli. Aucun champ de présence — `isOnline` / `lastActiveAt`
 * ne se servent que par `PresenceVisibilityService`, et cette route n'a aucune
 * raison de les charger (§ « Toute porte qui sort un profil de TIERS filtre sa
 * présence » : ce qu'on ne charge pas n'a pas besoin d'être gardé).
 */
const sovereignSenderSelect = {
  id: true,
  userId: true,
  type: true,
  displayName: true,
  avatar: true,
  nickname: true,
  user: { select: { id: true, username: true, displayName: true, avatar: true } },
} as const;

/**
 * Les deux compteurs de vue unique, que `messageContentProtectionSelect`
 * n'apporte pas : ils ne servent pas au VERDICT de protection (le prédicat ne
 * les lit pas) mais à le QUALIFIER — « voilé » (jamais ouvert) et « consumé »
 * (`viewOnceCount` a atteint `maxViewOnceCount`) sont deux états qu'une bulle
 * rend différemment, et qu'un booléen `isProtected` ne peut pas distinguer.
 */
const viewOnceCountersSelect = {
  maxViewOnceCount: true,
  viewOnceCount: true,
} as const;

/**
 * Ce que la pièce jointe rend.
 *
 * Composé à la main plutôt que par un spread d'`attachmentMediaSelect`
 * (`services/attachments/attachmentIncludes.ts`), pour deux raisons mesurées,
 * et non par goût :
 *
 * - `fileName` — voir le doc-comment du module : basename de `fileUrl`, donc
 *   une URL reconstructible sur une pièce masquée.
 * - `reactions` — une RELATION, que la route utilisateur agrège en
 *   `reactionSummary` (`aggregateAttachmentReactions`). La charger sans
 *   l'agréger servirait des lignes brutes `{emoji, participantId}` qu'aucun
 *   client ne lit, au prix d'une jointure par page.
 *
 * Le reste est `attachmentMediaSelect` champ pour champ, `transcription`,
 * `translations` et `capturedInApp` compris — la paire du Prisme dont l'absence
 * rendait tout vocal muet dans les contextes qui l'omettaient, et le drapeau de
 * PROVENANCE dont le commentaire d'origine dit lui-même que « absent d'ici, la
 * garde ne se déclenche jamais ».
 *
 * Cette parité est un TÉMOIN, pas une intention : l'écart avec le jeu canonique
 * doit valoir EXACTEMENT `{fileName, reactions}` (`admin-conversation-messages-sovereign.test.ts`
 * § « ne s'écarte d'`attachmentMediaSelect` que sur … »). Un commentaire qui
 * ÉNUMÈRE une exception est une affirmation, et celle-ci en avait déjà oublié
 * une.
 */
export const sovereignAttachmentSelect = {
  id: true,
  messageId: true,
  originalName: true,
  mimeType: true,
  fileSize: true,
  fileUrl: true,
  thumbnailUrl: true,
  thumbHash: true,
  imageVariants: true,
  width: true,
  height: true,
  duration: true,
  bitrate: true,
  sampleRate: true,
  codec: true,
  channels: true,
  fps: true,
  videoCodec: true,
  pageCount: true,
  lineCount: true,
  metadata: true,
  uploadedBy: true,
  isAnonymous: true,
  capturedInApp: true,
  createdAt: true,
  transcription: true,
  translations: true,
  ...attachmentProtectionSelect,
} as const;

/**
 * Le message CITÉ. Il porte ses PROPRES six colonnes de protection, et c'est
 * tout le sujet : un message parfaitement libre peut citer un message à vue
 * unique, et la citation est alors le seul endroit par où son texte sort.
 *
 * `deletedAt` et `conversationId` ne sont PAS servis : ce sont les deux entrées
 * de l'ADMISSION de la citation (`quotedMessageIsAdmissible` plus bas), et une
 * garde se mesure sur la REQUÊTE — un champ que le `select` ne demande pas rend
 * son prédicat muet sans qu'aucun témoin de rendu ne rougisse.
 */
const sovereignReplyToSelect = {
  id: true,
  conversationId: true,
  deletedAt: true,
  content: true,
  originalLanguage: true,
  messageType: true,
  createdAt: true,
  senderId: true,
  metadata: true,
  translations: true,
  ...messageContentProtectionSelect,
  sender: { select: sovereignSenderSelect },
} as const;

/** Le `select` Prisma de la lecture souveraine — la MÊME forme que la route utilisateur, gardée. */
export const sovereignMessageSelect = Prisma.validator<Prisma.MessageSelect>()({
  id: true,
  conversationId: true,
  senderId: true,
  content: true,
  originalLanguage: true,
  messageType: true,
  messageSource: true,
  metadata: true,
  isEdited: true,
  editedAt: true,
  replyToId: true,
  storyReplyToId: true,
  forwardedFromId: true,
  forwardedFromConversationId: true,
  createdAt: true,
  updatedAt: true,
  pinnedAt: true,
  pinnedBy: true,
  reactionSummary: true,
  reactionCount: true,
  validatedMentions: true,
  translations: true,
  ...messageContentProtectionSelect,
  ...viewOnceCountersSelect,
  sender: { select: sovereignSenderSelect },
  replyTo: { select: sovereignReplyToSelect },
  attachments: {
    select: sovereignAttachmentSelect,
    orderBy: [{ createdAt: 'asc' as const }, { id: 'asc' as const }],
  },
  // Gardé À CÔTÉ de la liste, et ce n'est pas une redondance : le compteur
  // porte sur TOUTES les pièces du message, la liste sur celles de cette page.
  _count: { select: { attachments: true } },
});

/** La ligne que `sovereignMessageSelect` produit — inférée, jamais retapée. */
export type SovereignMessageRow = Prisma.MessageGetPayload<{
  select: typeof sovereignMessageSelect;
}>;

type SovereignReplyToRow = NonNullable<SovereignMessageRow['replyTo']>;
type SovereignAttachmentRow = SovereignMessageRow['attachments'][number];

// ---------------------------------------------------------------------------
// LA PROJECTION
// ---------------------------------------------------------------------------

/**
 * Lit une colonne `Json` de traductions comme la carte `langue → données`
 * qu'elle est censée être.
 *
 * Une VALIDATION, pas une assertion : `translations` est un document Mongo
 * chargé sans schéma, et `transformTranslationsToArray` écarte lui-même les
 * entrées sans texte. Ce que ce garde-fou ajoute est le refus d'un tableau ou
 * d'un scalaire — une forme qu'`Object.entries` accepterait en rendant des
 * paires absurdes.
 */
function asTranslationMap(value: unknown): Record<string, MessageTranslationJSON> | null {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return null;
  return value as Record<string, MessageTranslationJSON>;
}

/**
 * La traduction SERVIE — le grain juste, pas le superset.
 *
 * `transformTranslationsToArray` rend aussi l'enveloppe E2EE d'une traduction
 * (`isEncrypted`, `encryptionKeyId`, `encryptionIv`, `encryptionAuthTag`).
 * Elle n'est jamais peuplée ici : un message chiffré est PROTÉGÉ, donc ses
 * traductions ne partent pas du tout. La projeter serait déclarer un champ sans
 * producteur — et compter sur le schéma pour la retirer ferait de
 * fast-json-stringify une garde de confidentialité, ce qu'il n'est pas. Le
 * retrait se fait donc à la SOURCE.
 */
export type SovereignTranslation = {
  readonly id: string;
  readonly messageId: string;
  readonly targetLanguage: string;
  readonly translatedContent: string;
  readonly translationModel: string | null;
  readonly confidenceScore: number | null;
  readonly createdAt: Date | null;
  readonly updatedAt: Date | null;
};

function servedTranslations(
  messageId: string,
  raw: unknown,
  protege: boolean
): readonly SovereignTranslation[] {
  if (protege) return [];
  return transformTranslationsToArray(messageId, asTranslationMap(raw)).map((t) => ({
    id: t.id,
    messageId: t.messageId,
    targetLanguage: t.targetLanguage,
    translatedContent: t.translatedContent,
    translationModel: t.translationModel ?? null,
    confidenceScore: t.confidenceScore ?? null,
    createdAt: t.createdAt ?? null,
    updatedAt: t.updatedAt ?? null,
  }));
}

/**
 * LES DEUX RESTRICTIONS QUE LE `where` DE LA ROUTE NE PEUT PAS PORTER.
 *
 * Le `where` (`{ conversationId, deletedAt: null }`) gouverne les lignes qu'il
 * SÉLECTIONNE. La citation n'en est pas une : c'est une relation, résolue par
 * son identifiant, et donc la seule porte de cette route que le `where` ne
 * franchit pas. Deux restrictions déjà DÉCLARÉES ailleurs y tombaient :
 *
 * 1. **SUPPRIMÉ.** L'en-tête de la route écrit « un message supprimé n'est plus
 *    servable du tout ». `messageContentIsProtected` ne lit délibérément pas
 *    `deletedAt` (son doc-comment le dit : cette colonne ne gouverne que le
 *    contexte MÉDIA), si bien qu'un message effacé APRÈS avoir été cité
 *    ressortait entier — texte, traductions, `metadata` — par la citation.
 * 2. **HORS PÉRIMÈTRE.** `admitAttachmentReply` (#6601) refuse à l'ENVOI qu'une
 *    citation désigne un message d'une autre conversation ; mais « une garde
 *    d'écriture ne dit rien des lignes écrites AVANT elle »
 *    (`citedAttachmentBackfill.ts`, qui revérifie pour cette raison exacte).
 *    Une citation héritée hors périmètre ferait sortir le texte d'une
 *    conversation que le motif écrit ne nomme pas, sous une ligne d'audit qui
 *    en nomme une autre.
 *
 * Elles se joignent au verdict de contenu par un OU : le résultat est SERVI
 * comme une protection ordinaire (`content: null`, `isProtected: true`) — une
 * citation masquée reste une citation, et un client qui ne distingue pas
 * « vide » de « masqué » est la confusion que le dépôt a déjà payée
 * (`reply-attachment-protection-contract`).
 */
function quotedContentMayNotTravel(replyTo: SovereignReplyToRow, hostConversationId: string): boolean {
  if (replyTo.deletedAt !== null) return true;
  if (replyTo.conversationId !== hostConversationId) return true;
  return messageContentIsProtected(replyTo);
}

/**
 * La citation, SERVIE sous sa propre protection.
 *
 * `isProtected` y est explicite et non déduit du message porteur : sans lui, un
 * client ne peut pas distinguer « cette citation est vide » de « cette citation
 * est masquée », et le dépôt a déjà payé cette confusion sur la route
 * utilisateur (`reply-attachment-protection-contract`).
 */
function servedReplyTo(replyTo: SovereignReplyToRow, hostConversationId: string) {
  const protege = quotedContentMayNotTravel(replyTo, hostConversationId);
  return {
    id: replyTo.id,
    content: protege ? null : replyTo.content,
    originalLanguage: replyTo.originalLanguage,
    messageType: replyTo.messageType,
    createdAt: replyTo.createdAt,
    senderId: replyTo.sender?.userId ?? replyTo.sender?.user?.id ?? replyTo.senderId,
    senderParticipantId: replyTo.senderId,
    sender: replyTo.sender,
    isProtected: protege,
    isViewOnce: replyTo.isViewOnce,
    isBlurred: replyTo.isBlurred,
    effectFlags: replyTo.effectFlags,
    expiresAt: replyTo.expiresAt,
    isEncrypted: replyTo.isEncrypted,
    encryptionMode: replyTo.encryptionMode,
    translations: servedTranslations(replyTo.id, replyTo.translations, protege),
    metadata: protege ? undefined : replyTo.metadata,
  };
}

/**
 * La pièce jointe, SERVIE sous le OU des deux niveaux qui déclarent la
 * protection — celui du MESSAGE et celui de la PIÈCE, indépendants.
 *
 * Une pièce protégée reste LISTÉE : constater qu'un média existe (son nom, son
 * poids, sa durée, son type) n'ouvre pas son contenu. Ce qui tombe est tout ce
 * qui le RESTITUE — l'URL, la vignette, le `thumbHash` (une empreinte
 * suffisante pour reconnaître une photo floutée), les variantes d'image (des
 * URL, toutes), la transcription, les pistes traduites (`translations[lang].url`
 * porte le TTS), et `metadata` qui peut porter une timeline d'effets.
 */
function servedAttachment(piece: SovereignAttachmentRow, messageProtege: boolean) {
  const protegee = messageProtege || mediaAttachmentIsProtected(piece);
  return {
    id: piece.id,
    messageId: piece.messageId,
    originalName: piece.originalName,
    mimeType: piece.mimeType,
    fileSize: piece.fileSize,
    width: piece.width,
    height: piece.height,
    duration: piece.duration,
    bitrate: piece.bitrate,
    sampleRate: piece.sampleRate,
    codec: piece.codec,
    channels: piece.channels,
    fps: piece.fps,
    videoCodec: piece.videoCodec,
    pageCount: piece.pageCount,
    lineCount: piece.lineCount,
    uploadedBy: piece.uploadedBy,
    isAnonymous: piece.isAnonymous,
    // La PROVENANCE, servie sans condition : un booléen « ce fichier sort de la
    // caméra de l'app » ne restitue rien du média qu'il qualifie. Son absence,
    // elle, désarme la confirmation de publication chez tout hôte qui rend la
    // vraie vue conversation (`attachmentIncludes.ts` le dit sur place).
    capturedInApp: piece.capturedInApp,
    createdAt: piece.createdAt,
    isViewOnce: piece.isViewOnce,
    isBlurred: piece.isBlurred,
    effectFlags: piece.effectFlags,
    isProtected: protegee,
    fileUrl: protegee ? null : piece.fileUrl,
    thumbnailUrl: protegee ? null : piece.thumbnailUrl,
    thumbHash: protegee ? null : piece.thumbHash,
    imageVariants: protegee ? [] : piece.imageVariants,
    // ABSENTS plutôt que `null` : ces trois-là sont OPTIONNELS au contrat des
    // clients — leur absence dit « rien à restituer », là où le tableau vide
    // des traductions de MESSAGE dit « résolu, rien à servir » sur un champ que
    // le contrat déclare requis.
    transcription: protegee ? undefined : piece.transcription,
    translations: protegee ? undefined : piece.translations,
    metadata: protegee ? undefined : piece.metadata,
  };
}

/**
 * Sérialise une ligne de la lecture souveraine.
 *
 * `isProtected` et `attachmentCount` sont servis par CETTE route seule et déjà
 * consommés par `apps/web-v2` (`decodeAdminSovereignMessages`) : ils restent.
 */
export function mapSovereignMessageRow(message: SovereignMessageRow) {
  const protege = messageContentIsProtected(message);
  return {
    id: message.id,
    conversationId: message.conversationId,
    // En base, `senderId` est un `Participant.id` ; les clients le comparent à
    // un `User.id` — c'est lui que `continues()` lit pour regrouper les bulles,
    // dater les séparateurs de jour et décider d'un avatar. Résolu ici, comme
    // le fait la route utilisateur, le brut restant servi à côté.
    senderId: message.sender?.userId ?? message.sender?.user?.id ?? message.senderId,
    senderParticipantId: message.senderId,
    content: protege ? null : message.content,
    originalLanguage: message.originalLanguage,
    messageType: message.messageType,
    messageSource: message.messageSource,
    isEdited: message.isEdited,
    editedAt: message.editedAt,
    replyToId: message.replyToId,
    storyReplyToId: message.storyReplyToId,
    forwardedFromId: message.forwardedFromId,
    forwardedFromConversationId: message.forwardedFromConversationId,
    createdAt: message.createdAt,
    updatedAt: message.updatedAt,
    pinnedAt: message.pinnedAt,
    pinnedBy: message.pinnedBy,
    // Les réactions ne sont pas du contenu : un compte d'emojis ne restitue
    // rien du texte masqué. Servis sans condition, comme les horloges.
    reactionSummary: message.reactionSummary,
    reactionCount: message.reactionCount,
    // Les colonnes de protection, BRUTES. `isProtected` dit QU'il y a
    // protection ; celles-ci disent LAQUELLE — voilé, consumé, expiré, chiffré
    // sont quatre bulles différentes.
    isViewOnce: message.isViewOnce,
    maxViewOnceCount: message.maxViewOnceCount,
    viewOnceCount: message.viewOnceCount,
    isBlurred: message.isBlurred,
    effectFlags: message.effectFlags,
    expiresAt: message.expiresAt,
    isEncrypted: message.isEncrypted,
    encryptionMode: message.encryptionMode,
    isProtected: protege,
    // DÉRIVÉS du texte, donc gardés avec lui : `metadata` porte l'instantané
    // d'un post cité, une position, la pièce visée par une citation ;
    // `validatedMentions` porte qui le texte nommait.
    metadata: protege ? undefined : message.metadata,
    validatedMentions: protege ? [] : message.validatedMentions,
    translations: servedTranslations(message.id, message.translations, protege),
    sender: message.sender,
    replyTo: message.replyTo ? servedReplyTo(message.replyTo, message.conversationId) : null,
    attachmentCount: message._count?.attachments ?? 0,
    attachments: (message.attachments ?? []).map((piece) => servedAttachment(piece, protege)),
  };
}

// ---------------------------------------------------------------------------
// LE SCHÉMA DE RÉPONSE
// ---------------------------------------------------------------------------

/**
 * Un objet dont les clés ne sont pas connues à la déclaration — un document
 * Mongo libre. `additionalProperties: true` est la DÉCLARATION qui dit cela ;
 * le silence (`{ type: 'object' }` nu) ferait sortir `{}`.
 */
const objetLibre = { type: 'object', additionalProperties: true, nullable: true } as const;

const senderSchema = {
  type: 'object',
  nullable: true,
  properties: {
    id: { type: 'string' },
    userId: { type: 'string', nullable: true },
    type: { type: 'string', nullable: true },
    displayName: { type: 'string', nullable: true },
    avatar: { type: 'string', nullable: true },
    nickname: { type: 'string', nullable: true },
    user: {
      type: 'object',
      nullable: true,
      properties: {
        id: { type: 'string' },
        username: { type: 'string', nullable: true },
        displayName: { type: 'string', nullable: true },
        avatar: { type: 'string', nullable: true },
      },
    },
  },
} as const;

const translationsSchema = {
  type: 'array',
  items: {
    type: 'object',
    properties: {
      id: { type: 'string' },
      messageId: { type: 'string' },
      targetLanguage: { type: 'string' },
      translatedContent: { type: 'string' },
      translationModel: { type: 'string', nullable: true },
      confidenceScore: { type: 'number', nullable: true },
      createdAt: { type: 'string', format: 'date-time', nullable: true },
      updatedAt: { type: 'string', format: 'date-time', nullable: true },
    },
  },
} as const;

const attachmentSchema = {
  type: 'object',
  properties: {
    id: { type: 'string' },
    messageId: { type: 'string', nullable: true },
    originalName: { type: 'string', nullable: true },
    mimeType: { type: 'string', nullable: true },
    fileSize: { type: 'number', nullable: true },
    width: { type: 'number', nullable: true },
    height: { type: 'number', nullable: true },
    duration: { type: 'number', nullable: true },
    bitrate: { type: 'number', nullable: true },
    sampleRate: { type: 'number', nullable: true },
    codec: { type: 'string', nullable: true },
    channels: { type: 'number', nullable: true },
    fps: { type: 'number', nullable: true },
    videoCodec: { type: 'string', nullable: true },
    pageCount: { type: 'number', nullable: true },
    lineCount: { type: 'number', nullable: true },
    uploadedBy: { type: 'string', nullable: true },
    isAnonymous: { type: 'boolean', nullable: true },
    capturedInApp: { type: 'boolean', nullable: true },
    createdAt: { type: 'string', format: 'date-time', nullable: true },
    isViewOnce: { type: 'boolean', nullable: true },
    isBlurred: { type: 'boolean', nullable: true },
    effectFlags: { type: 'number', nullable: true },
    isProtected: { type: 'boolean' },
    fileUrl: { type: 'string', nullable: true },
    thumbnailUrl: { type: 'string', nullable: true },
    thumbHash: { type: 'string', nullable: true },
    // Un tableau sans `items` est PERMISSIF (il laisse passer), là où un objet
    // sans `properties` efface. Les variantes ont deux producteurs dont les
    // formes divergent : ne rien déclarer est plus honnête que d'en choisir un.
    imageVariants: { type: 'array' },
    transcription: objetLibre,
    translations: objetLibre,
    metadata: objetLibre,
  },
} as const;

const replyToSchema = {
  type: 'object',
  nullable: true,
  properties: {
    id: { type: 'string' },
    content: { type: 'string', nullable: true },
    originalLanguage: { type: 'string', nullable: true },
    messageType: { type: 'string', nullable: true },
    createdAt: { type: 'string', format: 'date-time', nullable: true },
    senderId: { type: 'string', nullable: true },
    senderParticipantId: { type: 'string', nullable: true },
    sender: senderSchema,
    isProtected: { type: 'boolean' },
    isViewOnce: { type: 'boolean', nullable: true },
    isBlurred: { type: 'boolean', nullable: true },
    effectFlags: { type: 'number', nullable: true },
    expiresAt: { type: 'string', format: 'date-time', nullable: true },
    isEncrypted: { type: 'boolean', nullable: true },
    encryptionMode: { type: 'string', nullable: true },
    translations: translationsSchema,
    metadata: objetLibre,
  },
} as const;

/**
 * Le message SERVI, déclaré champ pour champ.
 *
 * Toute clé absente d'ici est SUPPRIMÉE en silence : un champ ajouté au
 * `select` et au mapping mais oublié ici n'atteint personne, et aucun témoin de
 * handler ne le voit. C'est pourquoi les témoins de cette route traversent
 * `app.inject()`.
 */
export const sovereignMessageSchema = {
  type: 'object',
  properties: {
    id: { type: 'string' },
    conversationId: { type: 'string', nullable: true },
    senderId: { type: 'string', nullable: true },
    senderParticipantId: { type: 'string', nullable: true },
    content: { type: 'string', nullable: true },
    originalLanguage: { type: 'string', nullable: true },
    messageType: { type: 'string', nullable: true },
    messageSource: { type: 'string', nullable: true },
    isEdited: { type: 'boolean', nullable: true },
    editedAt: { type: 'string', format: 'date-time', nullable: true },
    replyToId: { type: 'string', nullable: true },
    storyReplyToId: { type: 'string', nullable: true },
    forwardedFromId: { type: 'string', nullable: true },
    forwardedFromConversationId: { type: 'string', nullable: true },
    createdAt: { type: 'string', format: 'date-time' },
    updatedAt: { type: 'string', format: 'date-time', nullable: true },
    pinnedAt: { type: 'string', format: 'date-time', nullable: true },
    pinnedBy: { type: 'string', nullable: true },
    reactionSummary: { type: 'object', additionalProperties: { type: 'number' }, nullable: true },
    reactionCount: { type: 'number', nullable: true },
    isViewOnce: { type: 'boolean', nullable: true },
    maxViewOnceCount: { type: 'number', nullable: true },
    viewOnceCount: { type: 'number', nullable: true },
    isBlurred: { type: 'boolean', nullable: true },
    effectFlags: { type: 'number', nullable: true },
    expiresAt: { type: 'string', format: 'date-time', nullable: true },
    isEncrypted: { type: 'boolean', nullable: true },
    encryptionMode: { type: 'string', nullable: true },
    isProtected: { type: 'boolean' },
    attachmentCount: { type: 'number' },
    metadata: objetLibre,
    validatedMentions: { type: 'array', items: { type: 'string' } },
    translations: translationsSchema,
    sender: senderSchema,
    replyTo: replyToSchema,
    attachments: { type: 'array', items: attachmentSchema },
  },
} as const;
