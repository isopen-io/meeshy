/**
 * Décodage du payload `notification:new`.
 *
 * Le payload sur le fil est celui que `NotificationService.formatNotification()`
 * construit côté gateway : structure GROUPÉE (`state.isRead`, `state.readAt`,
 * `state.createdAt`, `state.expiresAt`), enrichie de `title`/`subtitle` calculés
 * serveur dans la langue résolue du destinataire.
 *
 * Les fixtures ci-dessous reproduisent CE payload — pas une forme inventée.
 */

import { decodeNotificationSocketPayload } from '@/utils/notification-socket-payload';

/** Payload tel que la gateway l'émet (`{...formatNotification(raw), title, subtitle}`). */
const makeSocketPayload = (overrides: Record<string, unknown> = {}) => ({
  id: 'notif-1',
  userId: 'user-1',
  type: 'new_message',
  priority: 'normal',
  title: 'Alice',
  subtitle: 'Équipe produit',
  content: 'Salut !',
  actor: { id: 'actor-1', username: 'alice' },
  context: { conversationId: 'conv-1' },
  metadata: {},
  state: {
    isRead: false,
    readAt: null,
    createdAt: '2026-01-01T10:00:00.000Z',
    expiresAt: null,
  },
  delivery: { emailSent: false, pushSent: false },
  ...overrides,
});

describe('decodeNotificationSocketPayload', () => {
  it('conserve le title serveur — source unique, déjà localisé', () => {
    const decoded = decodeNotificationSocketPayload(makeSocketPayload());

    expect(decoded?.title).toBe('Alice');
  });

  it('conserve le subtitle serveur — la ligne de contexte des notifications sociales en dépend', () => {
    const decoded = decodeNotificationSocketPayload(makeSocketPayload());

    expect(decoded?.subtitle).toBe('Équipe produit');
  });

  it('lit createdAt sous state — jamais l’horloge de l’appareil', () => {
    const decoded = decodeNotificationSocketPayload(makeSocketPayload());

    expect(decoded?.state.createdAt).toEqual(new Date('2026-01-01T10:00:00.000Z'));
  });

  it('lit isRead / readAt / expiresAt sous state', () => {
    const readAt = '2026-01-01T11:00:00.000Z';
    const expiresAt = '2026-01-02T10:00:00.000Z';
    const decoded = decodeNotificationSocketPayload(
      makeSocketPayload({ state: { isRead: true, readAt, createdAt: '2026-01-01T10:00:00.000Z', expiresAt } })
    );

    expect(decoded?.state.isRead).toBe(true);
    expect(decoded?.state.readAt).toEqual(new Date(readAt));
    expect(decoded?.state.expiresAt).toEqual(new Date(expiresAt));
  });

  it('IGNORE les champs d’état à la racine — la forme plate n’est plus émise par personne', () => {
    const decoded = decodeNotificationSocketPayload(
      makeSocketPayload({
        isRead: true,
        readAt: '2020-01-01T00:00:00.000Z',
        createdAt: '2020-01-01T00:00:00.000Z',
        expiresAt: '2020-01-02T00:00:00.000Z',
      })
    );

    expect(decoded?.state.isRead).toBe(false);
    expect(decoded?.state.readAt).toBeNull();
    expect(decoded?.state.createdAt).toEqual(new Date('2026-01-01T10:00:00.000Z'));
    expect(decoded?.state.expiresAt).toBeUndefined();
  });

  it('retombe sur l’heure de réception quand state.createdAt manque — dernier recours, pas cas nominal', () => {
    const before = new Date();
    const decoded = decodeNotificationSocketPayload(
      makeSocketPayload({ state: { isRead: false, readAt: null, createdAt: undefined, expiresAt: null } })
    );
    const after = new Date();

    expect(decoded?.state.createdAt.getTime()).toBeGreaterThanOrEqual(before.getTime());
    expect(decoded?.state.createdAt.getTime()).toBeLessThanOrEqual(after.getTime());
  });

  it('tolère un state absent sans jeter', () => {
    const decoded = decodeNotificationSocketPayload(makeSocketPayload({ state: undefined }));

    expect(decoded?.state.isRead).toBe(false);
    expect(decoded?.state.readAt).toBeNull();
  });

  it('remplit context / metadata / delivery par défaut quand ils manquent', () => {
    const decoded = decodeNotificationSocketPayload(
      makeSocketPayload({ context: undefined, metadata: undefined, delivery: undefined })
    );

    expect(decoded?.context).toEqual({});
    expect(decoded?.metadata).toEqual({});
    expect(decoded?.delivery).toEqual({ emailSent: false, pushSent: false });
  });

  it('préserve les clés de contexte que le serveur envoie — aucune reconstruction sélective', () => {
    const context = {
      conversationId: 'conv-1',
      callSessionId: 'call-1',
      postId: 'post-1',
      commentId: 'comment-1',
      parentCommentId: 'comment-0',
      postExpiresAt: '2026-01-02T10:00:00.000Z',
      firstAttachmentUrl: 'https://cdn.example/a.jpg',
    };
    const decoded = decodeNotificationSocketPayload(makeSocketPayload({ context }));

    expect(decoded?.context).toEqual(context);
  });

  it('rend null quand le payload n’a pas d’identité exploitable', () => {
    expect(decodeNotificationSocketPayload(makeSocketPayload({ id: undefined }))).toBeNull();
    expect(decodeNotificationSocketPayload(null)).toBeNull();
    expect(decodeNotificationSocketPayload('nope')).toBeNull();
  });

  it('normalise priority absente en normal', () => {
    const decoded = decodeNotificationSocketPayload(makeSocketPayload({ priority: undefined }));

    expect(decoded?.priority).toBe('normal');
  });

  it('rend title / subtitle null quand le serveur ne les a pas construits', () => {
    const decoded = decodeNotificationSocketPayload(
      makeSocketPayload({ title: null, subtitle: null })
    );

    expect(decoded?.title).toBeNull();
    expect(decoded?.subtitle).toBeNull();
  });
});
