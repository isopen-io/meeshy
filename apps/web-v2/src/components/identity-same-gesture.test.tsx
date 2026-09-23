import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import { renderToStaticMarkup } from 'react-dom/server';

import { loadInterfaceCatalog } from '@/lib/i18n-catalog';
import { ensureHappyDomRegistered, releaseHappyDomIfRegistered } from '@/test-support/happy-dom-environment';

import type { FeedPost } from '@/lib/api/feed-pages';
import type { PostComment } from '@/lib/api/publication-comments';
import type { Conversation, Message } from '@/lib/api/types';
import type { ConversationFlags } from '@/lib/api/preferences';
import type { PlacedMessage } from '@/lib/grouping';
import { resolveFeedCardModel } from '@/lib/feed/card-model';

import { Bubble } from './bubble';
import { CommentRow } from './comment-row';
import { FeedPostCard } from './feed-post-card';
import { FocalRow } from './focal-row';
import { LensRow } from './lens-row';

/**
 * **LE PSEUDO ET L'AVATAR SE TOUCHENT PAREIL** — directive porteur du
 * 2026-09-21 : « Dans conversations, post commentaire, reels, story, on doit
 * adopter le même comportement quand on y touche un pseudo ou avatar ».
 *
 * ## CE QUE CE FICHIER MESURE, ET POURQUOI IL NE MESURE PAS LA LOI
 *
 * La loi de destination a ses propres témoins (`lib/view/identity-target.test.ts`) :
 * ils prouvent que la RÈGLE est juste. Ils ne prouvent pas qu'un écran s'en
 * sert — c'est la distance exacte qui a coûté six lots à web-v2 cette
 * semaine (un mécanisme écrit, testé, jamais activé). Ce fichier-ci mesure
 * donc l'ARRIVÉE : sur chaque surface que la directive nomme, le balisage rendu
 * porte-t-il DEUX chemins vers la même adresse ?
 *
 * **Compter DEUX est le cœur du témoin.** Un seul `href="/u/nour"` passait déjà
 * avant ce lot (#6396 avait câblé l'avatar) : un témoin qui se contenterait de
 * `toContain` serait VERT sans que le nom soit tapable, et la directive serait
 * ratée sans qu'aucun rouge ne le dise.
 */

const compteLiens = (html: string, handle: string): number =>
  html.split(`href="/u/${handle}"`).length - 1;

beforeAll(async () => {
  ensureHappyDomRegistered();
  await loadInterfaceCatalog('fr');
});

afterAll(async () => {
  await releaseHappyDomIfRegistered();
});

const MESSAGE: Message = {
  id: 'm-identite',
  conversationId: 'c-identite',
  senderId: 'u-nour',
  content: 'Bonjour',
  originalLanguage: 'fr',
  messageType: 'text',
  messageSource: 'user',
  isEdited: false,
  isViewOnce: false,
  maxViewOnceCount: 1,
  viewOnceCount: 0,
  isBlurred: false,
  deliveredCount: 1,
  readCount: 1,
  reactionCount: 0,
  isEncrypted: false,
  createdAt: new Date('2026-09-21T09:00:00.000Z'),
  updatedAt: new Date('2026-09-21T09:00:00.000Z'),
  timestamp: new Date('2026-09-21T09:00:00.000Z'),
  translations: [],
  sender: {
    id: 'p-nour',
    conversationId: 'c-identite',
    userId: 'u-nour',
    displayName: 'Nour Haddad',
    type: 'user',
    role: 'member',
    language: 'fr',
    permissions: {
      canSendMessages: true,
      canSendFiles: true,
      canSendImages: true,
      canSendVideos: true,
      canSendAudios: true,
      canSendLocations: true,
      canSendLinks: true,
    },
    isActive: true,
    joinedAt: new Date('2026-01-01T00:00:00.000Z'),
    isOnline: false,
    user: { id: 'u-nour', username: 'nour', displayName: 'Nour Haddad' },
  },
} as Message;

const place: PlacedMessage = { message: MESSAGE, head: true, tail: true, opensDay: null };

const post = (): FeedPost =>
  ({
    id: 'p-identite',
    type: 'POST',
    createdAt: '2026-09-21T08:55:00.000Z',
    content: 'bonjour',
    originalLanguage: 'fr',
    author: { id: 'u-nour', displayName: 'Nour Haddad', username: 'nour' },
  }) as FeedPost;

describe('les deux moitiés de l’identité mènent au MÊME profil', () => {
  test('la bulle d’une conversation', () => {
    const html = renderToStaticMarkup(
      <Bubble place={place} languages={['fr']} isGrouped viewerId="u-viewer" ephemeralDeadline={{ state: 'none' }} onJumpToMessage={() => {}} />,
    );
    expect(compteLiens(html, 'nour')).toBe(2);
  });

  test('la rangée plate d’une conversation (Focal)', () => {
    const html = renderToStaticMarkup(
      <FocalRow mode="focal" place={place} languages={['fr']} viewerId="u-viewer" ephemeralDeadline={{ state: 'none' }} onJumpToMessage={() => {}} />,
    );
    expect(compteLiens(html, 'nour')).toBe(2);
  });

  test('la carte d’un post', () => {
    const html = renderToStaticMarkup(
      <FeedPostCard
        model={resolveFeedCardModel(post(), {
          preferredLanguages: ['fr'],
          now: new Date('2026-09-21T09:00:00.000Z'),
        })}
      />,
    );
    expect(compteLiens(html, 'nour')).toBe(2);
  });

  test('la rangée d’un commentaire', () => {
    const html = renderToStaticMarkup(
      <ul>
        <CommentRow
          comment={
            {
              id: 'c-identite',
              content: 'merci',
              createdAt: '2026-09-21T08:58:00.000Z',
              author: { id: 'u-nour', displayName: 'Nour Haddad', username: 'nour' },
            } as PostComment
          }
          language="fr"
          preferredLanguages={['fr']}
          locale="fr-FR"
          now={new Date('2026-09-21T09:00:00.000Z')}
        />
      </ul>,
    );
    expect(compteLiens(html, 'nour')).toBe(2);
  });
});

/**
 * **LA LISTE DES CONVERSATIONS EST L'EXCEPTION, ET ELLE EST ARBITRÉE.**
 *
 * Ici le titre de la rangée n'est pas une personne : sur un GROUPE c'est le nom
 * de la conversation. Et le geste dominant de l'écran le plus fréquenté est
 * d'OUVRIR LE FIL — le déplacer casserait plus qu'il ne servirait.
 *
 * iOS a tranché exactement ce cas (`LentilleConversationRow.swift:843`,
 * `onTap: isDirect ? onViewProfile : onViewConversationInfo`) : l'AVATAR porte
 * l'identité, le reste de la rangée porte le fil. Ce témoin fige les deux
 * moitiés de l'arbitrage — sans quoi « la rangée est un lien » reviendrait au
 * premier remaniement, et l'avatar redeviendrait muet.
 */
const FLAGS: ConversationFlags = { isPinned: false, isMuted: false, isArchived: false };

const conversationDirecte = (avecCompte: boolean): Conversation =>
  ({
    id: 'c-identite',
    type: 'direct',
    status: 'active',
    visibility: 'private',
    isActive: true,
    memberCount: 2,
    participants: [
      {
        id: 'p-nour',
        conversationId: 'c-identite',
        userId: 'u-nour',
        displayName: 'Nour Haddad',
        type: avecCompte ? 'user' : 'anonymous',
        role: 'member',
        language: 'fr',
        isActive: true,
        isOnline: false,
        joinedAt: new Date('2026-01-01'),
        ...(avecCompte ? { user: { id: 'u-nour', username: 'nour' } } : {}),
      },
    ],
    createdAt: new Date('2026-01-01'),
    updatedAt: new Date('2026-01-01'),
    unreadCount: 0,
    title: 'Nour Haddad',
    lastMessageAt: new Date('2026-09-21T09:00:00.000Z'),
  }) as unknown as Conversation;

const rangee = (conversation: Conversation): string =>
  renderToStaticMarkup(
    <LensRow
      conversation={conversation}
      languages={['fr']}
      viewerId="u-viewer"
      flags={FLAGS}
      unreadCount={0}
      onRowAction={() => {}}
    />,
  );

describe('dans la liste, l’avatar ouvre la personne et le texte ouvre le fil', () => {
  test('un direct : l’avatar mène au profil, le texte au fil', () => {
    const html = rangee(conversationDirecte(true));
    expect(compteLiens(html, 'nour')).toBe(1);
    expect(html).toContain('href="/c/c-identite"');
  });

  /**
   * LE CONTRE-TÉMOIN DE LA LOI 4 sur cette rangée : un pair SANS compte n'a
   * pas de fiche. L'avatar ne doit alors mener NULLE PART ailleurs qu'au fil —
   * jamais vers `/u/`, qui n'est pas une adresse.
   */
  test('un pair sans compte ne fabrique aucun lien de profil', () => {
    const html = rangee(conversationDirecte(false));
    expect(html).not.toContain('href="/u/');
    expect(html).toContain('href="/c/c-identite"');
  });
});
