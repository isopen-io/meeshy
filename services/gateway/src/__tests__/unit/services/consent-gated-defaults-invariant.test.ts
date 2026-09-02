/**
 * #4578 — **aucune préférence gardée par un consentement ne vaut `true` par
 * défaut, sauf si une garde d'USAGE la retient par ailleurs.**
 *
 * ## Le défaut que cet invariant ferme
 *
 * Mesuré sur staging le 2026-08-31, sur un compte créé pour l'occasion :
 * **trois catégories de réglages sur sept étaient inaccessibles à un compte
 * neuf.**
 *
 * ```
 * PATCH /me/preferences/application {"theme":"dark"}          → 403 [telemetryEnabled]
 * PATCH /me/preferences/privacy     {"profileVisibility":"private"} → 403 [allowAnalytics]
 * PATCH /me/preferences/audio       {"audioQuality":"high"}    → 403 [transcriptionEnabled, …]
 * ```
 *
 * L'utilisateur ne pouvait changer ni son thème, ni sa visibilité, ni sa
 * qualité audio — et le refus nommait à chaque fois un champ que son corps de
 * requête **ne portait pas**. La garde lisait le document FUSIONNÉ, où les
 * `default()` du schéma valaient `true` sur cinq préférences gardées.
 *
 * ## Les deux moitiés du correctif, et pourquoi il en fallait deux
 *
 * 1. La garde lit désormais les clés que le corps NOMME (les trois sites de
 *    validation). Cela suffit à rendre les réglages accessibles.
 * 2. Mais cela ne suffit PAS à rendre l'état stocké honnête : une préférence
 *    gardée qui vaut `true` par défaut fait affirmer par le système, pour un
 *    compte qui n'a rien consenti, exactement ce que la garde refuse.
 *
 * D'où cet invariant, qui garde la seconde moitié — celle qu'un correctif
 * pressé aurait laissée derrière.
 *
 * ## L'exception AUDIO, et sa preuve
 *
 * Les trois préférences audio restent `true` par défaut, et c'est délibéré :
 * une garde d'USAGE existe et fait le travail
 * (`routes/attachments/translation.ts`, `MessageTranslationService`), si bien
 * que stocker `true` sans le consentement voix n'applique RIEN. Le
 * `CLAUDE.md` porte la décision produit correspondante — la traduction est le
 * cœur du Prisme Linguistique, et « un consentement voix manquant reste le
 * seul verrou réel ».
 *
 * **L'exception est donc nommée AVEC sa raison, et sa raison est vérifiée
 * ci-dessous** : le témoin cherche les lecteurs d'usage dans le code servi.
 * Sans cette vérification, l'exception serait une simple permission d'oublier.
 *
 * @jest-environment node
 */

import { describe, it, expect } from '@jest/globals';
import * as fs from 'fs';
import * as path from 'path';
import { ApplicationPreferenceSchema } from '@meeshy/shared/types/preferences/application';
import { PrivacyPreferenceSchema } from '@meeshy/shared/types/preferences/privacy';
import { AudioPreferenceSchema } from '@meeshy/shared/types/preferences/audio';
import { MessagePreferenceSchema } from '@meeshy/shared/types/preferences/message';
import { VideoPreferenceSchema } from '@meeshy/shared/types/preferences/video';

const RACINE_GATEWAY = path.join(__dirname, '../../..');

/**
 * Les champs que `ConsentValidationService` refuse quand ils valent `true`,
 * relevés sur le service lui-même plutôt que recopiés : une liste écrite à la
 * main se périme au premier champ gardé qu'on ajoute.
 */
function champsGardes(): ReadonlySet<string> {
  const source = fs.readFileSync(
    path.join(RACINE_GATEWAY, 'services/ConsentValidationService.ts'),
    'utf-8'
  );
  const trouves = new Set<string>();
  for (const m of source.matchAll(/preferences\.([a-zA-Z]+) === true/g)) {
    trouves.add(m[1]);
  }
  return trouves;
}

/** Les défauts que Zod injecte, catégorie par catégorie. */
const DEFAUTS: ReadonlyArray<readonly [string, Record<string, unknown>]> = [
  ['application', ApplicationPreferenceSchema.parse({})],
  ['privacy', PrivacyPreferenceSchema.parse({})],
  ['audio', AudioPreferenceSchema.parse({})],
  ['message', MessagePreferenceSchema.parse({})],
  ['video', VideoPreferenceSchema.parse({})],
];

/**
 * L'exception, NOMMÉE et JUSTIFIÉE : ces trois-là peuvent valoir `true` par
 * défaut parce qu'une garde d'usage les retient. Le second `describe` vérifie
 * que cette garde existe encore.
 */
const EXEMPTES_PAR_GARDE_D_USAGE = new Set([
  'transcriptionEnabled',
  'audioTranslationEnabled',
  'ttsEnabled',
]);

describe('#4578 — aucune préférence gardée ne vaut `true` par défaut', () => {
  it('le relevé des champs gardés n\'est pas vide — sinon l\'invariant serait vide de sens', () => {
    const gardes = champsGardes();

    // Une garde qui n'a rien à garder passe au vert en ne protégeant rien.
    // C'est le cas positif de ce fichier.
    expect(gardes.size).toBeGreaterThanOrEqual(8);
    expect(gardes).toContain('telemetryEnabled');
    expect(gardes).toContain('allowAnalytics');
  });

  it.each(DEFAUTS)('catégorie %s : aucun champ gardé n\'y est vrai par défaut', (_categorie, defauts) => {
    const gardes = champsGardes();

    const fautifs = Object.entries(defauts)
      .filter(([cle, valeur]) => valeur === true && gardes.has(cle))
      .map(([cle]) => cle)
      .filter((cle) => !EXEMPTES_PAR_GARDE_D_USAGE.has(cle));

    expect(fautifs).toEqual([]);
  });

  it('telemetryEnabled et allowAnalytics valent FAUX par défaut — les deux qui n\'ont aucune garde d\'usage', () => {
    expect(ApplicationPreferenceSchema.parse({}).telemetryEnabled).toBe(false);
    expect(PrivacyPreferenceSchema.parse({}).allowAnalytics).toBe(false);
  });
});

describe('#4578 — l\'exception audio n\'est valable QUE tant que sa garde d\'usage existe', () => {
  it('la transcription est refusée à l\'USAGE quand le consentement manque', () => {
    // Sans ce témoin, `EXEMPTES_PAR_GARDE_D_USAGE` ci-dessus serait une simple
    // permission d'oublier : trois champs exemptés au nom d'une garde que
    // personne ne vérifie. La question n'est pas « l'exception est-elle
    // écrite ? » mais « ce qu'elle invoque existe-t-il encore ? ».
    const source = fs.readFileSync(
      path.join(RACINE_GATEWAY, 'routes/attachments/translation.ts'),
      'utf-8'
    );

    expect(source).toMatch(/if \(!consentStatus\.canTranscribeAudio\)/);
  });

  it('et la génération audio traduite lit le même statut avant d\'agir', () => {
    const source = fs.readFileSync(
      path.join(RACINE_GATEWAY, 'services/message-translation/MessageTranslationService.ts'),
      'utf-8'
    );

    expect(source).toContain('canGenerateTranslatedAudio');
    expect(source).toContain('consentStatus.canTranscribeAudio');
  });
});
