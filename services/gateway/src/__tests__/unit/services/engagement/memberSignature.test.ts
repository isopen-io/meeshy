/**
 * L'empreinte d'un ensemble de personnes (#8906).
 * @jest-environment node
 */
import { describe, it, expect } from '@jest/globals';
import { memberSignature } from '../../../../services/engagement/memberSignature';

describe('memberSignature', () => {
  it('ignore l’ordre et les doublons', () => {
    expect(memberSignature(['ali', 'baba', 'jean'])).toBe(memberSignature(['jean', 'ali', 'baba', 'ali']));
  });

  it('distingue un ensemble qui gagne un membre', () => {
    expect(memberSignature(['ali', 'baba', 'jean'])).not.toBe(memberSignature(['ali', 'baba', 'jean', 'josephine']));
  });

  it('rend une empreinte de taille fixe, quelle que soit la taille du groupe', () => {
    const many = Array.from({ length: 500 }, (_, i) => `u${i}`);
    expect(memberSignature(many)).toMatch(/^[0-9a-f]{64}$/);
  });
});
