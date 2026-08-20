/**
 * Une seule table de réduction de langue, sur les deux plateformes.
 *
 * `normalizeLanguageCode` réduit un identifier de langue hétérogène (BCP-47,
 * ISO 639-2/3, aliases dépréciés) vers un code supporté par Meeshy. La règle
 * vit en DEUX exemplaires — le SSOT TypeScript
 * (`ISO_639_3_TO_1` + `LEGACY_ISO_639_1`, `utils/language-normalize.ts`) et son
 * miroir Swift (`iso639ReductionMap` + `legacyISO6391Map`,
 * `MeeshyUser.normalizeLanguageCode`, `packages/MeeshySDK/.../Auth/AuthModels.swift`).
 * Les deux plateformes rendent la MÊME ligne depuis la MÊME charge : une
 * divergence servirait des textes différents pour un même compte selon le
 * client — exactement la violation du Prisme Linguistique que ces tables
 * existent pour fermer.
 *
 * Jusqu'ici l'invariant ne tenait que par une consigne en commentaire
 * (« Toute évolution DOIT toucher les deux sites »). Une consigne n'est pas un
 * témoin : ajouter `tgl: 'tl'` au TS en oubliant le Swift (ou l'inverse) passe
 * inaperçu jusqu'à ce qu'un utilisateur philippin, suédois, ou un client
 * Android sur locale hébraïque (`iw`), reçoive la mauvaise langue en
 * production. Ce garde lit les deux tables et prouve leur ÉGALITÉ — il tombe au
 * ROUGE dès qu'une entrée est ajoutée, retirée ou remappée d'un seul côté.
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

describe('table de réduction de langue — TS et Swift ne peuvent pas diverger', () => {
  const swift = readFileSync(SWIFT_SOURCE, 'utf8');

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
});
