/**
 * #17081 — **le lot de MENTIONS est borné comme l'éventail `regular`**.
 *
 * `notifyMessageRecipients` borne ses créations depuis #10819
 * (`settleWithConcurrency`, 16 en vol) avec la mesure en doc-comment : 370
 * créations lancées ensemble sur Meeshy Global tenaient la file Prisma et la
 * boucle d'événements 10 à 14 s, et TOUTES les routes attendaient derrière.
 *
 * `createMentionNotificationsBatch` était un `Promise.all` NU, jusqu'à
 * `MAX_MENTIONS_PER_MESSAGE = 50`. **La borne avait été posée sur le site qui
 * AVAIT la mesure, pas sur le coût qui la motive** : celui-ci vit dans
 * `createNotification` → `computeConversationUnreadBadge`, « 2 requêtes + une
 * par conversation NON MUETTE du destinataire », que la mention paie à
 * l'identique plus quatre lectures par destinataire.
 *
 * ─── Pourquoi le témoin a besoin de plus de seize mentionnés ─────────────────
 *
 * Un témoin à deux ou trois ne peut PAS tomber : la borne de seize ne mord
 * qu'au-delà, et `Promise.all` comme le réservoir borné rendent le même verdict
 * en dessous. Il en faut cinquante — ce que le plafond par message autorise.
 *
 * @jest-environment node
 */

import { describe, it, expect, jest } from '@jest/globals';

import { NOTIFICATION_FANOUT_CONCURRENCY } from '../../../../services/notifications/notificationFanOutBudget';
import { NotificationService } from '../../../../services/notifications/NotificationService';

const SENDER = 'sender-0001';
const CONV_ID = '507f1f77bcf86cd799439022';
const MSG_ID = '507f1f77bcf86cd799439051';

const mentionedIds = (count: number) =>
  Array.from({ length: count }, (_, index) => `mentionne-${String(index).padStart(4, '0')}`);

const tick = () => new Promise<void>((resolve) => setImmediate(resolve));

/**
 * Le service réel, dont SEULE la création par destinataire est remplacée : le
 * dédoublonnage, le budget de paire et la relecture de la source du Prisme
 * restent ceux de la production — c'est ce qui fait de ce témoin un témoin du
 * LOT, et non de son double.
 */
function trackingService(outcome: (userId: string) => Promise<unknown>) {
  const state = { inFlight: 0, peak: 0, recipients: [] as string[] };
  const service = new (NotificationService as unknown as new (...args: unknown[]) => any)();

  service.loadMessagePrismSource = jest.fn<any>().mockResolvedValue({
    liveness: 'live',
    originalLanguage: 'fr',
    translations: [],
    createdAt: new Date('2026-11-08T10:00:00.000Z'),
    messageType: 'text',
  });

  service.createMentionNotification = jest.fn<any>(async ({ mentionedUserId }: { mentionedUserId: string }) => {
    state.inFlight += 1;
    state.peak = Math.max(state.peak, state.inFlight);
    state.recipients.push(mentionedUserId);
    try {
      await tick();
      return await outcome(mentionedUserId);
    } finally {
      state.inFlight -= 1;
    }
  });

  return { state, service };
}

const commonData = {
  senderId: SENDER,
  messageContent: 'bonjour à vous cinquante',
  conversationId: CONV_ID,
  messageId: MSG_ID,
};

describe('le lot de mentions est borné comme l’éventail regular (#17081)', () => {
  it('la borne est UNE, partagée, et reste dans la fenêtre que la mesure justifie', () => {
    expect(NOTIFICATION_FANOUT_CONCURRENCY).toBeGreaterThanOrEqual(4);
    expect(NOTIFICATION_FANOUT_CONCURRENCY).toBeLessThanOrEqual(32);
  });

  it('50 mentionnés : jamais plus de NOTIFICATION_FANOUT_CONCURRENCY créations en vol, et chacun notifié une fois', async () => {
    const mentioned = mentionedIds(50);
    const { state, service } = trackingService(async (id) => ({ id }));

    const created = await service.createMentionNotificationsBatch(mentioned, commonData, mentioned);

    expect(state.peak).toBe(NOTIFICATION_FANOUT_CONCURRENCY);
    expect([...state.recipients].sort()).toEqual(mentioned);
    expect(created).toBe(50);
  });

  /**
   * `Promise.all` REJETTE au premier échec : un seul destinataire en défaut
   * emportait le lot entier, et avec lui le compte rendu de ceux qui avaient
   * abouti. Le réservoir borné règle les deux ensemble, parce qu'il est
   * `allSettled` par construction — c'est la même propriété que l'éventail
   * `regular` tient depuis #10819, et elle n'est pas un effet de bord : c'est
   * la moitié du lot qui se mesure sans compter les requêtes.
   */
  it('un mentionné qui échoue ne retient ni ses voisins ni le compte des autres', async () => {
    const mentioned = mentionedIds(30);
    const { state, service } = trackingService(async (id) =>
      id === 'mentionne-0007' ? Promise.reject(new Error('push refusé')) : { id },
    );

    const created = await service.createMentionNotificationsBatch(mentioned, commonData, mentioned);

    expect([...state.recipients].sort()).toEqual(mentioned);
    expect(created).toBe(29);
  });

  /**
   * Témoin NÉGATIF, vert des DEUX côtés par construction : sous la borne, un
   * `Promise.all` et le réservoir lancent tout de suite. Son rôle est
   * d'interdire qu'on paie la borne en SÉRIALISANT les petits lots — la mention
   * d'une poignée de personnes doit rester en un seul envol.
   */
  it('trois mentionnés partent ensemble — la borne ne sérialise pas un petit lot', async () => {
    const mentioned = mentionedIds(3);
    const { state, service } = trackingService(async (id) => ({ id }));

    await service.createMentionNotificationsBatch(mentioned, commonData, mentioned);

    expect(state.peak).toBe(3);
  });
});
