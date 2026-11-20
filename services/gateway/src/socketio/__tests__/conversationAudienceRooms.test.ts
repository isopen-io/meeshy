/**
 * #20007 — l'audience d'une mutation d'id ne s'arrête plus au plafond.
 *
 * `loadLiveParticipantTargets` rendait `[]` dès que l'audience dépassait 2 000
 * participants, et la diffusion repliait alors sur la room de conversation
 * SEULE : au-delà de ce seuil, un lecteur resté sur la LISTE ne recevait ni
 * suppression, ni épingle, ni désépinglage, ni fait de vue unique —
 * silencieusement, et sans suivi. L'audit adversarial de #19954 a nommé les deux
 * moitiés du défaut : ce plafond, et l'absence de tout témoin sur la clause
 * `bannedAt` de `PARTICIPATION_VIVANTE`.
 *
 * Le plafond TRONQUE désormais en le journalisant, à 50 000, et ce qu'il nomme
 * part en UNE émission — Socket.IO ne dédoublonnant que par émission.
 *
 * @jest-environment node
 */
import { describe, it, expect } from '@jest/globals';
import {
  conversationAudienceRooms,
  filterLiveAudience,
  loadLiveAudience,
  LIVE_AUDIENCE_SCAN_CAP,
} from '../conversationAudienceRooms';
import { liveParticipantTable } from '../../__tests__/helpers/live-audience-double';
import type { MongoDocument } from '../../__tests__/helpers/mongo-where';

const CONV = '507f1f77bcf86cd799439011';
const BANNED_AT = new Date('2026-11-01T00:00:00.000Z');

/** La forme de PRODUCTION d'un id : `Participant.id` est un ObjectId (24 hex). */
const objectId = (serial: number): string => `507f1f77bcf86cd7994${serial.toString(16).padStart(5, '0')}`;

const living = (serial: number): MongoDocument => ({
  id: objectId(serial),
  userId: `u-${String(serial).padStart(6, '0')}`,
  conversationId: CONV,
  isActive: true,
});

const crowd = (count: number): MongoDocument[] => Array.from({ length: count }, (_, index) => living(index));

const prismaOf = (table: { findMany: unknown }) => ({ participant: table }) as never;

describe('loadLiveAudience — qui est VIVANT, en une lecture bornée', () => {
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
    expect(audience.targets.map((target) => target.id)).toEqual(['p-live', 'p-guest']);
  });

  it('la lecture est BORNÉE par le plafond du module, plus une ligne de sonde', async () => {
    const table = liveParticipantTable(crowd(3));

    await loadLiveAudience(prismaOf(table), CONV);

    // La borne est le seul argument que ce chemin passe, et c'est la seule garde
    // de mémoire qu'il a : un témoin de comportement ne peut pas la voir.
    expect(table.lastArgs()).toMatchObject({ take: LIVE_AUDIENCE_SCAN_CAP + 1 });
    expect(table.reads()).toBe(1);
  });

  it('une audience EXACTEMENT de la taille du plafond est COMPLÈTE — la sonde le distingue', async () => {
    const table = liveParticipantTable(crowd(4));

    const audience = await loadLiveAudience(prismaOf(table), CONV, { cap: 4 });

    expect(audience.complete).toBe(true);
    expect(audience.targets).toHaveLength(4);
  });

  it('au-delà du plafond, l’audience est TRONQUÉE — plus jamais JETÉE', async () => {
    const table = liveParticipantTable(crowd(7));

    const audience = await loadLiveAudience(prismaOf(table), CONV, { cap: 4 });

    expect(audience.complete).toBe(false);
    expect(audience.targets).toHaveLength(4);
  });

  it('une lecture qui LÈVE ne prouve rien : aucune cible, et la panne est rendue', async () => {
    const seen: unknown[] = [];
    const table = liveParticipantTable(crowd(3), {
      onRead: () => {
        throw new Error('participant.findMany down');
      },
    });

    const audience = await loadLiveAudience(prismaOf(table), CONV, { onError: (error) => seen.push(error) });

    expect(audience).toEqual({ targets: [], complete: false });
    expect(seen).toHaveLength(1);
  });

  it('une audience VIDE est une AFFIRMATION, pas une ignorance', async () => {
    const audience = await loadLiveAudience(prismaOf(liveParticipantTable([])), CONV);

    expect(audience).toEqual({ targets: [], complete: true });
  });
});

describe('conversationAudienceRooms — UNE émission, dédoublonnée de bout en bout', () => {
  const audienceOf = (targets: Array<{ id: string; userId: string | null }>, complete = true) => ({
    targets,
    complete,
  });

  it('la room de conversation SUIVIE des rooms personnelles, une seule fois chacune', () => {
    const rooms = conversationAudienceRooms(
      CONV,
      audienceOf([
        { id: 'p-1', userId: 'u-1' },
        { id: 'p-2', userId: 'u-2' },
        { id: 'p-3', userId: null },
        // Deux lignes VIVANTES pour un même compte (inscrit entré aussi par un
        // lien : `@@unique([conversationId, userId, sessionTokenHash])` le
        // permet) ne nomment qu'une room — et le dédoublonnage porte sur
        // l'audience ENTIÈRE, puisqu'il n'y a qu'une émission.
        { id: 'p-4', userId: 'u-1' },
      ]),
    );

    expect(rooms).toEqual([`conversation:${CONV}`, 'user:u-1', 'user:u-2', 'user:p-3']);
  });

  it('sans aucune cible nommée, la room de conversation SEULE — jamais rien', () => {
    expect(conversationAudienceRooms(CONV, audienceOf([], false))).toEqual(`conversation:${CONV}`);
  });
});

describe('filterLiveAudience — retirer une personne sans mentir sur la lecture', () => {
  it('garde le verdict de complétude, qui parle de la LECTURE et non du filtre', () => {
    const audience = {
      targets: [
        { id: 'p-1', userId: 'u-1' },
        { id: 'p-2', userId: 'u-2' },
      ],
      complete: false,
    };

    const without = filterLiveAudience(audience, (target) => (target.userId ?? target.id) !== 'u-2');

    expect(without).toEqual({ targets: [{ id: 'p-1', userId: 'u-1' }], complete: false });
  });
});
