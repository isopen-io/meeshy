/**
 * L'éventail d'ARRIVÉE d'un membre (#16837).
 *
 * Trois portes font entrer un membre dans une conversation, et UNE SEULE
 * annonçait son arrivée : l'ajout par un hôte
 * (`POST /conversations/:id/participants`). La jointure PAR LIEN — la porte de
 * croissance du produit, servie par trois routes à travers `performLinkJoin` —
 * et l'invitation (`POST /conversations/:id/invite`) n'émettaient rien.
 *
 * L'invitation CITAIT pourtant sa jumelle : « mirrors POST
 * /conversations/:id/participants », sur la ligne de l'auto-join. La jumelle
 * avait donc été ouverte et à moitié reprise — la question posée était
 * « comment rattacher les sockets de l'invité ? », et la réponse trouvée y
 * répondait exactement.
 *
 * Ces témoins portent sur le SITE UNIQUE, pas sur les trois portes : leur
 * inventaire est gardé par `member-arrival-door-sweep.test.ts`, qui rougit
 * quand une QUATRIÈME porte entre sans l'appeler. Un témoin posé sur une seule
 * porte ne peut pas rougir si deux divergent à nouveau.
 *
 * @jest-environment node
 */

import { describe, it, expect, jest } from '@jest/globals';
import { announceMemberArrival } from '../../../routes/conversations/memberArrivalFanOut';

const CONV_ID = '507f1f77bcf86cd799439011';
const ARRIVING = '507f1f77bcf86cd799439033';
const HOST = '507f1f77bcf86cd799439022';
const WITNESS = '507f1f77bcf86cd799439066';
const GUEST_PARTICIPANT = '507f1f77bcf86cd799439077';

type Emitted = { rooms: string[]; event: string; payload: any };

function recorder() {
  const emitted: Emitted[] = [];
  const make = (rooms: string[]): any => ({
    to: (room: string) => make([...rooms, room]),
    except: () => make(rooms),
    emit: (event: string, payload: unknown) => emitted.push({ rooms, event, payload }),
  });
  return { emitted, io: { to: (room: string) => make([room]) } };
}

type Row = { id: string; userId: string | null; role: string; user: { role: string } | null };

const HOST_ROW: Row = { id: 'p-host', userId: HOST, role: 'creator', user: { role: 'USER' } };
const WITNESS_ROW: Row = { id: 'p-witness', userId: WITNESS, role: 'member', user: { role: 'USER' } };
const GUEST_ROW: Row = { id: GUEST_PARTICIPANT, userId: null, role: 'member', user: null };
const ARRIVING_ROW: Row = { id: 'p-arriving', userId: ARRIVING, role: 'member', user: { role: 'USER' } };

/**
 * Le double HONORE le `where` : il applique `differsOrUnset` comme MongoDB,
 * c'est-à-dire en gardant les lignes dont `userId` est ABSENT. Un double qui
 * rendrait toutes les lignes ne pourrait pas voir l'exclusion de l'arrivant, et
 * un double qui filtrerait par un `NOT` nu ne pourrait pas voir que l'invité
 * reste destinataire.
 */
function prismaWith(rows: Row[]) {
  const calls: any[] = [];
  return {
    calls,
    prisma: {
      participant: {
        findMany: jest.fn(async (args: any) => {
          calls.push(args);
          const excluded = args.where?.OR?.[0]?.NOT?.userId;
          return rows.filter((row) => (row.userId === null ? true : row.userId !== excluded));
        }),
      },
    } as never,
  };
}

const arrival = {
  userId: ARRIVING,
  displayName: 'Nouvelle',
  joinedAt: new Date('2026-11-08T12:00:00Z'),
};

const joinedEvents = (emitted: Emitted[]) =>
  emitted.filter((e) => e.event === 'conversation:participant-joined');

describe('announceMemberArrival — l\'arrivée d\'un membre atteint les lignes de liste (#16837)', () => {
  it('adresse les rooms PERSONNELLES des autres membres, et ÉCARTE l\'arrivant', async () => {
    const { io, emitted } = recorder();
    const { prisma } = prismaWith([HOST_ROW, WITNESS_ROW, ARRIVING_ROW]);

    await announceMemberArrival({ prisma, io, conversationId: CONV_ID, arrival, onError: () => {} });

    const rooms = joinedEvents(emitted).flatMap((e) => e.rooms);
    expect(rooms).toContain(`user:${HOST}`);
    expect(rooms).toContain(`user:${WITNESS}`);
    expect(rooms).not.toContain(`user:${ARRIVING}`);
  });

  it('porte l\'effectif ABSOLU, arrivant COMPRIS', async () => {
    const { io, emitted } = recorder();
    const { prisma } = prismaWith([HOST_ROW, WITNESS_ROW, ARRIVING_ROW]);

    await announceMemberArrival({ prisma, io, conversationId: CONV_ID, arrival, onError: () => {} });

    // Deux dans l'éventail (l'arrivant est écarté) + 1 pour lui-même.
    expect(joinedEvents(emitted)[0].payload).toMatchObject({
      conversationId: CONV_ID,
      userId: ARRIVING,
      displayName: 'Nouvelle',
      joinedAt: '2026-11-08T12:00:00.000Z',
      memberCount: 3,
    });
  });

  /**
   * Un invité de lien ne peut pas être le SUJET de cet événement (son contrat
   * déclare `userId` non optionnel, et les décodeurs clients sont stricts —
   * #16838), mais il en est un DESTINATAIRE légitime : il voit l'effectif.
   * C'est `differsOrUnset` qui le garde dedans — un `NOT` nu le perdrait, car
   * sous MongoDB un champ ABSENT n'est pas un champ nul.
   */
  it('garde un invité de lien comme DESTINATAIRE, par sa room de `Participant.id`', async () => {
    const { io, emitted } = recorder();
    const { prisma, calls } = prismaWith([HOST_ROW, GUEST_ROW, ARRIVING_ROW]);

    await announceMemberArrival({ prisma, io, conversationId: CONV_ID, arrival, onError: () => {} });

    expect(calls[0].where).toMatchObject({
      conversationId: CONV_ID,
      isActive: true,
      OR: [{ NOT: { userId: ARRIVING } }, { userId: { isSet: false } }],
    });
    const rooms = joinedEvents(emitted).flatMap((e) => e.rooms);
    expect(rooms).toContain(`conversation:${CONV_ID}`);
    expect(rooms).not.toContain('user:null');
  });

  it('demande le rôle de conversation ET le rôle plateforme — les deux titres de l\'effectif exact', async () => {
    const { io } = recorder();
    const { prisma, calls } = prismaWith([HOST_ROW]);

    await announceMemberArrival({ prisma, io, conversationId: CONV_ID, arrival, onError: () => {} });

    expect(calls[0].select).toMatchObject({
      id: true,
      userId: true,
      role: true,
      user: { select: { role: true } },
    });
  });

  it('sans émetteur, n\'interroge même pas la base', async () => {
    const { prisma, calls } = prismaWith([HOST_ROW]);

    await announceMemberArrival({ prisma, io: undefined, conversationId: CONV_ID, arrival, onError: () => {} });

    expect(calls).toEqual([]);
  });

  /**
   * L'éventail est ACCESSOIRE : l'adhésion est persistée et la réponse déjà
   * due. Lever ici annoncerait à l'arrivant que son entrée a échoué alors
   * qu'elle a pris effet — et le ferait rejouer.
   */
  it('une panne de l\'éventail est rapportée, jamais propagée', async () => {
    const { io } = recorder();
    const boom = new Error('replica set stepping down');
    const prisma = { participant: { findMany: jest.fn(async () => { throw boom; }) } } as never;
    const seen: unknown[] = [];

    await expect(
      announceMemberArrival({ prisma, io, conversationId: CONV_ID, arrival, onError: (e) => seen.push(e) }),
    ).resolves.toBeUndefined();

    expect(seen).toEqual([boom]);
  });
});
