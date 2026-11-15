import { describe, expect, test } from 'bun:test';

import { loadInterfaceCatalog } from '@/lib/i18n-catalog';
import { loadNotificationRowCatalog } from '@/lib/i18n-notification-row-catalog';

import { categoryAccepts, notificationAccent, notificationFamily } from './categories';
import { decodeNotification, type NotificationRecord } from './record';
import { notificationRowPresentation } from './row-presentation';
import { notificationTarget, pushTapTarget } from './target';

await Promise.all([loadNotificationRowCatalog('fr'), loadInterfaceCatalog('fr')]);

/**
 * #11150 — « VOTRE CONTENU A ÉTÉ RETIRÉ » : la notification `content_removed`
 * que la passerelle compose (titre et corps dans la langue du destinataire),
 * avec son MOTIF. La cloche la range sous « Système », la teinte de l'alerte,
 * la marque d'un médaillon (aucun acteur : le modérateur n'est jamais nommé)
 * et dit le motif — sans le répéter quand le corps le porte déjà.
 */
const NOW = new Date('2026-10-20T10:00:00.000Z');

const raw = (data: Record<string, unknown>, content = 'Votre message dans « Les Amis » a été retiré par un administrateur.') => ({
  id: 'n-removed',
  type: 'content_removed',
  title: 'Contenu retiré',
  content,
  context: { conversationId: 'c1', conversationTitle: 'Les Amis', conversationType: 'group' },
  metadata: data,
  state: { isRead: false, createdAt: '2026-10-20T09:00:00.000Z' },
});

const decoded = (value: unknown): NotificationRecord => {
  const record = decodeNotification(value);
  if (record === null) throw new Error('notification illisible');
  return record;
};

describe('la notification de retrait', () => {
  test('le motif est décodé — de `metadata`, ou à défaut de `context`', () => {
    expect(decoded(raw({ contentType: 'message', contentId: 'm1', reason: 'Spam répété' })).metadata.reason).toBe('Spam répété');
    const viaContext = { ...raw({}), context: { conversationId: 'c1', reason: 'Spam répété' } };
    expect(decoded(viaContext).metadata.reason).toBe('Spam répété');
  });

  test('la ligne : le titre et le corps servis, le motif en citation, un médaillon à la place d’un avatar', () => {
    const row = notificationRowPresentation(decoded(raw({ contentType: 'message', reason: 'Spam répété' })), { language: 'fr', now: NOW });
    expect(row.leading).toEqual({ kind: 'removed' });
    expect(row.title).toBe('Contenu retiré');
    expect(row.body).toBe('Votre message dans « Les Amis » a été retiré par un administrateur.');
    expect(row.quote).toBe('Motif : Spam répété');
  });

  test('un corps qui porte déjà le motif ne le répète pas', () => {
    const row = notificationRowPresentation(decoded(raw({ reason: 'Spam répété' }, 'Votre message a été retiré — Motif : Spam répété')), { language: 'fr', now: NOW });
    expect(row.quote).toBeNull();
  });

  test('rangée sous « Système », teintée comme une alerte, jamais consommée par la lecture', () => {
    expect(notificationFamily('content_removed')).toBe('system');
    expect(notificationAccent('content_removed')).toBe('var(--ios-error-strong)');
    expect(categoryAccepts('all', { type: 'content_removed', state: { isRead: true } })).toBe(true);
    expect(categoryAccepts('system', { type: 'content_removed', state: { isRead: false } })).toBe(true);
  });

  test('le toucher : un message retiré ouvre sa conversation, un commentaire retiré la publication qui le portait', () => {
    expect(notificationTarget(decoded(raw({ contentType: 'message', reason: 'x' })))).toEqual({ route: 'thread', params: { conversation: 'c1' } });
    const comment = { ...raw({ contentType: 'comment', reason: 'x' }), context: { postId: 'p1' } };
    expect(notificationTarget(decoded(comment))).toEqual({ route: 'post', params: { post: 'p1' } });
  });

  test('le push (contentType recopié en `postType`) : un commentaire retiré ouvre la publication, un message sa conversation', () => {
    expect(pushTapTarget({ type: 'content_removed', postId: 'p1', postType: 'comment' })).toEqual({ route: 'post', params: { post: 'p1' } });
    expect(pushTapTarget({ type: 'content_removed', conversationId: 'c1', postType: 'message' })).toEqual({ route: 'thread', params: { conversation: 'c1' } });
  });

  test('une publication, un réel ou une story retirés n’ouvrent rien — ils n’existent plus ; le push atterrit sur la cloche', () => {
    for (const contentType of ['post', 'reel', 'story']) {
      const removed = { ...raw({ contentType, reason: 'x' }), context: { postId: 'p1' } };
      expect({ contentType, target: notificationTarget(decoded(removed)) }).toEqual({ contentType, target: null });
      expect(pushTapTarget({ type: 'content_removed', postId: 'p1', contentType })).toEqual({ route: 'notifications' });
      expect(pushTapTarget({ type: 'content_removed', postId: 'p1', postType: contentType })).toEqual({ route: 'notifications' });
    }
  });
});
