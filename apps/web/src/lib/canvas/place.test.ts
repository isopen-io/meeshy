import { describe, expect, test } from 'bun:test';

import { parsePlace, placeLabel } from './place';

// T-D11 — miroir StoryLocationLayer.resolvedLabel.
describe('placeLabel — nom, adresse, repli (T-D11)', () => {
  test("{name:'Café'} ⇒ Café", () => {
    expect(placeLabel({ name: 'Café' }, 'Ici')).toBe('Café');
  });

  test('{address:...} ⇒ adresse (sans nom)', () => {
    expect(placeLabel({ address: '12 rue de la Paix' }, 'Ici')).toBe('12 rue de la Paix');
  });

  test('{} ⇒ le repli passé', () => {
    expect(placeLabel({}, 'Ici')).toBe('Ici');
  });
});

describe('parsePlace — place absent ⇒ null (objet rejeté)', () => {
  test('payload.place absent ⇒ null', () => {
    expect(parsePlace({})).toBeNull();
  });

  test('payload.place présent ⇒ {name,address}', () => {
    expect(parsePlace({ place: { name: 'Café Central', address: '…' } })).toEqual({ name: 'Café Central', address: '…' });
  });
});
