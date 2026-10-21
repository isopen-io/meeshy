import { beforeAll, describe, expect, test } from 'bun:test';
import { renderToStaticMarkup } from 'react-dom/server';

import type { Conversation } from '@/lib/api/types';
import { loadRowMenuCatalog } from '@/lib/i18n-row-menu-catalog';

import { LensRow, type LensRowProps } from './lens-row';

const GROUP = {
  id: 'c-grp',
  type: 'group',
  status: 'active',
  visibility: 'private',
  isActive: true,
  memberCount: 3,
  participants: [],
  createdAt: new Date('2026-01-01'),
  updatedAt: new Date('2026-01-01'),
  unreadCount: 0,
  title: 'Équipe',
  lastMessageAt: new Date('2026-10-14T12:00:00.000Z'),
} as unknown as Conversation;

const row = (interfaceLanguage: string): string => {
  const props: LensRowProps = {
    conversation: GROUP,
    languages: ['fr'],
    viewerId: 'u-viewer',
    flags: { isPinned: false, isMuted: false, isArchived: false },
    unreadCount: 0,
    onRowAction: () => {},
    interfaceLanguage,
    status: { magnified: true, alpha: 1, scale: 1, breathing: 0 },
  };
  return renderToStaticMarkup(<LensRow {...props} />);
};

beforeAll(async () => {
  await Promise.all(['fr', 'en'].map((l) => loadRowMenuCatalog(l as 'fr')));
});

describe('le supplément de la rangée magnifiée suit la langue du lecteur', () => {
  test('anglais : « 3 members » et une date lisible, ni « membres » ni AAAA-MM-JJ', () => {
    const html = row('en');
    expect(html).toContain('· 3 members');
    expect(html).not.toContain('membres');
    expect(html).toContain('<span>Oct 14, 2026</span>');
  });

  test('français : « 3 membres »', () => {
    expect(row('fr')).toContain('· 3 membres');
  });
});
