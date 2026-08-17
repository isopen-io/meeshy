/**
 * WL-105 (LWS-10) — résolution des participants de présence du rang.
 */
import {
  resolveLentillePresenceEntries,
  resolveOtherDirectParticipantUser,
} from '../lentille-row-utils';
import type { Conversation, Participant } from '@meeshy/shared/types';

const buildParticipant = (overrides: Partial<Participant> = {}): Participant =>
  ({
    id: `p-${overrides.userId ?? 'x'}`,
    conversationId: 'conv-1',
    type: 'user',
    userId: 'user-x',
    displayName: 'User X',
    role: 'member',
    language: 'fr',
    permissions: {},
    isActive: true,
    isOnline: false,
    joinedAt: new Date('2026-01-01'),
    ...overrides,
  }) as unknown as Participant;

describe('resolveLentillePresenceEntries — direct', () => {
  it('résout le participant dont l’id diffère du lecteur', () => {
    const conversation = {
      type: 'direct',
      participants: [
        buildParticipant({ userId: 'user-1', isOnline: true }),
        buildParticipant({ userId: 'user-2', isOnline: false }),
      ],
    } as unknown as Conversation;

    const entries = resolveLentillePresenceEntries(conversation, 'user-1');
    expect(entries).toEqual([{ userId: 'user-2', source: { isOnline: false, lastActiveAt: undefined } }]);
  });

  it('retombe sur le second participant quand aucun ne diffère explicitement (repli 2)', () => {
    const conversation = {
      type: 'direct',
      participants: [
        buildParticipant({ userId: 'user-1' }),
        buildParticipant({ userId: 'user-1' }),
      ],
    } as unknown as Conversation;

    const entries = resolveLentillePresenceEntries(conversation, 'user-1');
    expect(entries).toHaveLength(1);
  });

  it("retombe sur l'unique participant (repli 3)", () => {
    const conversation = {
      type: 'direct',
      participants: [buildParticipant({ userId: 'user-1' })],
    } as unknown as Conversation;

    const entries = resolveLentillePresenceEntries(conversation, 'someone-else');
    expect(entries).toEqual([{ userId: 'user-1', source: { isOnline: false, lastActiveAt: undefined } }]);
  });
});

describe('resolveLentillePresenceEntries — group (agrégat « quelqu’un d’actif »)', () => {
  it('rend TOUS les participants hors lecteur, dédupliqués', () => {
    const conversation = {
      type: 'group',
      participants: [
        buildParticipant({ userId: 'user-1' }),
        buildParticipant({ userId: 'user-2', isOnline: true }),
        buildParticipant({ userId: 'user-3', isOnline: false }),
        buildParticipant({ userId: 'user-2', isOnline: true }), // doublon
      ],
    } as unknown as Conversation;

    const entries = resolveLentillePresenceEntries(conversation, 'user-1');
    expect(entries.map((e) => e.userId)).toEqual(['user-2', 'user-3']);
  });

  it('rend un tableau vide sans participants', () => {
    const conversation = { type: 'group', participants: [] } as unknown as Conversation;
    expect(resolveLentillePresenceEntries(conversation, 'user-1')).toEqual([]);
  });
});

describe('resolveOtherDirectParticipantUser', () => {
  it('rend null hors conversation directe', () => {
    const conversation = { type: 'group', participants: [] } as unknown as Conversation;
    expect(resolveOtherDirectParticipantUser(conversation, 'user-1')).toBeNull();
  });

  it("rend l'objet `user` imbriqué quand présent", () => {
    const conversation = {
      type: 'direct',
      participants: [
        buildParticipant({ userId: 'user-1' }),
        buildParticipant({
          userId: 'user-2',
          user: { id: 'user-2', displayName: 'Bob', avatar: 'bob.png' },
        } as Partial<Participant>),
      ],
    } as unknown as Conversation;

    const other = resolveOtherDirectParticipantUser(conversation, 'user-1') as { displayName: string };
    expect(other.displayName).toBe('Bob');
  });
});
