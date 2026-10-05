/**
 * Les trophées et la vitrine du profil (#9387) : types, clés stables, ordre,
 * visibilité. Un trophée est un objet reçu à un moment précis ; il ne rapporte
 * aucun point.
 */

import { describe, it, expect } from 'vitest';
import {
  FLAME_TROPHY_DAYS,
  ATLAS_DEFAULT_VISIBILITY,
  SHOWCASE_DEFAULT_VISIBILITY,
  capShowcaseVisibility,
  visitorAwardedMonth,
  SHOWCASE_VISIBILITIES,
  canViewShowcase,
  flameTrophiesEarned,
  leagueCupTrophy,
  orderShowcase,
  parseTrophyKey,
  prestigeTrophy,
  seasonCupTrophy,
  sanitizeShowcaseOrder,
  trophyKey,
  flameTrophy,
} from '../../utils/game/trophies.js';

describe('les clés de trophée', () => {
  it('sont stables, lisibles et sans espace', () => {
    expect(trophyKey(leagueCupTrophy({ weekKey: '2026-10-05', league: 'jade', cup: 'gold' }))).toBe('trophy.league-cup.2026-10-05.jade.gold');
    expect(trophyKey(seasonCupTrophy(1))).toBe('trophy.season-cup.1');
    expect(trophyKey(prestigeTrophy(3))).toBe('trophy.prestige.3');
    expect(trophyKey(flameTrophy(365))).toBe('trophy.flame.365');
  });

  it('se relisent à l\'identique', () => {
    const specs = [
      leagueCupTrophy({ weekKey: '2026-10-05', league: 'prisme', cup: 'bronze' }),
      seasonCupTrophy(12),
      prestigeTrophy(5),
      flameTrophy(100),
    ];
    for (const spec of specs) expect(parseTrophyKey(trophyKey(spec))).toEqual(spec);
  });

  it('refusent ce qui n\'est pas une clé du catalogue — jamais une exception', () => {
    for (const bad of [
      '',
      'trophy.',
      'trophy.unknown.1',
      'trophy.prestige.0',
      'trophy.prestige.6',
      'trophy.flame.50',
      'trophy.season-cup.0',
      'trophy.season-cup.x',
      'trophy.league-cup.2026-10-05.jade',
      'trophy.league-cup.2026-10-05.jade.platinum',
      'trophy.league-cup.not-a-day.jade.gold',
      'badge.content.post:10',
    ]) {
      expect(parseTrophyKey(bad)).toBeNull();
    }
  });
});

describe('les trophées de Flamme', () => {
  it('se gagnent à 100 puis 365 jours de série', () => {
    expect([...FLAME_TROPHY_DAYS]).toEqual([100, 365]);
  });

  it('se gagnent une fois, au franchissement du record', () => {
    expect(flameTrophiesEarned({ previousLongest: 99, longest: 100 })).toEqual([100]);
    expect(flameTrophiesEarned({ previousLongest: 0, longest: 400 })).toEqual([100, 365]);
    expect(flameTrophiesEarned({ previousLongest: 100, longest: 200 })).toEqual([]);
    expect(flameTrophiesEarned({ previousLongest: 364, longest: 365 })).toEqual([365]);
  });
});

describe('l\'ordre de la vitrine', () => {
  const owned = [
    { key: trophyKey(leagueCupTrophy({ weekKey: '2026-10-05', league: 'jade', cup: 'bronze' })), awardedAt: '2026-10-12T00:00:00.000Z' },
    { key: trophyKey(prestigeTrophy(1)), awardedAt: '2026-11-01T00:00:00.000Z' },
    { key: trophyKey(leagueCupTrophy({ weekKey: '2026-10-12', league: 'jade', cup: 'gold' })), awardedAt: '2026-10-19T00:00:00.000Z' },
    { key: trophyKey(seasonCupTrophy(1)), awardedAt: '2026-12-07T00:00:00.000Z' },
    { key: trophyKey(flameTrophy(100)), awardedAt: '2026-11-20T00:00:00.000Z' },
  ];

  it('par défaut, le plus précieux d\'abord : Prestige, saison, Flamme, coupes de ligue', () => {
    expect(orderShowcase({ owned, order: [] }).map((k) => k.replace(/\.\d{4}-\d{2}-\d{2}/, ''))).toEqual([
      'trophy.prestige.1',
      'trophy.season-cup.1',
      'trophy.flame.100',
      'trophy.league-cup.jade.gold',
      'trophy.league-cup.jade.bronze',
    ]);
  });

  it('respecte l\'ordre choisi, puis range le reste par valeur', () => {
    const chosen = [owned[4]!.key, owned[0]!.key];
    const ordered = orderShowcase({ owned, order: chosen });
    expect(ordered.slice(0, 2)).toEqual(chosen);
    expect(ordered).toHaveLength(5);
    expect(ordered[2]).toBe(owned[1]!.key);
  });

  it('ignore une clé qu\'on ne possède pas et les doublons', () => {
    const ordered = orderShowcase({ owned, order: ['trophy.prestige.4', owned[0]!.key, owned[0]!.key] });
    expect(ordered[0]).toBe(owned[0]!.key);
    expect(ordered.filter((k) => k === owned[0]!.key)).toHaveLength(1);
    expect(ordered).not.toContain('trophy.prestige.4');
  });

  it('garde un trophée d\'un type que ce client ne connaît pas, en dernier — jamais perdu', () => {
    const ordered = orderShowcase({ owned: [...owned, { key: 'trophy.future.9', awardedAt: '2027-01-01T00:00:00.000Z' }], order: [] });
    expect(ordered.at(-1)).toBe('trophy.future.9');
  });

  it('assainit l\'ordre reçu : possédés, uniques, bornés', () => {
    const keys = owned.map((o) => o.key);
    expect(sanitizeShowcaseOrder({ order: [keys[1]!, 'x', keys[1]!, keys[0]!], ownedKeys: keys })).toEqual([keys[1], keys[0]]);
    expect(sanitizeShowcaseOrder({ order: keys, ownedKeys: [] })).toEqual([]);
  });
});

describe('la visibilité de la vitrine', () => {
  it('se règle comme le rang et le trésor : tout le monde, amis (défaut), moi seul', () => {
    expect([...SHOWCASE_VISIBILITIES]).toEqual(['everyone', 'friends', 'me']);
    expect(SHOWCASE_DEFAULT_VISIBILITY).toBe('friends');
  });

  it('se lit selon la relation du lecteur', () => {
    expect(canViewShowcase({ visibility: 'everyone', viewer: 'other' })).toBe(true);
    expect(canViewShowcase({ visibility: 'friends', viewer: 'other' })).toBe(false);
    expect(canViewShowcase({ visibility: 'friends', viewer: 'friend' })).toBe(true);
    expect(canViewShowcase({ visibility: 'me', viewer: 'friend' })).toBe(false);
    expect(canViewShowcase({ visibility: 'me', viewer: 'self' })).toBe(true);
    expect(canViewShowcase({ visibility: 'me', viewer: 'admin' })).toBe(true);
  });

  it('ferme tout sur une valeur inconnue — fail-closed', () => {
    expect(canViewShowcase({ visibility: 'public' as never, viewer: 'other' })).toBe(false);
    expect(canViewShowcase({ visibility: 'public' as never, viewer: 'self' })).toBe(true);
  });
});

describe('ce qui plafonne la vitrine', () => {
  it('plafonne à « amis » quand le profil est caché de la recherche (même règle que #8285)', () => {
    expect(capShowcaseVisibility({ visibility: 'everyone', hideProfileFromSearch: true, gameHidden: false })).toBe('friends');
    expect(capShowcaseVisibility({ visibility: 'friends', hideProfileFromSearch: true, gameHidden: false })).toBe('friends');
    expect(capShowcaseVisibility({ visibility: 'me', hideProfileFromSearch: true, gameHidden: false })).toBe('me');
  });

  it('ramène à « moi seul » quand le jeu est masqué', () => {
    expect(capShowcaseVisibility({ visibility: 'everyone', hideProfileFromSearch: false, gameHidden: true })).toBe('me');
    expect(capShowcaseVisibility({ visibility: 'friends', hideProfileFromSearch: true, gameHidden: true })).toBe('me');
  });

  it('ne change rien sans réglage de discrétion', () => {
    expect(capShowcaseVisibility({ visibility: 'everyone', hideProfileFromSearch: false, gameHidden: false })).toBe('everyone');
  });

  it('ferme tout sur une valeur inconnue — fail-closed', () => {
    expect(capShowcaseVisibility({ visibility: 'public' as never, hideProfileFromSearch: false, gameHidden: false })).toBe('me');
  });
});

describe('ce qu\'un trophée révèle à un visiteur', () => {
  it('ne rend que le MOIS d\'obtention, jamais l\'horodatage précis', () => {
    expect(visitorAwardedMonth('2026-11-01T08:42:17.000Z')).toBe('2026-11');
    expect(visitorAwardedMonth('2026-12-31T23:59:59.999Z')).toBe('2026-12');
  });

  it('ne rend rien d\'une date illisible', () => {
    expect(visitorAwardedMonth('hier')).toBeNull();
    expect(visitorAwardedMonth('')).toBeNull();
  });
});

describe('l\'Atlas dans la vitrine', () => {
  it('est PRIVÉ par défaut — une langue peut révéler une origine ou une conviction, quel que soit le réglage de la vitrine', () => {
    expect(ATLAS_DEFAULT_VISIBILITY).toBe('me');
    expect(SHOWCASE_DEFAULT_VISIBILITY).toBe('friends');
  });
});
