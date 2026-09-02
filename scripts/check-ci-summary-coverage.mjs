#!/usr/bin/env node
/**
 * Le CLIQUET qui interdit à un job de CI d'échapper au RÉSUMÉ (#4860).
 *
 * ## Ce qu'il garde, et pourquoi ça n'allait pas de soi
 *
 * `.github/workflows/ci.yml` finit par un job agrégateur qui publie un tableau
 * « Job | Status » dans `$GITHUB_STEP_SUMMARY`. C'est ce tableau qu'un humain
 * lit quand il demande « la CI est-elle verte ? ». Il tient sa matière de deux
 * listes ÉCRITES À LA MAIN, et rien ne les confrontait au workflow :
 *
 *   1. le `needs:` de l'agrégateur — un job absent n'y bloque rien ;
 *   2. les lignes du tableau — une ligne absente ne se voit pas, et une ligne
 *      dont le statut est un MOT EN DUR se voit encore moins.
 *
 * Les deux avaient dérivé au 2026-09-02. `chaines-v3` (le gate des chaînes
 * web-v3, écrit exprès, avec son étape nommée « Gate chaînes ») ne figurait
 * dans aucune des deux ; `test-python`, RALLUMÉ au sprint 0.3, était annoncé
 * « disabled » par un mot écrit à la main, pendant qu'il consommait un runner
 * à chaque poussée.
 *
 * > **Une liste tenue à la main est en retard par construction, et son retard
 * > ne ressemble pas à une erreur** — il ressemble à une liste. C'est la forme
 * > exacte de l'`include` énuméré du `tsconfig` du gateway, qui laissait six
 * > fichiers de production hors du compilateur en ayant l'air complet.
 *
 * ## Ce qui est DÉRIVÉ plutôt que nommé
 *
 * L'agrégateur n'est pas reconnu par son nom (`summary`) : il est reconnu par
 * ce qu'il FAIT — `if: always()` et une écriture dans `$GITHUB_STEP_SUMMARY`.
 * Le renommer ne doit pas éteindre le cliquet en silence, et c'est le genre
 * d'extinction qu'un nom en dur produit sans bruit. S'il n'y en a pas
 * exactement UN, le cliquet ROUGIT plutôt que de choisir.
 *
 * ## Les exemptions sont NOMMÉES, avec leur raison
 *
 * `HORS_RESUME` est un inventaire à faire DÉCROÎTRE, jamais une soupape : un
 * job qu'on y range doit porter la raison pour laquelle son résultat n'a pas
 * à figurer au tableau. Il est VIDE aujourd'hui, et c'est un état à défendre.
 *
 * Usage :
 *   node scripts/check-ci-summary-coverage.mjs             # le cliquet
 *   node scripts/check-ci-summary-coverage.mjs --self-test # prouve qu'il tombe
 */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { jobsOf, stepsOf } from './lib/lecture-workflow.mjs';

const RACINE = join(dirname(fileURLToPath(import.meta.url)), '..');
const WORKFLOW = join(RACINE, '.github/workflows/ci.yml');

/**
 * Les jobs dont le résultat n'a délibérément pas à figurer au tableau, chacun
 * avec sa raison. À faire DÉCROÎTRE. Vide au 2026-09-02.
 */
const HORS_RESUME = Object.freeze({});

/** Le `needs:` d'un job, sous sa forme en ligne `[a, b, c]` ou en liste. */
const needsOf = (job) => {
  const textes = job.body.map((entree) => entree.text);
  const debut = textes.findIndex((texte) => /^ {4}needs:/.test(texte));
  if (debut === -1) return [];
  const enLigne = /^ {4}needs:\s*\[(.*)\]\s*$/.exec(textes[debut]);
  if (enLigne) {
    return enLigne[1]
      .split(',')
      .map((nom) => nom.trim())
      .filter((nom) => nom !== '');
  }
  const seul = /^ {4}needs:\s*([A-Za-z0-9_-]+)\s*$/.exec(textes[debut]);
  if (seul) return [seul[1]];
  const liste = [];
  for (let index = debut + 1; index < textes.length; index += 1) {
    const element = /^ {6}- ([A-Za-z0-9_-]+)\s*$/.exec(textes[index]);
    if (!element) break;
    liste.push(element[1]);
  }
  return liste;
};

const conditionOf = (job) => {
  const texte = job.body.map((entree) => entree.text).find((ligne) => /^ {4}if:/.test(ligne));
  return texte === undefined ? null : texte.slice(texte.indexOf(':') + 1).trim();
};

/** Le script complet d'un job — toutes ses étapes `run`, concaténées. */
const scriptOf = (job) =>
  stepsOf(job)
    .map((etape) => etape.run ?? '')
    .join('\n');

/**
 * Les lignes de tableau que le script publie, sous la forme
 * `| Libellé | cellule de statut |`. On ne retient que les lignes à DEUX
 * colonnes qui ne sont ni l'en-tête ni son filet.
 */
const lignesDeTableau = (script) => {
  const lignes = [];
  for (const ligne of script.split('\n')) {
    const table = /\|\s*([^|]+?)\s*\|\s*([^|]*?)\s*\|/.exec(ligne);
    if (!table) continue;
    const [, libelle, statut] = table;
    if (/^-+$/.test(libelle) || /^-+$/.test(statut)) continue;
    if (libelle === 'Job' && statut === 'Status') continue;
    lignes.push({ libelle, statut, source: ligne.trim() });
  }
  return lignes;
};

const JOB_DU_STATUT = /^\$\{\{\s*needs\.([A-Za-z0-9_-]+)\.result\s*\}\}$/;

/** Rend la liste des violations — vide quand le workflow est conforme. */
export const violations = (workflow) => {
  const jobs = jobsOf(workflow);
  const agregateurs = jobs.filter(
    (job) => conditionOf(job) === 'always()' && scriptOf(job).includes('$GITHUB_STEP_SUMMARY'),
  );

  if (agregateurs.length !== 1) {
    return [
      `agrégateur introuvable ou multiple : ${agregateurs.length} job(s) avec ` +
        `if: always() écrivant dans $GITHUB_STEP_SUMMARY (attendu : exactement 1)`,
    ];
  }

  const [agregateur] = agregateurs;
  const attendus = needsOf(agregateur);
  const lignes = lignesDeTableau(scriptOf(agregateur));
  const faits = [];

  // Règle 1 — COUVERTURE : aucun job hors du `needs` de l'agrégateur.
  for (const job of jobs) {
    if (job.name === agregateur.name) continue;
    if (attendus.includes(job.name)) continue;
    if (job.name in HORS_RESUME) continue;
    faits.push(
      `le job « ${job.name} » (ligne ${job.line}) n'est pas dans le needs de ` +
        `« ${agregateur.name} » : son échec ne paraîtra dans aucun résumé`,
    );
  }

  // Règle 2 — RESTITUTION : chaque dépendance a sa ligne, qui INTERPOLE son résultat.
  const restitues = new Set(
    lignes.map((ligne) => JOB_DU_STATUT.exec(ligne.statut)?.[1]).filter((nom) => nom !== undefined),
  );
  for (const nom of attendus) {
    if (restitues.has(nom)) continue;
    faits.push(
      `« ${nom} » est attendu par « ${agregateur.name} » mais aucune ligne du ` +
        `tableau ne rend needs.${nom}.result`,
    );
  }

  // Règle 3 — AUCUN MOT EN DUR : un statut qui n'interpole rien ne mesure rien.
  for (const ligne of lignes) {
    if (JOB_DU_STATUT.test(ligne.statut)) continue;
    faits.push(
      `la ligne « ${ligne.libelle} » porte un statut ÉCRIT À LA MAIN ` +
        `(« ${ligne.statut} ») : il ne suivra jamais le job`,
    );
  }

  return faits;
};

/**
 * Les mutations qui doivent faire TOMBER le cliquet. Un cliquet qu'on ne voit
 * jamais rougir n'est pas un cliquet — et les trois règles se prouvent
 * séparément, sans quoi une seule pourrait porter les trois.
 */
const MUTATIONS = [
  {
    nom: 'règle 1 — un job retiré du needs',
    muter: (texte) => texte.replace('lifecycle-v3, chaines-v3,', 'lifecycle-v3,'),
    attendu: /n'est pas dans le needs/,
  },
  {
    nom: 'règle 2 — une ligne de tableau retirée',
    muter: (texte) =>
      texte
        .split('\n')
        .filter((ligne) => !ligne.includes('| Security | ${{ needs.security.result }} |'))
        .join('\n'),
    attendu: /aucune ligne du tableau ne rend needs\.security\.result/,
  },
  {
    nom: 'règle 3 — un statut écrit à la main',
    muter: (texte) =>
      texte.replace('| Prisma | ${{ needs.prisma.result }} |', '| Prisma | disabled |'),
    attendu: /statut ÉCRIT À LA MAIN/,
  },
];

const selfTest = (texte) => {
  let echecs = 0;
  const base = violations(texte);
  if (base.length !== 0) {
    console.error("self-test : l'état de départ n'est pas vert, les mutations ne prouvent rien");
    base.forEach((faute) => console.error(`  - ${faute}`));
    return 1;
  }
  for (const mutation of MUTATIONS) {
    const mute = mutation.muter(texte);
    if (mute === texte) {
      console.error(`✗ ${mutation.nom} : la mutation n'a RIEN changé — elle ne prouve rien`);
      echecs += 1;
      continue;
    }
    const trouvees = violations(mute);
    if (trouvees.some((faute) => mutation.attendu.test(faute))) {
      console.log(`✓ ${mutation.nom}`);
    } else {
      console.error(`✗ ${mutation.nom} : le cliquet N'A PAS rougi`);
      trouvees.forEach((faute) => console.error(`    ${faute}`));
      echecs += 1;
    }
  }
  return echecs === 0 ? 0 : 1;
};

const texte = readFileSync(WORKFLOW, 'utf8');

if (process.argv.includes('--self-test')) {
  process.exit(selfTest(texte));
}

const faits = violations(texte);
if (faits.length === 0) {
  console.log('Résumé de CI : tous les jobs y figurent, et aucun statut n\'est écrit à la main.');
  process.exit(0);
}

console.error('Le résumé de CI ne rend pas compte de tous les jobs :');
faits.forEach((faute) => console.error(`  - ${faute}`));
process.exit(1);
