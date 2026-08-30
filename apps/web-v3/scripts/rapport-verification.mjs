#!/usr/bin/env node
/**
 * LE rapport de la machine de verification de la v3 (§ 9).
 *
 *   node scripts/rapport-verification.mjs [--base http://127.0.0.1:3300]
 *                                         [--racine <zone>] [--sans-navigateur]
 *                                         [--json rapport.json]
 *
 * Il invoque les QUATRE mesures et rend UN resultat chiffre :
 *   1. ordre des ecrans      docs/product/MeeshyWebV3Design/ordre-des-ecrans.js
 *   2. rendu (diff + encre)  docs/product/MeeshyWebV3Design/compare-rendu.js
 *   3. poids reseau (CDP)    scripts/mesure-reseau.mjs
 *   4. budget de bundle      scripts/check-bundle-budget.mjs
 *
 * Trois verdicts, trois codes — et la hierarchie porte tout :
 *   vert (0)      les quatre ont tourne et sont vertes ;
 *   echec (1)     au moins une ROUGIT ;
 *   incomplet (3) aucune ne rougit mais au moins une n'a PAS TOURNE, ou a
 *                 tourne SANS CONCLURE (rc=3 : page en erreur, chemin sans
 *                 plafond, grandeur non mesuree, plafond de temps non
 *                 confronte faute de bridage, ligne du role premier jamais
 *                 ouverte). Les deux se distinguent dans le rapport —
 *                 `non-executee` contre `indeterminee` — parce que « je n'ai
 *                 pas pu mesurer » et « j'ai mesure et je refuse de conclure »
 *                 ne se corrigent pas au meme endroit.
 *
 * `echec` prime sur `incomplet` : une mesure qui rougit ne doit jamais etre
 * masquee par une mesure absente. Et `incomplet` n'est jamais vert : un
 * tableau de bord ou deux mesures sur quatre n'ont pas tourne, avec un vert en
 * bas de page, est exactement le rapport qui ne sert a rien.
 */
import { spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ICI = dirname(fileURLToPath(import.meta.url));
const ZONE = join(ICI, '..');
const DEPOT = join(ZONE, '..', '..');
const PLANCHE = join(DEPOT, 'docs', 'product', 'MeeshyWebV3Design');

const args = process.argv.slice(2);
const arg = (nom, defaut) => {
  const i = args.indexOf(nom);
  return i >= 0 && args[i + 1] !== undefined ? args[i + 1] : defaut;
};
const drapeau = (nom) => args.includes(nom);

const racine = resolve(arg('--racine', ZONE));
const base = (arg('--base', 'http://127.0.0.1:3300') ?? '').replace(/\/$/, '');
const profilReseau = arg('--reseau', '3g-fast');
const tirages = arg('--tirages', '5');
const sansNavigateur = drapeau('--sans-navigateur');
const json = arg('--json', null);
const travail = mkdtempSync(join(tmpdir(), 'rapport-v3-'));

/** Une commande se lit depuis la racine du depot ; ce qui n'y vit pas reste absolu. */
const lisible = (jeton) => {
  if (!jeton.startsWith('/')) return jeton;
  const relatif = relative(DEPOT, jeton);
  return relatif && !relatif.startsWith('..') ? relatif : jeton;
};
const commandeLisible = (argv) => `node ${argv.map(lisible).join(' ')}`;

/**
 * rc=3 n'est ni un echec ni une absence : c'est une mesure qui a TOURNE et qui
 * refuse de prononcer un verdict — page en erreur, chemin sans plafond,
 * grandeur non mesuree, plafond de temps non confronte faute de bridage, ligne
 * du role premier jamais ouverte. La confondre avec « non-executee » perdrait
 * la seule information qui distingue « je n'ai pas pu mesurer » de « j'ai
 * mesure et je ne conclus pas ».
 */
const classerMesure = (code) =>
  code === 0 ? 'vert' : code === 1 ? 'echec' : code === 3 ? 'indeterminee' : 'non-executee';

/**
 * Une mesure : ce qu'elle est, comment on la rejoue, comment on lit son code de
 * sortie, et ce qu'on retient de sa sortie JSON. La lecture du code est propre a
 * CHAQUE mesure — le gate d'ordre echoue en 1, 2, 3 ou 4, la mesure de poids
 * reseau reserve 3 a « incomplete » : une table commune trahirait les deux.
 */
const MESURES = [
  {
    id: 'ordre',
    titre: "Gate d'ordre des ecrans (DAG de la matrice)",
    argv: [join(PLANCHE, 'ordre-des-ecrans.js')],
    exigeNavigateur: false,
    classer: (code) => (code === 0 ? 'vert' : 'echec'),
    chiffres: ({ stdout }) => {
      const [, ecrans] = /(\d+) ecrans/.exec(stdout) ?? [];
      const [, lots] = /(\d+) lots/.exec(stdout) ?? [];
      return { ecrans: Number(ecrans ?? 0), lots: Number(lots ?? 0) };
    },
  },
  {
    id: 'rendu',
    titre: "Conformite du rendu a la cible (diff par region + axe d'encre)",
    argv: [join(PLANCHE, 'compare-rendu.js'), '--base', base, '--json', join(travail, 'rendu.json')],
    exigeNavigateur: true,
    fichier: join(travail, 'rendu.json'),
    classer: (code) => (code === 0 ? 'vert' : code === 1 ? 'echec' : 'non-executee'),
    chiffres: ({ contenu }) =>
      contenu ? { vues: contenu.total ?? null, hors_cible: contenu.echecs ?? null } : {},
  },
  {
    id: 'poids-reseau',
    titre: 'Poids reseau et Web Vitals (CDP)',
    argv: [
      join(ZONE, 'scripts', 'mesure-reseau.mjs'),
      '--base',
      base,
      '--racine',
      racine,
      '--reseau',
      profilReseau,
      '--tirages',
      tirages,
      '--json',
      join(travail, 'reseau.json'),
    ],
    exigeNavigateur: true,
    fichier: join(travail, 'reseau.json'),
    classer: classerMesure,
    /**
     * `pages` / `octets_max` / `depassements` ne disaient RIEN de ce qui n'a
     * PAS ete mesure : « 4/4 vertes » etait atteignable sans avoir jamais
     * ouvert un ecran du role premier, dont toutes les routes sont
     * parametrees. La couverture est donc rendue AVEC le chiffre — combien de
     * lignes de budget existent, combien ont ete ouvertes, et lesquelles du
     * role premier manquent a l'appel.
     */
    chiffres: ({ contenu }) => {
      if (!contenu) return {};
      const peses = (contenu.mesures ?? []).map((m) => m.octets_total).filter((o) => o !== null);
      return {
        pages: contenu.mesures?.length ?? 0,
        octets_max: peses.length ? Math.max(...peses) : null,
        depassements: contenu.depassements?.length ?? 0,
        conditions: contenu.conditions ?? null,
        lignes_de_budget: contenu.couverture?.lignes_de_budget ?? null,
        mesurees: contenu.couverture?.mesurees?.length ?? null,
        non_mesurees: contenu.couverture?.non_mesurees?.length ?? null,
        role_premier_non_mesure: contenu.couverture?.role_premier_non_mesure ?? [],
      };
    },
  },
  {
    id: 'budget-bundle',
    titre: 'Budget de bundle par route (manifeste de build)',
    argv: [
      join(ZONE, 'scripts', 'check-bundle-budget.mjs'),
      '--racine',
      racine,
      '--json',
      join(travail, 'budget.json'),
    ],
    exigeNavigateur: false,
    fichier: join(travail, 'budget.json'),
    classer: classerMesure,
    chiffres: ({ contenu }) =>
      contenu
        ? {
            routes: contenu.routes?.length ?? 0,
            regressions: contenu.regressions?.length ?? 0,
            sans_plafond: contenu.sans_plafond?.length ?? 0,
            groupes: (contenu.groupes ?? []).map((g) => ({
              groupe: g.groupe,
              socle_octets: g.socle_octets,
              ecran_le_plus_lourd_octets: g.ecran_le_plus_lourd_octets,
              cumul_p95_octets: g.cumul_p95_octets,
            })),
            hors_cible: contenu.ecarts_de_cible?.length ?? 0,
          }
        : {},
  },
];

const executer = (mesure) => {
  const commande = commandeLisible(mesure.argv);

  if (sansNavigateur && mesure.exigeNavigateur) {
    return {
      id: mesure.id,
      titre: mesure.titre,
      commande,
      statut: 'non-executee',
      code: null,
      raison: '--sans-navigateur : cette mesure exige un navigateur et une cible servie',
    };
  }

  const sortie = spawnSync(process.execPath, mesure.argv, { encoding: 'utf8' });
  const contenu =
    mesure.fichier && existsSync(mesure.fichier)
      ? JSON.parse(readFileSync(mesure.fichier, 'utf8'))
      : null;
  const statut = sortie.error ? 'non-executee' : mesure.classer(sortie.status ?? 2);
  const raison =
    statut === 'non-executee' || statut === 'indeterminee'
      ? (sortie.error?.message ?? (sortie.stderr || '').trim().split('\n').slice(-3).join(' ') ??
        'mesure non aboutie')
      : undefined;

  return {
    id: mesure.id,
    titre: mesure.titre,
    commande,
    statut,
    code: sortie.status ?? null,
    ...(raison ? { raison } : {}),
    chiffres: mesure.chiffres({ stdout: sortie.stdout ?? '', contenu }),
    ...(statut === 'echec' || statut === 'indeterminee'
      ? { detail: (sortie.stderr || sortie.stdout || '').trim().split('\n').slice(-6) }
      : {}),
  };
};

const mesures = MESURES.map(executer);
const verdict = mesures.some((m) => m.statut === 'echec')
  ? 'echec'
  : mesures.some((m) => m.statut === 'non-executee' || m.statut === 'indeterminee')
    ? 'incomplet'
    : 'vert';
const CODE = { vert: 0, echec: 1, incomplet: 3 };

const rapport = { genere_le: new Date().toISOString(), base, racine, verdict, mesures };
if (json) writeFileSync(resolve(json), `${JSON.stringify(rapport, null, 2)}\n`);

process.stdout.write('\n=== Machine de verification — web v3 ===\n');
for (const m of mesures) {
  process.stdout.write(`\n[${m.statut.toUpperCase()}] ${m.id} — ${m.titre}\n`);
  process.stdout.write(`  commande : ${m.commande}\n`);
  if (m.raison) process.stdout.write(`  raison   : ${m.raison}\n`);
  for (const [cle, valeur] of Object.entries(m.chiffres ?? {})) {
    process.stdout.write(`  ${cle.padEnd(9)}: ${JSON.stringify(valeur)}\n`);
  }
  for (const ligne of m.detail ?? []) process.stdout.write(`  | ${ligne}\n`);
}
process.stdout.write(`\nVERDICT : ${verdict} (${mesures.filter((m) => m.statut === 'vert').length}/4 vertes)\n`);
if (verdict === 'incomplet') {
  process.stdout.write(
    "Un rapport incomplet n'est pas vert : les mesures non executees ou indeterminees sont nommees ci-dessus.\n",
  );
}

process.exit(CODE[verdict]);
