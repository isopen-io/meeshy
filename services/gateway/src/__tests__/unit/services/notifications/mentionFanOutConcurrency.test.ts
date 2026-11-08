/**
 * #17081 — l'éventail de MENTIONS avait repris le débit non borné que #10819
 * venait de retirer à l'éventail `regular`.
 *
 * `messageNotificationFanOutConcurrency.test.ts` garde le lot `regular` :
 * `settleWithConcurrency(…, MESSAGE_FANOUT_CONCURRENCY, …)`, seize créations en
 * vol, avec sa mesure de production en doc-comment (375 membres, 10 à 14 s de
 * file Prisma tenue, TOUTES les routes de la passerelle derrière).
 * `createMentionNotificationsBatch` était un `Promise.all(…​.map(…))` **nu**,
 * jusqu'à `MAX_MENTIONS_PER_MESSAGE = 50`.
 *
 * **La borne avait été posée sur le site qui AVAIT la mesure, pas là où le coût
 * vit.** Il vient de `createNotification` → `computeConversationUnreadBadge`,
 * qui dit son prix à voix haute : « 2 requêtes + une par conversation NON MUETTE
 * du destinataire ». `createMentionNotification` le paie à l'identique, plus
 * quatre lectures parallèles par destinataire. Pour des membres suivant chacun
 * cinquante conversations, une seule mention de masse — une annonce qui nomme
 * l'équipe — lâchait 2 500 à 5 000 lectures d'un coup : trois fois le débit que
 * #10819 a jugé fatal, dans la file que partagent toutes les routes HTTP.
 *
 * > C'est la forme de la leçon 261 (« une énumération de sites porte DEUX
 * > affirmations ») appliquée à une BORNE : #10819 a nommé « l'éventail
 * > `new_message` », et ce nom décrit le site mesuré, jamais la propriété —
 * > « ce qui lâche N créations de notification en vol ».
 *
 * Le témoin exige N > la borne : à deux ou trois mentionnés, « borné » et « non
 * borné » rendent le même pic, et l'assertion ne peut pas tomber (§ un témoin de
 * rang s'écrit sur un rang autre que le premier).
 *
 * @jest-environment node
 */

import { describe, it, expect, jest } from '@jest/globals';

import { MESSAGE_FANOUT_CONCURRENCY } from '../../../../services/notifications/fanout-concurrency';
import { NotificationService } from '../../../../services/notifications/NotificationService';

jest.mock('../../../../utils/logger-enhanced', () => ({
  notificationLogger: { info: jest.fn(), debug: jest.fn(), warn: jest.fn(), error: jest.fn() },
  securityLogger: { logViolation: jest.fn() },
  enhancedLogger: { child: () => ({ info: jest.fn(), debug: jest.fn(), warn: jest.fn(), error: jest.fn() }) },
}));

const CONV_ID = '507f1f77bcf86cd799439022';
const MSG_ID = '507f1f77bcf86cd799439051';
const SENDER_USER_ID = '507f1f77bcf86cd799439041';
const SERVER_CLOCK = new Date('2026-11-08T10:00:00Z');

const mentionedIds = (count: number) =>
  Array.from({ length: count }, (_, i) => `mentioned-${String(i).padStart(4, '0')}`);

function makePrisma() {
  return {
    message: {
      findUnique: jest.fn<any>().mockResolvedValue({
        deletedAt: null,
        expiresAt: null,
        isViewOnce: false,
        viewOnceCount: 0,
        createdAt: SERVER_CLOCK,
        messageType: 'text',
        translations: null,
        originalLanguage: 'fr',
      }),
    },
    notification: {
      create: jest.fn<any>().mockImplementation((args: any) => ({ id: 'n', ...args.data })),
      findMany: jest.fn<any>().mockResolvedValue([]),
      count: jest.fn<any>().mockResolvedValue(0),
    },
    user: {
      findUnique: jest.fn<any>().mockResolvedValue({ username: 'alice', displayName: 'Alice', avatar: null }),
      findMany: jest.fn<any>().mockResolvedValue([]),
    },
    conversation: { findUnique: jest.fn<any>().mockResolvedValue({ title: 'Salon', type: 'group', avatar: null }) },
    userPreferences: { findUnique: jest.fn<any>().mockResolvedValue(null) },
    userConversationPreferences: { findMany: jest.fn<any>().mockResolvedValue([]) },
  } as any;
}

const tick = () => new Promise<void>((resolve) => setImmediate(resolve));

/**
 * Un double de `createMentionNotification` qui NE RÉSOUT PAS tout de suite : le
 * pic ne se mesure que sur une unité qui reste en vol. Un double synchrone
 * rendrait un pic de 1 quelle que soit la borne.
 */
function trackedService(outcome: (userId: string) => Promise<unknown> = async () => ({ id: 'n' })) {
  const prisma = makePrisma();
  const service = new NotificationService(prisma);
  const state = { inFlight: 0, peak: 0, served: [] as string[] };

  jest
    .spyOn(service, 'createMentionNotification')
    .mockImplementation(async ({ mentionedUserId }: any) => {
      state.inFlight += 1;
      state.peak = Math.max(state.peak, state.inFlight);
      state.served.push(mentionedUserId);
      try {
        await tick();
        return (await outcome(mentionedUserId)) as any;
      } finally {
        state.inFlight -= 1;
      }
    });

  return { service, state, prisma };
}

const runBatch = (service: NotificationService, ids: readonly string[]) =>
  service.createMentionNotificationsBatch(
    [...ids],
    {
      senderId: SENDER_USER_ID,
      messageContent: 'on se retrouve à 14 h',
      conversationId: CONV_ID,
      messageId: MSG_ID,
    } as any,
    [...ids, SENDER_USER_ID]
  );

describe('createMentionNotificationsBatch — un éventail BORNÉ (#17081)', () => {
  it('la borne est CELLE de l\'éventail `regular` — un seul chiffre pour un seul coût', () => {
    // Deux bornes divergentes seraient deux lois : le coût qu'elles arbitrent est
    // le même (`createNotification` → `computeConversationUnreadBadge`).
    expect(MESSAGE_FANOUT_CONCURRENCY).toBeGreaterThanOrEqual(4);
    expect(MESSAGE_FANOUT_CONCURRENCY).toBeLessThanOrEqual(32);
  });

  it('50 mentionnés : jamais plus de MESSAGE_FANOUT_CONCURRENCY créations en vol', async () => {
    const ids = mentionedIds(50);
    const { service, state } = trackedService();

    const created = await runBatch(service, ids);

    expect(state.peak).toBe(MESSAGE_FANOUT_CONCURRENCY);
    expect([...state.served].sort()).toEqual(ids);
    expect(created).toBe(50);
  });

  it('un lot plus petit que la borne part d\'un seul coup', async () => {
    // Mode d'échec du correctif : borner ne doit pas SÉRIALISER un lot ordinaire
    // — trois mentions sous une photo ne doivent pas coûter trois allers-retours.
    const ids = mentionedIds(3);
    const { service, state } = trackedService();

    await runBatch(service, ids);

    expect(state.peak).toBe(3);
  });

  it('un mentionné qui échoue ne retient ni ses voisins ni le compte', async () => {
    // `settleWithConcurrency` SETTLE, là où `Promise.all` rejetait : un
    // destinataire dont la lecture de contexte hoquette emportait le compte rendu
    // de ses 49 voisins, dont les bannières étaient DÉJÀ parties. C'est la raison
    // écrite du lot `regular`, et elle vaut mot pour mot ici.
    const ids = mentionedIds(20);
    const { service, state } = trackedService(async (id) => {
      if (id === 'mentioned-0003') throw new Error('push en panne');
      return { id };
    });

    const created = await runBatch(service, ids);

    expect(state.served).toHaveLength(20);
    expect(created).toBe(19);
  });
});
