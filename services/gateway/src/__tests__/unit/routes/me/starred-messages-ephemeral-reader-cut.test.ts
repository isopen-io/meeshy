/**
 * LA SIXIÈME PORTE DE L'ÉPHÉMÈRE — le favori juge « expiré » sur l'horloge DU
 * LECTEUR, jamais sur la colonne (#16604).
 *
 * `Message.expiresAt` d'un message à échéance PAR LECTEUR est l'heure INTERNE
 * de destruction — `max D(u) + 1 h`, ou `envoi + 7 jours` tant que personne n'a
 * reçu. Elle ne se sert à personne (`hasPerReaderEphemeralDeadline`). L'échéance
 * d'un lecteur vit dans SA ligne `MessageStatusEntry.ephemeralExpiresAt`, et les
 * deux divergent dès qu'un destinataire reçoit avant le dernier — le cas nominal
 * d'un groupe.
 *
 * Les témoins exercent donc TOUJOURS les deux horloges ensemble : une colonne
 * encore FUTURE au-dessus d'une échéance de lecteur DÉJÀ PASSÉE. Sous l'ancienne
 * lecture, cette paire est servie ; sous la juste, elle sort. Un témoin qui ne
 * poserait que la colonne passée ne pourrait pas tomber — c'est déjà le verdict
 * de `starred-messages-list.test.ts` § règle 2.
 *
 * @jest-environment node
 */

import { describe, it, expect, jest } from '@jest/globals';
import { MESSAGE_EFFECT_FLAGS } from '@meeshy/shared/types/message-effect-flags';

jest.mock('../../../../utils/logger-enhanced', () => ({
  enhancedLogger: { child: () => ({ info: jest.fn(), debug: jest.fn(), warn: jest.fn(), error: jest.fn() }), error: jest.fn() },
}));

import {
  CONV_A,
  DAY_MS,
  HOUR_MS,
  MSG_1,
  MSG_2,
  USER_ID,
  buildApp,
  conversationRow,
  fromHarnessNow,
  makePrisma,
  makeStore,
  messageRow,
  participantRow,
  starRow,
  statusEntryRow,
  type Store,
} from './starred-messages-harness';

/** La ligne du lecteur dans CONV_A — la clé de ses accusés. */
const READER_PARTICIPANT = '68b000000000000000000011';
/** Celle d'un AUTRE destinataire de la même conversation. */
const LATE_PARTICIPANT = '68b000000000000000000012';

const THIRTY_SECONDS = 30;

async function list(store: Store) {
  const app = await buildApp(makePrisma(store));
  try {
    const res = await app.inject({ method: 'GET', url: '/starred-messages' });
    return { res, body: res.json() as { data: { items: Array<{ message: Record<string, unknown> }> } } };
  } finally {
    await app.close();
  }
}

async function star(store: Store, messageId: string) {
  const app = await buildApp(makePrisma(store));
  try {
    const res = await app.inject({ method: 'PUT', url: `/starred-messages/${messageId}` });
    return { res, body: res.json() as Record<string, unknown> };
  } finally {
    await app.close();
  }
}

/**
 * Le lecteur participe à CONV_A et y étoile `MSG_1`. La colonne du message est
 * TOUJOURS future : seule l'échéance de lecteur décide.
 */
function store(overrides: Partial<Store> = {}): Store {
  return makeStore({
    participants: [
      participantRow({ id: READER_PARTICIPANT, userId: USER_ID }),
      participantRow({ id: LATE_PARTICIPANT, userId: '68b000000000000000000099' }),
    ],
    conversations: [conversationRow()],
    stars: [starRow()],
    ...overrides,
  });
}

/** Une flamme à durée que le DERNIER destinataire fait vivre cinq jours encore. */
function durationFlame(overrides: Record<string, unknown> = {}) {
  return messageRow({
    ephemeralDuration: THIRTY_SECONDS,
    // L'heure interne de destruction : `D(destinataire tardif) + 1 h`.
    expiresAt: fromHarnessNow(5 * DAY_MS),
    ...overrides,
  });
}

describe('GET — la coupure de l’éphémère est celle du LECTEUR, pas celle de la colonne', () => {
  it('retire une flamme dont le service du lecteur est clos, sous une colonne encore future', async () => {
    const { res, body } = await list(
      store({
        messages: [durationFlame()],
        statusEntries: [
          // `D(lecteur)` passé de deux heures — au-delà de la grâce d'une heure.
          statusEntryRow({ participantId: READER_PARTICIPANT, ephemeralExpiresAt: fromHarnessNow(-2 * HOUR_MS) }),
          // Le destinataire tardif, lui, décompte encore cinq jours.
          statusEntryRow({ id: '68d000000000000000000002', participantId: LATE_PARTICIPANT, ephemeralExpiresAt: fromHarnessNow(5 * DAY_MS) }),
        ],
      }),
    );

    expect(res.statusCode).toBe(200);
    expect(body.data.items).toEqual([]);
  });

  it('sert encore, en placeholder, la flamme dont le service du lecteur court toujours', async () => {
    const { res, body } = await list(
      store({
        messages: [durationFlame()],
        statusEntries: [
          // La bulle est partie de son écran, mais la grâce d'une heure court.
          statusEntryRow({ participantId: READER_PARTICIPANT, ephemeralExpiresAt: fromHarnessNow(-30 * 60 * 1000) }),
        ],
      }),
    );

    expect(res.statusCode).toBe(200);
    expect(body.data.items).toHaveLength(1);
    expect(body.data.items[0].message).toMatchObject({ isProtected: true, content: null });
  });

  it('sert la flamme dont le décompte du lecteur n’a pas démarré', async () => {
    const { res, body } = await list(store({ messages: [durationFlame()], statusEntries: [] }));

    expect(res.statusCode).toBe(200);
    expect(body.data.items).toHaveLength(1);
    expect(body.data.items[0].message).toMatchObject({ isProtected: true, content: null });
  });

  it('retire une flamme APRÈS LECTURE que le lecteur a consommée', async () => {
    const { res, body } = await list(
      store({
        messages: [
          messageRow({
            ephemeralDuration: null,
            effectFlags: MESSAGE_EFFECT_FLAGS.EPHEMERAL_AFTER_READ,
            // Le plafond de rétention : personne n'a « fini » au sens de la colonne.
            expiresAt: fromHarnessNow(7 * DAY_MS),
          }),
        ],
        statusEntries: [statusEntryRow({ participantId: READER_PARTICIPANT, ephemeralExpiresAt: fromHarnessNow(-2 * HOUR_MS) })],
      }),
    );

    expect(res.statusCode).toBe(200);
    expect(body.data.items).toEqual([]);
  });

  it('GARDE la flamme APRÈS LECTURE pour son EXPÉDITEUR, qui ne décompte pas', async () => {
    const { res, body } = await list(
      store({
        messages: [
          messageRow({
            senderId: READER_PARTICIPANT,
            ephemeralDuration: null,
            effectFlags: MESSAGE_EFFECT_FLAGS.EPHEMERAL_AFTER_READ,
            expiresAt: fromHarnessNow(7 * DAY_MS),
          }),
        ],
        // Un destinataire a consommé depuis longtemps : l'expéditeur garde sa bulle.
        statusEntries: [statusEntryRow({ participantId: LATE_PARTICIPANT, ephemeralExpiresAt: fromHarnessNow(-2 * DAY_MS) })],
      }),
    );

    expect(res.statusCode).toBe(200);
    expect(body.data.items).toHaveLength(1);
  });

  it('GARDE la flamme à durée pour son EXPÉDITEUR tant qu’un destinataire décompte', async () => {
    const { res, body } = await list(
      store({
        messages: [durationFlame({ senderId: READER_PARTICIPANT })],
        statusEntries: [
          statusEntryRow({ participantId: READER_PARTICIPANT, ephemeralExpiresAt: fromHarnessNow(-2 * HOUR_MS) }),
          statusEntryRow({ id: '68d000000000000000000002', participantId: LATE_PARTICIPANT, ephemeralExpiresAt: fromHarnessNow(5 * DAY_MS) }),
        ],
      }),
    );

    expect(res.statusCode).toBe(200);
    expect(body.data.items).toHaveLength(1);
  });

  it('retire la RÉPONSE à une flamme morte chez ce lecteur — avec son texte', async () => {
    const { res, body } = await list(
      store({
        messages: [
          // Le favori porte sur la RÉPONSE, qui n'est elle-même pas protégée :
          // sans la coupure héritée (#8630) son texte entier part.
          messageRow({ id: MSG_1, replyToId: MSG_2, content: 'oui, entendu' }),
          durationFlame({ id: MSG_2 }),
        ],
        statusEntries: [
          statusEntryRow({ messageId: MSG_2, participantId: READER_PARTICIPANT, ephemeralExpiresAt: fromHarnessNow(-2 * HOUR_MS) }),
          statusEntryRow({ id: '68d000000000000000000002', messageId: MSG_2, participantId: LATE_PARTICIPANT, ephemeralExpiresAt: fromHarnessNow(5 * DAY_MS) }),
        ],
      }),
    );

    expect(res.statusCode).toBe(200);
    expect(body.data.items).toEqual([]);
  });

  it('garde la réponse quand la flamme citée vit encore pour ce lecteur', async () => {
    const { res, body } = await list(
      store({
        messages: [
          messageRow({ id: MSG_1, replyToId: MSG_2, content: 'oui, entendu' }),
          durationFlame({ id: MSG_2 }),
        ],
        statusEntries: [
          statusEntryRow({ messageId: MSG_2, participantId: READER_PARTICIPANT, ephemeralExpiresAt: fromHarnessNow(DAY_MS) }),
        ],
      }),
    );

    expect(res.statusCode).toBe(200);
    expect(body.data.items).toHaveLength(1);
    expect(body.data.items[0].message).toMatchObject({ content: 'oui, entendu', isProtected: false });
  });

  it('NON-RÉGRESSION — sans échéance par lecteur, la colonne garde son mot', async () => {
    const { res, body } = await list(
      store({
        messages: [messageRow({ ephemeralDuration: null, effectFlags: 0, expiresAt: fromHarnessNow(-HOUR_MS) })],
        // Une ligne d'accusé encore FUTURE ne ressuscite rien : sans durée ni
        // flamme-œil, il n'y a pas d'échéance par lecteur à lire.
        statusEntries: [statusEntryRow({ participantId: READER_PARTICIPANT, ephemeralExpiresAt: fromHarnessNow(DAY_MS) })],
      }),
    );

    expect(res.statusCode).toBe(200);
    expect(body.data.items).toEqual([]);
  });
});

describe('PUT — la pose partage l’horloge de la liste', () => {
  it('refuse 404 une flamme morte chez le poseur, sous une colonne encore future', async () => {
    const { res } = await star(
      store({
        messages: [durationFlame()],
        stars: [],
        statusEntries: [
          statusEntryRow({ participantId: READER_PARTICIPANT, ephemeralExpiresAt: fromHarnessNow(-2 * HOUR_MS) }),
          statusEntryRow({ id: '68d000000000000000000002', participantId: LATE_PARTICIPANT, ephemeralExpiresAt: fromHarnessNow(5 * DAY_MS) }),
        ],
      }),
      MSG_1,
    );

    expect(res.statusCode).toBe(404);
  });

  it('accepte la flamme encore vivante chez lui', async () => {
    const { res, body } = await star(
      store({
        messages: [durationFlame()],
        stars: [],
        statusEntries: [statusEntryRow({ participantId: READER_PARTICIPANT, ephemeralExpiresAt: fromHarnessNow(DAY_MS) })],
      }),
      MSG_1,
    );

    expect(res.statusCode).toBe(200);
    expect(body.data).toMatchObject({ messageId: MSG_1, conversationId: CONV_A, starred: true });
  });

  it('accepte la flamme dont le décompte du poseur n’a pas démarré', async () => {
    const { res } = await star(store({ messages: [durationFlame()], stars: [], statusEntries: [] }), MSG_1);

    expect(res.statusCode).toBe(200);
  });
});

describe('les deux lectures DEMANDENT les colonnes dont dépend la coupure', () => {
  /**
   * Le faux Prisma rend des lignes ENTIÈRES, `select` ignoré : aucun témoin de
   * verdict ne peut voir une colonne manquante à la REQUÊTE, et la coupure
   * serait morte en production sous des témoins verts
   * (`services/gateway/CLAUDE.md`, « le `select` est le seul des trois qu'aucun
   * témoin de rang ne peut voir »). Ces deux témoins assertent donc sur la
   * requête, pas sur le rendu.
   */
  function recordingPrisma(base: Store) {
    const prisma = makePrisma(base) as Record<string, Record<string, unknown>>;
    const selects: { message: unknown[]; participant: unknown[] } = { message: [], participant: [] };
    const wrap = (model: 'message' | 'participant', method: string) => {
      const original = prisma[model][method] as (args: { select?: unknown }) => Promise<unknown>;
      prisma[model][method] = async (args: { select?: unknown }) => {
        selects[model].push(args?.select);
        return original(args);
      };
    };
    wrap('message', 'findMany');
    wrap('message', 'findUnique');
    wrap('participant', 'findMany');
    return { prisma, selects };
  }

  const hasKeys = (selects: unknown[], keys: readonly string[]): boolean =>
    selects.some((select) => keys.every((key) => (select as Record<string, unknown> | undefined)?.[key] === true));

  it('la liste demande `id` du participant et `senderId` / `ephemeralDuration` / `replyToId` du message', async () => {
    const { prisma, selects } = recordingPrisma(store({ messages: [durationFlame()] }));
    const app = await buildApp(prisma);
    try {
      await app.inject({ method: 'GET', url: '/starred-messages' });
    } finally {
      await app.close();
    }

    expect(hasKeys(selects.participant, ['id', 'conversationId'])).toBe(true);
    expect(hasKeys(selects.message, ['senderId', 'ephemeralDuration', 'replyToId'])).toBe(true);
  });

  it('la pose demande `senderId` et `ephemeralDuration` du message', async () => {
    const { prisma, selects } = recordingPrisma(store({ messages: [durationFlame()], stars: [] }));
    const app = await buildApp(prisma);
    try {
      await app.inject({ method: 'PUT', url: `/starred-messages/${MSG_1}` });
    } finally {
      await app.close();
    }

    expect(hasKeys(selects.message, ['senderId', 'ephemeralDuration'])).toBe(true);
  });
});
