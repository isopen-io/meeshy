/**
 * Les TROIS diffusions d'une adhésion, émises ENSEMBLE ou pas du tout (#17032).
 *
 * Le témoin porte la LISTE — pas un événement à la fois — et c'est le point de
 * l'issue : « un témoin par événement, écrit porte par porte, ne peut pas voir
 * une porte qui n'en émet AUCUN ». C'est exactement ce qui est arrivé à
 * `POST /conversations/:id/invite`, qui n'en émettait qu'une sur trois pendant
 * que sa jumelle les émettait toutes.
 *
 * @jest-environment node
 */

import { describe, it, expect, jest } from '@jest/globals';
import { ROOMS, SERVER_EVENTS } from '@meeshy/shared/types/socketio-events';

import { announceMembershipAdmission } from '../membershipAdmissionFanOut';

const CONV_ID = '507f1f77bcf86cd799439011';
const ACTOR_ID = '507f1f77bcf86cd799439022';
const ARRIVING_ID = '507f1f77bcf86cd799439033';
const WITNESS_ID = '507f1f77bcf86cd799439044';
const JOINED_AT = new Date('2026-11-08T09:00:00.000Z');

type Emitted = { readonly rooms: readonly string[]; readonly event: string; readonly payload: any };

/**
 * Double du `BroadcastOperator` qui retient la CHAÎNE de rooms de chaque
 * émission — `io.to(a).to(b).emit()` est UNE copie, deux `emit` en sont deux.
 * `throwOn` fait LEVER une émission PAR NOM : un double qui lève sur tout ne
 * prouverait que la survie à un harnais mort (cycle 147).
 */
function recordingIO(emitted: Emitted[], throwOn?: string) {
  const chain = (rooms: string[]): any => ({
    to: (room: string) => chain([...rooms, room]),
    except: () => chain(rooms),
    emit: (event: string, payload: any) => {
      if (event === throwOn) throw new Error(`adapter down on ${event}`);
      emitted.push({ rooms, event, payload });
    },
  });
  return { to: (room: string) => chain([room]) } as never;
}

function prismaDouble(options: { conversation?: unknown } = {}) {
  return {
    conversation: {
      findUnique: jest.fn<any>().mockResolvedValue(
        options.conversation === undefined
          ? { type: 'group', title: 'Les voisins', createdAt: new Date('2026-10-01T00:00:00.000Z') }
          : options.conversation,
      ),
    },
    participant: {
      findMany: jest.fn<any>().mockResolvedValue([
        { id: 'p-witness', userId: WITNESS_ID, role: 'member', user: { role: 'USER' } },
        { id: 'p-guest', userId: null, role: 'member', user: null },
      ]),
    },
    user: { findMany: jest.fn<any>().mockResolvedValue([{ id: ARRIVING_ID, role: 'USER' }]) },
  };
}

/**
 * Les FAMILLES émises, dans l'ordre de leur première apparition.
 *
 * Dédupliquer n'est pas une commodité : `conversation:participant-joined` part
 * **par destinataire**, avec un effectif que la capacité du lecteur plafonne
 * (`emitConversationMemberCountEvent`) — deux classes de capacité font deux
 * émissions pour une seule arrivée. La propriété que ce fichier garde est la
 * LISTE des familles, et c'est elle qui manquait à l'invitation.
 */
const families = (emitted: readonly Emitted[]): string[] => [...new Set(emitted.map((e) => e.event))];

const call = (overrides: Partial<Parameters<typeof announceMembershipAdmission>[0]> = {}) =>
  announceMembershipAdmission({
    prisma: prismaDouble() as never,
    io: recordingIO([]),
    conversationId: CONV_ID,
    arrival: { userId: ARRIVING_ID, displayName: 'Bob', joinedAt: JOINED_AT },
    actorUserId: ACTOR_ID,
    onError: () => undefined,
    ...overrides,
  });

describe('une adhésion émet ses trois diffusions, par un site unique (#17032)', () => {
  it('émet `conversation:joined`, `conversation:participant-joined` et `conversation:new`', async () => {
    const emitted: Emitted[] = [];
    await call({ io: recordingIO(emitted) });

    expect(families(emitted)).toEqual([
      SERVER_EVENTS.CONVERSATION_JOINED,
      SERVER_EVENTS.CONVERSATION_PARTICIPANT_JOINED,
      SERVER_EVENTS.CONVERSATION_NEW,
    ]);
  });

  it('`conversation:new` part dans la room PERSONNELLE de l’arrivant — la seule qui CRÉE sa ligne de liste', async () => {
    const emitted: Emitted[] = [];
    await call({ io: recordingIO(emitted) });

    const created = emitted.find((e) => e.event === SERVER_EVENTS.CONVERSATION_NEW);
    expect(created?.rooms).toEqual([ROOMS.user(ARRIVING_ID)]);
    expect(created?.payload).toMatchObject({
      conversationId: CONV_ID,
      conversationType: 'group',
      title: 'Les voisins',
      creatorId: ACTOR_ID,
      participantIds: [WITNESS_ID],
    });
  });

  it('`conversation:joined` part à la room du FIL, et nomme l’arrivant', async () => {
    const emitted: Emitted[] = [];
    await call({ io: recordingIO(emitted) });

    const joined = emitted.find((e) => e.event === SERVER_EVENTS.CONVERSATION_JOINED);
    expect(joined?.rooms).toEqual([ROOMS.conversation(CONV_ID)]);
    expect(joined?.payload).toEqual({ conversationId: CONV_ID, userId: ARRIVING_ID });
  });

  it('l’arrivant n’est pas destinataire de l’effectif — son écran le reçoit par `conversation:new`', async () => {
    const emitted: Emitted[] = [];
    await call({ io: recordingIO(emitted) });

    const arrival = emitted.find((e) => e.event === SERVER_EVENTS.CONVERSATION_PARTICIPANT_JOINED);
    expect(arrival?.rooms).not.toContain(ROOMS.user(ARRIVING_ID));
    expect(arrival?.payload).toMatchObject({ userId: ARRIVING_ID, displayName: 'Bob', joinedAt: JOINED_AT.toISOString() });
  });

  // ─── Aucune des trois n'emporte les suivantes ───────────────────────────────
  // `io.to(...).emit(...)` LÈVE quand l'adaptateur ou l'encodeur est en défaut
  // (`emitWithSeq`), et c'est la cause exacte du cycle 147 : une émission non
  // gardée en amont d'une autre les perd toutes.

  it.each([
    [SERVER_EVENTS.CONVERSATION_JOINED, [SERVER_EVENTS.CONVERSATION_PARTICIPANT_JOINED, SERVER_EVENTS.CONVERSATION_NEW]],
    [SERVER_EVENTS.CONVERSATION_PARTICIPANT_JOINED, [SERVER_EVENTS.CONVERSATION_JOINED, SERVER_EVENTS.CONVERSATION_NEW]],
    [SERVER_EVENTS.CONVERSATION_NEW, [SERVER_EVENTS.CONVERSATION_JOINED, SERVER_EVENTS.CONVERSATION_PARTICIPANT_JOINED]],
  ])('une levée sur %s laisse partir les deux autres', async (throwing, survivors) => {
    const emitted: Emitted[] = [];
    const errors: unknown[] = [];
    await call({ io: recordingIO(emitted, throwing), onError: (error) => errors.push(error) });

    expect(families(emitted)).toEqual(survivors);
    expect(errors).not.toHaveLength(0);
  });

  it('ne rejette jamais : une adhésion persistée et déjà due en réponse ne dépend pas de son éventail', async () => {
    const errors: unknown[] = [];
    const prisma = prismaDouble();
    prisma.participant.findMany.mockRejectedValue(new Error('mongo down'));
    prisma.conversation.findUnique.mockRejectedValue(new Error('mongo down'));

    await expect(call({ prisma: prisma as never, onError: (error) => errors.push(error) })).resolves.toBeUndefined();
    expect(errors).not.toHaveLength(0);
  });

  it('sans transport, rien ne part et rien n’est lu', async () => {
    const prisma = prismaDouble();
    await call({ io: null, prisma: prisma as never });
    expect(prisma.conversation.findUnique).not.toHaveBeenCalled();
    expect(prisma.participant.findMany).not.toHaveBeenCalled();
  });

  it('une conversation introuvable ne fabrique pas de ligne de liste — mais les deux autres partent', async () => {
    const emitted: Emitted[] = [];
    await call({ io: recordingIO(emitted), prisma: prismaDouble({ conversation: null }) as never });

    expect(families(emitted)).toEqual([
      SERVER_EVENTS.CONVERSATION_JOINED,
      SERVER_EVENTS.CONVERSATION_PARTICIPANT_JOINED,
    ]);
  });

  it('sans acteur nommé, l’arrivant est servi comme créateur — le champ n’est pas nullable', async () => {
    const emitted: Emitted[] = [];
    await call({ io: recordingIO(emitted), actorUserId: null });

    expect(emitted.find((e) => e.event === SERVER_EVENTS.CONVERSATION_NEW)?.payload.creatorId).toBe(ARRIVING_ID);
  });
});
