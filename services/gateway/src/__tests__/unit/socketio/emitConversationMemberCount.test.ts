/**
 * Le fanout d'effectif : UN fait, DEUX présentations, jamais deux copies au
 * même socket.
 *
 * Les cinq événements qui font varier l'effectif (`participant-joined`,
 * `-left`, `-banned`, `-unbanned`) le diffusaient PLAFONNÉ à toute la room. Sur
 * un groupe de 250 personnes, l'admin qui venait de lire 250 par REST voyait
 * son compteur retomber à « 199+ » au premier départ — le canal partagé
 * DÉGRADAIT activement ce que la règle produit lui accorde.
 *
 * La forme testée ici est celle de `broadcastReadStatus` : l'éventail plafonné
 * porte la room du fil et EXCLUT les rooms personnelles des lecteurs
 * autorisés, qui reçoivent ensuite l'effectif entier dans une seconde chaîne.
 * `.except()` est ce qui garantit qu'un autorisé assis dans la room du fil ne
 * reçoive pas les deux.
 *
 * #10205, FAIL-CLOSED — l'effectif ne voyage QUE vers les rooms PERSONNELLES
 * des comptes (`user:<User.id>`) encore participants, résolues au moment de
 * l'émission. La room du FIL — où peuvent siéger un invité, ou une socket dont
 * l'appartenance a changé depuis son `join` — ne reçoit qu'une copie SANS
 * effectif, qui exclut les rooms déjà servies. Le sujet d'un départ
 * (`participant-left` / `-banned`) n'est plus participant : il reçoit la copie
 * sans effectif.
 *
 * @jest-environment node
 */

import { emitConversationMemberCountEvent } from '../../../socketio/emitConversationMemberCount';

type Emission = { rooms: string[]; excluded: string[]; event: string; payload: any };

function makeRecorder() {
  const emissions: Emission[] = [];
  const chain = (rooms: string[], excluded: string[]): any => ({
    to: (room: string) => chain([...rooms, room], excluded),
    except: (room: string) => chain(rooms, [...excluded, room]),
    emit: (event: string, payload: any) => {
      emissions.push({ rooms, excluded, event, payload });
    },
  });
  return { io: { to: (room: string) => chain([room], []) } as never, emissions };
}

const conversationId = 'c_1';
const event = 'conversation:participant-left';
const joined = 'conversation:participant-joined';

const member = (id: string, userId: string | null, role = 'member', platformRole = 'USER') =>
  ({ id, userId, role, user: userId ? { role: platformRole } : null });

const emit = (params: { participants: any[]; memberCount: number; event?: string; payload?: Record<string, unknown> }) => {
  const { io, emissions } = makeRecorder();
  emitConversationMemberCountEvent({
    io,
    conversationId,
    participants: params.participants,
    event: (params.event ?? event) as never,
    payload: params.payload ?? { conversationId, userId: 'u_gone' },
    memberCount: params.memberCount,
  });
  return emissions;
};

const counted = (emissions: Emission[]) => emissions.filter((e) => 'memberCount' in e.payload);
const countless = (emissions: Emission[]) => emissions.filter((e) => !('memberCount' in e.payload));

describe('emitConversationMemberCountEvent — l\'effectif ne part que vers les comptes participants', () => {
  it('ne nomme JAMAIS la room du fil dans une chaîne qui porte l\'effectif', () => {
    for (const memberCount of [12, 250]) {
      const emissions = emit({
        participants: [member('p_1', 'u_1'), member('p_admin', 'u_admin', 'admin'), member('p_anon', null)],
        memberCount,
      });
      for (const e of counted(emissions)) {
        expect(e.rooms).not.toContain('conversation:c_1');
        expect(e.rooms.every((room) => room.startsWith('user:u_'))).toBe(true);
      }
    }
  });

  it('un invité (participant sans compte) ne reçoit que la copie SANS effectif', () => {
    const emissions = emit({ participants: [member('p_1', 'u_1'), member('p_anon', null)], memberCount: 12 });

    expect(counted(emissions).flatMap((e) => e.rooms)).not.toContain('user:p_anon');
    const copy = countless(emissions);
    expect(copy).toHaveLength(1);
    expect(copy[0].rooms).toEqual(['conversation:c_1', 'user:p_anon']);
    expect(copy[0].payload).toEqual({ conversationId, userId: 'u_gone' });
  });

  it('la copie sans effectif EXCLUT toutes les rooms déjà servies — une copie par socket', () => {
    const emissions = emit({
      participants: [member('p_1', 'u_1'), member('p_admin', 'u_admin', 'admin')],
      memberCount: 250,
    });

    const copy = countless(emissions)[0];
    expect(copy.rooms).toEqual(['conversation:c_1']);
    expect([...copy.excluded].sort()).toEqual(['user:u_1', 'user:u_admin']);
  });

  it('plafonne pour les comptes non autorisés, sert l\'entier aux autorisés, au-delà du plafond', () => {
    const emissions = emit({
      participants: [
        member('p_1', 'u_1'),
        member('p_creator', 'u_creator', 'creator'),
        member('p_mod', 'u_mod', 'member', 'MODERATOR'),
        member('p_admin', 'u_admin', 'member', 'ADMIN'),
        member('p_boss', 'u_boss', 'member', 'BIGBOSS'),
        member('p_audit', 'u_audit', 'member', 'AUDIT'),
      ],
      memberCount: 250,
    });

    const [capped, exact] = counted(emissions);
    expect(capped.rooms).toEqual(['user:u_1', 'user:u_audit']);
    expect(capped.payload).toEqual({ conversationId, userId: 'u_gone', memberCount: 199, memberCountCapped: true });
    expect(exact.rooms).toEqual(['user:u_creator', 'user:u_mod', 'user:u_admin', 'user:u_boss']);
    expect(exact.payload).toEqual({ conversationId, userId: 'u_gone', memberCount: 250 });
  });

  it('sous le plafond, UNE chaîne porte l\'effectif à tous les comptes', () => {
    const emissions = emit({ participants: [member('p_1', 'u_1'), member('p_admin', 'u_admin', 'admin')], memberCount: 12 });

    expect(counted(emissions)).toEqual([
      { rooms: ['user:u_1', 'user:u_admin'], excluded: [], event, payload: { conversationId, userId: 'u_gone', memberCount: 12 } },
    ]);
  });

  it('garde la chaîne comptée unique à 199 pile et rescinde à 200', () => {
    const participants = [member('p_1', 'u_1'), member('p_admin', 'u_admin', 'admin')];
    expect(counted(emit({ participants, memberCount: 199 }))).toHaveLength(1);
    expect(counted(emit({ participants, memberCount: 200 }))).toHaveLength(2);
  });

  it('le sujet d\'un DÉPART n\'est plus participant : ses appareils reçoivent la copie sans effectif', () => {
    for (const departure of ['conversation:participant-left', 'conversation:participant-banned']) {
      const emissions = emit({
        participants: [member('p_1', 'u_1'), member('p_gone', 'u_gone')],
        memberCount: 12,
        event: departure,
        payload: { conversationId, userId: 'u_gone' },
      });

      expect(counted(emissions).flatMap((e) => e.rooms)).toEqual(['user:u_1']);
      expect(countless(emissions)[0].rooms).toEqual(['conversation:c_1', 'user:u_gone']);
    }
  });

  it('le sujet d\'une ARRIVÉE est participant : il reçoit l\'effectif', () => {
    const emissions = emit({
      participants: [member('p_1', 'u_1'), member('p_new', 'u_new')],
      memberCount: 12,
      event: joined,
      payload: { conversationId, userId: 'u_new' },
    });

    expect(counted(emissions)[0].rooms).toEqual(['user:u_1', 'user:u_new']);
  });

  it('sans aucun compte participant, rien ne porte l\'effectif', () => {
    const emissions = emit({ participants: [member('p_anon', null)], memberCount: 3 });

    expect(counted(emissions)).toEqual([]);
    expect(countless(emissions)).toHaveLength(1);
  });

  it('ne fait rien sans émetteur', () => {
    expect(() =>
      emitConversationMemberCountEvent({
        io: null,
        conversationId,
        participants: [member('p_1', 'u_1')],
        event: event as never,
        payload: {},
        memberCount: 3,
      })
    ).not.toThrow();
  });
});
