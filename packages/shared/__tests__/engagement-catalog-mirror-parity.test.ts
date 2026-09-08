/**
 * Un seul catalogue de streaks & badges, sur les DEUX clients qui le peignent.
 *
 * Les axes, les paliers (badge, série, niveau), les succès et les familles
 * (`packages/shared/types/engagement.ts`) sont la source de vérité — importée
 * par la passerelle, qui PRODUIT les compteurs. iOS ne peut pas importer du
 * TypeScript : `EngagementCatalog.swift` en est le miroir, et ce témoin lit ses
 * littéraux pour prouver leur ÉGALITÉ. Il tombe au ROUGE dès qu'un axe, un
 * palier, un succès ou une famille est ajouté, retiré ou renommé sur un seul
 * des deux sites — même esprit et même mécanique que
 * `presence-mirror-parity.test.ts` et `language-normalize-mirror-parity.test.ts`.
 *
 * Ce qui divergerait sans lui : un badge gravé par le serveur sous une clé
 * qu'iOS ne connaît pas s'affiche… nulle part, sans erreur — exactement le
 * mode de panne que la leçon 261 décrit (« un témoin de rang s'écrit sur un
 * rang autre que le premier ») transposé à un catalogue.
 *
 * Les clés de palier sont comparées en RENDU, pas en texte : le gabarit Swift
 * `"\(axis.rawValue):\(threshold)"` est instancié ici sur un échantillon et
 * confronté à `badgeMilestoneKey` — c'est la forme gravée en base qui compte.
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';
import {
  BADGE_THRESHOLDS,
  ENGAGEMENT_ACHIEVEMENT_KEYS,
  ENGAGEMENT_AXES,
  ENGAGEMENT_AXIS_FAMILIES,
  ENGAGEMENT_MILESTONE_TYPES,
  LEVEL_THRESHOLDS,
  STREAK_THRESHOLDS,
  badgeMilestoneKey,
  levelMilestoneKey,
  streakMilestoneKey,
} from '../types/engagement.js';

const SWIFT_SOURCE = join(__dirname, '../../MeeshySDK/Sources/MeeshySDK/Models/EngagementCatalog.swift');

/** Le corps d'une `enum <name>` Swift — de l'accolade ouvrante à la première accolade fermante en colonne 0. */
function swiftEnumBody(source: string, name: string): string {
  const declaration = new RegExp(`enum ${name}\\b[^{]*\\{([\\s\\S]*?)\\n\\}`);
  const block = source.match(declaration);
  if (!block || block[1] === undefined) {
    throw new Error(`enum Swift \`${name}\` introuvable — la déclaration a-t-elle changé de forme ?`);
  }
  return block[1];
}

/** Les valeurs brutes des `case` d'une enum Swift, dans l'ordre — le nom du cas quand aucune valeur n'est écrite. */
function swiftEnumRawValues(source: string, name: string): string[] {
  const body = swiftEnumBody(source, name);
  return [...body.matchAll(/^\s*case\s+(\w+)(?:\s*=\s*"([^"]+)")?\s*$/gm)].map(([, caseName, raw]) => raw ?? caseName ?? '');
}

/** `static let <name>: [Int] = [1, 2, 3]` → `[1, 2, 3]`. */
function swiftIntArray(source: string, name: string): number[] {
  const declaration = new RegExp(`static let ${name}\\s*:\\s*\\[Int\\]\\s*=\\s*\\[([^\\]]*)\\]`);
  const block = source.match(declaration);
  if (!block || block[1] === undefined) {
    throw new Error(`tableau Swift \`${name}\` introuvable — la déclaration a-t-elle changé de forme ?`);
  }
  return block[1].split(',').map((n) => Number(n.trim()));
}

/** Le gabarit de chaîne rendu par `func <name>(...) -> String { "..." }`, instancié sur les substitutions données. */
function swiftKeyTemplate(source: string, name: string, substitutions: Readonly<Record<string, string>>): string {
  const declaration = new RegExp(`func ${name}\\([^)]*\\)\\s*->\\s*String\\s*\\{\\s*"([^"]+)"\\s*\\}`);
  const block = source.match(declaration);
  if (!block || block[1] === undefined) {
    throw new Error(`gabarit Swift \`${name}\` introuvable — la déclaration a-t-elle changé de forme ?`);
  }
  return Object.entries(substitutions).reduce(
    (rendered, [placeholder, value]) => rendered.split(`\\(${placeholder})`).join(value),
    block[1],
  );
}

describe('catalogue de streaks & badges — TS et Swift ne peuvent pas diverger', () => {
  const swift = readFileSync(SWIFT_SOURCE, 'utf8');

  it('les treize axes, dans le même ordre', () => {
    expect(swiftEnumRawValues(swift, 'EngagementAxisKey')).toEqual([...ENGAGEMENT_AXES]);
  });

  it('les quatre familles, dans l’ordre d’affichage', () => {
    expect(swiftEnumRawValues(swift, 'EngagementAxisFamily')).toEqual([...ENGAGEMENT_AXIS_FAMILIES]);
  });

  it('les quatre natures de palier', () => {
    expect(swiftEnumRawValues(swift, 'EngagementMilestoneType')).toEqual([...ENGAGEMENT_MILESTONE_TYPES]);
  });

  it('les cinq succès composés', () => {
    expect(swiftEnumRawValues(swift, 'EngagementAchievementKey')).toEqual([...ENGAGEMENT_ACHIEVEMENT_KEYS]);
  });

  it('les paliers de badge, de série et de niveau', () => {
    expect(swiftIntArray(swift, 'badgeThresholds')).toEqual([...BADGE_THRESHOLDS]);
    expect(swiftIntArray(swift, 'streakThresholds')).toEqual([...STREAK_THRESHOLDS]);
    expect(swiftIntArray(swift, 'levelThresholds')).toEqual([...LEVEL_THRESHOLDS]);
  });

  it('les clés de palier se rendent à l’identique — c’est la forme gravée en base', () => {
    expect(swiftKeyTemplate(swift, 'badgeMilestoneKey', { 'axis.rawValue': 'content.post', threshold: '10' })).toBe(
      badgeMilestoneKey('content.post', 10),
    );
    expect(swiftKeyTemplate(swift, 'streakMilestoneKey', { threshold: '7' })).toBe(streakMilestoneKey(7));
    expect(swiftKeyTemplate(swift, 'levelMilestoneKey', { threshold: '150' })).toBe(levelMilestoneKey(150));
  });

  it('contre-épreuve : le TS porte bien le socle § 7 du modèle', () => {
    expect([...BADGE_THRESHOLDS]).toEqual([1, 10, 50, 100, 500]);
    expect([...STREAK_THRESHOLDS]).toEqual([3, 7, 14, 30, 60, 100]);
    expect([...LEVEL_THRESHOLDS]).toEqual([10, 50, 150, 400, 1000, 2500]);
    expect(ENGAGEMENT_AXES).toHaveLength(13);
    expect(ENGAGEMENT_ACHIEVEMENT_KEYS).toHaveLength(5);
  });
});
