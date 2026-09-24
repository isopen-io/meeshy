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
 *   · `scripts/lib/institutional-routes.d.mts` type la source unique des
 *     sept adresses — jamais commité non plus.
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
import { pathToFileURL } from 'node:url';

const APP = new URL('..', import.meta.url).pathname.replace(/\/$/, '');
const ROOT = new URL('../../..', import.meta.url).pathname.replace(/\/$/, '');

/**
 * Ce qui n'a pas à être suivi : ce que la construction PRODUIT, ce que
 * l'installation POSE, et la coque native, qui a son propre cycle.
 */
/*
 * `.cache` a rejoint la liste en revue de #5774, pour la MÊME raison que
 * `render` y était déjà : c'est un répertoire de SORTIE. Les gates visuels y
 * déposent leurs captures (`join(APP, '..', '..', '.cache', 'web-v2-workflow',
 * 'rendus')`), et une session lancée depuis `apps/web-v2` y écrit sa recette
 * — dix PNG de recette du composeur y traînaient et faisaient rougir CE
 * témoin, qui réclamait qu'on SUIVE des captures de débogage. Élargir la
 * portée n'était pas l'affaiblir : le témoin garde les SOURCES avalées par
 * une règle générique, et une capture n'en est pas une.
 */
const OUT_OF_SCOPE = new Set(['dist', 'node_modules', 'android', 'ios', '.turbo', 'render', 'test-results', '.cache']);

/**
 * `isOutOfScope` — CE QUI N'EST PAS UNE SOURCE.
 *
 * **#6832 — le motif, jamais une liste de noms.** La seule appartenance au Set
 * ci-dessus rendait le gate NON IDEMPOTENT : `check-git-tracking` est le 35ᵉ
 * maillon de la chaîne `&&`, `check-admin-rung` le 38ᵉ, et ce dernier
 * CONSTRUIT `dist-admin-rung/`. Au tour suivant, dans le même arbre, le témoin
 * le trouvait et réclamait qu'on COMMITE des centaines de fichiers de build —
 * un rouge FAUX, qui désigne des innocents et invite à réparer ce qui n'est
 * pas cassé. La CI ne le voit jamais (elle clone frais) ; il ne mord qu'en
 * local, et seulement chez qui relance le gate — donc au pire moment, quand on
 * revérifie après un correctif.
 *
 * Trois scripts du gate écrivent des sorties `dist-*` (`dist-admin-rung`,
 * `dist-gateway`, `dist-capacitor`). Les NOMMER toutes les trois rejouerait
 * l'inventaire que #6080 et #6820 viennent de retirer ailleurs : la prochaine
 * sortie rouvrirait le défaut en silence. On reconnaît donc le MOTIF que
 * `.gitignore:3` déclare déjà — `dist-*` — le même que le message d'erreur de
 * ce fichier cite lui-même quand il rougit.
 *
 * La raison d'être du témoin est INTACTE : il traque les SOURCES avalées par
 * une règle générique (`src/bun-test.d.ts`,
 * `scripts/lib/institutional-routes.d.mts`). Une sortie de construction n'en
 * est pas une — c'est exactement ce que `dist`, exempté depuis toujours,
 * affirme déjà.
 */
export const isOutOfScope = (name) => OUT_OF_SCOPE.has(name) || name.startsWith('dist-');

const files = (dir) =>
  readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    if (isOutOfScope(e.name)) return [];
    const path = join(dir, e.name);
    return e.isDirectory() ? files(path) : [relative(ROOT, path)];
  });


/* Le pilote ne tourne QUE si ce fichier est le point d'entrée : importé (par
   son témoin), le module n'expose que `isOutOfScope`, sans marcher l'arbre ni
   appeler git — même motif que `check-shell-dist.mjs:384-386`. */
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const tracked = new Set(
    execFileSync('git', ['ls-files', '--', relative(ROOT, APP)], { cwd: ROOT, encoding: 'utf8' })
      .split('\n')
      .filter(Boolean),
  );
  const missing = files(APP).filter((f) => !tracked.has(f));

  if (missing.length > 0) {
    console.error(
      `\n  ${missing.length} fichier(s) de l'application ne sont PAS suivis par git —` +
        " ils manqueront à tout clone frais (CI, image Docker, collègue) :\n",
    );
    for (const f of missing) {
      let par = '';
      try {
        par = execFileSync('git', ['check-ignore', '-v', '--', f], { cwd: ROOT, encoding: 'utf8' }).trim();
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

  console.log(`  Les ${tracked.size} fichiers de l'application sont suivis par git.`);
}
