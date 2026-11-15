/**
 * Les étapes des niveaux (#9706) : une étape simple tous les dix niveaux, de 10 à 100. Ce qui se vérifie :
 * la table du porteur, chaque étape faite ou à faire, le niveau qui attend au palier précédent puis monte
 * d'un coup, la prochaine étape montrée, et le plafond servi (rang et étapes ensemble).
 */

import { describe, expect, it } from 'vitest';
import {
  LEVEL_STEPS,
  LEVEL_STEP_MISSIONS_COUNTED,
  levelCapWithSteps,
  levelStepGate,
  levelStepsOf,
  nextLevelStep,
  type LevelStepFacts,
} from '../../utils/game/level-steps.js';
import { levelOnTheWire, mintOnTheWire } from '../../utils/game/level-wire.js';
import { levelCapForRank } from '../../utils/game/glory.js';
import { previewMint } from '../../utils/game/mint.js';
import { levelProgress, levelThreshold } from '../../utils/game/levels.js';

const facts = (over: Partial<LevelStepFacts> = {}): LevelStepFacts => ({
  minted: 0,
  missionsDone: 0,
  flameRecord: 0,
  glory: 0,
  rank: 'murmure',
  ...over,
});

const all = (): LevelStepFacts => facts({ minted: 5, missionsDone: 10, flameRecord: 30, glory: 35_000, rank: 'passeur' });

describe('la table du porteur', () => {
  it('pose une étape par dizaine, de 10 à 100', () => {
    expect(LEVEL_STEPS.map((rule) => rule.level)).toEqual([10, 20, 30, 40, 50, 60, 70, 80, 90, 100]);
    expect(LEVEL_STEPS.map((rule) => (rule.kind === 'rank' ? `rank:${rule.rank}` : `${rule.kind}:${rule.target}`))).toEqual([
      'mint:1',
      'missions:1',
      'rank:echo',
      'flame:7',
      'missions:10',
      'rank:voix',
      'mint:5',
      'rank:conteur',
      'flame:30',
      'rank:passeur',
    ]);
  });

  it('ne compte pas les missions plus loin que la plus grande cible', () => {
    expect(LEVEL_STEP_MISSIONS_COUNTED).toBe(10);
  });
});

describe('le palier des étapes', () => {
  it('retient sous la première étape manquante', () => {
    expect(levelStepGate(facts())).toBe(9);
    expect(levelStepGate(facts({ minted: 1 }))).toBe(19);
    expect(levelStepGate(facts({ minted: 1, missionsDone: 1 }))).toBe(29);
    expect(levelStepGate(facts({ minted: 1, missionsDone: 1, rank: 'echo' }))).toBe(39);
    expect(levelStepGate(facts({ minted: 1, missionsDone: 1, rank: 'echo', flameRecord: 7 }))).toBe(49);
    expect(levelStepGate(facts({ minted: 1, missionsDone: 10, rank: 'echo', flameRecord: 7 }))).toBe(59);
    expect(levelStepGate(facts({ minted: 1, missionsDone: 10, rank: 'voix', flameRecord: 7 }))).toBe(69);
    expect(levelStepGate(facts({ minted: 5, missionsDone: 10, rank: 'voix', flameRecord: 7 }))).toBe(79);
    expect(levelStepGate(facts({ minted: 5, missionsDone: 10, rank: 'conteur', flameRecord: 7 }))).toBe(89);
    expect(levelStepGate(facts({ minted: 5, missionsDone: 10, rank: 'conteur', flameRecord: 30 }))).toBe(99);
    expect(levelStepGate(all())).toBeNull();
  });

  it('garde l\'ordre : une étape haute faite n\'ouvre pas une étape basse manquante', () => {
    expect(levelStepGate(facts({ minted: 0, missionsDone: 10, flameRecord: 30, glory: 35_000, rank: 'passeur' }))).toBe(9);
  });

  it('juge un rang sur le rang servi : le Mythe vaut tous les rangs', () => {
    expect(levelStepGate(facts({ minted: 5, missionsDone: 10, flameRecord: 30, glory: 0, rank: 'mythe' }))).toBeNull();
    expect(levelStepGate(facts({ minted: 5, missionsDone: 10, flameRecord: 30, glory: 35_000, rank: 'conteur' }))).toBe(99);
  });

  it('sans faits, ne retient rien (un serveur d\'avant les étapes)', () => {
    expect(levelStepGate(null)).toBeNull();
  });

  it('lit un compteur illisible comme zéro', () => {
    expect(levelStepGate(facts({ minted: Number.NaN }))).toBe(9);
  });
});

describe('les points sont là, l\'étape manque', () => {
  const score = levelThreshold(15);

  it('le niveau attend au palier précédent', () => {
    const p = levelProgress(score, levelCapForRank('murmure'), levelStepGate(facts()));
    expect(p.level).toBe(9);
    expect(p.held).toBe(true);
  });

  it('remplie après coup, le niveau monte d\'un coup', () => {
    const p = levelProgress(score, levelCapForRank('murmure'), levelStepGate(facts({ minted: 1 })));
    expect(p.level).toBe(15);
    expect(p.held).toBe(false);
  });

  it('remplie d\'avance, elle ne fait rien de plus que les points', () => {
    expect(levelProgress(levelThreshold(5), null, levelStepGate(facts({ minted: 1 }))).level).toBe(5);
  });
});

describe('la prochaine étape', () => {
  it('montre l\'étape du 10 à un niveau retenu à 9, à faire', () => {
    expect(nextLevelStep(9, facts())).toEqual({ level: 10, kind: 'mint', target: 1, current: 0, met: false, rank: null });
  });

  it('montre une étape déjà faite, avant que les points n\'y soient', () => {
    expect(nextLevelStep(12, facts({ minted: 1, missionsDone: 3 }))).toEqual({
      level: 20,
      kind: 'missions',
      target: 1,
      current: 3,
      met: true,
      rank: null,
    });
  });

  it('mesure un rang en Gloire, vers le seuil du rang', () => {
    expect(nextLevelStep(29, facts({ glory: 1200 }))).toEqual({ level: 30, kind: 'rank', target: 2000, current: 1200, met: false, rank: 'echo' });
  });

  it('se tait au-delà de 100, et sans faits', () => {
    expect(nextLevelStep(100, all())).toBeNull();
    expect(nextLevelStep(640, all())).toBeNull();
    expect(nextLevelStep(5, null)).toBeNull();
  });

  it('dit toutes les étapes pour le carnet des règles', () => {
    const steps = levelStepsOf(facts({ minted: 2, flameRecord: 9 }));
    expect(steps).toHaveLength(10);
    expect(steps.filter((step) => step.met).map((step) => step.level)).toEqual([10, 40]);
  });
});

describe('le plafond servi', () => {
  it('prend le plus serré du rang et des étapes', () => {
    expect(levelCapWithSteps({ rank: 'murmure', steps: facts() })).toBe(9);
    expect(levelCapWithSteps({ rank: 'passeur', steps: all() })).toBe(499);
    expect(levelCapWithSteps({ rank: 'oracle', steps: { ...all(), rank: 'oracle' } })).toBeNull();
    expect(levelCapWithSteps({ rank: 'murmure', steps: null })).toBe(499);
  });
});

describe('le fil', () => {
  it('sert le niveau retenu aux anciens clients comme aux nouveaux, et dit pourquoi', () => {
    const wire = levelOnTheWire({ score: levelThreshold(15), levelCap: 499, levelRecord: 9, prestige: 0, steps: facts() });
    expect(wire.level).toBe(9);
    expect(wire.pointsToNext).toBe(0);
    expect(wire.ladder?.level).toBe(9);
    expect(wire.ladder?.held).toBe(true);
    expect(wire.ladder?.isMax).toBe(false);
    expect(wire.ladder?.step).toEqual({ level: 10, kind: 'mint', target: 1, current: 0, met: false, rank: null });
    expect(wire.ladder?.steps).toEqual({ minted: 0, missionsDone: 0, flameRecord: 0 });
  });

  it('ne retient pas le Prestige derrière les seuls points', () => {
    const held = levelOnTheWire({ score: 1_000_000, levelCap: 499, levelRecord: 99, prestige: 0, steps: { ...all(), rank: 'conteur', glory: 15_000 } });
    expect(held.canPrestige).toBe(false);
    expect(held.ladder?.level).toBe(99);
    const open = levelOnTheWire({ score: 1_000_000, levelCap: 499, levelRecord: 99, prestige: 0, steps: all() });
    expect(open.canPrestige).toBe(true);
    expect(open.ladder?.record).toBe(100);
  });

  it('sans faits, sert la lecture des points et du rang', () => {
    const wire = levelOnTheWire({ score: levelThreshold(15), levelCap: 499, levelRecord: null, prestige: 0, steps: null });
    expect(wire.ladder?.level).toBe(15);
    expect(wire.ladder?.held).toBe(false);
    expect(wire.ladder?.step).toBeNull();
    expect(wire.ladder?.steps).toBeNull();
  });
});

describe('la frappe fait une étape', () => {
  it('frapper la première Meesh ouvre le niveau 10 : le niveau d\'après MONTE', () => {
    const preview = previewMint({
      score: 15_000,
      mintedLifetime: 0,
      debitablePoints: 15_000,
      levelCap: 499,
      steps: { missionsDone: 0, flameRecord: 0, glory: 0, rank: 'murmure' },
    });
    expect(preview.levelBefore).toBe(9);
    expect(preview.levelAfter).toBe(11);
    expect(preview.levelsLost).toBe(0);
  });

  it('sur le fil, la frappe qui fait monter ne perd rien — ni dans les champs d\'hier, ni dans ladder', () => {
    const wire = mintOnTheWire(
      previewMint({
        score: 15_000,
        mintedLifetime: 0,
        debitablePoints: 15_000,
        levelCap: 499,
        steps: { missionsDone: 0, flameRecord: 0, glory: 0, rank: 'murmure' },
      }),
    );
    expect(wire).toMatchObject({ levelBefore: 9, levelAfter: 11, levelsLost: 0, ladder: { levelBefore: 9, levelAfter: 11, levelsLost: 0 } });
  });

  it('sa Gloire peut faire passer le rang de l\'étape', () => {
    const preview = previewMint({
      score: levelThreshold(35),
      mintedLifetime: 3,
      debitablePoints: levelThreshold(35),
      levelCap: 499,
      steps: { missionsDone: 1, flameRecord: 0, glory: 1500, rank: 'murmure' },
    });
    expect(preview.levelBefore).toBe(29);
    expect(preview.levelAfter).toBe(34);
  });
});
