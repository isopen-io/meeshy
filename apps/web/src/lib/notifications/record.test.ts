import { describe, expect, test } from 'bun:test';

import { decodeNotification, decodeNotifications, notificationTitle } from './record';

/**
 * LE DÉCODAGE D'UNE NOTIFICATION SERVIE (#6288) — FAIL-CLOSED, CHAMP PAR CHAMP.
 *
 * `NotificationFormatter.formatNotification`
 * (`services/gateway/src/services/notifications/NotificationFormatter.ts`) sert
 * `title: null`, `actor: undefined`, `context: {}` et des dates en CHAÎNES. Une
 * ligne sans identité, sans type ou sans date est REJETÉE, jamais une exception
 * qui viderait toute la cloche ; un champ optionnel illisible est RETIRÉ, jamais
 * recopié tel quel.
 */

const servie = (partial: Record<string, unknown> = {}): Record<string, unknown> => ({
  id: 'n1',
  userId: 'u-viewer',
  type: 'new_message',
  priority: 'normal',
  title: 'Amina Diallo vous a écrit',
  subtitle: null,
  content: 'On se voit à 18 h ?',
  actor: { id: 'u-amina', username: 'amina', displayName: 'Amina Diallo', avatar: null },
  context: { conversationId: 'c-deploiement', conversationTitle: 'Équipe déploiement', conversationType: 'group' },
  metadata: {},
  state: { isRead: false, readAt: null, createdAt: '2026-09-13T08:00:00.000Z' },
  delivery: { emailSent: false, pushSent: true },
  ...partial,
});

describe('decodeNotification — ce que la passerelle sert', () => {
  test('une ligne complète est rendue sous la forme que la cloche lit', () => {
    expect(decodeNotification(servie())).toEqual({
      id: 'n1',
      type: 'new_message',
      title: 'Amina Diallo vous a écrit',
      content: 'On se voit à 18 h ?',
      actor: { id: 'u-amina', username: 'amina', displayName: 'Amina Diallo', avatar: null },
      context: { conversationId: 'c-deploiement', conversationTitle: 'Équipe déploiement', conversationType: 'group' },
      metadata: {},
      state: { isRead: false, createdAt: '2026-09-13T08:00:00.000Z' },
    });
  });

  test('les champs NULS servis par le formateur ne cassent rien', () => {
    const decoded = decodeNotification(servie({ title: null, actor: null, context: null, metadata: null, content: null }));
    expect(decoded?.title).toBeNull();
    expect(decoded?.actor).toBeNull();
    expect(decoded?.context).toEqual({});
    expect(decoded?.metadata).toEqual({});
    expect(decoded?.content).toBe('');
  });

  test('un titre BLANC vaut une absence de titre', () => {
    expect(decodeNotification(servie({ title: '   ' }))?.title).toBeNull();
  });

  test('sans id, sans type ou sans date, la ligne est rejetée', () => {
    expect(decodeNotification(servie({ id: undefined }))).toBeNull();
    expect(decodeNotification(servie({ type: 42 }))).toBeNull();
    expect(decodeNotification(servie({ state: { isRead: false, createdAt: null } }))).toBeNull();
    expect(decodeNotification(null)).toBeNull();
    expect(decodeNotification('n1')).toBeNull();
  });

  test('un acteur sans identité est retiré, pas recopié', () => {
    expect(decodeNotification(servie({ actor: { displayName: 'Anonyme' } }))?.actor).toBeNull();
  });

  test('un contexte ne garde que ses champs LISIBLES', () => {
    const decoded = decodeNotification(
      servie({ context: { conversationId: 'c1', postId: 7, conversationType: 'inconnu', commentId: 'k1' } }),
    );
    expect(decoded?.context).toEqual({ conversationId: 'c1', commentId: 'k1' });
  });

  test('la vignette et le discriminant d’entité sociale sont lus depuis `metadata`', () => {
    const decoded = decodeNotification(
      servie({ type: 'post_comment', metadata: { postType: 'STORY', postThumbnailUrl: 'https://cdn/x.jpg', emoji: '❤️' } }),
    );
    expect(decoded?.metadata).toEqual({ postType: 'STORY', postThumbnailUrl: 'https://cdn/x.jpg' });
  });

  test('une date servie comme `Date` (socket non sérialisé) est rendue en chaîne ISO', () => {
    const decoded = decodeNotification(servie({ state: { isRead: true, createdAt: new Date('2026-09-13T08:00:00.000Z') } }));
    expect(decoded?.state).toEqual({ isRead: true, createdAt: '2026-09-13T08:00:00.000Z' });
  });
});

describe('decodeNotifications — une ligne illisible ne vide pas la cloche', () => {
  test('les lignes valides passent, les autres tombent', () => {
    const decoded = decodeNotifications([servie({ id: 'a' }), { id: 'b' }, servie({ id: 'c' })]);
    expect(decoded.map((n) => n.id)).toEqual(['a', 'c']);
  });

  test('autre chose qu’un tableau rend une liste vide', () => {
    expect(decodeNotifications(undefined)).toEqual([]);
  });
});

describe('notificationTitle — le titre servi d’abord, jamais un titre inventé', () => {
  test('le titre persisté par la passerelle est rendu tel quel', () => {
    const n = decodeNotification(servie());
    expect(n === null ? null : notificationTitle(n)).toBe('Amina Diallo vous a écrit');
  });

  test('sans titre, le NOM de l’acteur — sans titre ni acteur, « Meeshy »', () => {
    const avecActeur = decodeNotification(servie({ title: null }));
    const sansRien = decodeNotification(servie({ title: null, actor: null }));
    expect(avecActeur === null ? null : notificationTitle(avecActeur)).toBe('Amina Diallo');
    expect(sansRien === null ? null : notificationTitle(sansRien)).toBe('Meeshy');
  });

  test('un acteur sans nom affiché se nomme par son identifiant', () => {
    const n = decodeNotification(servie({ title: null, actor: { id: 'u1', username: 'kwame', displayName: null } }));
    expect(n === null ? null : notificationTitle(n)).toBe('kwame');
  });
});
