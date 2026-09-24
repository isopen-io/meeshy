import { describe, expect, test } from 'bun:test';

import { appNotificationsOffer, appWebPushSubscriber, notificationsOffer, type PushSubscribeOutcome, type WebPushSubscriber } from './notifications-offer';

/**
 * LA CARTE 5 NE S'OUVRE QUE LÀ OÙ SA PROMESSE EST TENABLE (#7729) — « On te
 * prévient quand ça bouge » exige un ABONNEMENT enregistré auprès de la
 * passerelle, pas seulement une permission accordée. Sans abonné, accorder la
 * permission ne ferait arriver aucune notification : un contrôle qui ment.
 */

const subscriber = (outcome: PushSubscribeOutcome = 'subscribed') => {
  let calls = 0;
  const value: WebPushSubscriber = {
    subscribe: async () => {
      calls += 1;
      return outcome;
    },
  };
  return { value, calls: () => calls };
};

describe('notificationsOffer — la promesse avant la question', () => {
  test('sans abonné push, la carte n’est pas proposée, même permission jamais demandée', () => {
    expect(notificationsOffer({ permission: () => 'default', subscriber: null }).askable()).toBe(false);
  });

  test('sans API de notification (la WebView de la coque), rien n’est proposé', () => {
    expect(notificationsOffer({ permission: () => null, subscriber: subscriber().value }).askable()).toBe(false);
  });

  test('une permission déjà répondue ne se redemande pas', () => {
    const { value } = subscriber();
    expect(notificationsOffer({ permission: () => 'granted', subscriber: value }).askable()).toBe(false);
    expect(notificationsOffer({ permission: () => 'denied', subscriber: value }).askable()).toBe(false);
  });

  test('un abonné et une permission jamais demandée : la carte est proposée', () => {
    expect(notificationsOffer({ permission: () => 'default', subscriber: subscriber().value }).askable()).toBe(true);
  });

  test('« Oui » ABONNE l’appareil, il ne se contente pas d’ouvrir la fenêtre', async () => {
    const probe = subscriber();
    await notificationsOffer({ permission: () => 'default', subscriber: probe.value }).ask();
    expect(probe.calls()).toBe(1);
  });

  test('sans abonné, « Oui » ne fait rien et ne jette pas', async () => {
    expect(await notificationsOffer({ permission: () => 'default', subscriber: null }).ask()).toBe('unavailable');
  });

  test('l’issue de l’abonnement remonte telle quelle', async () => {
    const offer = notificationsOffer({ permission: () => 'default', subscriber: subscriber('denied').value });
    expect(await offer.ask()).toBe('denied');
  });

  test('l’application n’a pas encore d’abonné (#7306) : la carte 5 n’est proposée nulle part', () => {
    expect(appWebPushSubscriber).toBeNull();
    expect(appNotificationsOffer.askable()).toBe(false);
  });
});
