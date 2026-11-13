import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterAll, afterEach, beforeAll, describe, expect, test } from 'bun:test';

import type { ConversationFlags } from '@/lib/api/preferences';
import type { Conversation } from '@/lib/api/types';
import { loadCirclesCatalog } from '@/lib/i18n-circles-catalog';
import { loadRowMenuCatalog } from '@/lib/i18n-row-menu-catalog';
import { listeningStore } from '@/lib/now-playing/listening-live';
import { ensureHappyDomRegistered, releaseHappyDomIfRegistered } from '@/test-support/happy-dom-environment';

import { LensRow, type LensRowProps } from './lens-row';

/**
 * **DANS LA LISTE, CE QU'ÉCOUTE UN PROCHE DÉFILE SUR SON AVATAR** (#16733) — iso
 * `ConversationRowAvatar` (iOS, #17083) : la rangée d'un DIRECT porte le bandeau
 * de l'en-tête et de la fiche, au détail que le serveur a servi à ce lecteur
 * (la catégorie pour un Proche, « titre · origine » pour un Sang). Un groupe
 * n'en porte jamais. Le lecteur d'écran l'entend dans la ligne, une fois.
 */
const PLAIN: ConversationFlags = { isPinned: false, isMuted: false, isArchived: false };

const conversation = (type: 'direct' | 'group'): Conversation =>
  ({
    id: 'c-listen',
    type,
    status: 'active',
    visibility: 'private',
    isActive: true,
    memberCount: 2,
    participants: [
      {
        id: 'p-nour',
        conversationId: 'c-listen',
        userId: 'u-nour',
        displayName: 'Nour Haddad',
        type: 'user',
        role: 'member',
        language: 'fr',
        isActive: true,
        isOnline: false,
        joinedAt: new Date('2026-01-01'),
        user: { id: 'u-nour', username: 'nour' },
      },
    ],
    createdAt: new Date('2026-01-01'),
    updatedAt: new Date('2026-01-01'),
    unreadCount: 0,
    title: 'Nour Haddad',
    lastMessageAt: new Date('2026-11-13T09:00:00.000Z'),
  }) as unknown as Conversation;

const props = (overrides: Partial<LensRowProps> = {}): LensRowProps => ({
  conversation: conversation('direct'),
  languages: ['fr'],
  viewerId: 'u-viewer',
  flags: PLAIN,
  unreadCount: 0,
  onRowAction: () => {},
  ...overrides,
});

const globals = globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean };

const row = (overrides: Partial<LensRowProps> = {}): string => {
  const container = document.createElement('ul');
  document.body.appendChild(container);
  const root = createRoot(container);
  act(() => root.render(<LensRow {...props(overrides)} />));
  const html = container.innerHTML;
  act(() => root.unmount());
  container.remove();
  return html;
};

const listens = (served: { readonly title?: string; readonly source?: string } = {}) => {
  const updatedAt = new Date().toISOString();
  listeningStore.getState().receive({
    userId: 'u-nour',
    category: 'music',
    ...served,
    updatedAt,
    expiresAt: new Date(Date.now() + 60_000).toISOString(),
  });
};

beforeAll(async () => {
  ensureHappyDomRegistered({ url: 'http://localhost/' });
  globals.IS_REACT_ACT_ENVIRONMENT = true;
  await Promise.all([loadRowMenuCatalog('fr'), loadCirclesCatalog('fr')]);
});

afterAll(async () => {
  await act(async () => {});
  delete globals.IS_REACT_ACT_ENVIRONMENT;
  await releaseHappyDomIfRegistered();
});

afterEach(() => {
  listeningStore.getState().clear('u-nour');
});

describe('l’écoute d’un Proche sur l’avatar de la rangée (#16733)', () => {
  test('un Proche : la catégorie servie défile sur l’avatar du direct', () => {
    listens();
    const html = row();
    expect(html).toContain('data-listening-band');
    expect(html).toContain('🎵 Écoute de la musique');
  });

  test('un Sang : le titre et l’origine servis, rien d’inventé', () => {
    listens({ title: 'Clair de lune', source: 'Spotify' });
    const html = row();
    expect(html).toContain('🎵 Clair de lune · Spotify');
    expect(html).not.toContain('Écoute de la musique');
  });

  test('rien de servi : ni bandeau, ni phrase', () => {
    const html = row();
    expect(html).not.toContain('data-listening-band');
    expect(html).not.toContain('En ce moment');
  });

  test('un groupe ne porte jamais l’écoute d’un membre', () => {
    listens({ title: 'Clair de lune', source: 'Spotify' });
    const html = row({ conversation: conversation('group') });
    expect(html).not.toContain('data-listening-band');
    expect(html).not.toContain('Clair de lune');
  });

  test('le lecteur d’écran l’entend dans la ligne, une seule fois, le bandeau restant décoratif', () => {
    listens({ title: 'Clair de lune', source: 'Spotify' });
    const html = row();
    expect(html).toMatch(/data-listening-band="" aria-hidden="true"/);
    const primary = html.slice(html.indexOf('data-row-primary'));
    expect(primary).toContain('<span data-listening-spoken="" class="sr-only">En ce moment : Clair de lune · Spotify</span>');
    expect(primary.split('En ce moment').length - 1).toBe(1);
  });
});
