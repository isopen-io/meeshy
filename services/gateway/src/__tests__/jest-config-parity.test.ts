/**
 * Le CLIQUET qui interdit la divergence entre les DEUX configurations Jest du
 * gateway (#4505, ÉLARGI par #4507).
 *
 * `jest.config.json` (la config que la CI lance) et `jest.config.temp.json`
 * (celle des familles `integration`, `e2ee`, `performance`, `resilience`)
 * compilent le MÊME code de production. Rien ne justifie qu'elles le
 * résolvent, le transforment ou l'amorcent différemment.
 *
 * ## Ce que la première écriture de ce cliquet affirmait — et qui était FAUX
 *
 * Elle disait, en toutes lettres : « `testPathIgnorePatterns` est la SEULE
 * différence voulue entre les deux ». Mesuré en instruisant #4507 : les deux
 * fichiers différaient sur **cinq** clés, et l'une d'elles coûtait cher.
 *
 * `jest.config.temp.json` portait `"transform": {"^.+\\.ts$": "ts-jest"}` — un
 * `ts-jest` NU, sans `tsconfig`. Il retombait donc sur `tsconfig.json`, qui ne
 * déclare pas les types de Jest. Conséquence : **toute suite employant le
 * global `jest` échouait à COMPILER**, avec `TS2304: Cannot find name 'jest'`,
 * avant qu'un seul test ne s'exécute. C'est-à-dire, en pratique, toutes.
 *
 * > Les quatre familles « ne tournent nulle part » (#4507) pour une raison plus
 * > prosaïque que le coût d'un service MongoDB : **la seule configuration qui
 * > pouvait les lancer était elle-même incapable de les compiler.** Et rien ne
 * > le disait, puisque aucune CI ne l'exécute — le défaut se cachait derrière
 * > le défaut qu'il causait.
 *
 * Le cliquet de #4505 ne pouvait pas l'attraper : il ne comparait QUE
 * `moduleNameMapper`. **Une garde de parité qui couvre une clé pendant qu'une
 * autre diverge donne exactement la confiance qu'elle ne mérite pas** — c'est
 * la forme de la leçon 261 (un inventaire ferme une classe dans la langue où
 * on l'a énoncée) appliquée à une garde de parité.
 *
 * ## D'où la forme retenue : liste d'EXCEPTIONS, jamais liste d'inclusions
 *
 * Ce cliquet compare désormais **toutes** les clés et n'excepte que celles
 * dont la divergence est VOULUE et écrite ci-dessous. Une clé ajoutée demain à
 * l'une des deux configurations est donc couverte par défaut : c'est la seule
 * forme qui ne redemande pas à quelqu'un de penser à l'élargir.
 *
 * Il ne recopie AUCUNE valeur attendue en dur — recopier serait précisément le
 * défaut qu'il garde. Il relit les deux fichiers à l'exécution.
 *
 * @jest-environment node
 */

import { describe, it, expect } from '@jest/globals';
import { readFileSync } from 'fs';
import { join } from 'path';

const GATEWAY_ROOT = join(__dirname, '../..');

type ConfigJest = Readonly<Record<string, unknown>>;

/**
 * Les clés dont la divergence est VOULUE, chacune avec sa raison. Toute clé
 * absente de cette table doit être identique dans les deux fichiers.
 */
const DIVERGENCES_VOULUES: Readonly<Record<string, string>> = {
  testPathIgnorePatterns:
    "c'est la raison d'être du second fichier : la config de la CI écarte onze " +
    'chemins, la temporaire les inclut. Le contenu de cette liste est gouverné ' +
    'par son propre cliquet, `jest-ci-hidden-suites.test.ts`.',
  collectCoverage:
    'la couverture est une politique de la CI, pas une propriété de la résolution.',
  collectCoverageFrom:
    'idem — et les deux périmètres diffèrent parce que les familles hors gate ' +
    "ne couvrent pas les mêmes couches que la suite unitaire.",
  coverageThreshold:
    "le seuil (87/80/86/83) n'a de sens que sur le périmètre que la CI mesure " +
    'réellement ; l\'imposer à une exécution partielle la ferait échouer sur ' +
    'une couverture qu\'elle ne prétend pas atteindre.',
};

const lireConfig = (fileName: string): ConfigJest =>
  JSON.parse(readFileSync(join(GATEWAY_ROOT, fileName), 'utf8')) as ConfigJest;

const clesComparables = (a: ConfigJest, b: ConfigJest): readonly string[] =>
  [...new Set([...Object.keys(a), ...Object.keys(b)])]
    .filter((cle) => DIVERGENCES_VOULUES[cle] === undefined)
    .sort();

describe('jest.config.json et jest.config.temp.json ne divergent que là où c’est voulu (#4505, #4507)', () => {
  // Deux configurations vides seraient « identiques ». La borne le dit avant
  // toute comparaison.
  it('les deux fichiers portent bien une configuration non triviale', () => {
    expect(Object.keys(lireConfig('jest.config.json')).length).toBeGreaterThanOrEqual(10);
    expect(Object.keys(lireConfig('jest.config.temp.json')).length).toBeGreaterThanOrEqual(10);
  });

  it('la comparaison porte sur un nombre substantiel de clés — sinon la table d’exceptions aurait tout avalé', () => {
    const principale = lireConfig('jest.config.json');
    const temporaire = lireConfig('jest.config.temp.json');

    expect(clesComparables(principale, temporaire).length).toBeGreaterThanOrEqual(8);
  });

  it("ne diverge sur AUCUNE clé hors de celles dont la divergence est déclarée", () => {
    const principale = lireConfig('jest.config.json');
    const temporaire = lireConfig('jest.config.temp.json');

    const divergentes = clesComparables(principale, temporaire).filter(
      (cle) => JSON.stringify(principale[cle]) !== JSON.stringify(temporaire[cle])
    );

    expect(divergentes).toEqual([]);
  });

  // La clé qui a coûté le plus cher mérite son témoin nommé : une régression
  // sur `transform` ne se lit pas dans une liste de clés, elle se lit dans le
  // fait que plus rien ne compile.
  it('transforme le TypeScript avec le MÊME tsconfig des deux côtés', () => {
    const principale = lireConfig('jest.config.json');
    const temporaire = lireConfig('jest.config.temp.json');

    expect(JSON.stringify(temporaire.transform)).toBe(JSON.stringify(principale.transform));
    expect(JSON.stringify(principale.transform)).toContain('tsconfig.test.json');
  });

  it('chaque divergence déclarée porte une raison écrite, jamais une simple permission', () => {
    for (const [cle, raison] of Object.entries(DIVERGENCES_VOULUES)) {
      expect(cle.length).toBeGreaterThan(0);
      expect(raison.length).toBeGreaterThan(40);
    }
  });
});
