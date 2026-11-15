/**
 * `GET /me/starred-messages` survit à un expéditeur disparu (#7377, cas #6501).
 *
 * `Message.sender` est une relation REQUISE : une étoile posée sur un message
 * dont le `Participant` expéditeur a été effacé faisait lever à Prisma
 * « Field sender is required to return data, got `null` instead » — et la
 * lecture de la PAGE entière rejetée, donc un 500 à chaque ouverture de l'écran
 * des favoris. Le fil se répare (`withOrphanedSenderRepair`, #6501) ; la liste
 * doit en faire autant, avec les conversations de la page pour portée.
 *
 * La lecture des messages passe par la base en mémoire de #6501
 * (`helpers/orphaned-sender-db.ts`), qui JOINT l'expéditeur de chaque ligne lue
 * avec `select.sender` et rejette toute la lecture dès qu'il en manque un ; la
 * réparation qui tourne est la VRAIE. Le reste de la base (participations,
 * étoiles, conversations) vient du harnais du favori.
 *
 * @jest-environment node
 */

import { describe, it, expect, jest } from '@jest/globals';

jest.mock('../../../../utils/logger-enhanced', () => ({
  enhancedLogger: { child: () => ({ info: jest.fn(), debug: jest.fn(), warn: jest.fn(), error: jest.fn() }), error: jest.fn() },
  performanceLogger: { child: () => ({ info: jest.fn(), debug: jest.fn(), warn: jest.fn(), error: jest.fn() }) },
}));

import { makeOrphanedSenderDb, type OrphanDbMessage } from '../../../helpers/orphaned-sender-db';
import {
  CONV_A,
  MSG_1,
  MSG_2,
  buildApp,
  conversationRow,
  makePrisma,
  makeStore,
  matchesWhere,
  messageRow,
  participantRow,
  starRow,
} from './starred-messages-harness';

const ALIVE_SENDER_ID = '68b0000000000000000000e1';
const GHOST_SENDER_ID = '68b0000000000000000000e9';

function montage(options: { readonly foreignFailure?: boolean } = {}) {
  const message = (id: string, senderId: string, createdAt: Date): OrphanDbMessage => {
    const { sender: _sender, ...row } = messageRow({ id, senderId, createdAt, messageSource: 'user' });
    return { ...row, id, conversationId: CONV_A, createdAt } as OrphanDbMessage;
  };
  const db = makeOrphanedSenderDb({
    conversations: [{ id: CONV_A, lastMessageAt: new Date('2026-09-20T12:00:00.000Z'), createdAt: new Date('2026-01-01') }],
    participants: [
      {
        id: ALIVE_SENDER_ID,
        conversationId: CONV_A,
        userId: '68b000000000000000000002',
        displayName: 'Ada',
        avatar: null,
        sessionTokenHash: null,
        user: { username: 'ada', displayName: 'Ada', avatar: null },
      },
    ],
    messages: [
      message(MSG_1, ALIVE_SENDER_ID, new Date('2026-09-20T10:00:00.000Z')),
      message(MSG_2, GHOST_SENDER_ID, new Date('2026-09-20T11:00:00.000Z')),
    ],
  });
  const store = makeStore({
    participants: [participantRow()],
    conversations: [conversationRow()],
    stars: [
      starRow({ id: '68c000000000000000000001', messageId: MSG_1, createdAt: new Date('2026-09-21T09:00:00.000Z') }),
      starRow({ id: '68c000000000000000000002', messageId: MSG_2, createdAt: new Date('2026-09-21T10:00:00.000Z') }),
    ],
  });
  const base = makePrisma(store);

  const readsWithSender = jest.fn<(args: { where?: Record<string, unknown>; select?: Record<string, unknown> }) => Promise<unknown[]>>(
    async (args) => {
      const rows = db.state.messages.filter((row) => matchesWhere(row, args.where));
      if (!args.select?.sender) return rows;
      if (options.foreignFailure) throw new Error('connection reset');
      return rows.map(db.withSender);
    },
  );
  const findMany = async (args: { where?: Record<string, unknown>; select?: Record<string, unknown> }) => {
    const select = args.select ?? {};
    const scopeDiscovery = Object.keys(select).length === 1 && select.conversationId === true;
    return scopeDiscovery ? db.prisma.message.findMany(args) : readsWithSender(args);
  };

  const prisma = {
    ...base,
    ...db.prisma,
    message: { ...db.prisma.message, findMany },
    participant: { ...base.participant, create: db.prisma.participant.create },
    conversation: { ...base.conversation, ...db.prisma.conversation },
    messageStar: base.messageStar,
  };
  return { db, prisma, readsWithSender };
}

async function list(options: { readonly foreignFailure?: boolean } = {}) {
  const mounted = montage(options);
  const app = await buildApp(mounted.prisma);
  try {
    const res = await app.inject({ method: 'GET', url: '/starred-messages' });
    return { res, body: res.json(), ...mounted };
  } finally {
    await app.close();
  }
}

describe('GET /starred-messages — un expéditeur disparu ne rend plus la liste illisible', () => {
  it('répare les conversations de la page, rejoue, et sert le message orphelin sous « Compte supprimé »', async () => {
    const { res, body, db, readsWithSender } = await list();

    expect(res.statusCode).toBe(200);
    expect(body.data.map((item: { message: { id: string } }) => item.message.id)).toEqual([MSG_2, MSG_1]);
    expect(body.data[0].sender.displayName).toBe('Compte supprimé');
    expect(readsWithSender.mock.calls.filter(([args]) => Boolean(args.select?.sender))).toHaveLength(2);
    const scopes = db.prisma.message.aggregateRaw.mock.calls.map(([args]) => JSON.stringify((args as { pipeline: unknown[] }).pipeline[0]));
    expect(scopes[0]).toContain(CONV_A);
  });

  it('une erreur ÉTRANGÈRE reste un 500, sans aucune réparation', async () => {
    const { res, db } = await list({ foreignFailure: true });

    expect(res.statusCode).toBe(500);
    expect(db.prisma.message.aggregateRaw).not.toHaveBeenCalled();
  });
});
