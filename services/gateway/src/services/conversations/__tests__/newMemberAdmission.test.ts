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
import { newMemberRefusal } from '../newMemberAdmission';

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
