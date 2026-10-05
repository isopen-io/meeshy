import { describe, it, expect } from '@jest/globals';
import {
  activeCallStanding,
  mayModerateCallParticipant,
  type ModeratedCallSession,
} from '../callModerationPolicy';

type Row = ModeratedCallSession['participants'][number];

const row = (key: string, role: string, overrides: Partial<Row> = {}): Row => ({
  id: `cp-${key}`,
  participantId: `p-${key}`,
  leftAt: null,
  participant: { userId: key, role, isActive: true },
  ...overrides,
});

const session = (rows: Row[], initiatorId = 'alice'): ModeratedCallSession => ({ initiatorId, participants: rows });

const standing = (s: ModeratedCallSession, key: string) => {
  const found = activeCallStanding(s, key);
  if (!found) throw new Error(`${key} not in call`);
  return found;
};

describe('mayModerateCallParticipant — l’admin d’un appel (#8438)', () => {
  const call = session([
    row('alice', 'member'),
    row('mod', 'moderator'),
    row('admin', 'admin'),
    row('bob', 'member'),
    row('guest', 'call-guest', { participant: { userId: 'guest', role: 'call-guest', isActive: false } }),
  ]);

  it('celui qui a lancé l’appel modère n’importe quel autre participant, même un admin', () => {
    expect(mayModerateCallParticipant(standing(call, 'alice'), standing(call, 'bob'))).toBe(true);
    expect(mayModerateCallParticipant(standing(call, 'alice'), standing(call, 'admin'))).toBe(true);
  });

  it('un modérateur modère qui il dépasse en rang, jamais un égal ni un supérieur', () => {
    expect(mayModerateCallParticipant(standing(call, 'mod'), standing(call, 'bob'))).toBe(true);
    expect(mayModerateCallParticipant(standing(call, 'mod'), standing(call, 'guest'))).toBe(true);
    expect(mayModerateCallParticipant(standing(call, 'mod'), standing(call, 'admin'))).toBe(false);
    expect(mayModerateCallParticipant(standing(call, 'admin'), standing(call, 'mod'))).toBe(true);
  });

  it('un simple membre, un invité de l’appel, ou soi-même : refusé', () => {
    expect(mayModerateCallParticipant(standing(call, 'bob'), standing(call, 'guest'))).toBe(false);
    expect(mayModerateCallParticipant(standing(call, 'guest'), standing(call, 'bob'))).toBe(false);
    expect(mayModerateCallParticipant(standing(call, 'mod'), standing(call, 'mod'))).toBe(false);
  });

  it('un rang de conversation ne vaut que pour une participation ACTIVE', () => {
    const exMod = session([row('exmod', 'moderator', { participant: { userId: 'exmod', role: 'moderator', isActive: false } }), row('bob', 'member')]);
    expect(mayModerateCallParticipant(standing(exMod, 'exmod'), standing(exMod, 'bob'))).toBe(false);
  });
});

describe('activeCallStanding — la place d’une personne CONNECTÉE à l’appel', () => {
  it('ne trouve ni un participant parti, ni un inconnu', () => {
    const call = session([row('alice', 'member'), row('bob', 'member', { leftAt: new Date(0) })]);

    expect(activeCallStanding(call, 'bob')).toBeNull();
    expect(activeCallStanding(call, 'mallory')).toBeNull();
  });

  it('identifie un anonyme par son participantId, et l’initiateur par la session', () => {
    const call = session([row('alice', 'member'), row('anon', 'member', { participantId: 'anon', participant: { userId: null, role: 'member', isActive: true } })]);

    expect(activeCallStanding(call, 'anon')).toMatchObject({ key: 'anon', participantId: 'anon', isActiveCallInitiator: false });
    expect(activeCallStanding(call, 'alice')).toMatchObject({ isActiveCallInitiator: true, conversationRank: 10 });
  });
});
