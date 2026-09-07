#!/usr/bin/env node
/**
 * VÉRIFIE QU'AUCUNE SOURCE DE L'APPLICATION N'EST AVALÉE PAR `.gitignore`.
 *
 * POURQUOI CE TÉMOIN EXISTE. La racine ignore `**&#47;*.d.*` — une règle qui
 * vise les déclarations GÉNÉRÉES, et qui emporte aussi celles qu'on ÉCRIT. Le
 * dépôt l'a payé une première fois sur l'autre application (bloc de négations
 * de `.gitignore`), et une seconde fois ici, à l'identique :
 *
 *   · `src/bun-test.d.ts` déclare le module `bun:test` — jamais commité depuis
 *     la création de l'application ;
 *   · `scripts/lib/routes-institutionnelles.d.mts` type la source unique des
 *     cinq adresses — jamais commité non plus.
 *
 * Les deux sont apparus d'un coup, en quatre TS2307/TS7016, à la PREMIÈRE
 * exécution où la CI type-checkait cette application.
 *
 * CE QUI REND LE DÉFAUT INVISIBLE : l'arbre de travail porte les fichiers.
 * Tous les gates locaux passent. Seul un clone FRAIS en manque — donc la CI,
 * donc l'image Docker, donc un collègue. Un `git status` propre ne dit rien :
 * un fichier ignoré n'y figure pas.
 *
 * CE QU'IL VÉRIFIE, et il est volontairement plus large que le défaut trouvé :
 * tout fichier de l'application qui n'est ni produit ni installé doit être
 * SUIVI par git. Restreindre le témoin aux `.d.*` aurait fermé les deux cas
 * connus et laissé ouverte la classe entière — la prochaine règle générique
 * emportera autre chose.
 */
import { execFileSync } from 'node:child_process';
import { readdirSync } from 'node:fs';
import { join, relative } from 'node:path';

const APP = new URL('..', import.meta.url).pathname.replace(/\/$/, '');
const RACINE = new URL('../../..', import.meta.url).pathname.replace(/\/$/, '');

/**
 * Ce qui n'a pas à être suivi : ce que la construction PRODUIT, ce que
 * l'installation POSE, et la coque native, qui a son propre cycle.
 */
const HORS_SUJET = new Set(['dist', 'node_modules', 'android', 'ios', '.turbo', 'rendu', 'test-results']);

const fichiers = (rep) =>
  readdirSync(rep, { withFileTypes: true }).flatMap((e) => {
    if (HORS_SUJET.has(e.name)) return [];
    const chemin = join(rep, e.name);
    return e.isDirectory() ? fichiers(chemin) : [relative(RACINE, chemin)];
  });

const suivis = new Set(
  execFileSync('git', ['ls-files', '--', relative(RACINE, APP)], { cwd: RACINE, encoding: 'utf8' })
    .split('\n')
    .filter(Boolean),
);

const absents = fichiers(APP).filter((f) => !suivis.has(f));

if (absents.length > 0) {
  console.error(
    `\n  ${absents.length} fichier(s) de l'application ne sont PAS suivis par git —` +
      " ils manqueront à tout clone frais (CI, image Docker, collègue) :\n",
  );
  for (const f of absents) {
    let par = '';
    try {
      par = execFileSync('git', ['check-ignore', '-v', '--', f], { cwd: RACINE, encoding: 'utf8' }).trim();
    } catch {
      par = '(non ignoré — simplement jamais ajouté)';
    }
    console.error(`    · ${f}\n        ${par}`);
  }
  console.error(
    "\n  Si le fichier est une SOURCE, ajouter une négation dans `.gitignore`" +
      "\n  (`!chemin`) APRÈS la règle générique qui l'emporte, puis `git add`.\n",
  );
  process.exit(1);
}

console.log(`  Les ${suivis.size} fichiers de l'application sont suivis par git.`);
