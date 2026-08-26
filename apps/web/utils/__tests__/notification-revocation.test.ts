/**
 * La révocation d'une bannière déjà LIVRÉE.
 *
 * Quand le serveur retire une notification (réaction défaite, message ou post
 * supprimé), il pousse un signal de contrôle `notification_revoked` — et le
 * socket émet `notification:deleted`. Dans les deux cas, la bannière que le
 * Service Worker a déjà affichée doit se fermer. Ce module est la règle PURE
 * « quelles bannières fermer », partagée par la page (socket, FCM au premier
 * plan) et recopiée à l'identique dans les deux Service Workers, qui ne
 * savent pas l'importer.
 */
import {
  closeRevokedNotifications,
  parseNotificationRevocation,
  revocationOfDeletedNotification,
  selectRevokedNotifications,
} from '../notification-revocation';

const N1 = '64d000000000000000000001';
const N2 = '64d000000000000000000002';
const N3 = '64d000000000000000000003';
const CONV_A = '507f1f77bcf86cd799439021';
const CONV_B = '507f1f77bcf86cd799439022';

const banner = (data: Record<string, string>) => ({ data, close: jest.fn() });

describe('parseNotificationRevocation — la charge du push de contrôle', () => {
  it('lit les ids joints par virgule', () => {
    expect(parseNotificationRevocation({ type: 'notification_revoked', notificationIds: `${N1},${N2}` })).toEqual({
      notificationIds: [N1, N2],
      conversationIds: [],
    });
  });

  it('aligne conversationIds sur notificationIds, en gardant les vides', () => {
    expect(
      parseNotificationRevocation({
        type: 'notification_revoked',
        notificationIds: `${N1},${N2},${N3}`,
        conversationIds: `,${CONV_A},`,
      })
    ).toEqual({ notificationIds: [N1, N2, N3], conversationIds: ['', CONV_A, ''] });
  });

  it('rend null pour tout autre type de charge, ou sans ids', () => {
    expect(parseNotificationRevocation({ type: 'new_message', notificationId: N1 })).toBeNull();
    expect(parseNotificationRevocation({ type: 'notification_revoked', notificationIds: '' })).toBeNull();
    expect(parseNotificationRevocation(undefined)).toBeNull();
    expect(parseNotificationRevocation(null)).toBeNull();
  });
});

describe('selectRevokedNotifications — quelles bannières fermer', () => {
  it('ferme la bannière dont data.notificationId est révoqué, et laisse les autres', () => {
    const revoked = banner({ notificationId: N1, conversationId: CONV_A });
    const kept = banner({ notificationId: N2, conversationId: CONV_A });

    const selected = selectRevokedNotifications([revoked, kept], {
      notificationIds: [N1],
      conversationIds: [CONV_A],
    });

    expect(selected).toEqual([revoked]);
  });

  /**
   * Une bannière SANS identité de notification (agrégée par conversation, ou
   * affichée par un chemin qui ne porte pas `notificationId`) ne peut être
   * désignée que par sa conversation. Une bannière QUI a une identité, elle,
   * n'est jamais fermée pour sa seule conversation : elle annonce peut-être un
   * autre message, encore valide.
   */
  it('ferme par conversation SEULEMENT la bannière qui n’a pas d’identité de notification', () => {
    const aggregated = banner({ conversationId: CONV_A });
    const identified = banner({ notificationId: N2, conversationId: CONV_A });
    const otherConversation = banner({ conversationId: CONV_B });

    const selected = selectRevokedNotifications([aggregated, identified, otherConversation], {
      notificationIds: [N1],
      conversationIds: [CONV_A],
    });

    expect(selected).toEqual([aggregated]);
  });

  it('ignore une bannière sans data', () => {
    const selected = selectRevokedNotifications([{ data: undefined }, { data: null }], {
      notificationIds: [N1],
      conversationIds: [CONV_A],
    });

    expect(selected).toEqual([]);
  });

  it('ne ferme rien pour une révocation qui ne vise aucune bannière affichée', () => {
    const selected = selectRevokedNotifications([banner({ notificationId: N2 })], {
      notificationIds: [N1],
      conversationIds: [],
    });

    expect(selected).toEqual([]);
  });
});

describe('revocationOfDeletedNotification — le socket ne nomme qu’un id', () => {
  it('révoque exactement cet id, sans conversation', () => {
    expect(revocationOfDeletedNotification(N1)).toEqual({ notificationIds: [N1], conversationIds: [] });
  });
});

describe('closeRevokedNotifications — sur toutes les registrations', () => {
  /**
   * Deux Service Workers coexistent (`/sw.js` à la racine, celui de Firebase
   * sous son propre scope), et l'un ou l'autre a pu afficher la bannière :
   * `navigator.serviceWorker.ready` n'en verrait qu'un. Toutes les
   * registrations sont parcourues.
   */
  it('ferme les bannières révoquées de chaque registration et rend leur nombre', async () => {
    const revokedOnRoot = banner({ notificationId: N1 });
    const keptOnRoot = banner({ notificationId: N2 });
    const revokedOnFirebase = banner({ notificationId: N1 });
    const registrations = [
      { getNotifications: jest.fn().mockResolvedValue([revokedOnRoot, keptOnRoot]) },
      { getNotifications: jest.fn().mockResolvedValue([revokedOnFirebase]) },
    ];

    const closed = await closeRevokedNotifications(registrations, { notificationIds: [N1], conversationIds: [] });

    expect(closed).toBe(2);
    expect(revokedOnRoot.close).toHaveBeenCalledTimes(1);
    expect(revokedOnFirebase.close).toHaveBeenCalledTimes(1);
    expect(keptOnRoot.close).not.toHaveBeenCalled();
  });

  it('une registration qui échoue n’empêche pas les autres', async () => {
    const revoked = banner({ notificationId: N1 });
    const registrations = [
      { getNotifications: jest.fn().mockRejectedValue(new Error('gone')) },
      { getNotifications: jest.fn().mockResolvedValue([revoked]) },
    ];

    const closed = await closeRevokedNotifications(registrations, { notificationIds: [N1], conversationIds: [] });

    expect(closed).toBe(1);
    expect(revoked.close).toHaveBeenCalledTimes(1);
  });
});
