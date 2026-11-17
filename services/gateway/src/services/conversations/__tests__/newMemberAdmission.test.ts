/**
 * La loi UNIQUE des portes qui font entrer quelqu'un dans une conversation
 * existante (#17117, #16188) : une conversation externe et un tête-à-tête
 * chiffré de bout en bout n'admettent aucun nouveau membre ; tout le reste,
 * oui. Les témoins de comportement des portes vivent dans
 * `__tests__/unit/routes/conversations/external-conversation-doors-17117.test.ts`.
 *
 * @jest-environment node
 */
import { describe, it, expect } from '@jest/globals';
import { E2EE_ERROR_CODES } from '@meeshy/shared/types/e2ee-directory';
import { EXTERNAL_CONVERSATION_ERROR_CODES, EXTERNAL_CONVERSATION_TYPE } from '@meeshy/shared/types/external-conversation';
import { newMemberRefusal, returningMemberRefusal } from '../newMemberAdmission';

describe('newMemberRefusal', () => {
  it('une conversation externe n’a qu’un membre Meeshy (#17117)', () => {
    expect(newMemberRefusal({ type: EXTERNAL_CONVERSATION_TYPE, encryptionMode: null })).toMatchObject({
      code: EXTERNAL_CONVERSATION_ERROR_CODES.SINGLE_MEMBER,
    });
  });

  it.each(['e2ee', 'E2EE'])('un tête-à-tête chiffré de bout en bout (%s) reste à deux (#16188), avec une phrase lisible', (encryptionMode) => {
    const refusal = newMemberRefusal({ type: 'direct', encryptionMode });

    expect(refusal?.code).toBe(E2EE_ERROR_CODES.DIRECT_STAYS_A_PAIR);
    expect(refusal?.message).toMatch(/end-to-end encrypted/);
  });

  it.each([
    ['un tête-à-tête en clair', 'direct', null],
    ['un tête-à-tête chiffré au repos par le serveur', 'direct', 'server'],
    ['un tête-à-tête hybride', 'direct', 'hybrid'],
    ['un groupe', 'group', null],
    ['un groupe dont le mode dirait e2ee', 'group', 'e2ee'],
    ['une conversation publique', 'public', null],
  ])('%s admet un nouveau membre', (_label, type, encryptionMode) => {
    expect(newMemberRefusal({ type, encryptionMode })).toBeNull();
  });
});

/**
 * Audit de #19080, E1 — la règle de la paire (#12966) ne compte que les membres
 * ACTIFS : un ancien troisième membre « supprimé pour lui » ou banni ne bloquait
 * pas l'activation, et revenait ensuite par « restaurer pour moi » ou par la
 * levée de son bannissement. Un tête-à-tête chiffré ne rend sa place qu'à l'un
 * des deux de sa paire.
 */
describe('returningMemberRefusal', () => {
  const ENABLED = new Date('2026-11-10T00:00:00Z');
  const e2eeDirect = { type: 'direct', encryptionMode: 'e2ee', encryptionEnabledAt: ENABLED };
  const before = new Date('2026-11-01T00:00:00Z');
  const after = new Date('2026-11-12T00:00:00Z');

  it('un membre de la paire, parti APRÈS l’activation, revient', () => {
    expect(returningMemberRefusal({ conversation: e2eeDirect, returningUserId: 'b', leftAt: after, memberUserIds: ['a'] })).toBeNull();
  });

  it('un tiers parti AVANT l’activation n’y entre jamais, même si la paire n’a plus qu’un membre actif', () => {
    const refusal = returningMemberRefusal({ conversation: e2eeDirect, returningUserId: 'c', leftAt: before, memberUserIds: ['a'] });
    expect(refusal?.code).toBe(E2EE_ERROR_CODES.DIRECT_STAYS_A_PAIR);
  });

  it('un retour qui ferait trois membres actifs est refusé', () => {
    const refusal = returningMemberRefusal({ conversation: e2eeDirect, returningUserId: 'c', leftAt: after, memberUserIds: ['a', 'b'] });
    expect(refusal?.code).toBe(E2EE_ERROR_CODES.DIRECT_STAYS_A_PAIR);
  });

  it('sans date de départ, ou sans compte, le retour est refusé (fail-closed)', () => {
    expect(returningMemberRefusal({ conversation: e2eeDirect, returningUserId: 'b', leftAt: null, memberUserIds: ['a'] })).not.toBeNull();
    expect(returningMemberRefusal({ conversation: e2eeDirect, returningUserId: null, leftAt: after, memberUserIds: ['a'] })).not.toBeNull();
  });

  it('sans date d’activation, seule la taille de la paire décide', () => {
    const undated = { ...e2eeDirect, encryptionEnabledAt: null };
    expect(returningMemberRefusal({ conversation: undated, returningUserId: 'b', leftAt: before, memberUserIds: ['a'] })).toBeNull();
    expect(returningMemberRefusal({ conversation: undated, returningUserId: 'c', leftAt: before, memberUserIds: ['a', 'b'] })).not.toBeNull();
  });

  it.each([
    ['un tête-à-tête en clair', { type: 'direct', encryptionMode: null, encryptionEnabledAt: null }],
    ['un groupe', { type: 'group', encryptionMode: 'e2ee', encryptionEnabledAt: ENABLED }],
    ['une conversation externe (son ouvreur revient)', { type: EXTERNAL_CONVERSATION_TYPE, encryptionMode: null, encryptionEnabledAt: null }],
  ])('%s rend toujours sa place', (_label, conversation) => {
    expect(returningMemberRefusal({ conversation, returningUserId: 'c', leftAt: before, memberUserIds: ['a', 'b'] })).toBeNull();
  });
});
