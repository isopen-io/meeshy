/**
 * Le CLIQUET du budget de taille sous `routes/` (#4284, critère 3).
 *
 * La directive 2026-09-02 pose un budget de 1000–1200 lignes par fichier (elle relâche le 800–1100 du 2026-08-28) et une
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
 * ### Le seuil : 1000, pas 1200
 *
 * Le porteur a demandé « moins de 1000 lignes » en ouvrant le lot. C'est plus
 * strict que la fourchette documentée, et laisse 100 lignes de marge sous le
 * plafond de la directive plutôt que de s'asseoir dessus.
 *
 * ### Portée
 *
 * Ce cliquet balaie `services/gateway/src/routes/**` — la langue du critère 3.
 * Dix-sept fichiers du gateway HORS de `routes/` dépassent encore largement le
 * budget (`services/notifications/NotificationService.ts`, 6119 lignes en tête).
 * C'est un chantier distinct, et il a désormais SON cliquet, comme cette note
 * l'annonçait : `__tests__/gateway-file-size-budget.test.ts` (#4426), avec son
 * inventaire gelé décroissant.
 *
 * Les deux règles restent distinctes — ZÉRO exemption ici, où la dette a été
 * soldée en entier ; un inventaire qui décroît là-bas, où elle ne pouvait pas
 * l'être dans le même lot. Mais la MESURE est commune, dans
 * `__tests__/helpers/file-size-sweep.ts` : deux implémentations de `lineCount`
 * divergeraient d'une ligne au premier fichier sans saut de ligne final, et les
 * deux cliquets se contrediraient sur le même fichier.
 *
 * @jest-environment node
 */

import { describe, it, expect } from '@jest/globals';
import { statSync } from 'fs';
import { join } from 'path';

import { overBudget, walk } from '../../helpers/file-size-sweep';

const ROUTES_DIR = join(__dirname, '../../../routes');

/** Le plafond demandé par le porteur, plus strict que la directive (1200 depuis le 2026-09-02). */
const MAX_LINES = 1000;

describe('budget de taille des fichiers de routes (#4284)', () => {
  it('voit bien le répertoire des routes — sinon un balayage vide passerait au vert', () => {
    expect(statSync(ROUTES_DIR).isDirectory()).toBe(true);
    expect(walk(ROUTES_DIR).length).toBeGreaterThan(150);
  });

  it("n'a aucun fichier écrit à la main de 1000 lignes ou plus", () => {
    const listes = overBudget(ROUTES_DIR, MAX_LINES).map(
      (file) => `${file.path} (${file.lines} lignes)`
    );

    expect(listes).toEqual([]);
  });
});
