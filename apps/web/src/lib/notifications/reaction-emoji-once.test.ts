import { describe, expect, test } from 'bun:test';

import { loadNotificationRowCatalog } from '@/lib/i18n-notification-row-catalog';

import { bannerPresentation } from './in-app-banner-view';
import type { NotificationRecord } from './record';
import { notificationRowPresentation } from './row-presentation';

await loadNotificationRowCatalog('fr');

/**
 * #9049 — une réaction se lit « a réagi ❤️ à votre message : « … » » : l'émoji
 * UNE fois, l'acteur UNE fois. La passerelle compose la phrase ; la ligne de la
 * cloche et la bannière in-app la rendent sans y ajouter ni émoji ni nom.
 */

const NOW = new Date('2026-10-04T10:00:00.000Z');
const OPTIONS = { language: 'fr', now: NOW } as const;

const record = (partial: Partial<NotificationRecord>): NotificationRecord => ({
  id: 'n1',
  type: 'message_reaction',
  content: 'a réagi ❤️ à votre message : « J’attends! »',
  actor: { id: 'u-sama', username: 'sama', displayName: 'meeshy sama', avatar: null },
  context: { conversationId: 'c1', conversationType: 'direct' },
  metadata: { reactionEmoji: '❤️' },
  state: { isRead: false, createdAt: '2026-10-04T09:59:00.000Z' },
  ...partial,
});

const occurrences = (texts: readonly (string | null)[], needle: string): number =>
  texts.filter((text): text is string => text !== null).join('\n').split(needle).length - 1;

const rowTexts = (notification: NotificationRecord): readonly (string | null)[] => {
  const row = notificationRowPresentation(notification, OPTIONS);
  return [row.title, row.body, row.quote, row.footer?.text ?? null];
};

const bannerTexts = (notification: NotificationRecord): readonly (string | null)[] => {
  const banner = bannerPresentation(notification, OPTIONS);
  return [banner.headline, banner.body];
};

describe('#9049 — réaction à un message, en discussion directe', () => {
  const notification = record({});

  test('la ligne de la cloche : l’acteur en titre, la phrase servie en corps', () => {
    const row = notificationRowPresentation(notification, OPTIONS);
    expect(row.title).toBe('meeshy sama');
    expect(row.body).toBe('a réagi ❤️ à votre message : « J’attends! »');
    expect(occurrences(rowTexts(notification), '❤️')).toBe(1);
    expect(occurrences(rowTexts(notification), 'meeshy sama')).toBe(1);
  });

  test('la bannière in-app : même phrase, l’émoji et l’acteur une fois', () => {
    const banner = bannerPresentation(notification, OPTIONS);
    expect(banner.headline).toBe('meeshy sama');
    expect(banner.body).toBe('a réagi ❤️ à votre message : « J’attends! »');
    expect(occurrences(bannerTexts(notification), '❤️')).toBe(1);
    expect(occurrences(bannerTexts(notification), 'meeshy sama')).toBe(1);
  });
});

describe('#9049 — chaque réaction dit son émoji une fois, sur la ligne comme sur la bannière', () => {
  const cases: readonly (readonly [string, NotificationRecord])[] = [
    [
      'message de groupe',
      record({
        content: 'a réagi 🔥 à votre message : « On part à 9 h »',
        context: { conversationId: 'c2', conversationType: 'group', conversationTitle: 'Équipe Tech' },
        metadata: { reactionEmoji: '🔥' },
      }),
    ],
    [
      'story',
      record({
        type: 'story_reaction',
        title: 'Sam a réagi 🔥 à votre story',
        subtitle: 'Votre story',
        content: 'Votre story',
        context: { postId: 'p1' },
        metadata: { emoji: '🔥', postType: 'STORY' },
      }),
    ],
    [
      'commentaire',
      record({
        type: 'comment_reaction',
        title: 'Sam a réagi 🔥 à votre commentaire',
        subtitle: '« Superbe »',
        content: '« Superbe »',
        context: { postId: 'p1' },
        metadata: { reactionEmoji: '🔥', commentPreview: 'Superbe', postType: 'POST' },
      }),
    ],
  ];

  test.each(cases)('%s', (_name, notification) => {
    expect(occurrences(rowTexts(notification), '🔥')).toBe(1);
    expect(occurrences(bannerTexts(notification), '🔥')).toBe(1);
  });
});
