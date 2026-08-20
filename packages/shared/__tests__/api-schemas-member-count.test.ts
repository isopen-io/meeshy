import { describe, it, expect } from 'vitest';
import {
  conversationMinimalSchema,
  conversationSchema,
} from '../types/api-schemas';

// fast-json-stringify strippe tout champ non déclaré : sans ces déclarations,
// le drapeau de plafonnement disparaît du fil alors que les handlers le posent.
describe('memberCountCapped — déclaré sur les deux schémas de conversation', () => {
  it('est déclaré en boolean sur conversationMinimalSchema (liste, recherche)', () => {
    expect((conversationMinimalSchema as any).properties.memberCountCapped).toMatchObject({
      type: 'boolean',
    });
  });

  it('est déclaré en boolean sur conversationSchema (détail)', () => {
    expect((conversationSchema as any).properties.memberCountCapped).toMatchObject({
      type: 'boolean',
    });
  });
});
