import { describe, expect, test } from 'bun:test';
import { renderToStaticMarkup } from 'react-dom/server';

import { loadNotificationRowCatalog } from '@/lib/i18n-notification-row-catalog';
import { decodeNotification, type NotificationRecord } from '@/lib/notifications/record';

import { NotificationBanner } from './notification-toast';

await loadNotificationRowCatalog('fr');

/**
 * LA BANNIÈRE IN-APP PORTE LE DÉTAIL DU CONTENU (#8860, jumelle de
 * `NotificationToastView` iOS après #8856). Le corps est celui que la
 * passerelle a composé ; la bannière y ajoute les gestes (« Ouvrir la carte »,
 * « Rejoindre », « Répondre »), la vignette d'une vidéo, l'effectif d'une
 * invitation et le lecteur d'un vocal. La notification passe par le VRAI
 * décodeur : c'est lui qui pose le second verrou d'un message protégé.
 */

const noop = () => undefined;

const served = (context: Record<string, unknown>, content: string): NotificationRecord => {
  const record = decodeNotification({
    id: 'n1',
    type: 'new_message',
    title: 'Awa',
    content,
    actor: { id: 'u-awa', username: 'awa', displayName: 'Awa', avatar: null },
    context: { conversationId: 'c1', conversationType: 'direct', ...context },
    metadata: {},
    state: { isRead: false, createdAt: '2026-10-01T08:00:00.000Z' },
  });
  if (record === null) throw new Error('notification illisible');
  return record;
};

const render = (record: NotificationRecord) => renderToStaticMarkup(<NotificationBanner notification={record} onDismiss={noop} />);

const place = { latitude: 48.8584, longitude: 2.2945, name: 'Tour Eiffel', address: 'Champ de Mars' };

describe('la bannière in-app montre le détail par type', () => {
  test('une position : le corps servi, « Ouvrir la carte » vers Plans, et « Répondre »', () => {
    const html = render(served({ contentDetail: { location: place } }, '📍 Tour Eiffel · Champ de Mars'));
    expect(html).toContain('📍 Tour Eiffel · Champ de Mars');
    expect(html).toContain('href="https://maps.apple.com/?ll=48.85840,2.29450&amp;q=Tour%20Eiffel"');
    expect(html).toContain('>Ouvrir la carte<');
    expect(html).toContain('>Répondre<');
  });

  test('une invitation : « Rejoindre » et l’effectif du groupe', () => {
    const html = render(
      served({ contentDetail: { invite: { url: 'https://meeshy.me/chat/abc', conversationTitle: 'Équipe', memberCount: 12 } } }, '✉️ Invitation · Équipe'),
    );
    expect(html).toContain('>Rejoindre<');
    expect(html).toContain('12 membres');
    expect(html).toContain('data-banner-action="join"');
  });

  test('une vidéo : sa vignette occupe la case du contenu', () => {
    const html = render(served({ contentDetail: { videoThumbnailUrl: 'https://gate.meeshy.me/t.jpg' } }, '🎬 Vidéo'));
    expect(html).toContain('src="https://gate.meeshy.me/t.jpg"');
  });

  test('un contact, un lien, un sticker, une réponse à une story : le corps servi, « Répondre » seul', () => {
    const cases = [
      served({ contentDetail: { contact: { name: 'Mamadou' } } }, '👤 Mamadou'),
      served({ contentDetail: { link: { url: 'https://example.com/a', domain: 'example.com' } } }, '🔗 example.com'),
      served({ contentDetail: { sticker: { emoji: '🥳' } } }, '🥳 Sticker'),
      served({ contentDetail: { storyReply: { authorId: 'u-me' } } }, 'Réponse à votre story · Trop beau'),
    ];
    cases.forEach((record) => {
      const html = render(record);
      expect(html).toContain(record.content);
      expect(html).toContain('>Répondre<');
      expect(html).not.toContain('data-banner-action="open-map"');
      expect(html).not.toContain('data-banner-action="join"');
    });
  });

  test('un vocal : un lecteur — lecture et vitesse, la ligne, et ses deux temps', () => {
    const html = render(
      served({ firstAttachmentUrl: 'https://gate.meeshy.me/v.m4a', firstAttachmentMimeType: 'audio/mp4', firstAttachmentDurationMs: 12_000 }, '🎤 Message vocal · 0:12\nOn se voit à 18 h'),
    );
    expect(html).toContain('data-banner-audio');
    expect(html).toContain('aria-label="Écouter"');
    expect(html).toContain('aria-label="Vitesse de lecture"');
    expect(html).toContain('role="slider"');
    expect(html).toContain('>0:00<');
    expect(html).toContain('>0:12<');
  });
});

describe('un message PROTÉGÉ ne montre aucun détail', () => {
  test('sous `notificationLocKey` : ni carte, ni vignette, ni lecteur — « Répondre » reste', () => {
    const html = render(
      served(
        {
          notificationLocKey: 'notification.viewOnce',
          contentDetail: { location: place, videoThumbnailUrl: 'https://gate.meeshy.me/secret.jpg' },
          firstAttachmentUrl: 'https://gate.meeshy.me/secret.m4a',
          firstAttachmentMimeType: 'audio/mp4',
        },
        '👁️ 🎤',
      ),
    );
    expect(html).not.toContain('maps.apple.com');
    expect(html).not.toContain('secret');
    expect(html).not.toContain('data-banner-audio');
    expect(html).toContain('>Répondre<');
  });
});

describe('hors message de conversation, aucune action', () => {
  test('une réaction à un post ne porte ni « Répondre » ni pied d’actions', () => {
    const record = decodeNotification({
      id: 'n2',
      type: 'post_like',
      title: 'Awa a aimé votre publication',
      content: '',
      context: { postId: 'p1' },
      metadata: { postPreview: 'Le lac' },
      state: { isRead: false, createdAt: '2026-10-01T08:00:00.000Z' },
    });
    if (record === null) throw new Error('notification illisible');
    expect(render(record)).not.toContain('data-banner-actions');
  });
});
