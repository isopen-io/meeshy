/**
 * Sections d'export supplémentaires pour `GET /me/export` (#3633).
 *
 * Extrait dans un module séparé pour garder `export.ts` sous le budget de
 * taille — chaque fonction est une requête BORNÉE (toujours `take`/`skip`,
 * jamais un `findMany` nu : `me/export.ts` porte déjà 2 `findMany` non bornés
 * hérités et gelés par `unbounded-findmany-guard.test.ts`, ce module n'en
 * ajoute aucun) qui rend `{ items, total }` — `total` sert à calculer
 * `hasMore` côté route, sans réintroduire une pagination par curseur pour un
 * usage ponctuel (export RGPD, pas une liste défilante).
 *
 * Chaque sélection est un SUPERSET conscient des colonnes utiles à
 * l'utilisateur, à l'exclusion explicite de ce qui n'est ni lisible ni
 * portable : embeddings binaires (`UserVoiceModel.embedding`,
 * `chatterboxConditionals`), jetons de session (`sessionToken`,
 * `refreshToken`, `deviceFingerprint`).
 *
 * ─── `deletedAt` SE LIT EN DISANT L'ABSENCE (#19909) ─────────────────────────
 *
 * Les trois sections de publication portaient `deletedAt: null`. Sous Prisma +
 * MongoDB c'est une **ÉGALITÉ** : elle exige la clé PRÉSENTE. Or aucun des
 * quatre créateurs de `Post` et de `PostComment` ne l'écrit (`PostService` —
 * création et les deux reposts — et `PostCommentService.create`), donc les trois
 * clauses n'appariaient **aucune ligne** : l'export RGPD ne rendait ni post, ni
 * reel, ni story, ni statut, ni commentaire, pour aucun compte.
 *
 * Et le défaut ne ressemblait pas à une panne, parce que le `where` est partagé
 * par `findMany` ET `count` : `items: []` AVEC `total: 0`. L'archive ne se
 * présentait pas comme tronquée mais comme « vous n'avez rien publié » —
 * indistinguable d'un compte vide. C'est « la liste vide est plus dangereuse
 * que la réponse vide » (`services/gateway/CLAUDE.md`) appliqué à une
 * obligation légale (RGPD art. 15 et 20) au lieu d'un écran d'administration.
 *
 * La forme juste était déjà nommée et utilisée **105 fois** sur ces deux
 * modèles : `deletedAt: NOT_DELETED` (`{ isSet: false }`), la discipline
 * INVERSE qui dit « non supprimé = clé ABSENTE ». Ces trois sites l'ignoraient.
 */
import type { PrismaClient } from '@meeshy/shared/prisma/client';
import { validatePagination } from '../../utils/pagination';
import { AT_REST_MESSAGE_SELECT, revealAtRestRowsForWire, type AtRestKeyring } from '../../services/messaging/serverAtRest';
import { unsetOrNull } from '../../utils/prisma-unset';
import { publicMediaUrlFromEnv } from '../../services/attachments/publicMediaUrl';
import { NOT_DELETED } from '../../services/posts/softDelete';
import { exportPackData } from '../../services/packs/PackPrivacy';

const DEFAULT_LIMIT = 500;
const MAX_LIMIT = 2000;

export type ExportPage = { readonly limit: number; readonly offset: number };

/**
 * Borne `limit`/`offset` une fois, pour toutes les sections d'un même appel.
 *
 * Route par `validatePagination` (SSOT, `utils/pagination.ts`) plutôt qu'un
 * `parseInt` local — `pagination-parse-sweep.test.ts` interdit tout décodage de
 * pagination hors de ce point unique sur les routes non-admin.
 */
export function resolveExportPage(query: { limit?: string; offset?: string }): ExportPage {
  return validatePagination(query.offset ?? '0', query.limit, {
    defaultLimit: DEFAULT_LIMIT,
    maxLimit: MAX_LIMIT,
  });
}

export type ExportSection<T> = { readonly items: readonly T[]; readonly total: number; readonly hasMore: boolean };

function toSection<T>(items: readonly T[], total: number, page: ExportPage): ExportSection<T> {
  return { items, total, hasMore: page.offset + items.length < total };
}

/**
 * L'ADRESSE D'UN MÉDIA SERVIE PAR L'ARCHIVE (#7022).
 *
 * Le destinataire d'un export RGPD — un humain, un outil — n'a AUCUN
 * résolveur : ni base configurée, ni préfixe d'API, ni convention de clé.
 * Servir la colonne brute lui remet donc, pour une ligne sur quatre, une clé
 * de stockage nue (`2026/09/<uid>/<nom>.jpeg`) qui n'ouvre rien ; et pour une
 * ligne sur cinq, une route relative sans hôte, qui ne mène nulle part hors
 * d'un navigateur déjà posé sur le bon domaine.
 *
 * La composition n'est pas réécrite ici : `publicMediaUrlFromEnv` en est le
 * site UNIQUE, il connaît les trois formes de la colonne et il est IDEMPOTENT
 * — une adresse déjà absolue le traverse inchangée, donc la portabilité de
 * l'archive ne se paie d'aucune régression sur les 1600 lignes qui
 * fonctionnaient.
 */
function withServedMediaUrl<T extends { readonly fileUrl: string }>(row: T): T {
  return { ...row, fileUrl: publicMediaUrlFromEnv(row.fileUrl) };
}

export async function exportPosts(prisma: PrismaClient, userId: string, page: ExportPage) {
  const where = { authorId: userId, type: { in: ['POST' as const, 'REEL' as const] }, deletedAt: NOT_DELETED };
  const [items, total] = await Promise.all([
    prisma.post.findMany({
      where,
      select: {
        id: true, type: true, visibility: true, content: true, originalLanguage: true,
        communityId: true, repostOfId: true, isQuote: true, createdAt: true, updatedAt: true,
      },
      orderBy: { createdAt: 'desc' },
      take: page.limit,
      skip: page.offset,
    }),
    prisma.post.count({ where }),
  ]);
  return toSection(items, total, page);
}

export async function exportStories(prisma: PrismaClient, userId: string, page: ExportPage) {
  const where = { authorId: userId, type: { in: ['STORY' as const, 'STATUS' as const] }, deletedAt: NOT_DELETED };
  const [items, total] = await Promise.all([
    prisma.post.findMany({
      where,
      select: {
        id: true, type: true, visibility: true, content: true, storyEffects: true,
        createdAt: true, updatedAt: true,
      },
      orderBy: { createdAt: 'desc' },
      take: page.limit,
      skip: page.offset,
    }),
    prisma.post.count({ where }),
  ]);
  return toSection(items, total, page);
}

export async function exportComments(prisma: PrismaClient, userId: string, page: ExportPage) {
  const where = { authorId: userId, deletedAt: NOT_DELETED };
  const [items, total] = await Promise.all([
    prisma.postComment.findMany({
      where,
      select: {
        id: true, postId: true, parentId: true, content: true, originalLanguage: true,
        isEdited: true, likeCount: true, replyCount: true, createdAt: true, updatedAt: true,
      },
      orderBy: { createdAt: 'desc' },
      take: page.limit,
      skip: page.offset,
    }),
    prisma.postComment.count({ where }),
  ]);
  return toSection(items, total, page);
}

/**
 * Trois tables distinctes (réaction message / post / commentaire), trois
 * conventions de propriétaire (`participantId` via `Participant.userId`, ou
 * `userId` direct) — fusionner en une seule liste imposerait un curseur
 * commun à des collections hétérogènes. Chacune est bornée et paginée
 * indépendamment, sous la MÊME fenêtre `limit`/`offset`.
 */
export async function exportReactions(prisma: PrismaClient, participantIds: readonly string[], userId: string, page: ExportPage) {
  const messageWhere = { participantId: { in: [...participantIds] } };
  const postWhere = { userId };
  const commentWhere = { userId };

  const [messages, messagesTotal, posts, postsTotal, comments, commentsTotal] = await Promise.all([
    prisma.reaction.findMany({
      where: messageWhere,
      select: { id: true, messageId: true, emoji: true, createdAt: true },
      orderBy: { createdAt: 'desc' },
      take: page.limit,
      skip: page.offset,
    }),
    prisma.reaction.count({ where: messageWhere }),
    prisma.postReaction.findMany({
      where: postWhere,
      select: { id: true, postId: true, emoji: true, createdAt: true },
      orderBy: { createdAt: 'desc' },
      take: page.limit,
      skip: page.offset,
    }),
    prisma.postReaction.count({ where: postWhere }),
    prisma.commentReaction.findMany({
      where: commentWhere,
      select: { id: true, commentId: true, emoji: true, createdAt: true },
      orderBy: { createdAt: 'desc' },
      take: page.limit,
      skip: page.offset,
    }),
    prisma.commentReaction.count({ where: commentWhere }),
  ]);

  return {
    messages: toSection(messages, messagesTotal, page),
    posts: toSection(posts, postsTotal, page),
    comments: toSection(comments, commentsTotal, page),
  };
}

/**
 * Les sections dont la requête a besoin des SIÈGES du compte, et pas seulement
 * de son `userId`.
 *
 * C'est la liste qui décide si `me/export.ts` lit les sièges (`accountSeatIds`)
 * — une lecture faite UNE fois et réutilisée. Elle vit ici, à côté des sections
 * qui en dépendent, parce que c'est le seul endroit où l'on sait pourquoi :
 * `messages` apparie `senderId`, `reactions` `participantId`, `media` le second
 * espace de clés de `uploadedBy`, et `calls` le `participantId` de
 * `CallParticipant`.
 *
 * **`calls` y a été inscrite après coup, et c'est la leçon 261.** La condition
 * écrite dans la route affirmait deux choses : « ces sections consomment la
 * liste » (vrai) et « ce sont les sections qui en ont besoin » (jamais
 * vérifié). `exportCallTelemetry` en avait besoin et la relisait chez elle, avec
 * son propre `where` — une quatrième lecture de la même liste dans la même
 * requête d'export. Une section qui en aura besoin demain s'inscrit ici ; la
 * vérification, elle, ne se déduit pas de la liste.
 */
export const SECTIONS_NEEDING_PARTICIPANT_IDS = ['messages', 'reactions', 'media', 'calls'] as const;

export function needsParticipantIds(requestedTypes: readonly string[]): boolean {
  return SECTIONS_NEEDING_PARTICIPANT_IDS.some((section) => requestedTypes.includes(section));
}

/**
 * Même raison de séparation que `exportReactions` : deux tables, deux propriétaires.
 *
 * ─── ET DEUX ESPACES DE CLÉS DANS `uploadedBy` (#20129) ────────────────────
 *
 * `MessageAttachment.uploadedBy` portait l'identité de COMPTE pour les quatre
 * écrivains de téléversement et le `Participant.id` pour les deux écrivains de
 * COPIE. #20113 a unifié les écrivains ; **les lignes déjà écrites gardent
 * l'ancien espace**, et rien ne les réécrit.
 *
 * Apparier `uploadedBy: userId` ratait donc les médias TRANSFÉRÉS de
 * l'utilisateur — une omission dans un export d'article 15, sans erreur et
 * sans trace. Les deux espaces sont appariés ensemble, et la liste des
 * participants est celle que `exportReactions` reçoit déjà : calculée UNE fois
 * par la route (`export.ts`), pour ses voisines comme pour celle-ci.
 *
 * `PostMedia.uploaderId` n'a, lui, qu'un seul écrivain et qu'un seul espace :
 * il n'a rien à élargir, et le dire évite de l'élargir « par symétrie ».
 */
export async function exportMedia(
  prisma: PrismaClient,
  participantIds: readonly string[],
  userId: string,
  page: ExportPage
) {
  const attachmentWhere = { uploadedBy: { in: [userId, ...participantIds] }, isAnonymous: false };
  const postMediaWhere = { uploaderId: userId };

  const [attachments, attachmentsTotal, postMedia, postMediaTotal] = await Promise.all([
    prisma.messageAttachment.findMany({
      where: attachmentWhere,
      select: {
        id: true, messageId: true, originalName: true, mimeType: true, fileSize: true,
        fileUrl: true, duration: true, width: true, height: true, createdAt: true,
      },
      orderBy: { createdAt: 'desc' },
      take: page.limit,
      skip: page.offset,
    }),
    prisma.messageAttachment.count({ where: attachmentWhere }),
    prisma.postMedia.findMany({
      where: postMediaWhere,
      select: {
        id: true, postId: true, commentId: true, originalName: true, mimeType: true,
        fileSize: true, fileUrl: true, duration: true, width: true, height: true, createdAt: true,
      },
      orderBy: { createdAt: 'desc' },
      take: page.limit,
      skip: page.offset,
    }),
    prisma.postMedia.count({ where: postMediaWhere }),
  ]);

  return {
    attachments: toSection(attachments.map(withServedMediaUrl), attachmentsTotal, page),
    postMedia: toSection(postMedia.map(withServedMediaUrl), postMediaTotal, page),
  };
}

/**
 * Au plus une ligne par utilisateur (`userId` unique) : pas de pagination à
 * proprement parler, mais un `findFirst` reste bien plus honnête qu'un
 * `findUnique` suivi d'un cast — et surtout, EXCLUT les blobs binaires
 * (`embedding`, `chatterboxConditionals`) qui n'ont aucun sens dans un export
 * JSON portable.
 */
export async function exportVoiceProfile(prisma: PrismaClient, userId: string) {
  const profile = await prisma.userVoiceModel.findFirst({
    where: { userId },
    select: {
      profileId: true, embeddingModel: true, embeddingDimension: true, audioCount: true,
      totalDurationMs: true, qualityScore: true, version: true, referenceAudioUrl: true,
      trainingAudioSamples: true, voiceCharacteristics: true, voiceAnalysisAt: true,
      voicePublicAt: true, createdAt: true, updatedAt: true,
    },
  });

  // `referenceAudioUrl` est la MÊME classe de valeur que les deux `fileUrl`
  // ci-dessus — `schema.prisma` la déclare « URL to the reference audio », et
  // les formes du dépôt vont de `/api/v1/attachments/file/…` à une adresse
  // absolue. Un `null` reste `null` : l'absence de référence n'est pas une
  // adresse vide, et `publicMediaUrl` ne fabrique jamais ce que la base ne
  // porte pas.
  if (profile === null) return profile;
  return profile.referenceAudioUrl
    ? { ...profile, referenceAudioUrl: publicMediaUrlFromEnv(profile.referenceAudioUrl) }
    : profile;
}

/** Le plafond de la section `messages` — hérité de `me/export.ts`, qui le portait. */
export const MESSAGES_LIMIT = 10000;

/**
 * Les messages ENVOYÉS par le compte (RGPD art. 15(3) et 20(1)) — **ouverts**
 * quand la conversation les scelle au repos (#20163).
 *
 * La section sélectionnait `content` et rien de l'enveloppe, quand
 * `MessageProcessor` écrit `content: ''` dès qu'un message part dans une
 * conversation `server` ou `hybrid`, le texte vivant dans `encryptedContent`.
 * L'archive rendait donc une ligne par message avec un texte VIDE, et un
 * `messagesCount` JUSTE : elle ne se présentait pas comme tronquée mais comme
 * « vous n'avez rien écrit ». C'est « la liste vide est plus dangereuse que la
 * réponse vide » appliqué à une obligation légale, comme #19909 une section
 * plus bas.
 *
 * Rien de neuf n'est écrit ici : `AT_REST_MESSAGE_SELECT` et
 * `revealAtRestRowsForWire` sont la loi que QUATORZE lecteurs de la passerelle
 * appliquent déjà (fil, threads, liste, épinglés, sync, liens, tableau de bord,
 * socket, édition). L'export était le seul à ne pas ouvrir le sceau — et le
 * seul dont la sortie est opposable au titre d'un droit.
 *
 * ─── LA VARIANTE `…ForWire` N'EST PAS UN DÉTAIL ─────────────────────────────
 *
 * Le schéma de réponse déclare cette section
 * `items: { type: 'object', additionalProperties: true }` — OUVERT : tout ce que
 * la ligne porte SORT. Élargir le `select` sans déporter le chiffré publierait
 * `encryptedContent` et `encryptionMetadata` dans l'archive. `…ForWire` retire
 * les deux clés ; `isEncrypted` et `encryptionMode` RESTENT, et c'est voulu —
 * ils DISENT le régime, là où le silence était la moitié du défaut (art. 12(1)).
 *
 * ─── LES DEUX CAS QUI NE S'OUVRENT PAS, TRAITÉS EXPLICITEMENT ───────────────
 *
 * Un sceau que le coffre n'ouvre pas ressort `isEncrypted: true` et
 * `content: ''` (`servedSealed`) : l'archive DIT qu'elle n'a pas pu l'ouvrir, au
 * lieu de laisser croire à un message vide. Une conversation chiffrée de BOUT
 * EN BOUT ressort telle quelle, le trousseau n'étant jamais sollicité : il n'y a
 * rien à ouvrir côté serveur, et la clé n'y est pas. Ce que l'archive doit alors
 * DIRE à l'utilisateur relève du texte d'accompagnement, qui n'existe pas encore
 * (#20138 porte le même besoin pour les médias).
 *
 * ─── `deletedAt` SE LIT EN DISANT L'ABSENCE, MÊME SUR `Message` ─────────────
 *
 * `Message` a résolu le piège MongoDB par la discipline d'ÉCRITURE
 * (`LIVE_MESSAGE_MARK`, répandu par ses six créateurs), là où `Post` l'a résolu
 * par la LECTURE (#19909). Le filtre `deletedAt: null` est donc juste **du
 * code** — et faux **des données** : `liveMessage.ts` dit lui-même que deux de
 * ces créateurs (les messages d'appel de `CallService`) avaient PERDU le
 * marqueur, la constante n'y est arrivée que le 2026-11-18, et **aucune
 * migration ne rattrape la colonne**. Les lignes d'appel écrites avant cette
 * date ont donc `deletedAt` ABSENTE, et une égalité nue les omettrait de
 * l'export EN SILENCE, avec un `messagesCount` juste — le défaut exact de
 * #19909, sur le modèle qui servait de contre-exemple.
 *
 * D'où `unsetOrNull`, qui apparie les deux formes. C'est strictement un gain :
 * les trois transports de suppression ÉCRIVENT une date, donc aucune ligne
 * rappelée n'a la clé absente. La population réelle de lignes sans clé n'est
 * PAS mesurée (il n'y a pas de base dans les conteneurs de session) — c'est la
 * raison de choisir la forme qui apparie les deux plutôt que d'affirmer
 * laquelle existe.
 */
export async function exportMessages(
  prisma: PrismaClient,
  participantIds: readonly string[],
  keyring: AtRestKeyring
) {
  const rows = await prisma.message.findMany({
    where: {
      senderId: { in: [...participantIds] },
      ...unsetOrNull('deletedAt'),
    },
    select: {
      id: true,
      conversationId: true,
      content: true,
      originalLanguage: true,
      messageType: true,
      messageSource: true,
      createdAt: true,
      editedAt: true,
      ...AT_REST_MESSAGE_SELECT,
    },
    orderBy: { createdAt: 'desc' },
    take: MESSAGES_LIMIT,
  });
  return revealAtRestRowsForWire(rows, keyring);
}

/**
 * Les packs du compte (#10151) : ses choix d'installation des domaines, sa
 * bibliothèque de stickers, les packs qu'il a proposés et ceux qu'il a achetés
 * en Meeshes (#10632), et son profil partenaire de lens (#11327). La lecture vit
 * dans `services/packs/PackPrivacy.ts`, seul accès RGPD aux tables de packs ;
 * cette section n'y ajoute que le découpage en pages.
 */
export async function exportPacks(prisma: PrismaClient, userId: string, page: ExportPage) {
  const data = await exportPackData(prisma, userId, page);
  return {
    choices: toSection(data.choices.items, data.choices.total, page),
    library: toSection(data.library.items, data.library.total, page),
    submissions: toSection(data.submissions.items, data.submissions.total, page),
    ownerships: toSection(data.ownerships.items, data.ownerships.total, page),
    appearanceSubmissions: toSection(data.appearanceSubmissions.items, data.appearanceSubmissions.total, page),
    lensSubmissions: toSection(data.lensSubmissions.items, data.lensSubmissions.total, page),
    partnerProfile: toSection(data.partnerProfile.items, data.partnerProfile.total, page),
  };
}

// Les sessions et les événements de sécurité : `export-security.ts` (#9614).
