/**
 * L'ORDRE de résolution du Prisme, sur les TROIS plateformes.
 *
 * Le Prisme Linguistique se résout dans un ORDRE de priorité strict — c'est son
 * invariant central (`CLAUDE.md` racine, § « Résolution de langue ») :
 *
 *   1. systemLanguage            — préférence in-app primaire
 *   2. regionalLanguage          — préférence in-app secondaire
 *   3. customDestinationLanguage — override personnalisé
 *   4. deviceLocale              — locale appareil (Prisme étendu 2026-05-26)
 *   5. 'fr'                       — repli ultime
 *
 * Cet ordre vit en TROIS exemplaires — le SSOT TypeScript
 * (`resolveUserLanguage` / `resolveUserLanguagesOrdered`,
 * `utils/conversation-helpers.ts`), son miroir Swift
 * (`MeeshyUser.preferredContentLanguages`,
 * `packages/MeeshySDK/.../Auth/AuthModels.swift`) et son miroir Kotlin
 * (`LanguageResolver.preferredContentLanguages` / `.resolveUserLanguage`,
 * `apps/android/core/model/.../lang/LanguageResolver.kt`). Les trois construisent
 * la MÊME liste ordonnée depuis les MÊMES préférences : une divergence d'ordre
 * rétrograderait la langue PRIMAIRE d'un lecteur au profit d'un rang inférieur —
 * exactement la violation du Prisme (#3) que ces résolveurs existent pour fermer
 * (« un francophone avec un iPhone en anglais voit TOUJOURS ses messages en
 * français »).
 *
 * Jusqu'ici l'invariant ne tenait, sur les trois plateformes, que par des
 * doc-comments jumeaux (« Resolution order: 1. systemLanguage 2. regionalLanguage
 * … »). Un doc-comment n'est pas un témoin : rien ne relie l'ORDRE des
 * `appendIfDistinct(...)` Swift à celui des `addDistinct(...)` Kotlin ni à la
 * séquence du tableau `candidates` TS. Les TABLES de normalisation
 * (`language-normalize-mirror-parity.test.ts`), le barème de présence
 * (`presence-mirror-parity.test.ts`) et la SORTIE du résolveur d'aperçu
 * (`vectors/prism-preview.vectors.test.ts`) sont gardés ; la CONSTRUCTION de la
 * liste préférée depuis les préférences utilisateur, elle, ne l'était pas. C'est
 * ce trou — « N miroirs, zéro témoin de parité » — que ce témoin ferme pour
 * l'ordre lui-même.
 *
 * Même esprit et même mécanique que ses jumeaux : l'ordre de référence se LIT du
 * SSOT TS par son COMPORTEMENT (des sentinelles distinctes, jamais une seconde
 * liste écrite dans le témoin qui dériverait) ; les ordres Swift et Kotlin
 * s'EXTRAIENT de leur source comme texte, ancrés sur la FORME de chaque appel, et
 * le témoin tombe dès qu'un rang est ajouté, retiré ou permuté sur un seul site.
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';
import {
  resolveUserLanguage,
  resolveUserLanguagesOrdered,
} from '../utils/conversation-helpers.js';

const SWIFT_SOURCE = join(
  __dirname,
  '../../MeeshySDK/Sources/MeeshySDK/Auth/AuthModels.swift'
);

const KOTLIN_SOURCE = join(
  __dirname,
  '../../../apps/android/core/model/src/main/kotlin/me/meeshy/sdk/lang/LanguageResolver.kt'
);

/** Les quatre rangs du Prisme, dans leur ordre canonique. Le repli `'fr'` (rang
 *  5) est testé à part car il n'est pas une préférence utilisateur. */
const CANONICAL_ORDER = [
  'systemLanguage',
  'regionalLanguage',
  'customDestinationLanguage',
  'deviceLocale',
] as const;

/**
 * Isole le corps d'une déclaration nommée (Swift `var name … { … }` ou Kotlin
 * `fun name(...) … { … }`) en comptant les accolades depuis la première `{` qui
 * suit le nom. Lire le corps SEUL évite de ramasser les appels d'une autre
 * fonction du même fichier.
 */
function bodyAfter(source: string, anchor: RegExp, label: string): string {
  const start = source.match(anchor);
  if (!start || start.index === undefined) {
    throw new Error(`${label} introuvable — la déclaration a-t-elle changé de forme ?`);
  }
  const from = source.indexOf('{', start.index + start[0].length - 1);
  if (from === -1) throw new Error(`${label} : accolade ouvrante introuvable.`);
  let depth = 0;
  for (let i = from; i < source.length; i++) {
    if (source[i] === '{') depth++;
    else if (source[i] === '}') {
      depth--;
      if (depth === 0) return source.slice(from + 1, i);
    }
  }
  throw new Error(`${label} : accolade fermante introuvable.`);
}

/**
 * Isole une fonction à CORPS D'EXPRESSION (Kotlin `fun name(...) : T = <expr>`,
 * sans accolades) en rendant le texte entre la fin de la déclaration (`start`) et
 * la fin de l'expression (`end`, incluse). `bodyAfter` ne convient pas : sans
 * `{`, son compteur d'accolades irait lire le corps de la fonction suivante.
 */
function expressionBody(source: string, start: RegExp, end: RegExp, label: string): string {
  const head = source.match(start);
  if (!head || head.index === undefined) {
    throw new Error(`${label} introuvable — la déclaration a-t-elle changé de forme ?`);
  }
  const rest = source.slice(head.index + head[0].length);
  const tail = rest.match(end);
  if (!tail || tail.index === undefined) {
    throw new Error(`${label} : fin d'expression (\`${end}\`) introuvable — a-t-elle changé de forme ?`);
  }
  return rest.slice(0, tail.index + tail[0].length).trim();
}

/**
 * Extrait la séquence ordonnée des rangs du Prisme depuis un corps de fonction,
 * en repérant chaque appel du helper de dé-duplication (`appendIfDistinct` Swift,
 * `addDistinct` Kotlin) et en classant son argument par le nom de préférence
 * qu'il porte. `deviceLocale` est reconnu même enveloppé dans un appel de
 * normalisation (`normalizeLanguageCode(deviceLocale)` / `normalize(...deviceLocale)`).
 */
function extractOrder(body: string, helper: string): string[] {
  const order: string[] = [];
  const call = new RegExp(`${helper}\\s*\\(([^\\n]*?)\\)\\s*$`, 'gm');
  for (const match of body.matchAll(call)) {
    const arg = match[1];
    const rank = CANONICAL_ORDER.find((key) => arg.includes(key));
    if (rank) order.push(rank);
  }
  return order;
}

describe("l'ordre de résolution du Prisme — TS, Swift et Kotlin ne peuvent pas diverger", () => {
  const swift = readFileSync(SWIFT_SOURCE, 'utf8');
  const kotlin = readFileSync(KOTLIN_SOURCE, 'utf8');

  it('le SSOT TS construit la liste dans l\'ordre canonique (contre-épreuve comportementale)', () => {
    // Sentinelles distinctes par rang : l'ORDRE de sortie EST l'ordre de
    // résolution. Ancre l'ordre de référence sur le comportement du SSOT, jamais
    // sur une liste recopiée.
    const ordered = resolveUserLanguagesOrdered(
      {
        systemLanguage: 'aa',
        regionalLanguage: 'bb',
        customDestinationLanguage: 'cc',
      },
      { deviceLocale: 'dd' }
    );
    expect(ordered).toEqual(['aa', 'bb', 'cc', 'dd']);

    // Le rang unique gagnant descend bien dans l'ordre : sans le rang 1, c'est le
    // rang 2 qui sort — le témoin de rang s'écrit sur un rang AUTRE que le premier.
    expect(
      resolveUserLanguage({ regionalLanguage: 'bb', customDestinationLanguage: 'cc' })
    ).toBe('bb');
  });

  it('le repli ultime du SSOT TS est \'fr\' (rang 5)', () => {
    expect(resolveUserLanguage({})).toBe('fr');
    expect(resolveUserLanguagesOrdered({})).toEqual([]);
  });

  it('Swift (preferredContentLanguages) lit les rangs dans le même ordre que le SSOT TS', () => {
    const body = bodyAfter(
      swift,
      /var\s+preferredContentLanguages\s*:\s*\[String\]/,
      'Swift preferredContentLanguages'
    );
    const order = extractOrder(body, 'appendIfDistinct');

    // Contre-épreuve : une extraction cassée rendrait une liste vide qui
    // « passerait » un `toEqual` contre un tableau vide. On ancre la taille avant
    // de comparer.
    expect(order.length).toBe(CANONICAL_ORDER.length);
    expect(order).toEqual([...CANONICAL_ORDER]);
  });

  it('Swift replie sur \'fr\' quand la liste est vide (rang 5)', () => {
    const body = bodyAfter(
      swift,
      /var\s+preferredContentLanguages\s*:\s*\[String\]/,
      'Swift preferredContentLanguages'
    );
    expect(body).toMatch(/preferred\.append\("fr"\)/);
  });

  it('Kotlin (preferredContentLanguages) lit les rangs dans le même ordre que le SSOT TS', () => {
    const body = bodyAfter(
      kotlin,
      /fun\s+preferredContentLanguages\s*\(/,
      'Kotlin preferredContentLanguages'
    );
    const order = extractOrder(body, 'addDistinct');

    expect(order.length).toBe(CANONICAL_ORDER.length);
    expect(order).toEqual([...CANONICAL_ORDER]);
  });

  it('Kotlin (resolveUserLanguage) descend les rangs dans le même ordre, repli \'fr\'', () => {
    // `resolveUserLanguage` Kotlin est une fonction à CORPS D'EXPRESSION (`=`
    // suivi d'une chaîne de `?:`, sans accolades) : `bodyAfter` (compteur
    // d'accolades) irait lire le corps de la fonction SUIVANTE. On isole donc la
    // chaîne d'expression entre le `=` de la déclaration et le `?: FALLBACK_LANGUAGE`
    // qui la termine.
    const body = expressionBody(
      kotlin,
      /fun\s+resolveUserLanguage\s*\([^)]*\)\s*:\s*String\s*=/,
      /\?:\s*FALLBACK_LANGUAGE/,
      'Kotlin resolveUserLanguage'
    );
    // Ici les rangs s'enchaînent par l'opérateur Elvis (`?:`), pas par un helper —
    // leur ORDRE D'APPARITION dans l'expression EST l'ordre de résolution.
    const positions = CANONICAL_ORDER.map((key) => body.indexOf(key));
    expect(positions.every((p) => p >= 0)).toBe(true);
    const sorted = [...positions].sort((a, b) => a - b);
    expect(positions).toEqual(sorted);
    expect(body).toMatch(/FALLBACK_LANGUAGE\s*$/);
  });

  it('le repli Kotlin FALLBACK_LANGUAGE vaut \'fr\'', () => {
    expect(kotlin).toMatch(/const\s+val\s+FALLBACK_LANGUAGE\s*:\s*String\s*=\s*"fr"/);
  });
});
