// packages/shared/__tests__/ci/ios-gates-ci-parity.test.ts
//
// #6852 — une garde qui ne tourne nulle part reproduit le défaut qu'elle corrige.
//
// `apps/ios/scripts/check_simulator_election.sh` et `check_test_registration.sh`
// sont nés en livrant #6838 et #6839, verts en local, exécutés par aucun
// workflow. C'est la leçon 619 d'un cran plus haut : un témoin ne garde que ce
// qu'une INSCRIPTION fait jouer. #6839 existait parce qu'un témoin présent sur
// disque mais absent du `project.pbxproj` COMMITTÉ ne rougissait nulle part ;
// une garde présente sur disque mais absente de la CI est la même absence.
//
// Le dépôt a déjà payé cette leçon et l'a écrite dans l'en-tête de `ios.yml` :
// « le retrait du 2026-07-27 est passé inaperçu des semaines durant précisément
// parce que rien ne le surveillait ».
//
// Ce garde ne RECOPIE aucune liste : il énumère le répertoire, donc une garde
// neuve le fait rougir le jour où elle est écrite, sans que personne pense à
// lui. Placement : la suite `shared` est celle qui tourne sur CHAQUE PR
// (`ci.yml`, matrice `test`), donc la seule qui puisse constater l'absence —
// même raison que son voisin `ios-pr-compile-gate.test.ts`.

import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const REPO = new URL('../../../../', import.meta.url);
const WORKFLOW_PATH = fileURLToPath(new URL('.github/workflows/ios.yml', REPO));
const GATES_DIR = 'apps/ios/scripts';

/**
 * Les commentaires du workflow CITENT les gardes — l'en-tête de `ios.yml`
 * nomme `check-swift-viewbuilder.sh` sans l'exécuter. Les retirer avant toute
 * assertion évite qu'une prose satisfasse un garde que le YAML ne joue pas.
 */
const withoutComments = (yaml: string): string =>
  yaml
    .split('\n')
    .filter((line) => !/^\s*#/.test(line))
    .join('\n');

const WORKFLOW = withoutComments(readFileSync(WORKFLOW_PATH, 'utf8'));

const gates = (): readonly string[] =>
  readdirSync(fileURLToPath(new URL(GATES_DIR, REPO)))
    .filter((name) => name.startsWith('check_') && name.endsWith('.sh'))
    .sort();

/** Le bloc du job qui contient `needle`, des deux-points du nom jusqu'au job suivant. */
const jobContaining = (needle: string): string => {
  const lines = WORKFLOW.split('\n');
  const starts = lines.flatMap((line, index) => (/^ {2}\S.*:$/.test(line) ? [index] : []));
  const hit = lines.findIndex((line) => line.includes(needle));
  if (hit < 0) return '';
  const start = [...starts].reverse().find((index) => index < hit);
  if (start === undefined) return '';
  const end = starts.find((index) => index > start) ?? lines.length;
  return lines.slice(start, end).join('\n');
};

describe("les gardes iOS sont EXÉCUTÉES par la CI, pas seulement écrites", () => {
  /**
   * Sans ce premier témoin, déplacer ou renommer `apps/ios/scripts/` rendrait
   * la liste vide — et `[].every(...)` vaut `true`. Le garde passerait au vert
   * en ne vérifiant plus rien, ce qui est exactement la panne qu'il surveille.
   */
  it('a bien des gardes à surveiller — une liste vide verdirait toute seule', () => {
    expect(gates().length).toBeGreaterThan(0);
  });

  it.each(gates())('%s est exécutée par ios.yml', (gate) => {
    expect(WORKFLOW).toContain(`${GATES_DIR}/${gate}`);
  });

  /**
   * Une étape `continue-on-error` TOURNE sans JUGER. Le dépôt en a déjà onze
   * dans `Quality (bun)`, où `bun run lint` crache des milliers d'erreurs sans
   * faire rougir quoi que ce soit. Une garde inscrite là serait inscrite pour
   * rien — la seconde moitié de la même leçon.
   */
  it.each(gates())('%s tourne dans un job qui peut rougir', (gate) => {
    const job = jobContaining(`${GATES_DIR}/${gate}`);
    expect(job).not.toBe('');
    expect(job).not.toContain('continue-on-error');
  });

  /**
   * Le pool macOS est la ressource rare — `ios.yml` le dit lui-même à propos
   * de son job `scope`. Ces gardes lisent du texte : les faire attendre un
   * runner macOS retarderait leur verdict de plusieurs dizaines de minutes
   * pour une preuve qui tient en une seconde.
   */
  it.each(gates())('%s ne consomme pas le pool macOS', (gate) => {
    expect(jobContaining(`${GATES_DIR}/${gate}`)).toContain('runs-on: ubuntu-latest');
  });
});
