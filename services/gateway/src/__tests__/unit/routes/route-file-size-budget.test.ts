/**
 * Le CLIQUET du budget de taille sous `routes/` (#4284, critère 3).
 *
 * La directive 2026-08-28 pose un budget de 800–1100 lignes par fichier et une
 * règle stricte : « Un fichier qui dépasse se DÉCOUPE […] Ajouter à un fichier
 * déjà hors budget est interdit : on extrait d'abord, on ajoute ensuite. »
 *
 * **Elle n'a rien retenu tant qu'aucune machine ne la mesurait.** #4284 listait
 * sept issues bloquées avant leur première ligne par des fichiers de routes hors
 * budget ; les sept ont été livrées SANS attendre le découpage, et la trace est
 * arithmétique : `admin/agent.ts` est passé de 1866 à 1977 lignes PENDANT que
 * l'issue qui devait le découper était ouverte. C'est la forme de #4302 côté iOS
 * et de #4292 sur l'i18n — une règle déclarée dont la mesure n'existe pas, ou a
 * cessé de mordre, ne protège plus rien.
 *
 * ### Pourquoi un plafond DUR, et pas un inventaire décroissant
 *
 * Le cliquet iOS (#4302, `FileSizeBudgetGuardTests`) porte trois nombres et une
 * liste héritée, parce que ses 42 fichiers hors budget ne pouvaient pas être
 * découpés dans le même lot. Ici la dette a été soldée EN ENTIER : les huit
 * fichiers ≥ 1000 lignes de `routes/` ont été découpés par responsabilité dans
 * le lot qui pose ce test. Il n'y a donc **aucune liste héritée** — et c'est
 * volontaire : une liste vide est une garde qu'on ne peut pas contourner en
 * ajoutant une ligne au bon endroit.
 *
 * ### Le seuil : 1000, pas 1100
 *
 * Le porteur a demandé « moins de 1000 lignes » en ouvrant le lot. C'est plus
 * strict que la fourchette documentée, et laisse 100 lignes de marge sous le
 * plafond de la directive plutôt que de s'asseoir dessus.
 *
 * ### Portée
 *
 * Ce cliquet balaie `services/gateway/src/routes/**` — la langue du critère 3.
 * Six fichiers du gateway HORS de `routes/` dépassent encore largement le budget
 * (`services/notifications/NotificationService.ts`, 6119 lignes en tête) : c'est
 * un chantier distinct, avec son inventaire gelé, et non un oubli de ce test.
 *
 * @jest-environment node
 */

import { describe, it, expect } from '@jest/globals';
import { readdirSync, readFileSync, statSync } from 'fs';
import { join, relative, sep } from 'path';

const ROUTES_DIR = join(__dirname, '../../../routes');

/** Le plafond demandé par le porteur, plus strict que la directive (1100). */
const MAX_LINES = 1000;

/**
 * Seules les sources ÉCRITES À LA MAIN sont visées : la directive exclut
 * explicitement le code généré et les dépendances. Les suites de tests ont leur
 * propre économie (un témoin par ligne d'un tableau produit de longs fichiers
 * sans dette de lisibilité) et sortent du périmètre.
 */
const isHandWrittenSource = (path: string): boolean =>
  path.endsWith('.ts') && !path.endsWith('.d.ts') && !path.split(sep).includes('__tests__');

const walk = (dir: string): readonly string[] =>
  readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) return walk(full);
    return isHandWrittenSource(full) ? [full] : [];
  });

/**
 * Compte comme `wc -l` — le nombre de FINS de ligne — pour que les chiffres de
 * ce cliquet soient les mêmes que ceux des issues et des commentaires, qui
 * citent tous `wc -l`. `split('\n').length` en rendrait un de plus sur tout
 * fichier terminé par un saut de ligne, et le seuil mordrait à 999.
 */
const lineCount = (path: string): number => {
  const text = readFileSync(path, 'utf8');
  const newlines = (text.match(/\n/g) ?? []).length;
  return text.endsWith('\n') || text.length === 0 ? newlines : newlines + 1;
};

describe('budget de taille des fichiers de routes (#4284)', () => {
  it('voit bien le répertoire des routes — sinon un balayage vide passerait au vert', () => {
    expect(statSync(ROUTES_DIR).isDirectory()).toBe(true);
    expect(walk(ROUTES_DIR).length).toBeGreaterThan(150);
  });

  it("n'a aucun fichier écrit à la main de 1000 lignes ou plus", () => {
    const overBudget = walk(ROUTES_DIR)
      .map((path) => ({ path: relative(ROUTES_DIR, path), lines: lineCount(path) }))
      .filter((file) => file.lines >= MAX_LINES)
      .sort((a, b) => b.lines - a.lines)
      .map((file) => `${file.path} (${file.lines} lignes)`);

    expect(overBudget).toEqual([]);
  });
});
