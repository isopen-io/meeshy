import { beforeAll, describe, expect, test } from 'bun:test';
import { renderToStaticMarkup } from 'react-dom/server';
import { conversationAccentPalette } from '@meeshy/shared/utils/conversation-colors';
import { APPEARANCE_GAMUT } from '@meeshy/shared/utils/appearance-gamut';

import type { Conversation } from '@/lib/api/types';
import { loadRowMenuCatalog } from '@/lib/i18n-row-menu-catalog';

import { LensRow } from './lens-row';

/**
 * **L'ACCENT PERSONNEL SE LIT SUR LA RANGÉE** (#10631, D2) — la ligne de liste
 * et son avatar prennent l'accent choisi pour CETTE conversation, et la palette
 * calculée sans choix (« Automatique »).
 */
const conversation = (accent: string | null): Conversation =>
  ({
    id: 'c-accent',
    type: 'group',
    status: 'active',
    visibility: 'private',
    isActive: true,
    memberCount: 2,
    participants: [],
    createdAt: new Date('2026-01-01'),
    updatedAt: new Date('2026-01-01'),
    unreadCount: 0,
    title: 'Équipe',
    lastMessageAt: new Date('2026-10-14T09:00:00.000Z'),
    ...(accent === null ? {} : { userPreferences: [{ appearance: { v: 1, background: { kind: 'signature' }, accent, animate: true } }] }),
  }) as unknown as Conversation;

const row = (c: Conversation): string =>
  renderToStaticMarkup(
    <LensRow conversation={c} languages={['fr']} viewerId="u-viewer" flags={{ isPinned: false, isMuted: false, isArchived: false }} unreadCount={0} onRowAction={() => {}} />,
  );

beforeAll(async () => {
  await loadRowMenuCatalog('fr');
});

describe('l’accent personnel sur la ligne de liste', () => {
  test('un accent choisi remplace l’accent calculé', () => {
    const html = row(conversation('corail')).toUpperCase();
    expect(html).toContain(APPEARANCE_GAMUT.corail.dark.accent.toUpperCase());
    expect(html).not.toContain(conversationAccentPalette({ name: 'Équipe', type: 'group' }).primary.toUpperCase());
  });

  test('« Automatique » rend l’accent calculé', () => {
    expect(row(conversation(null)).toUpperCase()).toContain(conversationAccentPalette({ name: 'Équipe', type: 'group' }).primary.toUpperCase());
  });
});
