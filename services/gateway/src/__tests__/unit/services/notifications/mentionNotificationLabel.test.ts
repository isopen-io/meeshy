/**
 * « X vous a référencé dans son … » — un libellé par type de contenu.
 *
 * Quatre et non cinq : STATUS et MOOD sont le même type (`PostType` vaut
 * POST | REEL | STORY | STATUS), MOOD n'étant que son nom produit. Le catalogue
 * connaît pourtant `NotificationPostKind = 'POST'|'STORY'|'MOOD'|'STATUS'|'REEL'`
 * — les deux valeurs peuvent donc arriver, et se rabattent sur le même libellé.
 *
 * @jest-environment node
 */

import { describe, it, expect } from '@jest/globals';
import { buildNotificationDisplay } from '@meeshy/shared/utils/notification-strings';

describe('user_mentioned — libellé par type de contenu', () => {
  const cases = [
    { postType: 'POST', expected: 'publication' },
    { postType: 'REEL', expected: 'réel' },
    { postType: 'STORY', expected: 'story' },
    { postType: 'STATUS', expected: 'statut' },
    { postType: 'MOOD', expected: 'statut' },
  ] as const;

  for (const { postType, expected } of cases) {
    it(`nomme un ${postType} dans le titre`, () => {
      const display = buildNotificationDisplay('fr', {
        type: 'user_mentioned',
        actorName: 'Alice',
        postType,
      } as never);

      expect(display.title?.toLowerCase()).toContain(expected);
    });
  }

  it('retombe sur « vous a mentionné » sans type de contenu (conversation)', () => {
    const display = buildNotificationDisplay('fr', {
      type: 'user_mentioned',
      actorName: 'Alice',
    } as never);

    expect(display.title).toBe('Alice vous a mentionné');
  });
});
