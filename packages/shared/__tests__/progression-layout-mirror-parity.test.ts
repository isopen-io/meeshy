/**
 * LA PARITÉ DE LA COMPOSITION (#5838).
 *
 * `ProgressionLayout.swift` est le MIROIR de `progression-layout.ts`. Xcode ne
 * peut pas importer un module TypeScript : le Swift en est la projection, et
 * rien n'empêche mécaniquement les deux de diverger — sauf ce témoin.
 *
 * Ce qu'une divergence coûterait est exactement ce que ce lot vient de
 * réparer : deux utilisateurs, l'un sur web l'autre sur iOS, trouveraient les
 * mêmes blocs à des places différentes. Pas une erreur, pas un plantage : deux
 * vérités. Et l'écrire une fois de chaque côté sans les comparer, c'est
 * reproduire la cause au lieu de la corriger.
 *
 * Le témoin lit le SOURCE Swift plutôt qu'un binaire — il n'a besoin ni de
 * Xcode ni d'un simulateur, donc il tourne dans le même `vitest` que le reste.
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { PROGRESSION_SECTIONS, progressionLayout } from '../utils/progression-layout.js';
import {
  COMMENT_AXIS_WEIGHT,
  CONTENT_AXIS_WEIGHT,
  CONVERSATION_AXIS_WEIGHT,
  SOCIAL_AXIS_WEIGHT,
  TOOL_AXIS_WEIGHT,
} from '../types/engagement.js';
import { resolveEngagementProgress } from '../utils/engagement-progress.js';

const SWIFT = readFileSync(
  join(import.meta.dirname, '../../MeeshySDK/Sources/MeeshySDK/Models/ProgressionLayout.swift'),
  'utf8',
);

/** Un compte qui porte TOUT — le seul état où les deux côtés énumèrent la même
 * chose, depuis que `meesh` est conditionnel (#6497). */
const COMPLET = {
  counters: [],
  milestones: [],
  streak: { currentStreakDays: 0, longestStreakDays: 0 },
  level: { engagementScore: 0 },
  meesh: { balance: 1, mintedLifetime: 1, debitablePoints: 0, floorPoints: 0, missingPoints: 0, mintCost: 1200 },
} as const;

const VIDE = {
  counters: [],
  milestones: [],
  streak: { currentStreakDays: 0, longestStreakDays: 0 },
  level: { engagementScore: 0 },
} as const;

/** Les sections déclarées côté Swift, dans leur ordre de déclaration. */
function sectionsFromSwift(): string[] {
  // La borne est l'accolade en DÉBUT DE LIGNE, pas la première rencontrée :
  // l'énumération porte un `id` calculé dont le corps `{ rawValue }` en
  // contient une. S'arrêter dessus rendait une liste VIDE — et une liste vide
  // aurait pu passer pour un miroir conforme si le témoin avait été plus
  // faible.
  const bloc = SWIFT.slice(SWIFT.indexOf('public enum ProgressionSection'));
  const corps = bloc.slice(0, bloc.search(/\n}/));
  return [...corps.matchAll(/^\s{4}case\s+([a-z]+)/gm)].map((m) => m[1]!);
}

/** Les trois heros, dans l'ordre où le Swift les compose. */
function herosFromSwift(): string[] {
  // La parenthèse est TOLÉRÉE, pas ignorée : le Swift annote le littéral
  // (`as [ProgressionBlock]`) pour que ses membres s'écrivent `.cas` — la même
  // forme que le TypeScript. Sans elle, le premier portait le nom du type et le
  // miroir semblait divergent sur un détail de syntaxe.
  const ligne = SWIFT.match(/return \(?\[([^\]]+)\]/);
  return ligne === null ? [] : ligne[1]!.split(',').map((s) => s.trim().replace(/^\./, ''));
}

describe('la composition Swift est le miroir EXACT de la composition TypeScript', () => {
  it('déclare les mêmes sections, dans le même ordre', () => {
    expect(sectionsFromSwift()).toEqual([...PROGRESSION_SECTIONS]);
  });

  /**
   * LA COMPARAISON SE FAIT SUR UN COMPTE COMPLET, jamais sur un compte vide.
   *
   * Elle lisait la sortie TS d'un compte VIDE et la comparait au littéral
   * Swift. La prémisse tenait tant que les quatre heros étaient
   * INCONDITIONNELS ; elle a cassé à la minute où `meesh` est devenu
   * conditionnel (#6497) — le littéral en listait cinq, la sortie d'un compte
   * vide en rendait quatre, et le miroir semblait divergent alors qu'il était
   * exact.
   *
   * Un compte qui porte TOUT est le seul état où les deux côtés doivent
   * énumérer la même chose. L'absence, elle, se mesure au témoin suivant.
   */
  it('compose les mêmes heros, dans le même ordre, sur un compte complet', () => {
    const ts = progressionLayout(resolveEngagementProgress(COMPLET))
      .filter((b) => b.kind !== 'section-link')
      .map((b) => b.kind);
    // `last-achievement` ↔ `lastAchievement` : même mot, deux conventions.
    const camel = ts.map((k) => k.replace(/-([a-z])/g, (_, c: string) => c.toUpperCase()));
    expect(herosFromSwift()).toEqual(camel);
    expect(camel).toContain('meesh');
  });

  /**
   * **Le hero des Meeshes est CONDITIONNEL des deux côtés, et par la même
   * phrase.** Sans cette assertion, un client pourrait le rendre toujours et
   * annoncer « 0 Meesh » sur un compte dont le serveur ne dit rien.
   */
  it('gouverne le hero des Meeshes par la PRÉSENCE du solde, des deux côtés', () => {
    expect(progressionLayout(resolveEngagementProgress(VIDE)).map((b) => b.kind)).not.toContain('meesh');
    expect(SWIFT).toContain('$0 != .meesh || progress.meesh != nil');
    const source = readFileSync(join(import.meta.dirname, '../utils/progression-layout.ts'), 'utf8');
    expect(source).toContain("bloc.kind !== 'meesh' || (progress.meesh !== undefined && progress.meesh !== null)");
  });

  /**
   * **La règle des portes doit être la MÊME phrase des deux côtés.**
   *
   * Le TypeScript pouvait la dire « si la carte est servie » ; le Swift ne le
   * peut pas, son modèle collapsant « carte absente » et « carte vide » en un
   * tableau vide. Une règle qu'un miroir ne peut pas reproduire est une
   * divergence en attente : les deux disent donc « s'il Y A des sections ».
   */
  it('gouverne la porte des défis par la PRÉSENCE de sections, des deux côtés', () => {
    expect(SWIFT).toContain('!progress.achievementSections.isEmpty');
    const source = readFileSync(join(import.meta.dirname, '../utils/progression-layout.ts'), 'utf8');
    expect(source).toContain('(progress.achievementSections ?? []).length > 0');
  });
});

/**
 * LE BARÈME, mirroré parce que le hero du niveau l'ÉNUMÈRE (#5841).
 *
 * Le porteur l'a réglé trois fois le 2026-09-09. Une valeur recopiée côté Swift
 * se périmerait au premier réglage suivant, et l'écran iOS annoncerait un
 * barème que le serveur n'applique plus — un mensonge que rien ne signalerait,
 * puisque les deux nombres seraient également plausibles.
 */
describe('le barème Swift est le miroir EXACT du barème TypeScript', () => {
  const CATALOGUE = readFileSync(
    join(import.meta.dirname, '../../MeeshySDK/Sources/MeeshySDK/Models/EngagementCatalog.swift'),
    'utf8',
  );

  const poidsSwift = (): Record<string, number> => {
    // Le découpage part du `= [` du LITTÉRAL, pas du nom : l'annotation de
    // type `[EngagementAxisFamily: Int]` porte un `]` avant lui, et s'arrêter
    // dessus rendait un corps vide — donc un témoin vert sur zéro poids.
    const bloc = CATALOGUE.slice(CATALOGUE.indexOf('familyWeights'));
    const litteral = bloc.slice(bloc.indexOf('= [') + 3);
    const corps = litteral.slice(0, litteral.indexOf(']'));
    return Object.fromEntries(
      [...corps.matchAll(/\.([a-z]+):\s*(\d+)/g)].map((m) => [m[1]!, Number.parseInt(m[2]!, 10)]),
    );
  };

  it('donne les mêmes cinq poids aux mêmes cinq familles', () => {
    expect(poidsSwift()).toEqual({
      content: CONTENT_AXIS_WEIGHT,
      social: SOCIAL_AXIS_WEIGHT,
      conversation: CONVERSATION_AXIS_WEIGHT,
      comment: COMMENT_AXIS_WEIGHT,
      tool: TOOL_AXIS_WEIGHT,
    });
  });

  /**
   * **Le barème ORDONNE les familles, ou il ne sert à rien.** Le témoin
   * ci-dessus passerait au vert si toutes valaient la même chose : il lit les
   * mêmes constantes des deux côtés. Celui-ci mesure l'ÉCART voulu par le
   * porteur — contenu > social > conversation > commentaire > outil.
   */
  it('conserve l\'ORDRE voulu par le porteur', () => {
    const p = poidsSwift();
    expect(p.content).toBeGreaterThan(p.social!);
    expect(p.social).toBeGreaterThan(p.conversation!);
    expect(p.conversation).toBeGreaterThan(p.comment!);
    expect(p.comment).toBeGreaterThan(p.tool!);
  });
});
