/**
 * Une seule table de réduction de langue, sur les TROIS plateformes.
 *
 * `normalizeLanguageCode` réduit un identifier de langue hétérogène (BCP-47,
 * ISO 639-2/3, aliases dépréciés) vers un code supporté par Meeshy. La règle
 * vit en TROIS exemplaires — le SSOT TypeScript
 * (`ISO_639_3_TO_1` + `LEGACY_ISO_639_1`, `utils/language-normalize.ts`), son
 * miroir Swift (`iso639ReductionMap` + `legacyISO6391Map`,
 * `MeeshyUser.normalizeLanguageCode`, `packages/MeeshySDK/.../Auth/AuthModels.swift`)
 * et son miroir Kotlin (`ISO_639_3_TO_1` + `LEGACY_ISO_639_1`,
 * `LanguageCodeNormalizer`, `apps/android/core/model/.../lang/LanguageCodeNormalizer.kt`).
 * Les trois plateformes rendent la MÊME ligne depuis la MÊME charge : une
 * divergence servirait des textes différents pour un même compte selon le
 * client — exactement la violation du Prisme Linguistique que ces tables
 * existent pour fermer.
 *
 * Jusqu'ici l'invariant ne tenait, côté Android, que par une consigne en
 * commentaire (« Any change here MUST touch the TS + Swift mirrors »). Une
 * consigne n'est pas un témoin : ce garde ne couvrait QUE Swift, et pendant ce
 * temps Kotlin n'avait JAMAIS reçu `LEGACY_ISO_639_1` — un client Android sur
 * locale hébraïque (`java.util.Locale.getLanguage()` → `iw`) recevait donc son
 * fil dans la langue de l'expéditeur, la traduction `he` restant introuvable.
 * C'est la plateforme même dont la JVM ÉMET ces codes dépréciés qui était
 * restée hors du garde. Ce témoin lit les trois tables et prouve leur
 * ÉGALITÉ — il tombe au ROUGE dès qu'une entrée est ajoutée, retirée ou
 * remappée sur un seul site.
 *
 * Même esprit et même mécanique que `password-min-length-parity.test.ts` : une
 * règle unique, recensée là où elle se duplique, et un témoin qui peut tomber.
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';
import { ISO_639_3_TO_1, LEGACY_ISO_639_1 } from '../utils/language-normalize.js';

const SWIFT_SOURCE = join(
  __dirname,
  '../../MeeshySDK/Sources/MeeshySDK/Auth/AuthModels.swift'
);

const KOTLIN_SOURCE = join(
  __dirname,
  '../../../apps/android/core/model/src/main/kotlin/me/meeshy/sdk/lang/LanguageCodeNormalizer.kt'
);

/**
 * Extrait un dictionnaire Swift `[String: String]` nommé, en objet JS. Ne lit
 * QUE le corps entre les crochets de la déclaration `name`, pour ne pas
 * ramasser des paires d'un autre littéral du fichier.
 */
function swiftStringMap(source: string, name: string): Record<string, string> {
  const declaration = new RegExp(
    `${name}\\s*:\\s*\\[String:\\s*String\\]\\s*=\\s*\\[([\\s\\S]*?)\\]`
  );
  const block = source.match(declaration);
  if (!block) {
    throw new Error(`Swift map \`${name}\` introuvable — la déclaration a-t-elle changé de forme ?`);
  }
  const pairs: Record<string, string> = {};
  for (const pair of block[1].matchAll(/"([a-z]+)"\s*:\s*"([a-z]+)"/g)) {
    pairs[pair[1]] = pair[2];
  }
  return pairs;
}

/**
 * Extrait un `Map<String, String> = mapOf( … )` Kotlin nommé, en objet JS. Ne
 * lit QUE le corps de la déclaration `name` (jusqu'au `)` de `mapOf`), pour ne
 * pas ramasser les paires d'un autre littéral. Les paires Kotlin s'écrivent
 * `"xx" to "yy"`.
 */
function kotlinStringMap(source: string, name: string): Record<string, string> {
  const declaration = new RegExp(
    `${name}\\s*:\\s*Map<String,\\s*String>\\s*=\\s*mapOf\\(([\\s\\S]*?)\\)`
  );
  const block = source.match(declaration);
  if (!block) {
    throw new Error(`Kotlin map \`${name}\` introuvable — la déclaration a-t-elle changé de forme ?`);
  }
  const pairs: Record<string, string> = {};
  for (const pair of block[1].matchAll(/"([a-z]+)"\s*to\s*"([a-z]+)"/g)) {
    pairs[pair[1]] = pair[2];
  }
  return pairs;
}

describe('table de réduction de langue — TS, Swift et Kotlin ne peuvent pas diverger', () => {
  const swift = readFileSync(SWIFT_SOURCE, 'utf8');
  const kotlin = readFileSync(KOTLIN_SOURCE, 'utf8');

  it('ISO_639_3_TO_1 (TS) est exactement iso639ReductionMap (Swift)', () => {
    const swiftMap = swiftStringMap(swift, 'iso639ReductionMap');

    // Contre-épreuve : une extraction cassée rendrait un objet vide qui
    // « passerait » contre un TS lui-même vidé. On ancre la taille sur le
    // recensement réel avant de comparer les contenus.
    expect(Object.keys(swiftMap).length).toBeGreaterThan(50);
    expect(swiftMap).toEqual(ISO_639_3_TO_1);
  });

  it('LEGACY_ISO_639_1 (TS) est exactement legacyISO6391Map (Swift)', () => {
    const swiftMap = swiftStringMap(swift, 'legacyISO6391Map');

    expect(Object.keys(swiftMap).length).toBeGreaterThan(0);
    expect(swiftMap).toEqual(LEGACY_ISO_639_1);
  });

  it('ISO_639_3_TO_1 (TS) est exactement ISO_639_3_TO_1 (Kotlin)', () => {
    const kotlinMap = kotlinStringMap(kotlin, 'ISO_639_3_TO_1');

    // Même contre-épreuve que côté Swift : ancrer la taille avant de comparer.
    expect(Object.keys(kotlinMap).length).toBeGreaterThan(50);
    expect(kotlinMap).toEqual(ISO_639_3_TO_1);
  });

  it('LEGACY_ISO_639_1 (TS) est exactement LEGACY_ISO_639_1 (Kotlin)', () => {
    const kotlinMap = kotlinStringMap(kotlin, 'LEGACY_ISO_639_1');

    // Ce cas est celui qui aurait ROUGI avant ce lot : Kotlin n'avait pas de
    // table `LEGACY_ISO_639_1`, `kotlinStringMap` aurait throw « introuvable ».
    expect(Object.keys(kotlinMap).length).toBeGreaterThan(0);
    expect(kotlinMap).toEqual(LEGACY_ISO_639_1);
  });
});
