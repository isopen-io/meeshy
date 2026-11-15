import { SUPPORTED_LANGUAGE_CODES } from '../utils/language-codes';
import { SUPPORTED_LANGUAGES, getSupportedLanguageCodes } from '../utils/languages';

/**
 * LA FEUILLE ET LA TABLE DISENT LES MÊMES LANGUES.
 *
 * `language-codes.ts` existe pour le POIDS : un module de navigateur qui ne
 * veut que les codes ne doit pas embarquer les 30 Ko de métadonnées de la
 * table (noms, drapeaux, capacités TTS/STT — #5396). Deux listes, un seul
 * contenu : ce témoin est ce qui les tient ensemble. Ajouter une langue se
 * fait DEUX fois (la feuille, puis son entrée de table) — l'oubli d'un côté
 * rougit ici, par son nom.
 */
describe('la feuille des codes et la table des langues', () => {
  it('portent exactement le même ensemble de codes', () => {
    const feuille = [...SUPPORTED_LANGUAGE_CODES].sort();
    const table = getSupportedLanguageCodes().sort();
    expect(feuille).toEqual(table);
  });

  it('sans doublon ni code vide dans la feuille', () => {
    expect(new Set(SUPPORTED_LANGUAGE_CODES).size).toBe(SUPPORTED_LANGUAGE_CODES.length);
    expect(SUPPORTED_LANGUAGE_CODES.every((c) => c.length >= 2)).toBe(true);
  });

  it('la table reste la source des MÉTADONNÉES : chaque code de la feuille y a son entrée', () => {
    const parCode = new Map(SUPPORTED_LANGUAGES.map((l) => [l.code, l]));
    for (const code of SUPPORTED_LANGUAGE_CODES) {
      expect(parCode.get(code)?.name).toBeTruthy();
    }
  });
});
