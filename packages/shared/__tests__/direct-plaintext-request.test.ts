import { describe, it, expect } from 'vitest';
import { ConversationSchemas } from '../utils/validation.js';
import { createConversationRequestSchema } from '../types/api-schemas/conversation-request.js';
import {
  E2EE_DIRECT_ALREADY_END_TO_END_MESSAGE,
  E2EE_DIRECT_NOT_A_PAIR_MESSAGE,
  E2EE_ERROR_CODES,
} from '../types/e2ee-directory.js';

/**
 * UN SECOND TÊTE-À-TÊTE, NON CHIFFRÉ, À CÔTÉ DU CHIFFRÉ (#12966) — le contrat
 * partagé de la demande : `plaintext: true` demande le tête-à-tête que le
 * serveur lit (le créer s'il n'existe pas) ; absent, rien ne change pour un
 * ancien client.
 */
describe('la demande de tête-à-tête porte `plaintext` (#12966)', () => {
  const create = (body: Record<string, unknown>) => ConversationSchemas.create.parse(body);

  it('garde `plaintext: true` jusqu’à la passerelle', () => {
    expect(create({ type: 'direct', participantIds: ['507f1f77bcf86cd799439012'], plaintext: true }).plaintext).toBe(true);
  });

  it('sans `plaintext`, la demande d’un ancien client reste celle d’avant : aucun défaut posé', () => {
    expect('plaintext' in create({ type: 'direct', participantIds: ['507f1f77bcf86cd799439012'] })).toBe(false);
  });

  it('refuse un `plaintext` qui n’est pas un booléen', () => {
    expect(() => create({ type: 'direct', participantIds: ['507f1f77bcf86cd799439012'], plaintext: 'yes' })).toThrow();
  });

  it('le schéma de route déclare `plaintext` booléen', () => {
    expect(createConversationRequestSchema.properties.plaintext.type).toBe('boolean');
  });
});

describe('le refus d’un second tête-à-tête chiffré de bout en bout (#12966)', () => {
  it('a un code stable et un texte lisible par un ancien client', () => {
    expect(E2EE_ERROR_CODES.DIRECT_ALREADY_END_TO_END).toBe('E2EE_DIRECT_ALREADY_END_TO_END');
    expect(E2EE_DIRECT_ALREADY_END_TO_END_MESSAGE).toMatch(/already/i);
  });
});

describe('un tête-à-tête ne se chiffre de bout en bout qu’entre deux personnes (#12966)', () => {
  it('a un code stable et un texte lisible', () => {
    expect(E2EE_ERROR_CODES.DIRECT_NOT_A_PAIR).toBe('E2EE_DIRECT_NOT_A_PAIR');
    expect(E2EE_DIRECT_NOT_A_PAIR_MESSAGE).toMatch(/two/i);
  });
});
