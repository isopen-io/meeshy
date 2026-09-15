import { describe, expect, test } from 'bun:test';

import type { NotificationRecord } from './record';
import { notificationTarget } from './target';

/**
 * OÙ MÈNE UNE NOTIFICATION (#6288) — miroir de `NotificationContentRouter`
 * (`apps/ios/Meeshy/Features/Main/Navigation/NotificationContentRouter.swift`).
 *
 * La règle d'iOS tient en une phrase, et c'est elle que ces témoins gardent :
 * **le TYPE n'est pas un discriminant d'entité.** `story_thread_reply` est émis
 * pour un commentaire sur N'IMPORTE quel contenu — seul `metadata.postType`
 * (ou `contentType`) dit la vérité. Router sur le type seul ouvrait le lecteur
 * de story sur un réel commenté.
 *
 * Une destination que le web n'a pas encore rend `null` — la ligne se marque
 * lue sans prétendre ouvrir quoi que ce soit (loi 4).
 */

const record = (partial: Partial<NotificationRecord>): NotificationRecord => ({
  id: 'n1',
  type: 'new_message',
  title: null,
  content: '',
  actor: null,
  context: {},
  metadata: {},
  state: { isRead: false, createdAt: '2026-09-13T08:00:00.000Z' },
  ...partial,
});

describe('les contenus sociaux ouvrent l’entité que la métadonnée NOMME', () => {
  test('un commentaire de publication ouvre le détail de la publication', () => {
    expect(notificationTarget(record({ type: 'post_comment', context: { postId: 'p1' }, metadata: { postType: 'POST' } }))).toEqual({
      route: 'post',
      params: { post: 'p1' },
    });
  });

  test('`story_thread_reply` sur un RÉEL ouvre la publication, pas le lecteur de story', () => {
    expect(
      notificationTarget(record({ type: 'story_thread_reply', context: { postId: 'r1' }, metadata: { postType: 'REEL' } })),
    ).toEqual({ route: 'post', params: { post: 'r1' } });
  });

  test('une story, un statut ou une humeur ouvrent le lecteur plein écran', () => {
    for (const postType of ['STORY', 'STATUS', 'MOOD']) {
      expect(notificationTarget(record({ type: 'post_like', context: { postId: 's1' }, metadata: { postType } }))).toEqual({
        route: 'story',
        params: { post: 's1' },
      });
    }
  });

  test('la famille `friend_new_*` se discrimine par `contentType`', () => {
    expect(
      notificationTarget(record({ type: 'friend_new_post', context: { postId: 's2' }, metadata: { contentType: 'STORY' } })),
    ).toEqual({ route: 'story', params: { post: 's2' } });
  });

  test('sans discriminant, un type éphémère PAR CONSTRUCTION ouvre la story, tout autre la publication', () => {
    expect(notificationTarget(record({ type: 'story_reaction', context: { postId: 's3' } }))).toEqual({
      route: 'story',
      params: { post: 's3' },
    });
    expect(notificationTarget(record({ type: 'post_like', context: { postId: 'p4' } }))).toEqual({
      route: 'post',
      params: { post: 'p4' },
    });
  });
});

describe('les autres familles', () => {
  test('un message, une mention ou une réaction à un message ouvrent la conversation', () => {
    for (const type of ['new_message', 'user_mentioned', 'message_reaction', 'member_joined']) {
      expect(notificationTarget(record({ type, context: { conversationId: 'c-deploiement' } }))).toEqual({
        route: 'thread',
        params: { conversation: 'c-deploiement' },
      });
    }
  });

  test('un badge, une série ou un niveau ouvrent la progression', () => {
    for (const type of ['achievement_unlocked', 'badge_earned', 'streak_milestone', 'level_up']) {
      expect(notificationTarget(record({ type }))).toEqual({ route: 'progression' });
    }
  });

  test('une alerte de sécurité ouvre les réglages', () => {
    expect(notificationTarget(record({ type: 'login_new_device' }))).toEqual({ route: 'settings' });
  });

  test('une demande de contact ne mène NULLE PART tant que le web n’a pas d’écran de contacts', () => {
    expect(notificationTarget(record({ type: 'friend_request', context: { friendRequestId: 'fr1' } }))).toBeNull();
  });
});
