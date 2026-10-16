import { describe, expect, test } from 'bun:test';

import { mintBadgeImpact } from './game-mint';

/**
 * LA FRAPPE N'ÉTEINT PLUS AUCUN BADGE (porteur, 2026-10-16, #10845) : elle dépense la poche d'étincelles seule. L'aperçu dit
 * toujours « aucun badge ne s'éteint », quels que soient les compteurs — y compris ceux dont l'ancienne loi aurait fait
 * tomber deux paliers.
 */
describe('mintBadgeImpact', () => {
  test('un axe à 100 actions et 2000 points : aucun palier ne tombe', () => {
    const counters = [{ axisKey: 'content.text_message', count: 100, points: 2000 }];
    expect(mintBadgeImpact(counters, 1221)).toEqual({ lost: 0, regain: 0 });
  });

  test('un serveur qui ne sert pas les points : le même verdict, il n\'y a plus rien à calculer', () => {
    expect(mintBadgeImpact([{ axisKey: 'content.text_message', count: 100 }], 1221)).toEqual({ lost: 0, regain: 0 });
  });

  test('les conversations non plus', () => {
    expect(mintBadgeImpact([{ axisKey: 'conversation.private', count: 60, points: 3000 }], 1221)).toEqual({ lost: 0, regain: 0 });
  });
});
