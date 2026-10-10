import { describe, expect, test } from 'bun:test';

import { decodeNamePreview } from './admin-name-preview';

/**
 * Le décodeur UNIQUE de l'aperçu de membres (#8876, règle R1). Trois membres au plus,
 * deux champs chacun — jamais un identifiant, un avatar, une présence.
 */
describe('decodeNamePreview', () => {
  test('rend null quand la charge ne porte pas l’aperçu — les rôles sans rang d’administration', () => {
    expect(decodeNamePreview(null)).toBeNull();
    expect(decodeNamePreview({ title: null })).toBeNull();
    expect(decodeNamePreview({ participants: 'Awa' })).toBeNull();
    expect(decodeNamePreview({ participants: [] })).toBeNull();
  });

  test('garde le nom affiché et le pseudo, et rien d’autre — ni identifiant, ni avatar', () => {
    const preview = decodeNamePreview({
      participants: [{ displayName: ' Awa Diop ', username: 'awa', id: 'x'.repeat(24), avatar: 'https://cdn/awa.png', isOnline: true }],
      total: 2,
    });

    expect(preview).toEqual({ participants: [{ displayName: 'Awa Diop', username: 'awa' }], total: 2 });
    expect(JSON.stringify(preview)).not.toContain('cdn');
  });

  test('borne à trois membres, ignore ceux qui n’ont aucun nom, et un total plus petit que l’aperçu est relevé', () => {
    const preview = decodeNamePreview({
      participants: [
        { displayName: 'A', username: null },
        { displayName: null, username: null },
        { displayName: 'B', username: 'b' },
        { displayName: 'C', username: 'c' },
        { displayName: 'D', username: 'd' },
      ],
      total: 1,
    });

    expect(preview?.participants.map((member) => member.displayName)).toEqual(['A', 'B', 'C']);
    expect(preview?.total).toBe(3);
  });

  test('sans total servi, l’effectif est celui de l’aperçu', () => {
    expect(decodeNamePreview({ participants: [{ displayName: 'Awa', username: null }] })?.total).toBe(1);
  });
});
