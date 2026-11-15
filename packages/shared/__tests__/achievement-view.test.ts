/**
 * La grammaire des succès et sa fenêtre d'affichage (#5758).
 */

import { describe, it, expect } from 'vitest';
import {
  achievementKey,
  difficultyOf,
  type AchievementFamily,
} from '../types/achievement-catalog.js';
import {
  expandCatalog,
  isAttainable,
  sectionViews,
  windowSize,
  ACHIEVEMENT_WINDOW_MINIMUM,
} from '../utils/achievement-view.js';

const rejoindreTaille: AchievementFamily = {
  section: 'cercles',
  subject: 'conversation',
  verb: 'join',
  scale: 'size',
  baseDifficulty: 1,
};
const rejoindreVolume: AchievementFamily = {
  section: 'cercles',
  subject: 'conversation',
  verb: 'join',
  scale: 'count',
  baseDifficulty: 2,
};
const envoyerVolume: AchievementFamily = {
  section: 'parole',
  subject: 'message',
  verb: 'send',
  scale: 'count',
  baseDifficulty: 0,
};

const sansMesure = new Map<string, number>();
const rien = new Map<string, string | null>();

describe('la clé composée', () => {
  it('nomme la section, le sujet, le geste, l\'échelle et le palier', () => {
    expect(achievementKey(rejoindreTaille, 1000)).toBe(
      'achievement.cercles.conversation.join.size:1000',
    );
    expect(achievementKey(envoyerVolume, 10000)).toBe('achievement.parole.message.send.count:10000');
  });
});

describe('l\'atteignabilité est MESURÉE, pas déclarée', () => {
  it('masque un palier d\'AMPLEUR que le produit ne peut pas rendre vrai', () => {
    // La plus grande conversation compte 300 membres.
    const reach = new Map([['conversation.join.size', 300]]);
    expect(isAttainable(rejoindreTaille, 100, reach)).toBe(true);
    expect(isAttainable(rejoindreTaille, 1000, reach)).toBe(false);
    expect(isAttainable(rejoindreTaille, 1_000_000, reach)).toBe(false);
  });

  it('masque TOUTE ampleur non mesurée — on ne promet pas ce qu\'on ignore', () => {
    expect(isAttainable(rejoindreTaille, 10, sansMesure)).toBe(false);
  });

  it('laisse le VOLUME visible sans mesure — répéter n\'est pas impossible, juste long', () => {
    expect(isAttainable(envoyerVolume, 10_000, sansMesure)).toBe(true);
  });
});

describe('l\'ordre va du moins complexe au plus complexe', () => {
  it('range par CRANS, pas par palier brut', () => {
    // « 100 conversations rejointes » (base 2 + 2 crans = 4) est plus dur que
    // « une conversation de 1 000 membres » (base 1 + 3 crans = 4)… à égalité,
    // et strictement plus dur au palier suivant. Le palier brut, lui, dirait
    // l'inverse — c'est exactement le classement absurde qu'on évite.
    expect(difficultyOf(rejoindreVolume, 100)).toBeCloseTo(4, 6);
    expect(difficultyOf(rejoindreTaille, 1000)).toBeCloseTo(4, 6);
    expect(difficultyOf(rejoindreVolume, 1000)).toBeGreaterThan(difficultyOf(rejoindreTaille, 1000));
  });

  it('développe le catalogue dans l\'ordre croissant de difficulté', () => {
    const reach = new Map([['conversation.join.size', 1_000_000]]);
    const entries = expandCatalog({
      families: [rejoindreVolume, rejoindreTaille, envoyerVolume],
      reach,
      unlocked: rien,
    });
    const difficultes = entries.map((e) => e.difficulty);
    expect([...difficultes].sort((a, b) => a - b)).toEqual(difficultes);
  });

  it('exclut du catalogue les paliers inatteignables', () => {
    const reach = new Map([['conversation.join.size', 300]]);
    const entries = expandCatalog({ families: [rejoindreTaille], reach, unlocked: rien });
    expect(entries.map((e) => e.tier)).toEqual([10, 100]);
  });
});

describe('la fenêtre : sept, puis deux par deux', () => {
  it('montre sept entrées à un compte qui n\'a rien décroché', () => {
    expect(windowSize(0)).toBe(ACHIEVEMENT_WINDOW_MINIMUM);
  });

  it('reste à sept tant que les acquis n\'atteignent pas cinq', () => {
    // 5 acquis + 2 = 7 : la fenêtre ne rétrécit jamais, elle s'ouvre.
    expect(windowSize(3)).toBe(7);
    expect(windowSize(5)).toBe(7);
  });

  it('s\'ouvre de deux au-delà — le prochain objectif est TOUJOURS visible', () => {
    expect(windowSize(6)).toBe(8);
    expect(windowSize(40)).toBe(42);
    expect(windowSize(1000)).toBe(1002);
  });

  it('traite une valeur négative ou non finie comme zéro', () => {
    expect(windowSize(-5)).toBe(7);
    expect(windowSize(Number.NaN)).toBe(7);
  });
});

describe('les sections, une rangée chacune', () => {
  const reach = new Map([['conversation.join.size', 1_000_000]]);

  it('range les entrées par section et tronque chacune à SA fenêtre', () => {
    const entries = expandCatalog({
      families: [rejoindreTaille, rejoindreVolume, envoyerVolume],
      reach,
      unlocked: rien,
    });
    const vues = sectionViews(entries);
    const cercles = vues.find((v) => v.section === 'cercles');
    expect(cercles?.entries.length).toBe(7);
    // 6 paliers d'ampleur + 5 de volume = 11 atteignables, 7 montrés.
    expect(cercles?.attainableCount).toBe(11);
  });

  it('ouvre la fenêtre d\'une section quand SES succès tombent, sans toucher aux autres', () => {
    const acquis = new Map<string, string | null>([
      [achievementKey(rejoindreTaille, 10), '2026-09-08T00:00:00.000Z'],
      [achievementKey(rejoindreTaille, 100), '2026-09-08T00:00:00.000Z'],
      [achievementKey(rejoindreTaille, 1000), '2026-09-08T00:00:00.000Z'],
      [achievementKey(rejoindreVolume, 1), '2026-09-08T00:00:00.000Z'],
      [achievementKey(rejoindreVolume, 10), '2026-09-08T00:00:00.000Z'],
      [achievementKey(rejoindreVolume, 100), '2026-09-08T00:00:00.000Z'],
    ]);
    const entries = expandCatalog({
      families: [rejoindreTaille, rejoindreVolume, envoyerVolume],
      reach,
      unlocked: acquis,
    });
    const vues = sectionViews(entries);
    expect(vues.find((v) => v.section === 'cercles')?.entries.length).toBe(8); // 6 + 2
    expect(vues.find((v) => v.section === 'parole')?.entries.length).toBe(5); // 5 atteignables seulement
  });

  it('porte la date d\'obtention d\'un succès décroché', () => {
    const acquis = new Map<string, string | null>([
      [achievementKey(envoyerVolume, 1), '2026-09-08T12:00:00.000Z'],
    ]);
    const entries = expandCatalog({ families: [envoyerVolume], reach, unlocked: acquis });
    const premier = entries[0];
    expect(premier.unlocked).toBe(true);
    expect(premier.reachedAt).toBe('2026-09-08T12:00:00.000Z');
  });

  it('retire une section dont aucun palier n\'est atteignable', () => {
    const entries = expandCatalog({ families: [rejoindreTaille], reach: sansMesure, unlocked: rien });
    expect(sectionViews(entries)).toHaveLength(0);
  });
});
