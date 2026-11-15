/**
 * La room de conversation MOINS les lecteurs sous plancher (#18623).
 *
 * #17025 a fermé `message:attachment-updated`. Ses deux canaux FRÈRES — dans la
 * même fonction, sept lignes plus haut — partaient nus : `transcription:ready`
 * et `audio-translation:*`, le second avec l'URL de la piste TTS. L'invité sous
 * plancher recevait donc le texte intégral une milliseconde AVANT la garde du
 * site voisin.
 *
 * Les témoins portent un lecteur arrivé APRÈS le message : au cas nominal la
 * forme juste et le défaut rendent le même verdict, donc un témoin posé là ne
 * peut pas tomber (leçon 261).
 *
 * Le double Prisma ÉVALUE le `where` (`matchesMongoWhere`) : la sélection des
 * lecteurs tardifs se juge sur ce qu'elle rend, jamais sur une copie de la
 * clause.
 *
 * @jest-environment node
 */

import { describe, it, expect, jest } from '@jest/globals';
import { ROOMS } from '@meeshy/shared/types/socketio-events';

import { flooredAudience, targetWithout } from '../flooredAudience';
import { matchesMongoWhere, type MongoDocument } from '../../__tests__/helpers/mongo-where';

const CONV = 'aaaaaaaaaaaaaaaaaaaaaaaa';
const MSG = 'bbbbbbbbbbbbbbbbbbbbbbbb';
const ECRIT = new Date('2026-10-08T10:00:00Z');
const apres = (minutes: number) => new Date(ECRIT.getTime() + minutes * 60_000);

const hote: MongoDocument = {
  id: 'p-hote', userId: 'u-hote', isActive: true, conversationId: CONV, role: 'creator',
  joinedAt: new Date('2026-10-01T00:00:00Z'), shareLinkId: null, historyVisibleFrom: null,
  permissions: null, anonymousSession: null, user: { role: 'USER' },
};

/** Entré APRÈS le message, par un lien qui REFUSE l'historique. */
const invite = (overrides: MongoDocument = {}): MongoDocument => ({
  id: 'p-invite', userId: null, isActive: true, conversationId: CONV, role: 'member',
  joinedAt: apres(30), shareLinkId: 'lnk-ferme', historyVisibleFrom: null,
  permissions: null, anonymousSession: { rights: null }, user: null, ...overrides,
});

function prismaOf(participants: MongoDocument[], options: { loiTombe?: boolean; sansDate?: boolean } = {}) {
  return {
    message: {
      findUnique: jest.fn(async () => (options.sansDate ? {} : { createdAt: ECRIT })),
      findFirst: jest.fn(async () => null),
    },
    participant: {
      findMany: jest.fn(async (args: any) => {
        if (options.loiTombe) throw new Error('mongo down');
        return participants.filter((row) => matchesMongoWhere(row, args.where));
      }),
    },
    conversationShareLink: {
      findMany: jest.fn(async () => [
        { id: 'lnk-ferme', allowViewHistory: false, expiresAt: null },
        { id: 'lnk-ouvert', allowViewHistory: true, expiresAt: null },
      ]),
    },
  } as never;
}

describe('flooredAudience — qui sort de la room', () => {
  it("exclut la room personnelle d'un lecteur entré après le message", async () => {
    const audience = await flooredAudience(prismaOf([hote, invite()]), CONV, MSG);

    expect(audience.kind).toBe('ok');
    expect(audience.kind === 'ok' && audience.exceptRooms).toContain(ROOMS.user('p-invite'));
  });

  it("n'exclut PAS le lecteur autorisé", async () => {
    const audience = await flooredAudience(prismaOf([hote, invite()]), CONV, MSG);

    expect(audience.kind === 'ok' && audience.exceptRooms).not.toContain(ROOMS.user('u-hote'));
  });

  it("n'exclut personne quand tout le monde était là avant le message", async () => {
    const tot = invite({ joinedAt: new Date('2026-10-02T00:00:00Z') });

    const audience = await flooredAudience(prismaOf([hote, tot]), CONV, MSG);

    // Non-régression : la loi rend `{kind:'room'}` et la diffusion reste celle
    // d'avant le lot.
    expect(audience).toEqual({ kind: 'ok', exceptRooms: [] });
  });

  it("rend 'unknown' quand la loi est illisible", async () => {
    const audience = await flooredAudience(prismaOf([hote, invite()], { loiTombe: true }), CONV, MSG);

    expect(audience.kind).toBe('unknown');
  });

  it("exclut tout lecteur à plancher quand la DATE du message est illisible", async () => {
    const audience = await flooredAudience(prismaOf([hote, invite()], { sansDate: true }), CONV, MSG);

    // « Une date de message inconnue fait lire le plancher de tous, et exclut
    // quiconque en a un » — plus étroit, jamais plus large.
    expect(audience.kind === 'ok' && audience.exceptRooms).toContain(ROOMS.user('p-invite'));
  });

  it("nomme la panne à l'appelant par onError", async () => {
    const onError = jest.fn();

    await flooredAudience(prismaOf([hote, invite()], { loiTombe: true }), CONV, MSG, onError);

    expect(onError).toHaveBeenCalled();
  });
});

describe('targetWithout — la cible amputée', () => {
  const fabrique = () => {
    const excepts: string[] = [];
    const cible = {
      excepts,
      except(room: string) { excepts.push(room); return this; },
      emit: jest.fn(),
    };
    return cible;
  };

  it('retire chaque room exclue de la cible', () => {
    const cible = fabrique();

    const sorti = targetWithout(cible, [ROOMS.user('p-invite'), ROOMS.user('p-banni')]);

    expect(sorti).not.toBeNull();
    expect(cible.excepts).toEqual([ROOMS.user('p-invite'), ROOMS.user('p-banni')]);
  });

  it('laisse la cible INTACTE quand il n’y a personne à exclure', () => {
    const cible = fabrique();

    expect(targetWithout(cible, [])).toBe(cible);
    expect(cible.excepts).toEqual([]);
  });

  it("rend null quand la cible ne sait pas exclure alors qu'il FAUT exclure", () => {
    // La porte échoue en montrant MOINS : sans `except`, servir la room
    // entière livrerait le texte au lecteur qu'on vient d'établir comme
    // interdit.
    const sansExcept = { emit: jest.fn() };

    expect(targetWithout(sansExcept, [ROOMS.user('p-invite')])).toBeNull();
  });

  it('laisse passer une cible sans `except` quand il n’y a rien à exclure', () => {
    const sansExcept = { emit: jest.fn() };

    expect(targetWithout(sansExcept, [])).toBe(sansExcept);
  });
});
