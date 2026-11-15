/**
 * Garde de source NÉGATIVE — #4180.
 *
 * Un consentement se prouve par UNE SEULE colonne, horodatée par le serveur
 * (`User.*ConsentAt`, écrite uniquement par `VoiceProfileService.
 * updateConsent`). `ApplicationPreferenceSchema` déclarait autrefois les
 * cinq mêmes noms comme des champs de date LIBRES : un client pouvait donc
 * affirmer un consentement — avec la date de son choix — via un PATCH de
 * préférences ordinaire, et `ConsentValidationService` donnait PRIORITÉ à
 * cette affirmation sur la colonne serveur (cf. le commentaire de
 * `LEGACY_CONSENT_ERROR` dans `../application.ts`).
 *
 * Ce témoin balaie TOUT `packages/shared/types/preferences/` (pas le seul
 * `application.ts`) : une garde nominative posée sur un seul fichier meurt
 * en silence le jour où l'une de ces cinq clés réapparaît dans une catégorie
 * VOISINE (`audio.ts`, `privacy.ts`, …) — c'est exactement le risque que le
 * critère de fin de #4180 nomme explicitement. Un fichier peut re-déclarer
 * l'un de ces noms UNIQUEMENT via le sentinel `z.never(...)` que
 * `application.ts` pose lui-même (la déclaration EST la garde, pas un champ
 * qui accepte une valeur) — tout autre type contre l'une de ces cinq clés
 * fait tomber ce témoin.
 */

import { describe, test, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { LEGACY_APPLICATION_CONSENT_KEYS } from '../application';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PREFERENCES_DIR = join(__dirname, '..');

/**
 * Dépouille les commentaires `//` et `/* … *\/` avant le balayage : ce dépôt
 * exige des commentaires denses en français, et plusieurs d'entre eux, dans
 * `application.ts` lui-même, NOMMENT ces cinq clés en prose. Sans ce
 * dépouillement, le témoin confondrait « ce nom est ÉCRIT » (vrai, et
 * voulu — c'est la documentation du retrait) et « ce nom est DÉCLARÉ comme
 * un champ » (le seul fait que ce témoin doit garder).
 */
function stripComments(source: string): string {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/\/\/.*$/gm, '');
}

function sourceFiles(): ReadonlyArray<{ file: string; code: string }> {
  return readdirSync(PREFERENCES_DIR)
    .filter((name) => name.endsWith('.ts') && !name.endsWith('.d.ts'))
    .map((name) => ({
      file: name,
      code: stripComments(readFileSync(join(PREFERENCES_DIR, name), 'utf8')),
    }));
}

describe('garde de source — aucune clé *ConsentAt legacy hors z.never() (#4180)', () => {
  test('LEGACY_APPLICATION_CONSENT_KEYS porte exactement les cinq noms de #4180', () => {
    // Le témoin lui-même dépend de cette liste : s'assurer qu'elle n'a pas
    // dérivé silencieusement avant de s'en servir comme référence.
    expect([...LEGACY_APPLICATION_CONSENT_KEYS].sort()).toEqual(
      [
        'dataProcessingConsentAt',
        'voiceCloningConsentAt',
        'voiceCloningEnabledAt',
        'voiceDataConsentAt',
        'voiceProfileConsentAt',
      ].sort()
    );
  });

  for (const key of LEGACY_APPLICATION_CONSENT_KEYS) {
    test(`aucun fichier de packages/shared/types/preferences/ ne déclare "${key}" hors z.never(...)`, () => {
      // Une déclaration de shape Zod a la forme `nomDeChamp: <ZodType>` — le
      // sentinel autorisé est celui, et UNIQUEMENT celui, dont le type
      // commence par `z.never(`. Tout autre type (`z.iso.datetime(...)`,
      // `z.string()`, `z.date()`, …) accroché à l'un de ces cinq noms
      // rouvrirait la seconde main que #4180 a fermée.
      //
      // PAS de flag `g` ici : un même objet RegExp global garde son
      // `lastIndex` d'un `.test()` au suivant, donc réutilisé tel quel sur
      // plusieurs fichiers dans une boucle, il saute silencieusement les
      // fichiers courts qui suivent un fichier long — un témoin qui ne peut
      // pas voir la moitié de ce qu'il balaie n'est pas un témoin.
      //
      // Le `\s*` qui saute l'espace après `:` va DANS le lookahead
      // (`(?!\s*z\.never\(...)`), jamais devant : un `\s*(?!z\.never\()`
      // extérieur se BACKTRACK à zéro caractère dès que le lookahead échoue
      // sur la position gourmande — et à zéro caractère, le lookahead ne
      // voit que l'espace qui suit `:`, jamais le `z.never(` qui vient
      // après elle, donc il « réussit » (accuse) à tort. Mesuré : la
      // première version de cette garde accusait `application.ts` lui-même,
      // sentinel `z.never()` compris — un témoin qui tombe sur la ligne
      // même qu'il doit épargner ne garde rien.
      const offenders = sourceFiles()
        .filter(({ code }) => new RegExp(`\\b${key}\\s*:(?!\\s*z\\.never\\()`).test(code))
        .map(({ file }) => file);

      expect(offenders).toEqual([]);
    });
  }
});
