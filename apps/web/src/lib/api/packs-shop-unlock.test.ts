import { describe, expect, test } from 'bun:test';

import { decodeShopPack } from './packs-shop';

/**
 * W18 (#11324) — `requirementPreview` se décode à la frontière : une forme
 * attendue est gardée, une forme inattendue est ignorée (la rangée retombe sur
 * celle d'avant), et un pack sans prix qui porte un aperçu n'est pas « possédé »
 * d'office — c'est le pack récompensé, que le lecteur n'a pas encore gagné.
 */
const decode = decodeShopPack('wallpaper');
const base = { slug: 'w1', name: 'Pack', installed: false };

describe('decodeShopPack — requirementPreview', () => {
  test('un aperçu bien formé est gardé, et le pack récompensé n’est pas possédé', () => {
    const preview = { met: false, reward: { kind: 'season', number: 3, met: false }, window: null };
    const pack = decode({ ...base, owned: false, requirementPreview: preview });
    expect(pack?.requirementPreview).toEqual(preview);
    expect(pack?.owned).toBe(false);
  });

  test('un aperçu mal formé est ignoré, sans perdre la rangée', () => {
    const pack = decode({ ...base, requirementPreview: { met: 'oui' } });
    expect(pack).not.toBeNull();
    expect(pack?.requirementPreview).toBeUndefined();
    expect(pack?.owned).toBe(true);
  });
});
