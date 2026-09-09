/**
 * CE QUE L'ÉCRAN MONTRE DES SUCCÈS (#5758) — l'ordre, l'atteignabilité, et la
 * fenêtre qui s'ouvre deux par deux.
 *
 * Trois règles du porteur, toutes appliquées ici et nulle part ailleurs, pour
 * que le web et iOS montrent exactement la même chose :
 *
 *  1. « ordonnées du moins complexe au plus complexe » ;
 *  2. « ne doivent s'afficher que par palier et seulement si ATTEIGNABLE » ;
 *  3. « affiche les 7 premiers de chaque section et à chaque fois fait
 *     apparaître les 2 suivants à réaliser, 2 par 2 ».
 *
 * La troisième se formule d'une ligne : `visible = max(7, acquis + 2)`. Elle a
 * une propriété qu'il faut voir pour comprendre pourquoi elle est bonne — **le
 * prochain objectif est TOUJOURS visible**, quel que soit l'avancement. Un
 * catalogue de milliers d'entrées n'écrase donc jamais l'écran, et n'a jamais
 * l'air fini non plus.
 */

import {
  achievementKey,
  difficultyOf,
  reachKey,
  tiersOf,
  type AchievementFamily,
  type AchievementReach,
  type AchievementSection,
} from '../types/achievement-catalog.js';

/** Le nombre d'entrées qu'une section montre au minimum. */
export const ACHIEVEMENT_WINDOW_MINIMUM = 7;

/** De combien la fenêtre s'ouvre à chaque succès décroché. */
export const ACHIEVEMENT_WINDOW_STEP = 2;

export type AchievementEntry = {
  readonly key: string;
  readonly section: AchievementSection;
  readonly family: AchievementFamily;
  readonly tier: number;
  readonly difficulty: number;
  readonly unlocked: boolean;
  /** ISO 8601 du palier gravé, `null` tant qu'il ne l'est pas. */
  readonly reachedAt: string | null;
};

export type AchievementSectionView = {
  readonly section: AchievementSection;
  /** Ce que l'écran rend, dans l'ordre — déjà tronqué par la fenêtre. */
  readonly entries: readonly AchievementEntry[];
  readonly unlockedCount: number;
  /** Le total ATTEIGNABLE, jamais le total déclaré : promettre l'inatteignable est un mensonge. */
  readonly attainableCount: number;
};

/**
 * Un palier est ATTEIGNABLE si le produit peut le rendre vrai.
 *
 * `size` sans mesure ⇒ masqué : on ne promet pas « une conversation de
 * 1 000 000 membres » quand on ignore si une telle conversation peut exister.
 * `count` sans mesure ⇒ visible : rien n'empêche structurellement de répéter
 * un geste, seul le temps s'y oppose — et le temps n'est pas une impossibilité.
 */
export function isAttainable(family: AchievementFamily, tier: number, reach: AchievementReach): boolean {
  const mesure = reach.get(reachKey(family));
  if (mesure === undefined) return family.scale === 'count';
  return tier <= mesure;
}

/**
 * Le catalogue développé : chaque famille × chacun de ses paliers atteignables,
 * rangé du moins complexe au plus complexe.
 *
 * Le tri porte sur `difficulty`, qui combine le coût de base de la famille et
 * le NOMBRE DE CRANS du palier (`log10`) : sans lui, « 100 conversations
 * rejointes » et « une conversation de 100 membres » se rangeraient au même
 * endroit alors qu'elles n'ont rien à voir. À difficulté égale, la clé départage
 * — un ordre stable vaut mieux qu'un ordre joli mais changeant d'un rendu à
 * l'autre.
 */
export function expandCatalog(params: {
  readonly families: readonly AchievementFamily[];
  readonly reach: AchievementReach;
  readonly unlocked: ReadonlyMap<string, string | null>;
}): readonly AchievementEntry[] {
  const entries: AchievementEntry[] = [];
  for (const family of params.families) {
    for (const tier of tiersOf(family)) {
      if (!isAttainable(family, tier, params.reach)) continue;
      const key = achievementKey(family, tier);
      const reachedAt = params.unlocked.get(key);
      entries.push({
        key,
        section: family.section,
        family,
        tier,
        difficulty: difficultyOf(family, tier),
        unlocked: params.unlocked.has(key),
        reachedAt: reachedAt ?? null,
      });
    }
  }
  return entries.sort((a, b) => a.difficulty - b.difficulty || a.key.localeCompare(b.key));
}

/**
 * La FENÊTRE d'une section : `max(7, acquis + 2)` entrées, dans l'ordre.
 *
 * Le `max` est ce qui fait tenir les deux moitiés de la règle du porteur — sept
 * au démarrage, puis deux de plus à chaque palier décroché. Un compte à zéro
 * succès voit ses sept premiers ; un compte à quarante voit ses quarante-deux
 * premiers, donc ses deux prochains objectifs.
 */
export function windowSize(unlockedCount: number): number {
  const acquis = Number.isFinite(unlockedCount) ? Math.max(0, Math.trunc(unlockedCount)) : 0;
  return Math.max(ACHIEVEMENT_WINDOW_MINIMUM, acquis + ACHIEVEMENT_WINDOW_STEP);
}

/**
 * Les sections telles que l'écran les rend : une rangée horizontale chacune,
 * dans l'ordre du catalogue, les sections VIDES retirées.
 *
 * Une section sans aucun palier atteignable ne s'affiche pas du tout — une
 * rangée vide n'apprend rien et coûte un écran.
 */
export function sectionViews(entries: readonly AchievementEntry[]): readonly AchievementSectionView[] {
  const parSection = new Map<AchievementSection, AchievementEntry[]>();
  for (const entry of entries) {
    const bucket = parSection.get(entry.section);
    if (bucket) bucket.push(entry);
    else parSection.set(entry.section, [entry]);
  }

  const views: AchievementSectionView[] = [];
  for (const [section, toutes] of parSection) {
    const unlockedCount = toutes.filter((e) => e.unlocked).length;
    views.push({
      section,
      entries: toutes.slice(0, windowSize(unlockedCount)),
      unlockedCount,
      attainableCount: toutes.length,
    });
  }
  return views;
}
