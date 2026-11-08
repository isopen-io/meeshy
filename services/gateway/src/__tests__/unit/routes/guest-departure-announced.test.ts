/**
 * La sortie d'un INVITÉ de lien est annoncée, et le sortant est sorti.
 *
 * `socketio/endConversationMembership.ts` ouvre sur « Quatre chemins mettent
 * fin à l'appartenance d'un membre » — quitter, être banni, être retiré,
 * supprimer le fil pour soi. La sortie d'invité est le CINQUIÈME, et elle n'est
 * dans aucune de ces listes : `endGuestSession` désactivait la ligne, annonçait
 * un changement de langue, libérait la place du lien, et retournait.
 *
 * C'est la forme de la leçon 261 : le lot a fermé « les verbes qui retirent un
 * MEMBRE », et la sortie d'invité est un verbe de SESSION.
 *
 * Deux moitiés, et elles sont indépendantes :
 *
 *  - LES AUTRES ne savaient rien. Le web ne retire une rangée du trombinoscope
 *    que sur `conversation:participant-left` / `-banned`
 *    (`apps/web/src/lib/api/conversation-members-live.ts`), et iOS POSE
 *    l'effectif ABSOLU que ces événements portent. L'effectif d'une
 *    conversation à invités ne pouvait donc DÉRIVER QUE VERS LE HAUT — ce que
 *    le commentaire de `memberArrivalFanOut.ts` affirmait impossible, en ne
 *    comptant pas cette porte.
 *  - LE SORTANT gardait tout : sa socket restait dans `ROOMS.conversation(...)`
 *    (c'est `endConversationMembership` qui l'en sort), donc il continuait de
 *    recevoir les messages d'un fil quitté ; son partage de position vive, sa
 *    participation d'appel et son marqueur « ici » restaient actifs ; et son
 *    cache d'appartenance le laissait écrire.
 *
 * Aucun changement de contrat : `ConversationParticipantLeftEventData` déclare
 * `participantId` toujours présent et `userId: string | null` — « `null` quand
 * la personne n'a PAS de compte ». C'est exactement un invité, et
 * `identifyTarget` est le helper qui l'écrit.
 *
 * @jest-environment node
 */

import { describe, it, expect, jest } from '@jest/globals';

import { endGuestSession } from '../../../routes/conversations/guest-sessions';
import { hashSessionToken } from '../../../utils/session-token';
import { SERVER_EVENTS } from '@meeshy/shared/types/socketio-events';

const TOKEN = 'guest-session-token-abc';
const CONV_ID = '507f1f77bcf86cd799439222';
const GUEST_PARTICIPANT = '507f1f77bcf86cd799439233';
const MEMBER_USER = '507f1f77bcf86cd799439244';
const MEMBER_PARTICIPANT = '507f1f77bcf86cd799439255';

type Emitted = { readonly room: string; readonly event: string; readonly payload: Record<string, unknown> };

function harness(options: { readonly alreadyInactive?: boolean } = {}) {
  const emitted: Emitted[] = [];
  const left: string[] = [];
  /**
   * Le double REFUSE ce que le vrai refuse, et il a d'abord menti : écrit avec
   * un `socketsLeave`, il laissait `endConversationMembership` lever sur un
   * `fetchSockets` absent — donc le témoin d'éviction tombait pour la mauvaise
   * raison. Le contrat réel est `in(room).fetchSockets()`
   * (`MembershipRoomReader`), et le `as never` du site d'appel est ce qui a
   * empêché le compilateur de le dire.
   */
  const io = {
    to: (room: string) => ({
      emit: (event: string, payload: Record<string, unknown>) => {
        emitted.push({ room, event, payload });
      },
    }),
    in: (room: string) => ({
      fetchSockets: async () => [
        { leave: async (left_: string) => { left.push(`${room}->${left_}`); } },
      ],
    }),
  };
  const ended: Array<{ conversationId: string; userId: string }> = [];
  const invalidated: Array<{ userId: string; conversationId: string }> = [];
  const manager = {
    endLiveLocationForDepartedMember: (conversationId: string, userId: string) => {
      ended.push({ conversationId, userId });
    },
    endCallParticipationForDepartedMember: async () => {},
    retractViewingForDepartedMember: async () => {},
    invalidateParticipantCache: (userId: string, conversationId: string) => {
      invalidated.push({ userId, conversationId });
    },
  };

  const prisma = {
    participant: {
      findFirst: jest.fn(async () => ({
        id: GUEST_PARTICIPANT,
        conversationId: CONV_ID,
        userId: null,
        displayName: 'Nova',
        type: 'anonymous',
        isActive: !options.alreadyInactive,
        sessionTokenHash: hashSessionToken(TOKEN),
        shareLinkId: null,
      })),
      updateMany: jest.fn(async () => ({ count: options.alreadyInactive ? 0 : 1 })),
      findMany: jest.fn(async () => [
        { id: MEMBER_PARTICIPANT, userId: MEMBER_USER, displayName: 'Ana' },
      ]),
    },
    conversationShareLink: { updateMany: jest.fn(async () => ({ count: 0 })) },
  };

  return { prisma, io, manager, emitted, left, ended, invalidated };
}

const departures = (emitted: readonly Emitted[]) =>
  emitted.filter((e) => e.event === SERVER_EVENTS.CONVERSATION_PARTICIPANT_LEFT);

describe('la sortie d’un invité de lien est annoncée aux autres', () => {
  it('diffuse `conversation:participant-left` avec l’effectif ABSOLU restant', async () => {
    const h = harness();

    const outcome = await endGuestSession({
      prisma: h.prisma as never,
      sessionToken: TOKEN,
      io: h.io as never,
      manager: h.manager as never,
    });

    expect(outcome.kind).toBe('ended');
    const seen = departures(h.emitted);
    expect(seen.length).toBeGreaterThan(0);
    expect(seen[0].payload).toMatchObject({
      conversationId: CONV_ID,
      participantId: GUEST_PARTICIPANT,
      // `userId` est `null`, JAMAIS le `Participant.id` : le champ déclare un
      // `User.id`, et un invité n'en a pas.
      userId: null,
      displayName: 'Nova',
      memberCount: 1,
    });
  });

  it('nomme le sortant par son `participantId` — le seul champ qu’un invité possède', async () => {
    const h = harness();
    await endGuestSession({
      prisma: h.prisma as never,
      sessionToken: TOKEN,
      io: h.io as never,
      manager: h.manager as never,
    });
    const payloads = departures(h.emitted).map((e) => e.payload);
    // `every` sur une liste VIDE rend `true` : sans cette ligne, ce témoin
    // passait au vert AVANT le lot, quand aucun départ n'était annoncé du tout.
    // Un témoin qui ne peut pas tomber n'est pas un témoin.
    expect(payloads.length).toBeGreaterThan(0);
    expect(payloads.every((p) => p.participantId === GUEST_PARTICIPANT)).toBe(true);
    expect(JSON.stringify(payloads)).not.toContain(`"userId":"${GUEST_PARTICIPANT}"`);
  });

  it('sort le partant de la room du fil et éteint ce qu’il y tenait de vivant', async () => {
    const h = harness();
    await endGuestSession({
      prisma: h.prisma as never,
      sessionToken: TOKEN,
      io: h.io as never,
      manager: h.manager as never,
    });

    // La clé est `userId ?? id` : un invité est nommé par son `Participant.id`.
    expect(h.ended).toEqual([{ conversationId: CONV_ID, userId: GUEST_PARTICIPANT }]);
    expect(h.invalidated).toEqual([{ userId: GUEST_PARTICIPANT, conversationId: CONV_ID }]);
    // Et la socket du partant quitte bien la room du FIL, lue depuis sa room
    // PERSONNELLE — la seule où un invité se trouve par son `Participant.id`.
    expect(h.left).toEqual([`user:${GUEST_PARTICIPANT}->conversation:${CONV_ID}`]);
  });

  it('une sortie DÉJÀ faite n’annonce rien et ne sort personne — la porte reste idempotente', async () => {
    const h = harness({ alreadyInactive: true });
    const outcome = await endGuestSession({
      prisma: h.prisma as never,
      sessionToken: TOKEN,
      io: h.io as never,
      manager: h.manager as never,
    });
    expect(outcome.kind).toBe('ended');
    expect(departures(h.emitted)).toEqual([]);
    expect(h.ended).toEqual([]);
  });

  it('sans couche socket, la sortie aboutit quand même — c’est un canal latéral', async () => {
    const h = harness();
    const outcome = await endGuestSession({ prisma: h.prisma as never, sessionToken: TOKEN });
    expect(outcome.kind).toBe('ended');
    expect(h.prisma.participant.updateMany).toHaveBeenCalled();
  });

  it('une lecture des membres qui tombe ne fait pas échouer une sortie déjà persistée', async () => {
    const h = harness();
    h.prisma.participant.findMany = jest.fn(async () => {
      throw new Error('mongo down');
    }) as never;
    const outcome = await endGuestSession({
      prisma: h.prisma as never,
      sessionToken: TOKEN,
      io: h.io as never,
      manager: h.manager as never,
    });
    expect(outcome.kind).toBe('ended');
  });
});
