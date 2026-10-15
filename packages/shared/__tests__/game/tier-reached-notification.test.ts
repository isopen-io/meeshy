/**
 * LA NOTIFICATION D'UN PALIER (#10298) — le palier ET l'exploit, dans les huit
 * langues du catalogue, nombres à la locale du lecteur, jamais une clé ni un
 * gabarit non résolu.
 */

import { describe, it, expect } from 'vitest';
import { CERCLES_FAMILIES, familyId } from '../../types/achievement-families.js';
import { NOTIFICATION_LANGUAGES } from '../../utils/notification-strings.js';
import { tierReachedNotification, type TierReached } from '../../utils/tier-reached-notification.js';

const conversationsRejointes = CERCLES_FAMILIES.find((f) => familyId(f) === 'conversation.join.count');
if (!conversationsRejointes) throw new Error('famille absente du catalogue');

const CASES: readonly TierReached[] = [
  { kind: 'achievement', family: conversationsRejointes, tier: 1_000 },
  { kind: 'badge', axisKey: 'comment.text', threshold: 1_000 },
  { kind: 'level', threshold: 1_000 },
];

describe('tierReachedNotification', () => {
  it('dit en français le palier en titre, l’exploit chiffré et le palier en corps', () => {
    expect(tierReachedNotification('fr', CASES[0])).toEqual({
      title: '🏆 Palier 4 atteint',
      body: '1\u202f000 conversations rejointes — bravo, vous êtes au palier 4 !',
      rank: 4,
      value: 1_000,
    });
    expect(tierReachedNotification('fr', CASES[1])).toMatchObject({
      title: '🏆 Palier 6 atteint',
      body: 'Commentaires écrits : 1\u202f000 — bravo, vous êtes au palier 6 !',
    });
    expect(tierReachedNotification('fr', CASES[2])).toMatchObject({
      title: '⭐ Niveau 5 atteint !',
      body: '1\u202f000 points — bravo, vous êtes au niveau 5 !',
    });
  });

  it.each(NOTIFICATION_LANGUAGES)('se compose entièrement en %s', (lang) => {
    for (const reached of CASES) {
      const banner = tierReachedNotification(lang, reached);
      expect(banner).not.toBeNull();
      expect(banner!.title).not.toMatch(/[{}]/);
      expect(banner!.body).not.toMatch(/[{}]/);
      expect(banner!.body).toContain(String(banner!.rank));
    }
  });

  it('n’annonce rien pour une valeur hors de son échelle', () => {
    expect(tierReachedNotification('fr', { kind: 'badge', axisKey: 'comment.text', threshold: 999 })).toBeNull();
    expect(tierReachedNotification('fr', { kind: 'level', threshold: 7 })).toBeNull();
  });
});
