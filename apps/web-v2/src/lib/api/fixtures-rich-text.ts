import { usernamePatternSource } from '@meeshy/shared/types/api-schemas';

import { AUTHOR_POSTS_PAGE_SIZE } from './author-posts';
import type { FeedAuthor, FeedPage, FeedPost } from './feed-pages';
import { amina, conversationDefaults, kwame, message, portraitStandIn, threadMoment, translation, VIEWER_ID, viewer } from './fixtures-base';
import { FIXTURE_PEOPLE, fixtureBlockedUsers, fixtureFriendRequests } from './fixtures-friends';
import type { HashtagPage } from './hashtag-posts';
import type { PublicProfile, PublicProfileStats, PublicProfileView, ServedRelation } from './public-profile';
import type { Conversation, Message } from './types';

/**
 * **LE CORPUS DU TEXTE ENRICHI** (#7032) — le seul jeu qui fasse tomber un
 * rendu faux. Trois choses qu'un corpus « joli » ne prouverait pas :
 *
 *  1. **Le témoin du texte TRADUIT est écrit sur un rang ≠ 1** (leçon 261).
 *     `rt-traduit` est en espagnol et porte une traduction ANGLAISE (jamais
 *     française) : le lecteur du gate a pour prisme `['fr', 'en']`, donc c'est
 *     le rang 2 qui sert. Un rendu qui n'enrichirait que l'ORIGINAL montrerait
 *     le texte espagnol ; un rendu qui enrichirait le rang 1 ne montrerait
 *     rien. Seule la bonne implémentation rend `@kwame.mensah` cliquable DANS
 *     la phrase anglaise.
 *  2. **Le hashtag de conversation est un CONTRE-témoin.** `rt-hashtag` en
 *     porte un ; aucune surface de conversation ne doit le rendre cliquable —
 *     les hashtags n'existent que pour les publications.
 *  3. **Le pseudo NON validé est un contre-témoin lui aussi.** `rt-mention`
 *     nomme `@kwame.mensah` (dans `validatedMentions`) ET `@fantome` (absent) :
 *     un rendu qui linkifierait tout handle rendrait deux liens, dont un vers
 *     un profil inexistant.
 */

export const RICH_TEXT_CONVERSATION_ID = 'c-texte-enrichi';

const richMessage = (partial: Parameters<typeof message>[0]): Message =>
  message({ ...partial, conversationId: RICH_TEXT_CONVERSATION_ID });

/**
 * **LE PSEUDO DU TÉMOIN NE PEUT PAS ÊTRE CELUI DU CORPUS DES PERSONNES** — et
 * c'est une mesure, pas une préférence.
 *
 * `FIXTURE_PEOPLE` sert des pseudos à POINT (`kwame.mensah`) ; la validation
 * réelle d'un nom d'utilisateur est `usernamePatternSource` — `^[a-zA-Z0-9_-]+$`,
 * SANS point (`packages/shared/types/api-schemas/auth.ts`, la même source que
 * l'inscription, le changement de pseudo et le schéma Ajv). Un tel pseudo ne
 * peut donc pas exister en production, et `MENTION_HANDLE_CHARS` — dérivé de
 * cette même validation — s'arrête au point : `@kwame.mensah` capture
 * `kwame`. Bâtir un témoin dessus mesurerait un cas impossible, et le ferait
 * échouer pour la mauvaise raison.
 *
 * Le tiret, lui, EST valide et c'est le caractère que `\w` seul manquait
 * (doc-comment de `MENTION_HANDLE_CHARS`) : ce corpus le choisit donc
 * exprès — `@kwame-mensah` doit rester UN handle entier.
 *
 * L'assertion ci-dessous n'est pas décorative : elle fait tomber le corpus à
 * l'import si quelqu'un y écrit un pseudo que le serveur refuserait.
 */
const richHandle = (handle: string): string => {
  if (!new RegExp(usernamePatternSource).test(handle)) {
    throw new Error(`Pseudo de fixture invalide au regard de usernamePatternSource : ${handle}`);
  }
  return handle;
};

const KWAME_HANDLE = richHandle('kwame-mensah');
const RICH_PERSON: PublicProfile = {
  id: 'u-rich-kwame',
  username: KWAME_HANDLE,
  displayName: 'Kwame Mensah',
  avatar: portraitStandIn('#60a5fa', '#1e40af'),
  banner: portraitStandIn('#a78bfa', '#4338ca'),
  bio: 'Compte de démonstration du texte enrichi.',
  createdAt: '2024-03-08T09:00:00.000Z',
};

const rtIntro = richMessage({
  id: 'rt-1',
  senderId: 'u-amina',
  sender: amina,
  content: 'On se retrouve ici pour le texte enrichi.',
  originalLanguage: 'fr',
  translations: [],
  createdAt: threadMoment(30),
});

/** MENTION — une validée, une fantôme. */
const rtMention = richMessage({
  id: 'rt-2',
  senderId: 'u-amina',
  sender: amina,
  content: `Merci @${KWAME_HANDLE} — et @fantome n’existe pas.`,
  originalLanguage: 'fr',
  translations: [],
  validatedMentions: [KWAME_HANDLE],
  createdAt: threadMoment(25),
});

/**
 * LIEN — une URL, un `javascript:` qui doit rester du texte mort, et une
 * TROISIÈME forme que le premier jet n'avait pas : un lien qui TERMINE LA
 * PHRASE. C'est la façon nominale d'écrire une adresse, et la ponctuation
 * finale étant un caractère d'URL valide, elle était avalée dans le `href` —
 * le lien affiché et le lien suivi cessaient d'être le même (revue #7033).
 */
const rtLien = richMessage({
  id: 'rt-3',
  senderId: 'u-kwame',
  sender: kwame,
  content: 'La note est là : https://meeshy.me/notes/7021 — pas javascript:alert(1). Détail sur https://meeshy.me/notes/7022.',
  originalLanguage: 'fr',
  translations: [],
  createdAt: threadMoment(20),
});

/**
 * EMPHASE — LES QUATRE que le porteur a demandées, dans une seule bulle, plus
 * le PIÈGE dans la même phrase : `snake_case` porte un tiret bas et doit
 * rester nu. Les quatre ensemble sont ce qui fait tomber un rendu qui n'en
 * connaîtrait que deux — et le piège est ce qui fait tomber un souligné écrit
 * sans frontière de mot. Aucune dépendance de rendu : quatre balises HTML.
 */
const rtEmphase = richMessage({
  id: 'rt-4',
  senderId: 'u-kwame',
  sender: kwame,
  content: 'C’est **important**, *urgent*, __noté__, ~~annulé~~ — et snake_case reste nu.',
  originalLanguage: 'fr',
  translations: [],
  createdAt: threadMoment(15),
});

/** HASHTAG — le CONTRE-témoin : rien ne doit devenir cliquable ici. */
const rtHashtag = richMessage({
  id: 'rt-5',
  senderId: 'u-amina',
  sender: amina,
  content: 'On range ça sous #livraison pour l’instant.',
  originalLanguage: 'fr',
  translations: [],
  createdAt: threadMoment(10),
});

/**
 * TRADUIT AU RANG 2 — original ESPAGNOL, traduction ANGLAISE, aucune
 * française. Le prisme du gate (`['fr', 'en']`) sert donc l'anglais, et c'est
 * dans CETTE phrase que la mention et le lien doivent être cliquables.
 */
const rtTraduit = richMessage({
  id: 'rt-6',
  senderId: 'u-kwame',
  sender: kwame,
  content: `Hola @${KWAME_HANDLE}, mira https://meeshy.me/es`,
  originalLanguage: 'es',
  translations: [translation('rt-6', 'en', `Hi @${KWAME_HANDLE}, look at https://meeshy.me/en`)],
  validatedMentions: [KWAME_HANDLE],
  createdAt: threadMoment(5),
});

const rtLast = richMessage({
  id: 'rt-7',
  senderId: VIEWER_ID,
  sender: viewer,
  content: 'Parfait, je relis.',
  originalLanguage: 'fr',
  translations: [],
  createdAt: threadMoment(2),
});

export const RICH_TEXT_MESSAGES: readonly Message[] = [
  rtIntro,
  rtMention,
  rtLien,
  rtEmphase,
  rtHashtag,
  rtTraduit,
  rtLast,
];

export const RICH_TEXT_CONVERSATION: Conversation = {
  ...conversationDefaults,
  id: RICH_TEXT_CONVERSATION_ID,
  title: 'Texte enrichi',
  type: 'group',
  memberCount: 3,
  participants: [viewer, amina, kwame],
  unreadCount: 0,
  lastMessage: rtLast,
  lastMessageAt: rtLast.createdAt,
  lastMessageOriginalLanguage: 'fr',
};

// ---------------------------------------------------------------- publications

const RICH_AUTHOR: FeedAuthor = { id: 'u-feed-nour', displayName: 'Nour Ben Ali', username: 'nour.benali' };

/**
 * LA PUBLICATION, où le hashtag EST cliquable — la différence de traitement
 * entre les deux surfaces est ce que le gate mesure, et elle n'est mesurable
 * que si les deux corpus portent le MÊME motif.
 */
export const RICH_TEXT_POSTS: readonly FeedPost[] = [
  {
    id: 'post-texte-enrichi',
    type: 'POST',
    createdAt: threadMoment(40).toISOString(),
    content: `Compte rendu **complet** sous #livraison — merci @${KWAME_HANDLE}, tout est sur https://meeshy.me/notes/7021`,
    originalLanguage: 'fr',
    author: RICH_AUTHOR,
    mentions: [{ username: KWAME_HANDLE }],
    likeCount: 3,
    commentCount: 0,
    repostCount: 0,
    bookmarkCount: 0,
    shareCount: 0,
  },
  {
    id: 'post-texte-enrichi-2',
    type: 'POST',
    createdAt: threadMoment(120).toISOString(),
    content: 'Deuxième passage sur #livraison, rien à signaler.',
    originalLanguage: 'fr',
    author: RICH_AUTHOR,
    mentions: [],
    likeCount: 0,
    commentCount: 0,
    repostCount: 0,
    bookmarkCount: 0,
    shareCount: 0,
  },
];

export function fixtureHashtagPosts(tag: string, cursor: number, limit: number): HashtagPage {
  const posts = tag === 'livraison' ? RICH_TEXT_POSTS : [];
  const slice = posts.slice(cursor, cursor + limit);
  const next = cursor + slice.length;
  return { posts: slice, nextCursor: next < posts.length ? next : null };
}

// ------------------------------------------------- les publications d'un auteur

/**
 * LES PUBLICATIONS DU SUJET DE RECETTE (#7083) — cinq, dont DEUX réels : c'est
 * le corpus minimal qui rend le filtre du bandeau MESURABLE (toucher « Réels »
 * doit faire baisser le nombre de cartes, re-toucher doit le rétablir).
 */
const authorPost = (
  id: string,
  type: 'POST' | 'REEL',
  content: string,
  minutes: number,
  extra: Partial<FeedPost> = {},
): FeedPost => ({
  id,
  type,
  createdAt: threadMoment(minutes).toISOString(),
  content,
  originalLanguage: 'fr',
  author: { id: RICH_PERSON.id, username: RICH_PERSON.username, displayName: RICH_PERSON.displayName, avatar: RICH_PERSON.avatar },
  mentions: [],
  likeCount: 0,
  commentCount: 0,
  repostCount: 0,
  bookmarkCount: 0,
  shareCount: 0,
  ...extra,
});

const AUTHOR_POSTS: readonly FeedPost[] = [
  /* LE TÉMOIN DE RANG, hérité du corpus du texte enrichi : original ESPAGNOL,
     traduction ANGLAISE, aucune française. Le prisme du gate (`['fr','en']`)
     sert donc le RANG 2 — un bloc qui ne descendrait que le rang 1 montrerait
     l'espagnol. Le bloc publications du profil hérite de ce témoin sans en
     réécrire un (leçon 261 : un témoin de rang s'écrit hors du rang 1). */
  authorPost('ap-1', 'POST', 'Hola, el informe está listo.', 12, {
    originalLanguage: 'es',
    translations: { en: { text: 'Hi, the report is ready.' } },
  }),
  authorPost('ap-2', 'REEL', 'Trois minutes sur le terrain.', 90),
  authorPost('ap-3', 'POST', `Compte rendu sous #livraison — merci @${KWAME_HANDLE}.`, 60 * 5, {
    mentions: [{ username: KWAME_HANDLE }],
    likeCount: 4,
    commentCount: 2,
  }),
  authorPost('ap-4', 'REEL', 'Le montage de la semaine.', 60 * 26),
  authorPost('ap-5', 'POST', 'Première note publiée sur ce compte.', 60 * 24 * 9),
];

/**
 * LA PAGE DE FIXTURES EN PORTE TROIS, pas vingt — et c'est délibéré.
 *
 * La route sert au plus `limit` lignes, mais rien dans son contrat ne promet
 * qu'une page PLEINE : `hasMore` + `nextCursor` sont la seule vérité, et
 * `nextFeedCursor` ne compare jamais la longueur d'une page à la limite
 * demandée. Un corpus de quarante publications n'achèterait donc aucun témoin
 * de plus qu'un corpus de cinq servi par pages de trois — il pèserait juste.
 *
 * LE CURSEUR EST UNE CHAÎNE OPAQUE, comme celui de la passerelle : un entier
 * rendrait vert un port qui `Number(...)`-ait le curseur, c'est-à-dire
 * exactement le défaut que le doc-comment d'`author-posts.ts` décrit.
 */
const FIXTURE_AUTHOR_PAGE = 3;
const CURSOR_PREFIX = 'author:';

export function fixtureAuthorPosts(authorId: string, cursor: string | null): FeedPage {
  const all = authorId === RICH_PERSON.id ? AUTHOR_POSTS : [];
  const from = cursor === null ? 0 : Number.parseInt(cursor.slice(CURSOR_PREFIX.length), 10);
  const start = Number.isFinite(from) && from > 0 ? from : 0;
  const posts = all.slice(start, start + FIXTURE_AUTHOR_PAGE);
  const next = start + posts.length;
  const hasMore = next < all.length;
  return {
    posts,
    pagination: {
      limit: AUTHOR_POSTS_PAGE_SIZE,
      hasMore,
      nextCursor: hasMore ? `${CURSOR_PREFIX}${next}` : null,
    },
  };
}

// ------------------------------------------------------------- le profil public

/** Les compteurs SERVIS à un tiers — les quatre intimes sont ABSENTS, comme
 * `servedUserStats` les retire (`routes/user-stats.ts:245-251`). */
const THIRD_PARTY_STATS: PublicProfileStats = {
  languagesUsed: 4,
  memberDays: 561,
  postsCount: 3,
  reelsCount: 2,
  storiesCount: 7,
  totalMessages: null,
  totalConversations: null,
  totalTranslations: null,
  friendRequestsReceived: null,
};

/** Les onze compteurs — ce que le serveur sert à SOI et à l'administration. */
const SELF_STATS: PublicProfileStats = {
  ...THIRD_PARTY_STATS,
  postsCount: 0,
  reelsCount: 0,
  storiesCount: 0,
  totalMessages: 1204,
  totalConversations: 18,
  totalTranslations: 340,
  friendRequestsReceived: 3,
};

/**
 * LA RELATION SE DÉRIVE DU MÊME ÉTAT QUE LES PANIERS, jamais d'une table à
 * part : côté serveur, `relationAvec` lit la table `friendRequest`
 * (`routes/directory/person.ts:72-93`) — c'est-à-dire exactement ce que
 * `GET /directory/friend-requests` sert. Deux sources ici auraient fait dire
 * deux choses au même geste, le défaut que `relationshipIndexOf` évite déjà
 * sur « Découvrir ».
 */
const servedRelation = (userId: string): ServedRelation => {
  if (userId === VIEWER_ID) return 'self';
  if (fixtureBlockedUsers().some((person) => person.id === userId)) return 'none';
  if (fixtureFriendRequests('accepted').some((row) => row.senderId === userId || row.receiverId === userId)) return 'friend';
  if (fixtureFriendRequests('received').some((row) => row.senderId === userId)) return 'pending_received';
  if (fixtureFriendRequests('sent').some((row) => row.receiverId === userId)) return 'pending_sent';
  return 'none';
};

const viewOf = (profile: PublicProfile): PublicProfileView => {
  const isSelf = profile.id === VIEWER_ID;
  /* Un compte BLOQUÉ par le lecteur : la passerelle n'a pas de valeur
     `blocked` dans `relationAvec` — la fiche le sait par le panier des
     bloqués, comme « Découvrir ». `relation` reste donc `none` sur le fil ;
     c'est `relationFromServed` qui compose l'état affiché. */
  return {
    profile,
    stats: isSelf ? SELF_STATS : THIRD_PARTY_STATS,
    relation: servedRelation(profile.id),
    isSelf,
  };
};

const VIEWER_PROFILE: PublicProfile = {
  id: VIEWER_ID,
  username: 'vous',
  displayName: 'Awa Diallo',
  avatar: portraitStandIn('#34d399', '#065f46'),
  banner: null,
  bio: 'Traductrice, Dakar.',
  createdAt: '2023-10-02T08:30:00.000Z',
};

/**
 * LE PROFIL PUBLIC EN FIXTURES — résolu par pseudo, INSENSIBLE À LA CASSE,
 * comme `servirProfilPublic` (`{ username: { equals: handle, mode:
 * 'insensitive' } }`). Sans cette insensibilité, un `@Kwame.Mensah` écrit dans
 * un message ouvrirait « profil introuvable » alors que le serveur, lui, le
 * trouve — le gate mesurerait un défaut que la production n'a pas.
 *
 * Il rend désormais la VUE ENTIÈRE (#7083) — identité, compteurs, relation —
 * parce que la route la sert en UN aller-retour (`?expand=stats,relation`) :
 * une fixture qui n'en rendrait qu'une part laisserait l'écran câbler des
 * requêtes que la production ne fait pas.
 */
export function fixturePublicProfile(handle: string): PublicProfileView | null {
  const needle = handle.trim().toLowerCase();
  if (RICH_PERSON.username.toLowerCase() === needle || RICH_PERSON.id.toLowerCase() === needle) return viewOf(RICH_PERSON);
  if (VIEWER_PROFILE.username === needle || VIEWER_PROFILE.id.toLowerCase() === needle) return viewOf(VIEWER_PROFILE);
  const found = Object.values(FIXTURE_PEOPLE).find(
    (person) => person.username.toLowerCase() === needle || person.id.toLowerCase() === needle,
  );
  return found === undefined
    ? null
    : viewOf({
        id: found.id,
        username: found.username,
        displayName: found.displayName,
        avatar: found.avatar,
        banner: null,
        bio: `Compte de démonstration — ${found.displayName ?? found.username}.`,
        createdAt: '2025-01-14T12:00:00.000Z',
      });
}
