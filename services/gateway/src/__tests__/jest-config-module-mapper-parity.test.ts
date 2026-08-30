/**
 * Le CLIQUET qui interdit la divergence entre les DEUX tables `moduleNameMapper`
 * du gateway (#4505).
 *
 * `jest.config.json` (la config principale, verte à 1050 suites) et
 * `jest.config.temp.json` (partagée par `test:integration`, `test:e2ee`,
 * `test:performance`, `test:resilience`) compilent le MÊME code de
 * production — les mêmes imports relatifs suffixés `.js`, le même alias
 * `@meeshy/shared`. Rien ne justifie qu'elles le résolvent différemment ;
 * `testPathIgnorePatterns` est la SEULE différence voulue entre les deux
 * (la principale exclut les quatre familles hors gate, la temporaire existe
 * pour les inclure) — `moduleNameMapper` doit rester identique.
 *
 * `jest.config.temp.json` avait perdu trois des quatre règles de la table
 * principale, silencieusement : aucune CI n'exécute les quatre familles
 * qu'elle sert, donc rien ne pouvait rougir. Conséquence mesurée : les
 * suites échouaient à la RÉSOLUTION DE MODULE, avant qu'un seul test ne
 * s'exécute — `Cannot find module '../../../utils/logger-enhanced.js' from
 * 'src/services/zmq-translation/utils/zmq-helpers.ts'`, zéro test exécuté.
 * Deux inventaires tenus à la main sur la même règle divergent par
 * construction ; c'est la leçon que ce dépôt applique partout ailleurs
 * (cf. `CLAUDE.md` racine, § Pilotage — « deux tables pour une règle »).
 *
 * Un `.json` ne peut pas hériter d'un autre par lui-même — ce cliquet est
 * donc le seul rempart tant que les deux fichiers restent deux tables
 * distinctes. Il ne recopie PAS la table attendue en dur : recopier serait
 * exactement le défaut qu'il garde, pas sa réparation. Il relit
 * `jest.config.json` à l'exécution et exige que `jest.config.temp.json`
 * porte EXACTEMENT la même chose — le jour où quelqu'un ajoute une
 * cinquième règle à la config principale sans la reporter ici, ce test
 * tombe avant qu'une seule suite hors gate ne heurte le mur en silence.
 *
 * @jest-environment node
 */

import { describe, it, expect } from '@jest/globals';
import { readFileSync } from 'fs';
import { join } from 'path';

const GATEWAY_ROOT = join(__dirname, '../..');

type ModuleNameMapper = Readonly<Record<string, string>>;

type JestConfigFile = {
  readonly moduleNameMapper?: ModuleNameMapper;
};

const readModuleNameMapper = (fileName: string): ModuleNameMapper => {
  const path = join(GATEWAY_ROOT, fileName);
  const parsed = JSON.parse(readFileSync(path, 'utf8')) as JestConfigFile;
  return parsed.moduleNameMapper ?? {};
};

describe('jest.config.json et jest.config.temp.json résolvent les modules à l’identique (#4505)', () => {
  it('la config principale porte bien une table moduleNameMapper non triviale — sinon une comparaison vide passerait au vert', () => {
    const principale = readModuleNameMapper('jest.config.json');

    expect(Object.keys(principale).length).toBeGreaterThanOrEqual(4);
  });

  it("jest.config.temp.json ne diverge de jest.config.json sur AUCUNE règle moduleNameMapper", () => {
    const principale = readModuleNameMapper('jest.config.json');
    const temporaire = readModuleNameMapper('jest.config.temp.json');

    expect(temporaire).toEqual(principale);
  });
});
