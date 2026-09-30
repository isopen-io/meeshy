import { describe, expect, test } from 'bun:test';
import { renderToStaticMarkup } from 'react-dom/server';

import type { NotificationRecord } from '@/lib/notifications/record';

import { NotificationBanner } from './notification-toast';

/**
 * LA BANNIÈRE IN-APP DESSINÉE (#8727, jumelle de #8723) — la capture porteur
 * montrait « 🎵 Audio • 🎵 Audio · 0:32 · 193 Ko » : le libellé du média ne
 * paraît ici qu'UNE fois, l'avatar porte la pastille du TYPE, la bannière mène
 * où la ligne de la cloche mène, et se ferme sans souris.
 */

const noop = () => undefined;

const record = (partial: Partial<NotificationRecord>): NotificationRecord => ({
  id: 'n1',
  type: 'new_message',
  title: 'Grace',
  content: '🎵 Audio · 0:32 · 193 Ko',
  actor: { id: 'u-grace', username: 'grace', displayName: 'Grace', avatar: null },
  context: { conversationId: 'c1', conversationTitle: 'Les amateurs', conversationType: 'group' },
  metadata: {},
  state: { isRead: false, createdAt: '2026-09-30T09:59:58.000Z' },
  ...partial,
});

const occurrences = (html: string, text: string) => html.split(text).length - 1;

describe('la bannière in-app', () => {
  test('un vocal : le libellé du média UNE fois, la pastille du type sur l’avatar', () => {
    const html = renderToStaticMarkup(<NotificationBanner notification={record({})} onDismiss={noop} />);
    expect(occurrences(html, '🎵 Audio')).toBe(1);
    expect(html).toContain('data-banner-type-badge');
    expect(html).toContain('>Grace<');
  });

  test('elle mène à la conversation, et se ferme par un bouton NOMMÉ', () => {
    const html = renderToStaticMarkup(<NotificationBanner notification={record({})} onDismiss={noop} />);
    expect(html).toContain('href="/c/c1"');
    expect(html).toContain('aria-label="Fermer la notification"');
    expect(html).toContain('role="status"');
  });

  test('une réaction à un post montre la case du contenu et l’extrait du POST', () => {
    const html = renderToStaticMarkup(
      <NotificationBanner
        notification={record({ type: 'post_like', title: 'Awa a aimé votre publication', content: '', metadata: { postPreview: 'Le lac au matin' }, context: { postId: 'p1' } })}
        onDismiss={noop}
      />,
    );
    expect(html).toContain('Le lac au matin');
    expect(html).toContain('href="/post/p1"');
  });
});
