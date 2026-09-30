import { describe, expect, test } from 'bun:test';

import { inAppBannerStore, offerInAppBanner, shouldShowBanner } from './in-app-banner';
import { bannerPresentation, bannerSwipeOutcome } from './in-app-banner-view';
import type { NotificationRecord } from './record';

/**
 * LA BANNIÈRE IN-APP (#8727, jumelle de `NotificationToastView` iOS, #8723) —
 * quand l'application est ouverte, une notification réseau descend du haut.
 * Elle ne dit son aperçu qu'UNE fois (« 🎵 Audio • 🎵 Audio · 0:32 » était le
 * défaut de la capture porteur), se tait sur la conversation déjà ouverte et
 * laisse les appels à la couche d'appel.
 */

const NOW = new Date('2026-09-30T10:00:00.000Z');

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

describe('quand la bannière descend', () => {
  test('partout, sauf sur le fil de SA conversation', () => {
    expect(shouldShowBanner(record({}), { pathname: '/c' })).toBe(true);
    expect(shouldShowBanner(record({}), { pathname: '/c/c2' })).toBe(true);
    expect(shouldShowBanner(record({}), { pathname: '/c/c1' })).toBe(false);
  });

  test('jamais pour un appel — la couche d’appel le présente elle-même', () => {
    expect(shouldShowBanner(record({ type: 'incoming_call' }), { pathname: '/c' })).toBe(false);
    expect(shouldShowBanner(record({ type: 'call_ended' }), { pathname: '/c' })).toBe(false);
    expect(shouldShowBanner(record({ type: 'missed_call' }), { pathname: '/c' })).toBe(true);
  });

  test('jamais pour une notification déjà lue', () => {
    expect(shouldShowBanner(record({ state: { isRead: true, createdAt: '2026-09-30T09:59:58.000Z' } }), { pathname: '/c' })).toBe(false);
  });
});

describe('ce que la bannière dit — UNE fois', () => {
  test('un vocal : le libellé composé par le serveur paraît une seule fois', () => {
    const banner = bannerPresentation(record({}), { language: 'fr', now: NOW });
    expect(banner.headline).toBe('Grace');
    expect(banner.body).toBe('🎵 Audio · 0:32 · 193 Ko');
  });

  test('une réaction à un post dit le POST, faute de corps', () => {
    const banner = bannerPresentation(
      record({ type: 'post_like', title: 'Awa a aimé votre publication', content: '', metadata: { postPreview: 'Le lac au matin' }, context: { postId: 'p1' } }),
      { language: 'fr', now: NOW },
    );
    expect(banner.body).toBe('Le lac au matin');
    expect(banner.content).toBe('post');
  });

  test('un badge se nomme', () => {
    const banner = bannerPresentation(
      record({ type: 'badge_earned', title: 'Badge débloqué', content: '', actor: null, context: {}, metadata: { axisKey: 'content.story', threshold: 10 } }),
      { language: 'fr', now: NOW },
    );
    expect(banner.headline).toBe('Stories');
    expect(banner.body).toBe('Badge débloqué · palier 10');
  });
});

describe('le geste', () => {
  test('vers le HAUT ferme ; en deçà, rien', () => {
    expect(bannerSwipeOutcome(-40)).toBe('dismiss');
    expect(bannerSwipeOutcome(-10)).toBe('none');
    expect(bannerSwipeOutcome(60)).toBe('none');
  });
});

describe('le magasin', () => {
  test('une nouvelle bannière REMPLACE la précédente ; une notification refusée ne pose rien', () => {
    inAppBannerStore.setState({ current: null });
    offerInAppBanner(record({ id: 'a' }), { pathname: '/c' });
    offerInAppBanner(record({ id: 'b' }), { pathname: '/c' });
    offerInAppBanner(record({ id: 'c' }), { pathname: '/c/c1' });
    expect(inAppBannerStore.getState().current?.id).toBe('b');
    inAppBannerStore.getState().dismiss();
    expect(inAppBannerStore.getState().current).toBeNull();
  });
});
