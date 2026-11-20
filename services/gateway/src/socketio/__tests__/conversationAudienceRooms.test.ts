/**
 * #20007 — l'audience d'une mutation d'id ne s'arrête plus au plafond.
 *
 * `loadLiveParticipantTargets` rendait `[]` dès que l'audience dépassait 2 000
 * participants, et `conversationAudienceRooms` repliait alors sur la room de
 * conversation SEULE : au-delà de ce seuil, un lecteur resté sur la LISTE ne
 * recevait ni suppression, ni épingle, ni désépinglage — silencieusement, et
 * sans suivi. L'audit adversarial de #19954 a nommé les deux moitiés du défaut :
 * ce plafond, et l'absence de tout témoin sur la clause `bannedAt` de
 * `PARTICIPATION_VIVANTE`.
 *
 * La lecture se fait désormais PAGE par page (curseur sur `id`, la forme de
 * `userRelationBackfill`) et l'émission par LOTS : chaque page est une émission,
 * la room de conversation voyageant dans la première.
 *
 * @jest-environment node
 */
import { describe, it, expect } from '@jest/globals';
import {
  conversationAudienceRoomBatches,
  filterLiveAudience,
  loadLiveAudience,
  LIVE_AUDIENCE_MAX_PAGES,
  LIVE_AUDIENCE_PAGE,
} from '../conversationAudienceRooms';
import { liveParticipantTable } from '../../__tests__/helpers/live-audience-double';
import type { MongoDocument } from '../../__tests__/helpers/mongo-where';

const CONV = '507f1f77bcf86cd799439011';
const BANNED_AT = new Date('2026-11-01T00:00:00.000Z');

const living = (serial: number): MongoDocument => ({
  id: `p-${String(serial).padStart(6, '0')}`,
  userId: `u-${String(serial).padStart(6, '0')}`,
  conversationId: CONV,
  isActive: true,
});

const manyLiving = (count: number): MongoDocument[] => Array.from({ length: count }, (_, index) => living(index));

const prismaOf = (table: { findMany: unknown }) => ({ participant: table }) as never;

describe('loadLiveAudience — qui est VIVANT, page par page', () => {
  it('nomme les vivants, écarte la participation close et le participant BANNI', async () => {
    const table = liveParticipantTable([
      { id: 'p-live', userId: 'u-live', conversationId: CONV, isActive: true },
      { id: 'p-guest', userId: null, conversationId: CONV, isActive: true },
      { id: 'p-gone', userId: 'u-gone', conversationId: CONV, isActive: false },
      // ACTIF et BANNI : la seule ligne qui distingue `PARTICIPATION_VIVANTE`
      // d'un `isActive: true` nu. Sans elle, retirer la clause `bannedAt` de la
      // loi ne faisait rougir AUCUN témoin d'audience (audit de #19954).
      { id: 'p-banned', userId: 'u-banned', conversationId: CONV, isActive: true, bannedAt: BANNED_AT },
      { id: 'p-elsewhere', userId: 'u-elsewhere', conversationId: 'other', isActive: true },
    ]);

    const audience = await loadLiveAudience(prismaOf(table), CONV);

    expect(audience.complete).toBe(true);
    expect(audience.batches.flat().map((target) => target.id)).toEqual(['p-guest', 'p-live']);
  });

  it('une audience plus grande qu’une page se lit en PLUSIEURS pages, sans perdre personne', async () => {
    const table = liveParticipantTable(manyLiving(LIVE_AUDIENCE_PAGE + 3));

    const audience = await loadLiveAudience(prismaOf(table), CONV);

    expect(table.pagesRead()).toBe(2);
    expect(audience.complete).toBe(true);
    expect(audience.batches.map((batch) => batch.length)).toEqual([LIVE_AUDIENCE_PAGE, 3]);
    expect(audience.batches.flat()).toHaveLength(LIVE_AUDIENCE_PAGE + 3);
  });

  it('une audience EXACTEMENT d’une page ne paie pas de page vide', async () => {
    const table = liveParticipantTable(manyLiving(4));

    const audience = await loadLiveAudience(prismaOf(table), CONV, { page: 4 });

    expect(table.pagesRead()).toBe(1);
    expect(audience.complete).toBe(true);
    expect(audience.batches).toHaveLength(1);
  });

  it('le plafond de pages TRONQUE, et le dit — il ne rend plus une audience vide', async () => {
    const table = liveParticipantTable(manyLiving(7));

    const audience = await loadLiveAudience(prismaOf(table), CONV, { page: 2, maxPages: 2 });

    expect(table.pagesRead()).toBe(2);
    expect(audience.complete).toBe(false);
    expect(audience.batches.flat()).toHaveLength(4);
  });

  it('une lecture qui LÈVE à la première page ne prouve rien : aucune cible, et la panne est rendue', async () => {
    const seen: unknown[] = [];
    const table = liveParticipantTable(manyLiving(3), {
      onPage: () => {
        throw new Error('participant.findMany down');
      },
    });

    const audience = await loadLiveAudience(prismaOf(table), CONV, { onError: (error) => seen.push(error) });

    expect(audience).toEqual({ batches: [], complete: false });
    expect(seen).toHaveLength(1);
  });

  it('une lecture qui LÈVE à la DEUXIÈME page garde ce qu’elle avait prouvé', async () => {
    const table = liveParticipantTable(manyLiving(6), {
      onPage: (page) => {
        if (page === 2) throw new Error('participant.findMany down mid-scan');
      },
    });

    const audience = await loadLiveAudience(prismaOf(table), CONV, { page: 2 });

    expect(audience.complete).toBe(false);
    expect(audience.batches.flat().map((target) => target.id)).toEqual(['p-000000', 'p-000001']);
  });

  it('le plafond par défaut borne la lecture, quoi qu’il arrive', () => {
    expect(LIVE_AUDIENCE_MAX_PAGES * LIVE_AUDIENCE_PAGE).toBeGreaterThanOrEqual(50_000);
  });
});

describe('conversationAudienceRoomBatches — une émission par page', () => {
  const audienceOf = (batches: Array<Array<{ id: string; userId: string | null }>>, complete = true) => ({
    batches,
    complete,
  });

  it('la room de conversation voyage dans la PREMIÈRE émission, et dans elle seule', () => {
    const emissions = conversationAudienceRoomBatches(
      CONV,
      audienceOf([
        [{ id: 'p-1', userId: 'u-1' }],
        [{ id: 'p-2', userId: 'u-2' }],
        [{ id: 'p-3', userId: null }],
      ]),
    );

    expect(emissions).toEqual([
      [`conversation:${CONV}`, 'user:u-1'],
      'user:u-2',
      'user:p-3',
    ]);
    expect(emissions.flat().filter((room) => room === `conversation:${CONV}`)).toHaveLength(1);
  });

  it('sans aucune cible nommée, la room de conversation SEULE — jamais rien', () => {
    expect(conversationAudienceRoomBatches(CONV, audienceOf([], false))).toEqual([`conversation:${CONV}`]);
  });

  it('une seule room dans une émission sort en CHAÎNE, comme avant ce lot', () => {
    expect(conversationAudienceRoomBatches(CONV, audienceOf([[{ id: 'p-1', userId: null }], [{ id: 'p-2', userId: null }]]))).toEqual([
      [`conversation:${CONV}`, 'user:p-1'],
      'user:p-2',
    ]);
  });
});

describe('filterLiveAudience — retirer une personne sans perdre les pages', () => {
  it('garde la forme en lots, et le verdict de complétude', () => {
    const audience = {
      batches: [
        [{ id: 'p-1', userId: 'u-1' }, { id: 'p-2', userId: 'u-2' }],
        [{ id: 'p-3', userId: null }],
      ],
      complete: true,
    };

    const without = filterLiveAudience(audience, (target) => (target.userId ?? target.id) !== 'u-2');

    expect(without.complete).toBe(true);
    expect(without.batches.map((batch) => batch.map((target) => target.id))).toEqual([['p-1'], ['p-3']]);
  });
});
