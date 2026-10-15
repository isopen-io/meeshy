import { describe, expect, test } from 'bun:test';

import { WORLD_CONVERSATION_IDENTIFIER } from '@meeshy/shared/types/world-identity';

import { pinWorldWide } from './world-pin';

/**
 * WORLD WIDE ÉPINGLÉE EN CARTE EN TÊTE DE LISTE (#10004). La liste la sort de
 * ses sections pour la poser en carte au-dessus d'elles : jamais deux fois,
 * et jamais une autre conversation à sa place.
 */
const conv = (id: string, identifier?: string) => ({ id, ...(identifier === undefined ? {} : { identifier }) });

describe('World Wide épinglée en carte (#10004)', () => {
  test('World Wide sort des rangées et devient la carte', () => {
    const list = [conv('a'), conv('w', WORLD_CONVERSATION_IDENTIFIER), conv('b', 'meeshy')];
    const { world, rest } = pinWorldWide(list);
    expect(world?.id).toBe('w');
    expect(rest.map((c) => c.id)).toEqual(['a', 'b']);
  });

  test('sans World Wide (pas membre, filtrée, recherchée) : aucune carte, la liste intacte', () => {
    const list = [conv('a'), conv('b', 'meeshy')];
    const { world, rest } = pinWorldWide(list);
    expect(world).toBeUndefined();
    expect(rest).toEqual(list);
  });

  test('« Meeshy Global » reste une rangée ordinaire', () => {
    const { world } = pinWorldWide([conv('g', 'meeshy')]);
    expect(world).toBeUndefined();
  });
});
