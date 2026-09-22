import { describe, expect, test } from 'bun:test';

import { attachmentOpenReport } from './attachment-open-report';

/**
 * `attachmentOpenReport` (#7363, W6) — miroir pur de
 * `DocumentOpenReport.bodyForOpening(isMine:)`.
 */
describe('attachmentOpenReport (#7363, W6)', () => {
  test('pièce REÇUE ⇒ action "viewed", jamais "downloaded"', () => {
    expect(attachmentOpenReport({ isMine: false })).toEqual({
      action: 'viewed',
      playPositionMs: 0,
      durationMs: 0,
      complete: true,
    });
  });

  test('SA PROPRE pièce ⇒ aucun rapport (pas d’auto-déclaration)', () => {
    expect(attachmentOpenReport({ isMine: true })).toBe(null);
  });
});
