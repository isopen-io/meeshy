import { describe, expect, test } from 'bun:test';

import { handOffVideoPosition, takeVideoHandoff } from './video-handoff';

/**
 * #8234 — PASSER AU PLEIN ÉCRAN PENDANT LA LECTURE REPREND À LA MÊME POSITION.
 * La tuile du fil CONFIE sa position au moment où elle ouvre la visionneuse ;
 * la page vidéo de la visionneuse la REPREND une fois, à son montage.
 */
describe('video-handoff — la position confiée au plein écran', () => {
  test('une position confiée se reprend UNE fois, pour sa pièce', () => {
    handOffVideoPosition({ attachmentId: 'a-1', positionMs: 3_200 });
    expect(takeVideoHandoff('a-1')).toBe(3_200);
    expect(takeVideoHandoff('a-1')).toBeNull();
  });

  test('une autre pièce ne reprend rien', () => {
    handOffVideoPosition({ attachmentId: 'a-2', positionMs: 900 });
    expect(takeVideoHandoff('a-3')).toBeNull();
    expect(takeVideoHandoff('a-2')).toBe(900);
  });

  test('la dernière position confiée gagne', () => {
    handOffVideoPosition({ attachmentId: 'a-4', positionMs: 1_000 });
    handOffVideoPosition({ attachmentId: 'a-4', positionMs: 5_000 });
    expect(takeVideoHandoff('a-4')).toBe(5_000);
  });

  test('une position négative ou non finie ne se confie pas', () => {
    handOffVideoPosition({ attachmentId: 'a-5', positionMs: Number.NaN });
    handOffVideoPosition({ attachmentId: 'a-6', positionMs: -1 });
    expect(takeVideoHandoff('a-5')).toBeNull();
    expect(takeVideoHandoff('a-6')).toBeNull();
  });
});
