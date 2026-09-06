/**
 * Témoin de parité entre la table complète des langues (`languages.ts`) et la
 * feuille des codes seuls (`language-codes.ts`), extraite pour que les
 * consommateurs qui n'ont besoin QUE des codes (`language-normalize.ts`)
 * n'embarquent pas les 30 Ko de métadonnées TTS/STT/voice-cloning (#5396).
 *
 * Les deux listes sont désormais des sources DISTINCTES — `languages.ts`
 * n'écrit plus `getSupportedLanguageCodes()` par un `.map()` sur
 * `SUPPORTED_LANGUAGES`, il lit la feuille. Sans ce témoin, une langue
 * ajoutée/retirée d'un côté et pas de l'autre ne rougirait nulle part : le
 * catalogue et la feuille dériveraient en silence, et `normalizeLanguageCode`
 * (qui ne lit QUE la feuille) accepterait ou rejetterait des codes que le
 * catalogue contredit.
 */
import { describe, it, expect } from 'vitest';
import { SUPPORTED_LANGUAGES, getSupportedLanguageCodes } from '../utils/languages';
import { SUPPORTED_LANGUAGE_CODES } from '../utils/language-codes';

describe('parité feuille des codes ↔ table des langues', () => {
  it('chaque code de SUPPORTED_LANGUAGES est dans la feuille', () => {
    const feuille = new Set<string>(SUPPORTED_LANGUAGE_CODES);
    const manquants = SUPPORTED_LANGUAGES.map((lang) => lang.code).filter(
      (code) => !feuille.has(code)
    );
    expect(manquants).toEqual([]);
  });

  it('chaque code de la feuille est dans SUPPORTED_LANGUAGES', () => {
    const table = new Set(SUPPORTED_LANGUAGES.map((lang) => lang.code));
    const orphelins = SUPPORTED_LANGUAGE_CODES.filter((code) => !table.has(code));
    expect(orphelins).toEqual([]);
  });

  it('aucun doublon dans la feuille', () => {
    expect(new Set(SUPPORTED_LANGUAGE_CODES).size).toBe(SUPPORTED_LANGUAGE_CODES.length);
  });

  it('getSupportedLanguageCodes() rend exactement la feuille', () => {
    expect(getSupportedLanguageCodes()).toEqual([...SUPPORTED_LANGUAGE_CODES]);
  });

  it('les deux longueurs concordent', () => {
    expect(SUPPORTED_LANGUAGE_CODES.length).toBe(SUPPORTED_LANGUAGES.length);
  });
});
