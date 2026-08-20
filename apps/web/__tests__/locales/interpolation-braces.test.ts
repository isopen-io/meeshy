/**
 * Les catalogues web n'interpolent qu'en SIMPLES accolades.
 *
 * Les trois interpolateurs de l'app — `hooks/use-i18n.ts`, `lib/i18n-utils.ts`,
 * `lib/i18n/locale-config.ts` — appliquent tous `/\{(\w+)\}/g`. Aucun ne
 * comprend la forme `{{nom}}` héritée d'i18next : elle se décompose en `{` +
 * `{nom}` + `}`, seul l'intérieur est remplacé, et l'enveloppe survit à
 * l'écran. C'est ainsi que l'avis d'arrivée affichait
 * « {ano_Jc_n045} a rejoint la conversation ».
 *
 * Ce témoin interdit la forme double dans TOUS les catalogues, pas seulement
 * dans celui qui a été signalé.
 */

import { readdirSync, readFileSync, statSync } from 'fs';
import { join } from 'path';

const RACINE = join(__dirname, '../../locales');
const DOUBLES_ACCOLADES = /\{\{\s*\w+\s*\}\}/;

const fichiersJson = (dossier: string): string[] =>
  readdirSync(dossier).flatMap((entree) => {
    const chemin = join(dossier, entree);
    if (statSync(chemin).isDirectory()) return fichiersJson(chemin);
    return chemin.endsWith('.json') ? [chemin] : [];
  });

const valeursFautives = (valeur: unknown, chemin: string): string[] => {
  if (typeof valeur === 'string') {
    return DOUBLES_ACCOLADES.test(valeur) ? [`${chemin} → ${valeur}`] : [];
  }
  if (valeur && typeof valeur === 'object') {
    return Object.entries(valeur as Record<string, unknown>).flatMap(([cle, v]) =>
      valeursFautives(v, `${chemin}.${cle}`)
    );
  }
  return [];
};

describe('catalogues de traduction web', () => {
  it('trouve des catalogues à analyser', () => {
    expect(fichiersJson(RACINE).length).toBeGreaterThan(0);
  });

  it("n'emploie jamais la forme {{nom}}, que nul interpolateur de l'app ne comprend", () => {
    const fautes = fichiersJson(RACINE).flatMap((fichier) => {
      const contenu = JSON.parse(readFileSync(fichier, 'utf-8')) as unknown;
      return valeursFautives(contenu, fichier.slice(RACINE.length + 1));
    });

    expect(fautes).toEqual([]);
  });
});
