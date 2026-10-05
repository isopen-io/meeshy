import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import type { ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

import type { TypingEntry } from '@/lib/api/typing-store';
import { loadInterfaceCatalog } from '@/lib/i18n-catalog';
import { HerePeersContext, hereKeyOf, herePeersIn } from '@/lib/view/use-conversation-viewing';
import { AuthorMoodsContext } from '@/lib/view/use-author-moods';
import type { ActiveMember } from '@/lib/view/top-active-members';
import { ensureHappyDomRegistered, releaseHappyDomIfRegistered } from '@/test-support/happy-dom-environment';

import { ActiveMembersStack } from './active-members-stack';
import { AuthorAvatar } from './author-avatar';
import { TypingRosterCell } from './typing-roster-cell';

/**
 * « EST DANS LA CONVERSATION » DANS LE FIL (#8892) — dans un groupe, l'avatar
 * de chaque auteur dit s'il a la conversation ouverte : le point indigo sur
 * les bulles, sur la cellule de frappe et sur la pile de l'en-tête.
 */

const HERE = 'data-presence="here"';

beforeAll(async () => {
  ensureHappyDomRegistered();
  await loadInterfaceCatalog('fr');
});
afterAll(async () => {
  await releaseHappyDomIfRegistered();
});

const inThread = (herePeers: readonly string[], node: ReactNode) =>
  renderToStaticMarkup(<HerePeersContext.Provider value={herePeers}>{node}</HerePeersContext.Provider>);

describe('l’avatar d’un auteur de message', () => {
  test('l’auteur présent dans la conversation porte le point indigo', () => {
    const html = inThread(['u-nour'], <AuthorAvatar initials="NH" color="#6366f1" size={32} authorId="u-nour" />);
    expect(html).toContain(HERE);
  });

  test('l’auteur absent n’en porte pas', () => {
    const html = inThread(['u-ali'], <AuthorAvatar initials="NH" color="#6366f1" size={32} authorId="u-nour" />);
    expect(html).not.toContain(HERE);
  });

  test('hors d’un fil, personne n’est « ici »', () => {
    const html = renderToStaticMarkup(<AuthorAvatar initials="NH" color="#6366f1" size={32} authorId="u-nour" />);
    expect(html).not.toContain(HERE);
  });
});

describe('la cellule de frappe', () => {
  const entry = (userId: string, displayName: string): TypingEntry => ({ userId, displayName, expiresAt: 0 });

  test('le meneur présent porte le point indigo, dans les deux tenues', () => {
    for (const flat of [true, false]) {
      const html = inThread(['u-kwame'], <TypingRosterCell typists={[entry('u-kwame', 'Kwame Mensah')]} accent="#5B4CFF" flat={flat} />);
      expect(html).toContain(HERE);
    }
  });
});

describe('la pile des participants actifs de l’en-tête', () => {
  const members: readonly ActiveMember[] = [
    { id: 'u-nour', name: 'Nour Haddad', username: 'nour', avatar: undefined, count: 5 },
    { id: 'u-ali', name: 'Ali Ben', username: 'ali', avatar: undefined, count: 3 },
  ];

  test('seuls les membres présents portent le point indigo', () => {
    const html = inThread(['u-ali'], <ActiveMembersStack members={members} accent="#6366f1" />);
    expect(html.split(HERE).length - 1).toBe(1);
    expect(html.indexOf(HERE)).toBeGreaterThan(html.indexOf('data-active-member="u-ali"'));
  });
});

describe('qui est ici, et sous quelle clé', () => {
  test('un inscrit se reconnaît à son compte, un invité à sa ligne de participant', () => {
    expect(hereKeyOf({ id: 'p-1', userId: 'u-1' })).toBe('u-1');
    expect(hereKeyOf({ id: 'p-2', userId: null, user: { id: 'u-2' } })).toBe('u-2');
    expect(hereKeyOf({ id: 'p-anon', userId: null })).toBe('p-anon');
    expect(hereKeyOf(undefined)).toBeUndefined();
  });

  test('une conversation sans présent rend toujours la MÊME liste vide', () => {
    const state = { byConversation: { 'c-1': ['u-1'] } };
    expect(herePeersIn(state, 'c-1')).toEqual(['u-1']);
    expect(herePeersIn(state, 'c-2')).toBe(herePeersIn({ byConversation: {} }, 'c-3'));
  });
});

describe('le mood des auteurs dans le fil (#9065)', () => {
  const MOODS: Readonly<Record<string, string>> = { 'u-nour': '😎' };
  const withMoods = (node: ReactNode) =>
    renderToStaticMarkup(
      <AuthorMoodsContext.Provider value={(authorId) => (authorId === undefined ? undefined : MOODS[authorId])}>{node}</AuthorMoodsContext.Provider>,
    );

  test('l’auteur qui a un mood le porte sur son avatar', () => {
    expect(withMoods(<AuthorAvatar initials="NH" color="#6366f1" size={32} authorId="u-nour" />)).toContain('data-mood="😎"');
  });

  test('l’auteur sans mood n’en porte pas', () => {
    expect(withMoods(<AuthorAvatar initials="AB" color="#6366f1" size={32} authorId="u-ali" />)).not.toContain('data-mood');
  });

  test('la pile des actifs et la cellule de frappe le portent aussi', () => {
    const members: readonly ActiveMember[] = [{ id: 'u-nour', name: 'Nour Haddad', username: 'nour', avatar: undefined, count: 5 }];
    expect(withMoods(<ActiveMembersStack members={members} accent="#6366f1" />)).toContain('data-mood="😎"');
    const entry: TypingEntry = { userId: 'u-nour', displayName: 'Nour Haddad', expiresAt: 0 };
    expect(withMoods(<TypingRosterCell typists={[entry]} accent="#5B4CFF" flat />)).toContain('data-mood="😎"');
  });
});
