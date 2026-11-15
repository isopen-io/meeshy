/**
 * Le CLIQUET de parité `jest.requireActual` bun ↔ jest (#6519).
 *
 * ## Le défaut
 *
 * Bun n'implémente pas `jest.requireActual` (oven-sh/bun#29834,
 * oven-sh/bun#5394). Sous `bun test`, l'appel est `undefined` et toute suite
 * qui l'utilise meurt au chargement (`TypeError: jest.requireActual is not a
 * function`) alors qu'elle est verte sous jest — la porte locale (bun) et la
 * porte CI (jest) ne mesurent donc pas le même corpus. `bun-preload.ts`
 * répare ce trou pour le runtime bun en préchargeant, avant que le premier
 * `jest.mock()` ne s'exécute où que ce soit, le module réel derrière chaque
 * site `jest.requireActual` (avec son spécificateur) de la suite — la seule
 * fenêtre où aucun mock n'existe encore pour personne.
 *
 * ## Ce que ce cliquet garde
 *
 * Le préchargement dépend d'un balayage STATIQUE du texte source
 * (`helpers/require-actual-sweep.ts`) : un nouveau site dont la cible ne
 * résout à AUCUN module chargeable — chemin déplacé, faute de frappe, import
 * cassé — échapperait au préchargement en silence, et ne se manifesterait que
 * si quelqu'un exécute cette suite précise sous bun. Ce test évalue, une fois
 * pour toutes, EXACTEMENT la même liste que celle que le préchargement
 * consomme, et exige que chaque cible RÉSOUVE. Il tourne sous jest ET sous
 * bun : sous les deux, une cible qui ne charge pas est un vrai défaut (un
 * import cassé n'est jamais un faux positif propre à un runtime).
 *
 * ## Ce qu'il ne garde PAS
 *
 * Il ne prouve pas que la valeur obtenue sous bun est la version RÉELLE
 * (non moquée) au moment précis d'un appel — un `jest.mock` posé par un
 * fichier exécuté plus tôt dans le même process bun reste actif pour les
 * fichiers suivants (relevé en commentaire sur #6519, famille distincte de
 * `jest.resetModules`, non traitée ici). Ce cliquet garde la RÉSOLUTION du
 * balayage, pas l'isolation entre fichiers.
 *
 * @jest-environment node
 */
import { describe, it, expect } from '@jest/globals';
import { resolve as resolvePath } from 'path';

import { collectRequireActualSites, GATEWAY_ROOT } from '../helpers/require-actual-sweep';

describe('jest.requireActual : chaque site résout un module chargeable (#6519)', () => {
  const sites = collectRequireActualSites(resolvePath(GATEWAY_ROOT, 'src'));

  // La borne de non-vacuité passe AVANT la règle : un balayage qui ne
  // trouverait plus rien rendrait le test suivant vert pour la pire raison.
  it('a trouvé au moins un site — sinon ce cliquet ne surveille rien', () => {
    expect(sites.length).toBeGreaterThan(0);
  });

  it('chaque cible unique résout à un module chargeable via require()', () => {
    const uniqueTargets = [...new Map(sites.map((site) => [site.resolved, site])).values()];

    const failures = uniqueTargets.flatMap((site) => {
      try {
        require(site.resolved);
        return [];
      } catch (error) {
        return [`${site.specifier} (déclaré dans ${site.file}) → ${site.resolved} : ${String(error)}`];
      }
    });

    expect(failures).toEqual([]);
  });
});
