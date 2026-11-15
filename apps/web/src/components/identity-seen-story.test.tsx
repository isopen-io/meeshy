import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import { renderToStaticMarkup } from 'react-dom/server';

import type { FeedPost } from '@/lib/api/feed-pages';
import type { Message } from '@/lib/api/types';
import { resolveFeedCardModel } from '@/lib/feed/card-model';
import type { PlacedMessage } from '@/lib/grouping';
import { loadInterfaceCatalog } from '@/lib/i18n-catalog';
import type { AuthorStoryRing } from '@/lib/view/author-story-ring';
import { ensureHappyDomRegistered, releaseHappyDomIfRegistered } from '@/test-support/happy-dom-environment';

import { Avatar } from './avatar';
import { Bubble } from './bubble';
import { FeedPostCard } from './feed-post-card';
import { FocalRow } from './focal-row';
import { PersonName } from './person-name';

/**
 * **TOUCHER UNE IDENTITÉ : LA STORY NON VUE, SINON LE PROFIL** — sur TOUTES
 * les surfaces qui passent par `identityTarget` (#7241, #7828, #7830 ; jumelle
 * iOS #7831, `MeeshyAvatar.swift:361-365`). Une story déjà vue reste
 * atteignable par « Voir la story » de l'appui long.
 *
 * Les rangées de commentaire, le réel et le lecteur de story ne reçoivent pas
 * d'anneau : leur identité mène au profil, déjà mesurée par
 * `identity-same-gesture.test.tsx`.
 */

const UNSEEN: AuthorStoryRing = { entryStoryId: 's-nour', unseen: true };
const SEEN: AuthorStoryRing = { entryStoryId: 's-nour', unseen: false };

const count = (html: string, href: string): number => html.split(`href="${href}"`).length - 1;

beforeAll(async () => {
  ensureHappyDomRegistered();
  await loadInterfaceCatalog('fr');
});
afterAll(async () => {
  await releaseHappyDomIfRegistered();
});

const MESSAGE = {
  id: 'm-vu',
  conversationId: 'c-vu',
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
  createdAt: new Date('2026-09-24T09:00:00.000Z'),
  updatedAt: new Date('2026-09-24T09:00:00.000Z'),
  timestamp: new Date('2026-09-24T09:00:00.000Z'),
  translations: [],
  sender: {
    id: 'p-nour',
    conversationId: 'c-vu',
    userId: 'u-nour',
    displayName: 'Nour Haddad',
    type: 'user',
    role: 'member',
    language: 'fr',
    isActive: true,
    joinedAt: new Date('2026-01-01T00:00:00.000Z'),
    isOnline: false,
    user: { id: 'u-nour', username: 'nour', displayName: 'Nour Haddad' },
  },
} as unknown as Message;

const place: PlacedMessage = { message: MESSAGE, head: true, tail: true, opensDay: null };

const post = (): FeedPost =>
  ({
    id: 'p-vu',
    type: 'POST',
    createdAt: '2026-09-24T08:55:00.000Z',
    content: 'bonjour',
    originalLanguage: 'fr',
    author: { id: 'u-nour', displayName: 'Nour Haddad', username: 'nour' },
  }) as FeedPost;

const surfaces: ReadonlyArray<{ readonly name: string; readonly render: (ring: AuthorStoryRing) => string; readonly links: number }> = [
  {
    name: 'la bulle du fil (avatar + nom)',
    links: 2,
    render: (ring) =>
      renderToStaticMarkup(
        <Bubble place={place} languages={['fr']} isGrouped viewerId="u-viewer" ephemeralDeadline={{ state: 'none' }} onJumpToMessage={() => {}} senderStoryRing={ring} />,
      ),
  },
  {
    name: 'la rangée plate du fil (avatar + nom)',
    links: 2,
    render: (ring) =>
      renderToStaticMarkup(
        <FocalRow mode="focal" place={place} languages={['fr']} viewerId="u-viewer" ephemeralDeadline={{ state: 'none' }} onJumpToMessage={() => {}} senderStoryRing={ring} />,
      ),
  },
  {
    name: 'la carte d’une publication (avatar + nom)',
    links: 2,
    render: (ring) =>
      renderToStaticMarkup(
        <FeedPostCard
          model={resolveFeedCardModel(post(), { preferredLanguages: ['fr'], now: new Date('2026-09-24T09:00:00.000Z') })}
          storyRing={ring}
        />,
      ),
  },
  {
    name: 'un avatar seul',
    links: 1,
    render: (ring) => renderToStaticMarkup(<Avatar initials="NH" color="#6366f1" size={40} name="Nour Haddad" profileUsername="nour" storyRing={ring} />),
  },
  {
    name: 'un nom seul (PersonName)',
    links: 1,
    render: (ring) => renderToStaticMarkup(<PersonName name="Nour Haddad" username="nour" storyRing={ring} />),
  },
];

for (const { name, render, links } of surfaces) {
  describe(name, () => {
    test('story NON VUE ⇒ le toucher ouvre la story', () => {
      const html = render(UNSEEN);
      expect(count(html, '/story/s-nour')).toBe(links);
      expect(count(html, '/u/nour')).toBe(0);
    });

    test('story DÉJÀ VUE ⇒ le toucher ouvre le profil', () => {
      const html = render(SEEN);
      expect(count(html, '/u/nour')).toBe(links);
      expect(count(html, '/story/s-nour')).toBe(0);
    });
  });
}
