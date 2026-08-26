import { describe, it, expect } from 'vitest';
import {
  conversationMinimalSchema,
  conversationSchema,
} from '../types/api-schemas';

// fast-json-stringify strippe tout champ non déclaré : sans ces déclarations,
// le drapeau de plafonnement disparaît du fil alors que les handlers le posent.
describe('memberCount / memberCountCapped — déclarés sur les DEUX schémas', () => {
  // Élargir le droit de voir l'effectif entier ne change pas la FORME du fil :
  // les deux mêmes champs, une valeur différente selon le lecteur. Ce test
  // garde la forme — un champ retiré d'un seul des deux schémas rendrait la
  // règle invisible sur une surface et pas sur l'autre, en silence.
  it('déclare memberCount en number sur les deux schémas', () => {
    expect((conversationMinimalSchema as any).properties.memberCount).toMatchObject({
      type: 'number',
    });
    expect((conversationSchema as any).properties.memberCount).toMatchObject({
      type: 'number',
    });
  });

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
