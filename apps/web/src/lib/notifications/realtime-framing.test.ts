import { describe, expect, test } from 'bun:test';

import { decodeRealtimeNotification } from './record';
import { bannerPresentation } from './in-app-banner-view';
import { notificationRowPresentation } from './row-presentation';
import { loadNotificationRowCatalog } from '@/lib/i18n-notification-row-catalog';

await loadNotificationRowCatalog('fr');

/**
 * UNE NOTIFICATION DIT CE QUI S'EST PASSÉ ET OÙ (#9992) — `notification:new`
 * porte le cadrage TOAST de `buildPushHeader` : `title` = l'acteur seul,
 * `subtitle` = la phrase d'action (social, relation) ou le nom du groupe
 * (message). La cloche REST porte la phrase entière en `title`. Relu comme
 * une ligne REST, le temps réel disait « Awa » sans dire ce qu'Awa avait fait,
 * et un message ne disait ni son groupe ni qu'il était privé.
 */

const NOW = new Date('2026-10-10T10:00:00.000Z');
const OPTIONS = { language: 'fr', now: NOW } as const;

const toast = (partial: Record<string, unknown>): Record<string, unknown> => ({
  id: 'n1',
  type: 'story_reaction',
  title: 'Awa Diop',
  subtitle: 'a réagi 🔥 à votre story',
  content: 'Coucher de soleil',
  actor: { id: 'u-awa', username: 'awa', displayName: 'Awa Diop', avatar: null },
  context: { postId: 'p1' },
  metadata: { postType: 'STORY', postPreview: 'Coucher de soleil' },
  state: { isRead: false, createdAt: '2026-10-10T09:59:58.000Z' },
  ...partial,
});

const decoded = (partial: Record<string, unknown>) => {
  const notification = decodeRealtimeNotification(toast(partial));
  if (notification === null) throw new Error('décodage refusé');
  return notification;
};

describe('le cadrage temps réel recompose la phrase d’action', () => {
  test('une réaction de story : « Awa Diop a réagi 🔥 à votre story », comme la cloche REST', () => {
    const notification = decoded({});
    expect(notification.title).toBe('Awa Diop a réagi 🔥 à votre story');
    expect(notification.subtitle).toBeUndefined();
    expect(bannerPresentation(notification, OPTIONS).headline).toBe('Awa Diop a réagi 🔥 à votre story');
    expect(notificationRowPresentation(notification, OPTIONS).title).toBe('Awa Diop a réagi 🔥 à votre story');
  });

  test('réel, post, humeur, commentaire, demande d’ami : la même recomposition', () => {
    const cases: readonly (readonly [string, string, string])[] = [
      ['post_like', 'REEL', 'a réagi ❤️ à votre réel'],
      ['post_comment', 'POST', 'a commenté votre publication'],
      ['status_reaction', 'MOOD', 'a réagi 😂 à votre humeur'],
      ['friend_new_story', 'STORY', 'a publié une nouvelle story'],
      ['friend_request', '', 'veut se connecter'],
    ];
    cases.forEach(([type, postType, action]) => {
      expect(decoded({ type, subtitle: action, metadata: postType === '' ? {} : { postType } }).title).toBe(`Awa Diop ${action}`);
    });
  });

  test('un titre qui porte DÉJÀ l’action ne la reçoit pas une seconde fois', () => {
    expect(decoded({ title: 'Awa Diop a réagi 🔥 à votre story' }).title).toBe('Awa Diop a réagi 🔥 à votre story');
  });

  test('un titre propre au serveur (pas l’acteur) garde son sous-titre tel quel', () => {
    const notification = decoded({ type: 'system', title: 'Maintenance ce soir', subtitle: 'De 22 h à 23 h', actor: null });
    expect(notification.title).toBe('Maintenance ce soir');
    expect(notification.subtitle).toBe('De 22 h à 23 h');
  });

  test('un message : le sous-titre (le groupe) ne se colle pas au nom — le contexte le porte', () => {
    const notification = decoded({
      type: 'new_message',
      subtitle: 'Les amateurs',
      content: 'On se voit à 18 h ?',
      context: { conversationId: 'c1', conversationTitle: 'Les amateurs', conversationType: 'group' },
      metadata: {},
    });
    expect(notification.title).toBe('Awa Diop');
    expect(notification.subtitle).toBeUndefined();
  });
});

describe('un message dit OÙ il a été écrit', () => {
  const message = (type: string, context: Record<string, unknown>, content = 'On se voit à 18 h ?') =>
    decoded({ type, subtitle: undefined, content, context: { conversationId: 'c1', ...context }, metadata: {} });

  test('message de groupe : la bannière dit le groupe, en plus du corps', () => {
    const banner = bannerPresentation(message('new_message', { conversationTitle: 'Les amateurs', conversationType: 'group' }), OPTIONS);
    expect(banner.headline).toBe('Awa Diop');
    expect(banner.body).toBe('On se voit à 18 h ?');
    expect(banner.context).toEqual({ scope: 'group', text: 'Les amateurs' });
  });

  test('message privé : la bannière ET la ligne le disent', () => {
    const notification = message('new_message', { conversationTitle: 'Awa Diop', conversationType: 'direct' });
    expect(bannerPresentation(notification, OPTIONS).context).toEqual({ scope: 'direct', text: 'Message privé' });
    expect(notificationRowPresentation(notification, OPTIONS).footer).toEqual({ kind: 'conversation', scope: 'direct', text: 'Message privé' });
  });

  test('réponse, mention et réaction à un message disent aussi leur conversation', () => {
    (['message_reply', 'user_mentioned', 'message_reaction'] as const).forEach((type) => {
      expect(bannerPresentation(message(type, { conversationTitle: 'Les amateurs', conversationType: 'group' }, 'a réagi ❤️ à votre message'), OPTIONS).context).toEqual({
        scope: 'group',
        text: 'Les amateurs',
      });
      expect(bannerPresentation(message(type, { conversationType: 'direct' }, 'a réagi ❤️ à votre message'), OPTIONS).context).toEqual({ scope: 'direct', text: 'Message privé' });
    });
  });

  test('une notification sans conversation n’a pas de ligne de contexte', () => {
    expect(bannerPresentation(decoded({}), OPTIONS).context).toBeNull();
  });
});
