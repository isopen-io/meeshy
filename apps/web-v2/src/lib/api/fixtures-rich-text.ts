import { usernamePatternSource } from '@meeshy/shared/types/api-schemas';

import type { FeedAuthor, FeedPost } from './feed-pages';
import { amina, conversationDefaults, kwame, message, portraitStandIn, threadMoment, translation, VIEWER_ID, viewer } from './fixtures-base';
import { FIXTURE_PEOPLE } from './fixtures-friends';
import type { HashtagPage } from './hashtag-posts';
import type { PublicProfile } from './public-profile';
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
  bio: 'Compte de démonstration du texte enrichi.',
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

/** LIEN — une URL, et un `javascript:` qui doit rester du texte mort. */
const rtLien = richMessage({
  id: 'rt-3',
  senderId: 'u-kwame',
  sender: kwame,
  content: 'La note est là : https://meeshy.me/notes/7021 — pas javascript:alert(1).',
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

/**
 * LE PROFIL PUBLIC EN FIXTURES — résolu par pseudo, INSENSIBLE À LA CASSE,
 * comme `servirProfilPublic` (`{ username: { equals: handle, mode:
 * 'insensitive' } }`). Sans cette insensibilité, un `@Kwame.Mensah` écrit dans
 * un message ouvrirait « profil introuvable » alors que le serveur, lui, le
 * trouve — le gate mesurerait un défaut que la production n'a pas.
 */
export function fixturePublicProfile(handle: string): PublicProfile | null {
  const needle = handle.trim().toLowerCase();
  if (RICH_PERSON.username.toLowerCase() === needle || RICH_PERSON.id.toLowerCase() === needle) return RICH_PERSON;
  const found = Object.values(FIXTURE_PEOPLE).find(
    (person) => person.username.toLowerCase() === needle || person.id.toLowerCase() === needle,
  );
  return found === undefined
    ? null
    : {
        id: found.id,
        username: found.username,
        displayName: found.displayName,
        avatar: found.avatar,
        bio: `Compte de démonstration — ${found.displayName ?? found.username}.`,
      };
}
