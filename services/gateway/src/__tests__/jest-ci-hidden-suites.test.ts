/**
 * Le CLIQUET de ce que la CI NE LANCE PAS (#4507).
 *
 * `jest.config.json` — la seule configuration qu'un workflow exécute — écarte
 * onze chemins par `testPathIgnorePatterns`. Ces chemins portent **25 fichiers
 * de témoins, 12 765 lignes**, entretenus, compilés par personne, exécutés
 * nulle part.
 *
 * > Une suite supprimée ne trompe personne. Une suite rouge se voit. **Une
 * > suite qu'on entretient et que rien n'exécute affirme une couverture qui
 * > n'existe pas** — et le coût est payé deux fois : à l'écriture, puis à
 * > chaque relecture qui la croit vivante.
 *
 * ## Ce que ce cliquet fait, et ce qu'il ne fait pas
 *
 * Il ne rallume rien. Rallumer ces 25 fichiers demande un travail réel, mesuré
 * en instruisant #4507 (voir le tableau ci-dessous), et chacun est son propre
 * lot. Ce que ce cliquet fait, c'est répondre au critère 2 de #4507 — *« leur
 * état est lisible sans lancer quoi que ce soit »* — et empêcher que la liste
 * s'allonge en silence.
 *
 * Deux règles, la seconde étant la seule qui morde au quotidien :
 *
 * 1. tout chemin écarté est DÉCLARÉ ici, avec le nombre de fichiers qu'il
 *    cache et la raison mesurée de son extinction ;
 * 2. **le nombre de fichiers cachés ne peut que DESCENDRE.** Écarter un
 *    douzième chemin, ou laisser un chemin déjà écarté en avaler un de plus,
 *    fait rougir ce test.
 *
 * Un chemin rallumé disparaît d'ici sans faire rougir la garde — la règle 2
 * est un plafond, jamais une égalité. C'est ce qui rend le chantier faisable
 * sans bloquer les issues qui doivent écrire dans ces répertoires.
 *
 * ## Pourquoi elles sont éteintes — mesuré, pas supposé
 *
 * #4507 affirmait que ces suites « exigent MongoDB et Redis ». C'est vrai pour
 * certaines, et ce n'est pas ce qui les bloque en premier. Mesure du
 * 2026-08-31, après réparation du `transform` de `jest.config.temp.json` (sans
 * quoi RIEN ne compilait, cf. `jest-config-parity.test.ts`) :
 *
 * | famille | ce qui tombe d'abord |
 * |---|---|
 * | `integration/`, `e2ee/` | `Cannot find module '../../../shared/types/encryption'` — douze occurrences. Des imports RELATIFS vers une arborescence que le dépôt a quittée en passant à `@meeshy/shared`. |
 * | `notifications-*`, `NotificationService` | échecs de COMPORTEMENT sur les doubles Firebase/APNs — les suites ont vieilli contre un service qui a évolué. |
 * | `resilience/`, `performance/` | mêmes imports périmés, plus un dépassement de délai. |
 *
 * Autrement dit : **elles n'ont pas été éteintes parce qu'elles coûtaient cher
 * à exécuter, mais parce qu'elles ont cessé de compiler et que les éteindre
 * était moins cher que de les migrer.** La distinction change l'arbitrage
 * qu'on peut leur appliquer, et c'est pourquoi elle est écrite ici plutôt que
 * supposée.
 *
 * @jest-environment node
 */

import { describe, it, expect } from '@jest/globals';
import { readdirSync, readFileSync, statSync } from 'fs';
import { join, relative, sep } from 'path';

const GATEWAY_ROOT = join(__dirname, '../..');

type CheminEteint = {
  /** Le motif exact, tel que `testPathIgnorePatterns` le porte. */
  readonly motif: string;
  /** Combien de fichiers de témoins il cache, mesuré le 2026-08-31. */
  readonly fichiers: number;
  /** Ce qui tombe EN PREMIER si on le rallume — mesuré, jamais supposé. */
  readonly pourquoi: string;
};

const ETEINTS: readonly CheminEteint[] = [
  {
    motif: '<rootDir>/src/__tests__/e2ee/',
    fichiers: 1,
    pourquoi: "imports relatifs vers `shared/types/encryption`, arborescence quittée pour `@meeshy/shared`",
  },
  {
    motif: '<rootDir>/src/__tests__/integration/',
    fichiers: 10,
    pourquoi: "mêmes imports périmés ; certaines exigent en plus MongoDB et Redis",
  },
  {
    motif: '<rootDir>/src/__tests__/resilience/',
    fichiers: 1,
    pourquoi: 'imports périmés, plus un dépassement de délai à 30 s',
  },
  {
    motif: '<rootDir>/src/__tests__/performance/',
    fichiers: 1,
    pourquoi: 'imports périmés ; mesure de charge, à faire tourner hors du chemin de poussée',
  },
  {
    motif: '<rootDir>/src/__tests__/notifications-',
    fichiers: 4,
    pourquoi: 'échecs de comportement sur les doubles Firebase et APNs — suites vieillies contre un service qui a évolué',
  },
  {
    motif: '<rootDir>/src/__tests__/NotificationService',
    fichiers: 1,
    pourquoi: 'idem — et c\'est la surface la plus dense du dépôt en règles de confidentialité',
  },
  {
    motif: '<rootDir>/src/__tests__/password-reset',
    fichiers: 1,
    pourquoi: 'non instruit — à mesurer avant de trancher',
  },
  {
    motif: '<rootDir>/src/__tests__/unit/StatusService',
    fichiers: 1,
    pourquoi: 'non instruit — à mesurer avant de trancher',
  },
  {
    motif: '<rootDir>/src/__tests__/unit/MaintenanceService',
    fichiers: 1,
    pourquoi: 'non instruit — à mesurer avant de trancher',
  },
  {
    motif: '<rootDir>/src/__tests__/unit/encryption/shared-encryption',
    fichiers: 1,
    pourquoi: 'non instruit — à mesurer avant de trancher',
  },
  {
    motif: '<rootDir>/src/dma-interoperability/',
    fichiers: 3,
    pourquoi: 'non instruit — à mesurer avant de trancher',
  },
];

const FICHIERS_CACHES = ETEINTS.reduce((somme, e) => somme + e.fichiers, 0);

const lireMotifsEteints = (): readonly string[] => {
  const config = JSON.parse(
    readFileSync(join(GATEWAY_ROOT, 'jest.config.json'), 'utf8')
  ) as { readonly testPathIgnorePatterns?: readonly string[] };

  return (config.testPathIgnorePatterns ?? []).filter((motif) => motif !== '/node_modules/');
};

const estTemoin = (chemin: string): boolean =>
  chemin.endsWith('.test.ts') && !chemin.split(sep).includes('node_modules');

const parcourir = (dir: string): readonly string[] => {
  if (!statSync(dir, { throwIfNoEntry: false })?.isDirectory()) return [];
  return readdirSync(dir, { withFileTypes: true }).flatMap((entree) => {
    const complet = join(dir, entree.name);
    if (entree.isDirectory()) return parcourir(complet);
    return estTemoin(complet) ? [complet] : [];
  });
};

/**
 * Les témoins que la config de la CI écarte réellement, mesurés sur le disque
 * plutôt que recopiés depuis la table ci-dessus.
 */
const temoinsEcartes = (): readonly string[] => {
  const motifs = lireMotifsEteints().map((motif) =>
    motif.replace('<rootDir>/', '').replace(/\/$/, '')
  );

  return parcourir(join(GATEWAY_ROOT, 'src'))
    .map((chemin) => relative(GATEWAY_ROOT, chemin))
    .filter((chemin) => motifs.some((motif) => chemin.startsWith(motif)));
};

describe('ce que la CI ne lance pas est DÉCLARÉ, et ne peut que rétrécir (#4507)', () => {
  // Un balayage qui ne voit rien déclarerait zéro témoin caché, et passerait
  // au vert pour la pire des raisons.
  it('voit bien les témoins du gateway — sinon un balayage vide passerait au vert', () => {
    expect(parcourir(join(GATEWAY_ROOT, 'src')).length).toBeGreaterThan(300);
  });

  it('règle 1 — tout chemin écarté par la CI est déclaré ici, avec sa raison', () => {
    const declares = new Set(ETEINTS.map((e) => e.motif));
    const nonDeclares = lireMotifsEteints().filter((motif) => !declares.has(motif));

    expect(nonDeclares).toEqual([]);
  });

  it('règle 1 bis — aucune déclaration ne survit à l’extinction qu’elle décrivait', () => {
    const reels = new Set(lireMotifsEteints());
    const perimes = ETEINTS.map((e) => e.motif).filter((motif) => !reels.has(motif));

    expect(perimes).toEqual([]);
  });

  it('règle 2 — le nombre de témoins que la CI n’exécute pas ne remonte pas', () => {
    expect(temoinsEcartes().length).toBeLessThanOrEqual(FICHIERS_CACHES);
  });

  it('chaque extinction porte une raison MESURÉE, jamais une simple mention', () => {
    for (const eteint of ETEINTS) {
      expect(eteint.pourquoi.length).toBeGreaterThan(20);
      expect(eteint.fichiers).toBeGreaterThan(0);
    }
  });
});
