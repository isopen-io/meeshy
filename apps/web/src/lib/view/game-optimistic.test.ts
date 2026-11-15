import { describe, expect, test } from 'bun:test';

import { resolveEngagementProgress } from '@meeshy/shared/utils/engagement-progress';

import { ENGAGEMENT_PROGRESS_FIXTURE } from '@/lib/api/engagement-fixture';
import { gameBlockFixture } from '@/lib/api/game-fixture';
import type { EngagementWithGame } from '@/lib/api/engagement';

import {
  afterChestOpening,
  afterFreeze,
  afterMint,
  afterMintUnlessServed,
  afterRelight,
  afterReroll,
  withChestReward,
  withRelit,
  withRerolled,
} from './game-optimistic';

/**
 * LES MISES À JOUR OPTIMISTES (#9383) — chaque geste se voit tout de suite,
 * calculé par la MÊME loi que la passerelle (niveau, rang, trésor, prix) ;
 * la relecture qui suit rend la vérité, et un échec restaure l'instantané.
 */

const view = (patch: Parameters<typeof gameBlockFixture>[0] = {}): EngagementWithGame => ({
  ...resolveEngagementProgress(ENGAGEMENT_PROGRESS_FIXTURE),
  game: gameBlockFixture(patch),
});

const gameOf = (value: EngagementWithGame) => {
  if (value.game === undefined) throw new Error('le bloc game est attendu');
  return value.game;
};

describe('afterMint — la pièce tombe, le niveau redescend, le trésor monte', () => {
  const before = view();
  const after = afterMint(before);

  test('le niveau baisse du prix de la frappe', () => {
    expect(gameOf(after).level.score).toBe(gameOf(before).level.score - gameOf(before).mint.price);
    expect(gameOf(after).level.level).toBeLessThan(gameOf(before).level.level);
  });

  test('le record, lui, ne baisse pas', () => {
    expect(gameOf(after).level.record).toBe(gameOf(before).level.record);
  });

  test('le trésor gagne une Meesh', () => {
    expect(gameOf(after).treasury.held).toBe(gameOf(before).treasury.held + 1);
    expect(after.meesh?.balance).toBe((before.meesh?.balance ?? 0) + 1);
  });

  test('la Gloire monte de ce que l’aperçu annonçait', () => {
    expect(gameOf(after).glory.glory).toBe(gameOf(before).glory.glory + gameOf(before).mint.gloryGained);
  });

  test('la prochaine Meesh porte le numéro suivant', () => {
    expect(gameOf(after).mint.number).toBe(gameOf(before).mint.number + 1);
  });

  test('le Vent arrière s’allume : le niveau est sous le record', () => {
    expect(gameOf(after).boosts.tailwind).toBe(1.25);
  });

  test('une frappe impossible ne change RIEN', () => {
    const poor = view({ score: 100, debitablePoints: 100 });
    expect(afterMint(poor)).toBe(poor);
  });

  test('sans bloc game, la progression est rendue telle quelle', () => {
    const legacy = resolveEngagementProgress(ENGAGEMENT_PROGRESS_FIXTURE);
    expect(afterMint(legacy)).toBe(legacy);
  });
});

describe('afterMint avec les étincelles (#10892) — la poche paie et fait le niveau, le cumul reste', () => {
  const sparks = { pocket: 40_000, cycle: 90_000, lifetime: 250_000, debt: 0 };
  const before = view({ score: sparks.pocket, debitablePoints: sparks.pocket, sparks, levelMaxLifetime: 30 });
  const after = afterMint(before);

  test('la poche perd le prix, le niveau se relit sur elle', () => {
    expect(gameOf(after).level.sparks).toBe(sparks.pocket - gameOf(before).mint.price);
    expect(gameOf(after).level.score).toBe(sparks.pocket - gameOf(before).mint.price);
    expect(gameOf(after).level.ladder?.level).toBeLessThan(gameOf(before).level.ladder?.level ?? 0);
  });

  test('le cumul depuis le Prestige, le total à vie et le niveau max à vie restent', () => {
    expect(gameOf(after).level.sparksCycle).toBe(sparks.cycle);
    expect(gameOf(after).level.sparksLifetime).toBe(sparks.lifetime);
    expect(gameOf(after).level.levelMaxLifetime).toBe(30);
  });

  test('le Vent arrière suit la loi des étincelles : 7 niveaux ou plus sous le record (#10896)', () => {
    const level = gameOf(after).level;
    const gap = (level.ladder?.record ?? level.record) - (level.ladder?.level ?? level.level);
    expect(gameOf(after).boosts.tailwind).toBe(gap >= 7 ? 1.25 : 1);
  });

  test('le prix suivant porte le facteur du niveau d’après, jamais le prix de rang nu (#10898)', () => {
    const next = gameOf(after).mint;
    expect(next.basePrice).toBe(1221);
    expect(next.price).toBeLessThan(1221);
    expect(next.price).toBe(Math.round((1221 * Math.round((next.costFactor ?? 0) * 1000)) / 1000));
  });

  test('le compteur de Meeshes lit le même prix suivant que le héro de frappe (#10898)', () => {
    expect(after.meesh?.mintCost).toBe(gameOf(after).mint.price);
    expect(after.meesh?.missingPoints).toBe(gameOf(after).mint.missingPoints);
  });
});

describe('afterMintUnlessServed — une frappe ne se débite qu’une fois (#10898)', () => {
  const sparks = { pocket: 40_000, cycle: 40_000, lifetime: 40_000, debt: 0 };
  const before = view({ score: sparks.pocket, debitablePoints: sparks.pocket, sparks });
  const numberBefore = gameOf(before).mint.number;

  test('sur la lecture d’avant la frappe, la frappe s’applique', () => {
    expect(afterMintUnlessServed(before, numberBefore)).toEqual(afterMint(before));
  });

  test('sur une relecture servie qui la porte déjà, rien ne bouge : la poche ne paie pas deux fois', () => {
    const served = afterMint(before);
    expect(afterMintUnlessServed(served, numberBefore)).toBe(served);
  });
});

describe('le gel et le changement de mission coûtent une Meesh', () => {
  test('un gel : un de plus en réserve, une Meesh de moins', () => {
    const before = view();
    const after = afterFreeze(before);
    expect(gameOf(after).flame.freezes).toBe(gameOf(before).flame.freezes + 1);
    expect(gameOf(after).treasury.held).toBe(gameOf(before).treasury.held - gameOf(before).flame.freezePrice);
  });

  test('changer une mission : une Meesh de moins et plus de changement possible aujourd’hui', () => {
    const before = view();
    expect(gameOf(before).missions.rerollAvailable).toBe(true);
    const after = afterReroll(before);
    expect(gameOf(after).missions.rerollAvailable).toBe(false);
    expect(gameOf(after).treasury.held).toBe(gameOf(before).treasury.held - 1);
  });

  test('la mission servie remplace l’ancienne, au même rang', () => {
    const before = view();
    const replacement = { ...gameOf(before).missions.items[1]!, id: 'm-new', templateKey: 'comment-text', progress: 0 };
    const after = withRerolled(afterReroll(before), 'm-medium', replacement, 3);
    expect(gameOf(after).missions.items.map((m) => m.id)).toEqual(['m-easy', 'm-new', 'm-hard']);
    expect(gameOf(after).treasury.held).toBe(3);
  });
});

describe('le coffre', () => {
  test('il s’ouvre tout de suite, sans contenu connu', () => {
    const ready = view({
      missions: gameOf(view()).missions.items.map((m) => ({ ...m, completedAt: '2026-10-05T10:00:00.000Z', progress: m.target })),
    });
    expect(gameOf(ready).chest.status).toBe('ready');
    const opening = afterChestOpening(ready);
    expect(gameOf(opening).chest.status).toBe('claimed');
    expect(gameOf(opening).chest.reward).toBeNull();
  });

  test('le contenu servi s’y pose, le score avec', () => {
    const reward = { points: 120, fragment: true, freeze: false };
    const after = withChestReward(afterChestOpening(view()), reward, 1500);
    expect(gameOf(after).chest.reward).toEqual(reward);
    expect(gameOf(after).level.score).toBe(1500);
  });
});

describe('la Flamme', () => {
  test('rallumer : éteinte → allumée, le prix part du trésor', () => {
    const out = view({
      streak: 9,
      lastActiveDay: '2026-10-03',
      broken: { streak: 9, lastActiveDay: '2026-10-03' },
      freezes: 0,
      balance: 5,
    });
    expect(gameOf(out).flame.status).toBe('out');
    const after = afterRelight(out);
    expect(gameOf(after).flame.status).toBe('lit');
    expect(gameOf(after).flame.canRelight).toBe(false);
    expect(gameOf(after).treasury.held).toBe(5 - gameOf(out).flame.relightPrice);
  });

  test('la série servie fixe les jours, la forme et le bonus', () => {
    const out = view({ streak: 9, lastActiveDay: '2026-10-03', broken: { streak: 9, lastActiveDay: '2026-10-03' }, freezes: 0 });
    const after = withRelit(afterRelight(out), 9, 2);
    expect(gameOf(after).flame.days).toBe(9);
    expect(gameOf(after).flame.form).toBe('flamme');
    expect(gameOf(after).flame.bonusPercent).toBe(18);
    expect(gameOf(after).treasury.held).toBe(2);
  });
});
