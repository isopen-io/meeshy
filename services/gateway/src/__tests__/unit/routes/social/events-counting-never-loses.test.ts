/**
 * @jest-environment node
 *
 * #10553 — LE COMPTAGE NE PERD RIEN (règle du porteur, 2026-10-13 : « tant que
 * l'information arrive, on compte »).
 *
 *  1. un événement de comptage ANCIEN (file hors ligne restée des jours) compte ;
 *  2. un comptage qui échoue APRÈS l'écriture du reçu laisse le renvoi compter ;
 *  3. un reçu qui ne s'écrit pas n'empêche pas de compter ;
 *  4. un reçu ne dit rien du contenu : ni cible, ni acteur.
 *
 * Les témoins passent par la VRAIE porte et lisent ce qui a été ÉCRIT.
 */
import { describe, it, expect, jest } from '@jest/globals';
import {
  reachHarness, sendReach, sendReachV2, visitorHeader, viewEvent, impressionEvent,
} from '../../../helpers/reach-harness';

jest.mock('../../../../services/PostService', () => ({ PostService: jest.fn() }));
jest.mock('../../../../services/MediaService', () => ({ MediaService: jest.fn() }));

const POST = '507f1f77bcf86cd799439011';
const READER = '507f1f77bcf86cd7994390ff';
const account = { authorization: `Bearer ${READER}` };
const EVENT_A = '0192a3b4-c5d6-7e8f-9a0b-1c2d3e4f5a6b';
const TEN_DAYS_MS = 10 * 24 * 60 * 60 * 1000;

const dataOf = (res: { payload: string }) => JSON.parse(res.payload).data;
type RawRunner = { $runCommandRaw: jest.Mock<(command: Record<string, unknown>) => Promise<unknown>> };

describe('un événement de comptage ancien compte — une file hors ligne ne perd rien', () => {
  it('une impression et une vue vieilles de dix jours comptent pour un compte', async () => {
    const h = await reachHarness([{ id: POST }]);
    const now = Date.now();
    const occurredAt = new Date(now - TEN_DAYS_MS).toISOString();
    const res = await sendReachV2(h.app, [
      impressionEvent(POST, { occurredAt, eventId: EVENT_A }),
      viewEvent(POST, { occurredAt }),
    ], account, { sentAt: new Date(now).toISOString() });

    expect(dataOf(res)).toMatchObject({ recorded: 2, ignored: 0 });
    expect(h.store.read(POST)).toMatchObject({ impressionCount: 1, viewCount: 1 });
    await h.app.close();
  });

  it('une impression vieille de dix jours compte pour un visiteur sans compte', async () => {
    const h = await reachHarness([{ id: POST }]);
    const now = Date.now();
    const res = await sendReachV2(h.app, [
      impressionEvent(POST, { occurredAt: new Date(now - TEN_DAYS_MS).toISOString() }),
    ], visitorHeader(1), { sentAt: new Date(now).toISOString() });

    expect(dataOf(res)).toMatchObject({ recorded: 1, ignored: 0 });
    expect(h.store.read(POST)).toMatchObject({ impressionCount: 1 });
    await h.app.close();
  });
});

describe('un comptage qui échoue après le reçu laisse le renvoi compter', () => {
  it('la vue d’un compte dont le comptage lève : le renvoi du même eventId monte viewCount', async () => {
    const h = await reachHarness([{ id: POST }]);
    h.prisma.postView.create.mockRejectedValueOnce(new Error('base indisponible'));

    const failed = await sendReach(h.app, [viewEvent(POST, { eventId: EVENT_A })], account);
    const replay = await sendReach(h.app, [viewEvent(POST, { eventId: EVENT_A })], account);

    expect(failed.statusCode).toBeGreaterThanOrEqual(500);
    expect(replay.statusCode).toBe(200);
    expect(h.store.read(POST)).toMatchObject({ viewCount: 1 });
    await h.app.close();
  });
});

describe('seul ce qui n’a PAS compté est rendu — un échec partiel ne recompte pas le reste', () => {
  it('deux vues, la seconde échoue : au renvoi la première ne recompte pas, la seconde compte', async () => {
    const OTHER = '507f1f77bcf86cd799439012';
    const EVENT_B = '0192a3b4-c5d6-7e8f-9a0b-1c2d3e4f5a6c';
    const h = await reachHarness([{ id: POST }, { id: OTHER }]);
    const create = h.prisma.postView.create;
    const real = create.getMockImplementation() as (args: { data: { postId: string; userId: string } }) => Promise<unknown>;
    let failed = false;
    create.mockImplementation(async (args) => {
      if (!failed && args.data.postId === OTHER) {
        failed = true;
        throw new Error('base indisponible');
      }
      return real(args);
    });
    const lot = [viewEvent(POST, { eventId: EVENT_A }), viewEvent(OTHER, { eventId: EVENT_B })];

    const first = await sendReach(h.app, lot, account);
    const replay = await sendReach(h.app, lot, account);

    expect(first.statusCode).toBeGreaterThanOrEqual(500);
    expect(replay.statusCode).toBe(200);
    expect(h.store.read(POST)).toMatchObject({ viewCount: 1 });
    expect(h.store.read(OTHER)).toMatchObject({ viewCount: 1 });
    await h.app.close();
  });
});

describe('une impression dont le compteur échoue après sa ligne laisse le renvoi compter', () => {
  it('la ligne est retirée avec l’échec : le renvoi du même eventId monte impressionCount, une seule ligne reste', async () => {
    const h = await reachHarness([{ id: POST }]);
    const raw = (h.prisma as unknown as RawRunner).$runCommandRaw;
    const real = raw.getMockImplementation() as (command: Record<string, unknown>) => Promise<unknown>;
    let failed = false;
    raw.mockImplementation(async (command) => {
      if (!failed && command.update === 'Post') {
        failed = true;
        throw new Error('base indisponible');
      }
      return real(command);
    });

    const first = await sendReach(h.app, [impressionEvent(POST, { eventId: EVENT_A })], account);
    const replay = await sendReach(h.app, [impressionEvent(POST, { eventId: EVENT_A })], account);

    expect(first.statusCode).toBeGreaterThanOrEqual(500);
    expect(replay.statusCode).toBe(200);
    expect(h.store.read(POST)).toMatchObject({ impressionCount: 1 });
    expect(h.impressions).toHaveLength(1);
    await h.app.close();
  });
});

describe('un reçu qui ne s’écrit pas n’empêche pas de compter', () => {
  it('l’écriture des reçus lève : la vue est comptée quand même', async () => {
    const h = await reachHarness([{ id: POST }]);
    const raw = (h.prisma as unknown as RawRunner).$runCommandRaw;
    const real = raw.getMockImplementation() as (command: Record<string, unknown>) => Promise<unknown>;
    raw.mockImplementation(async (command) => {
      if (command.insert === 'ContentEvent') throw new Error('ContentEvent indisponible');
      return real(command);
    });

    const res = await sendReach(h.app, [viewEvent(POST, { eventId: EVENT_A })], account);

    expect(res.statusCode).toBe(200);
    expect(h.store.read(POST)).toMatchObject({ viewCount: 1 });
    await h.app.close();
  });
});

describe('un reçu ne dit rien du contenu', () => {
  it('le reçu d’une vue ne porte ni cible ni acteur', async () => {
    const h = await reachHarness([{ id: POST }]);
    await sendReach(h.app, [viewEvent(POST, { eventId: EVENT_A })], account);

    const receipt = h.contentEvents.find((row) => row.action === 'receipt');
    expect(receipt).toBeDefined();
    expect(receipt).not.toHaveProperty('targetId');
    expect(receipt).not.toHaveProperty('targetKind');
    expect(receipt).not.toHaveProperty('userId');
    expect(JSON.stringify(receipt)).not.toContain(POST);
    await h.app.close();
  });
});
