import { beforeAll, describe, expect, test } from 'bun:test';
import { renderToStaticMarkup } from 'react-dom/server';

import type { ConversationFlags } from '@/lib/api/preferences';
import type { Conversation } from '@/lib/api/types';
import { loadRowMenuCatalog } from '@/lib/i18n-row-menu-catalog';

import { LensRow, sameRowProps, type LensRowProps } from './lens-row';

/**
 * **L'ANNEAU DE STORY ET LA SOURDINE SUR LA RANGÉE** (#10598) — miroir de
 * `LentilleConversationRow.swift` : l'avatar d'un DIRECT porte l'anneau des
 * stories du pair (`storyState: storyRingState`, `:653`) et l'ouvre au toucher
 * tant qu'il reste du non-vu (`MeeshyAvatar.swift:410`) ; la sourdine se voit
 * après le nom (`🔕`, `:262`), plus seulement par le fondu du chrome.
 */
const MUTED: ConversationFlags = { isPinned: false, isMuted: true, isArchived: false };
const PLAIN: ConversationFlags = { isPinned: false, isMuted: false, isArchived: false };

const conversation = (type: 'direct' | 'group'): Conversation =>
  ({
    id: 'c-ring',
    type,
    status: 'active',
    visibility: 'private',
    isActive: true,
    memberCount: 2,
    participants: [
      {
        id: 'p-nour',
        conversationId: 'c-ring',
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
    lastMessageAt: new Date('2026-10-14T09:00:00.000Z'),
  }) as unknown as Conversation;

const LANGUAGES: readonly string[] = ['fr'];
const DIRECT = conversation('direct');
const GROUP = conversation('group');
const noop = () => {};

const props = (overrides: Partial<LensRowProps> = {}): LensRowProps => ({
  conversation: DIRECT,
  languages: LANGUAGES,
  viewerId: 'u-viewer',
  flags: PLAIN,
  unreadCount: 0,
  onRowAction: noop,
  ...overrides,
});

const row = (overrides: Partial<LensRowProps> = {}): string => renderToStaticMarkup(<LensRow {...props(overrides)} />);

beforeAll(async () => {
  await loadRowMenuCatalog('fr');
});

describe('l’anneau de story sur l’avatar de la rangée (#10598)', () => {
  test('une story NON VUE du pair : anneau plein, et l’avatar ouvre la story', () => {
    const html = row({ peerStoryRing: { entryStoryId: 's-1', unseen: true } });
    expect(html).toContain('data-story-ring="unseen"');
    expect(html).toContain('href="/story/s-1"');
    expect(html).not.toContain('href="/u/nour"');
  });

  test('une story DÉJÀ VUE : anneau atténué, l’avatar garde le profil', () => {
    const html = row({ peerStoryRing: { entryStoryId: 's-1', unseen: false } });
    expect(html).toContain('data-story-ring="seen"');
    expect(html).toContain('href="/u/nour"');
    expect(html).not.toContain('href="/story/s-1"');
  });

  test('sans story, aucun anneau', () => {
    expect(row()).not.toContain('data-story-ring');
  });

  test('un groupe ne porte jamais l’anneau d’un membre', () => {
    const html = row({ conversation: GROUP, peerStoryRing: { entryStoryId: 's-1', unseen: true } });
    expect(html).not.toContain('data-story-ring');
    expect(html).not.toContain('href="/story/s-1"');
  });
});

describe('le glyphe de sourdine (#10598)', () => {
  test('une conversation en sourdine porte la cloche barrée, nommée', () => {
    const html = row({ flags: MUTED });
    expect(html).toMatch(/data-muted[^>]*>/);
    expect(html).toContain('En sourdine');
  });

  test('une conversation qui sonne n’en porte aucun', () => {
    expect(row()).not.toContain('data-muted');
  });
});

describe('le comparateur de memo suit l’anneau par VALEUR (#10598)', () => {
  test('le même anneau dans un objet neuf ne re-rend pas la rangée', () => {
    expect(
      sameRowProps(props({ peerStoryRing: { entryStoryId: 's-1', unseen: true } }), props({ peerStoryRing: { entryStoryId: 's-1', unseen: true } })),
    ).toBe(true);
  });

  test('une story vue à l’instant re-rend la rangée', () => {
    expect(
      sameRowProps(props({ peerStoryRing: { entryStoryId: 's-1', unseen: true } }), props({ peerStoryRing: { entryStoryId: 's-1', unseen: false } })),
    ).toBe(false);
  });
});
