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

const member = (id: string, userId: string | null) => ({ id, userId, role: 'member', user: { role: 'USER' } });

describe('emitConversationMemberCountEvent', () => {
  it('plafonne pour tout le monde quand personne n\'est autorisé', () => {
    const { io, emissions } = makeRecorder();

    emitConversationMemberCountEvent({
      io,
      conversationId,
      participants: [member('p_1', 'u_1'), member('p_anon', null)],
      event,
      payload: { conversationId, userId: 'u_gone' },
      memberCount: 250,
    });

    expect(emissions).toHaveLength(1);
    expect(emissions[0].rooms).toEqual(['conversation:c_1', 'user:u_1', 'user:p_anon']);
    expect(emissions[0].excluded).toEqual([]);
    expect(emissions[0].payload).toEqual({
      conversationId,
      userId: 'u_gone',
      memberCount: 199,
      memberCountCapped: true,
    });
  });

  it('sert l\'effectif ENTIER à l\'admin du groupe dans une seconde chaîne', () => {
    const { io, emissions } = makeRecorder();

    emitConversationMemberCountEvent({
      io,
      conversationId,
      participants: [
        member('p_1', 'u_1'),
        { id: 'p_admin', userId: 'u_admin', role: 'admin', user: { role: 'USER' } },
      ],
      event,
      payload: { conversationId, userId: 'u_gone' },
      memberCount: 250,
    });

    expect(emissions).toHaveLength(2);

    const capped = emissions[0];
    expect(capped.rooms).toEqual(['conversation:c_1', 'user:u_1']);
    // Sans l'exclusion, l'admin qui a le FIL ouvert recevrait la copie
    // plafonnée par la room de conversation, en plus de la sienne.
    expect(capped.excluded).toEqual(['user:u_admin']);
    expect(capped.payload.memberCount).toBe(199);
    expect(capped.payload.memberCountCapped).toBe(true);

    const exact = emissions[1];
    expect(exact.rooms).toEqual(['user:u_admin']);
    expect(exact.excluded).toEqual([]);
    expect(exact.payload).toEqual({ conversationId, userId: 'u_gone', memberCount: 250 });
  });

  it('autorise aussi le creator et les rôles plateforme ADMIN/BIGBOSS/MODERATOR', () => {
    const { io, emissions } = makeRecorder();

    emitConversationMemberCountEvent({
      io,
      conversationId,
      participants: [
        member('p_1', 'u_1'),
        { id: 'p_creator', userId: 'u_creator', role: 'creator', user: { role: 'USER' } },
        { id: 'p_mod', userId: 'u_mod', role: 'member', user: { role: 'MODERATOR' } },
        { id: 'p_admin', userId: 'u_admin', role: 'member', user: { role: 'ADMIN' } },
        { id: 'p_boss', userId: 'u_boss', role: 'member', user: { role: 'BIGBOSS' } },
        { id: 'p_audit', userId: 'u_audit', role: 'member', user: { role: 'AUDIT' } },
      ],
      event,
      payload: { conversationId },
      memberCount: 250,
    });

    expect(emissions[0].rooms).toEqual(['conversation:c_1', 'user:u_1', 'user:u_audit']);
    expect(emissions[1].rooms).toEqual([
      'user:u_creator',
      'user:u_mod',
      'user:u_admin',
      'user:u_boss',
    ]);
    expect(emissions[1].payload.memberCount).toBe(250);
  });

  // Sous le plafond, `presentMemberCount` rend la MÊME valeur aux deux
  // audiences : la scission n'a plus rien à séparer. Une conversation de 12
  // personnes — c'est-à-dire l'immense majorité des fanouts — payait deux
  // filtres sur la liste des participants, deux constructions de chaîne et
  // deux emits pour délivrer deux fois le même octet. Le chemin rapide est
  // donc une chaîne UNIQUE, sans exclusion, exactement l'ancien fanout.
  it('n\'émet qu\'UNE chaîne quand l\'effectif tient sous le plafond', () => {
    const { io, emissions } = makeRecorder();

    emitConversationMemberCountEvent({
      io,
      conversationId,
      participants: [
        member('p_1', 'u_1'),
        { id: 'p_admin', userId: 'u_admin', role: 'admin', user: { role: 'USER' } },
      ],
      event,
      payload: { conversationId },
      memberCount: 12,
    });

    expect(emissions).toHaveLength(1);
    expect(emissions[0].rooms).toEqual(['conversation:c_1', 'user:u_1', 'user:u_admin']);
    expect(emissions[0].excluded).toEqual([]);
    expect(emissions[0].payload).toEqual({ conversationId, memberCount: 12 });
  });

  // La borne, des deux côtés : à 199 pile la chaîne reste unique, à 200 la
  // scission reprend — sinon le chemin rapide servirait l'entier à tout le
  // monde d'un cran au-dessus du plafond.
  it('garde la chaîne unique à 199 pile et rescinde à 200', () => {
    const participants = [
      member('p_1', 'u_1'),
      { id: 'p_admin', userId: 'u_admin', role: 'admin', user: { role: 'USER' } },
    ];

    const atCap = makeRecorder();
    emitConversationMemberCountEvent({
      io: atCap.io,
      conversationId,
      participants,
      event,
      payload: { conversationId },
      memberCount: 199,
    });
    expect(atCap.emissions).toHaveLength(1);
    expect(atCap.emissions[0].payload).toEqual({ conversationId, memberCount: 199 });

    const overCap = makeRecorder();
    emitConversationMemberCountEvent({
      io: overCap.io,
      conversationId,
      participants,
      event,
      payload: { conversationId },
      memberCount: 200,
    });
    expect(overCap.emissions).toHaveLength(2);
    expect(overCap.emissions[0].payload).toEqual({
      conversationId,
      memberCount: 199,
      memberCountCapped: true,
    });
    expect(overCap.emissions[1].payload).toEqual({ conversationId, memberCount: 200 });
  });

  it('ne fait rien sans émetteur', () => {
    expect(() =>
      emitConversationMemberCountEvent({
        io: null,
        conversationId,
        participants: [member('p_1', 'u_1')],
        event,
        payload: {},
        memberCount: 3,
      })
    ).not.toThrow();
  });
});
