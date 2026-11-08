/**
 * `participantAccountClosure` — la loi PURE qui dit « le compte de cet
 * interlocuteur est fermé » (supprimé OU désactivé), servie en un seul booléen.
 *
 * Trois propriétés, pas une : le booléen est présent SEULEMENT à vrai (la clé
 * est absente sinon, un ancien client et le fil restent inchangés) ; un état
 * non lu n'est jamais une fermeture ; et rien d'autre du compte ne part à côté
 * (ni horodatage, ni distinction supprimé/désactivé).
 */
import { describe, it, expect } from 'vitest';
import {
  participantAccountClosure,
  serializeConversationParticipant,
} from '../../utils/participant-helpers.js';

const row = (overrides: Record<string, unknown> = {}) => ({
  id: 'part-1',
  userId: 'usr-1',
  type: 'user',
  displayName: 'Alice B.',
  role: 'member',
  isActive: true,
  user: { id: 'usr-1', username: 'alice', isActive: true },
  ...overrides,
});

describe('participantAccountClosure', () => {
  it('sert accountClosed: true quand le compte inscrit est fermé', () => {
    expect(
      participantAccountClosure(row({ user: { id: 'usr-1', isActive: false } })),
    ).toEqual({ accountClosed: true });
  });

  it('laisse la clé ABSENTE (jamais false) quand le compte est actif', () => {
    const served = participantAccountClosure(row());
    expect('accountClosed' in served).toBe(false);
  });

  it.each([
    ['isActive absent', { id: 'usr-1' }],
    ['isActive nul', { id: 'usr-1', isActive: null }],
    ['user nul', null],
  ])('n\'affirme jamais une fermeture non lue (%s)', (_label, user) => {
    const served = participantAccountClosure(row({ user }));
    expect('accountClosed' in served).toBe(false);
  });

  it('ignore un participant sans user chargé', () => {
    const { user: _user, ...withoutUser } = row();
    expect('accountClosed' in participantAccountClosure(withoutUser)).toBe(false);
  });

  it('ne marque jamais un anonyme, même avec un user.isActive false', () => {
    const served = participantAccountClosure(
      row({ type: 'anonymous', user: { id: 'usr-1', isActive: false } }),
    );
    expect('accountClosed' in served).toBe(false);
  });

  it('ne marque jamais une ligne sans userId', () => {
    const served = participantAccountClosure(
      row({ userId: null, user: { isActive: false } }),
    );
    expect('accountClosed' in served).toBe(false);
  });
});

describe('serializeConversationParticipant — compte fermé', () => {
  const closedRow = () =>
    row({
      user: {
        id: 'usr-1',
        username: 'alice',
        isActive: false,
        deletedAt: new Date('2026-10-01T00:00:00.000Z'),
        deactivatedAt: new Date('2026-10-02T00:00:00.000Z'),
      },
    });

  it('sert accountClosed et rien d\'autre du compte fermé', () => {
    const served = serializeConversationParticipant(closedRow());
    const open = serializeConversationParticipant(row());

    expect(served).toMatchObject({ accountClosed: true });
    expect(Object.keys(served).sort()).toEqual([...Object.keys(open), 'accountClosed'].sort());
    expect(served).not.toHaveProperty('deletedAt');
    expect(served).not.toHaveProperty('deactivatedAt');
  });

  it('garde le fil d\'un compte actif strictement inchangé', () => {
    expect('accountClosed' in serializeConversationParticipant(row())).toBe(false);
  });
});
