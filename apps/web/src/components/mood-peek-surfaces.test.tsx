import { afterAll, afterEach, beforeAll, describe, expect, test } from 'bun:test';
import { renderToStaticMarkup } from 'react-dom/server';

import type { PublicProfile } from '@/lib/api/public-profile';
import type { Conversation } from '@/lib/api/types';
import { loadInterfaceCatalog } from '@/lib/i18n-catalog';
import { closeMoodPeek, registerMoodPeekHost } from '@/lib/view/mood-peek';
import { AuthorMoodsContext } from '@/lib/view/use-author-moods';
import { ProfileHero } from '@/routes/user-profile-header';
import { ensureHappyDomRegistered, releaseHappyDomIfRegistered } from '@/test-support/happy-dom-environment';

import { AuthorAvatar } from './author-avatar';
import { LensRow } from './lens-row';

/**
 * **LES QUATRE EMPLACEMENTS DE L'HUMEUR** (#10528) — le profil, la rangée
 * d'un direct, l'avatar d'un auteur dans le fil (l'en-tête du fil a son propre
 * témoin, `thread-header-mood.test.tsx`). Dans les deux LISTES, la pastille
 * est immobile ; partout, elle se touche.
 */

beforeAll(async () => {
  ensureHappyDomRegistered();
  await loadInterfaceCatalog('fr');
});

afterAll(async () => {
  await releaseHappyDomIfRegistered();
});

const hosts: Array<() => void> = [];

afterEach(() => {
  closeMoodPeek();
  hosts.splice(0).forEach((release) => release());
});

const withHost = () => {
  hosts.push(registerMoodPeekHost());
};

const MOTION = /mood-(breathe|stir|hush|enter)/;

const direct = (): Conversation =>
  ({
    id: 'c1',
    type: 'direct',
    status: 'active',
    visibility: 'private',
    isActive: true,
    memberCount: 2,
    participants: [
      { id: 'p1', userId: 'u-viewer' },
      { id: 'p2', userId: 'u-amina', user: { id: 'u-amina', username: 'amina', isOnline: true } },
    ],
    createdAt: new Date('2026-01-01'),
    updatedAt: new Date('2026-01-01'),
    unreadCount: 0,
    title: 'Amina',
  }) as unknown as Conversation;

const row = (peerMood: string | undefined) =>
  renderToStaticMarkup(
    <LensRow
      conversation={direct()}
      languages={['fr']}
      viewerId="u-viewer"
      flags={{ isPinned: false, isMuted: false, isArchived: false }}
      unreadCount={0}
      onRowAction={() => {}}
      peerHere
      peerActive
      {...(peerMood === undefined ? {} : { peerMood })}
    />,
  );

describe('la liste des conversations', () => {
  test('la pastille du pair est immobile, même quand il est actif ici', () => {
    const html = row('😎');

    expect(html).toContain('data-mood="😎"');
    expect(html).not.toMatch(MOTION);
  });

  test('et elle se touche : la cible désigne le pair', () => {
    withHost();
    expect(row('😎')).toContain('data-mood-peek="u-amina"');
  });

  test('sans humeur, aucune cible', () => {
    withHost();
    expect(row(undefined)).not.toContain('data-mood-peek');
  });
});

const author = () =>
  renderToStaticMarkup(
    <AuthorMoodsContext.Provider value={(id) => (id === 'u-nour' ? '🎉' : undefined)}>
      <AuthorAvatar initials="NO" color="#4455ff" size={28} name="Nour" profileUsername="nour" authorId="u-nour" />
    </AuthorMoodsContext.Provider>,
  );

describe('la liste des messages', () => {
  test('la pastille de l’auteur est immobile', () => {
    const html = author();

    expect(html).toContain('data-mood="🎉"');
    expect(html).not.toMatch(MOTION);
  });

  test('et elle se touche : la cible désigne l’auteur, sur 44 px', () => {
    withHost();
    expect(author()).toMatch(/data-mood-peek="u-nour"[^>]*style="[^"]*width:44px;height:44px/);
  });
});

const PROFILE: PublicProfile = {
  id: 'u-nour',
  username: 'nour',
  displayName: 'Nour',
  avatar: '2026/09/u-nour/photo.png',
  banner: null,
  bio: null,
  createdAt: null,
};

const hero = (mood: string | undefined) =>
  renderToStaticMarkup(<ProfileHero profile={PROFILE} name="Nour" accent="#4455ff" presence={null} {...(mood === undefined ? {} : { mood })} />);

describe('le profil', () => {
  test('sans humeur servie, l’avatar du profil n’en porte pas', () => {
    expect(hero(undefined)).not.toContain('data-mood');
  });

  test('avec une humeur, la pastille est là — et elle respire, ce n’est pas une liste', () => {
    const html = hero('🎉');

    expect(html).toContain('data-mood="🎉"');
    expect(html).toContain('mood-breathe');
  });

  /** La photo du profil est un BOUTON (elle s'ouvre en plein écran) : la cible
   * de l'humeur ne peut pas être son enfant. */
  test('la cible de l’humeur est hors du bouton de la photo', () => {
    withHost();
    const html = hero('🎉');
    const photo = html.slice(html.indexOf('data-profile-open-image'), html.indexOf('</button>'));

    expect(html).toContain('data-mood-peek="u-nour"');
    expect(photo).toContain('data-mood="🎉"');
    expect(photo).not.toContain('data-mood-peek');
  });
});
