import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, test } from 'bun:test';

/**
 * **UN MAILLON DU COMPOSITE QUI NE FIGURE PAS DANS LA CI EST VERT PARCE QU'IL
 * NE S'EXÉCUTE NULLE PART** (#5910).
 *
 * `bun run gate` enchaîne seize gardes. La CI, elle, ne lance PAS le composite :
 * elle ÉNUMÈRE ses maillons un par un, répartis entre le job `quality` (ceux qui
 * tournent sous node seul) et le job navigateur (ceux qui ouvrent un chromium).
 * Ce choix est délibéré — les deux familles n'ont pas les mêmes prérequis.
 *
 * Sa conséquence ne l'était pas : au 2026-09-10, SIX maillons n'étaient nommés
 * nulle part dans `ci.yml`. `check-scheme-bootstrap`, `check-list-actions`,
 * `check-reading-mode`, `check-field-focus`, `check-shell-dist`,
 * `check-gateway-build` — tous verts, tous inertes hors d'un poste de
 * développement.
 *
 * `check-field-focus` a été écrit et livré le jour même, en le croyant dans la
 * chaîne : il y était, mais la chaîne n'est pas en CI.
 *
 * **LE COMMENTAIRE DE `ci.yml` PRÉDISAIT EXACTEMENT CE DÉFAUT** — « le composite
 * `bun run gate` n'est PAS lancé en CI : cette étape énumère ses maillons un par
 * un, donc un maillon ajouté au composite seul ne s'exécuterait nulle part ».
 * Il était juste, au bon endroit, et il n'a rien empêché.
 *
 * > **Une phrase ne compte pas.** Deux listes écrites à la main, l'une à côté de
 * > l'autre, divergent — c'est vrai du composite face à `ci.yml`, et c'est vrai
 * > d'une suite de tests Swift face à sa `PBXSourcesBuildPhase` (#5859, #5718,
 * > trouvés le même soir sur l'autre substrat). Ce qui tient les deux ensemble
 * > n'est pas une consigne : c'est un témoin qui COMPTE.
 *
 * CE TÉMOIN NE RECOPIE AUCUNE LISTE. Il lit les deux ensembles à leur source et
 * exige leur égalité — une liste recopiée ici ne ferait que déplacer le problème
 * d'un fichier.
 */

const V3 = dirname(fileURLToPath(import.meta.url)) + '/..';
const CI = join(V3, '..', '..', '.github', 'workflows', 'ci.yml');

/** Les maillons `scripts/*.mjs` que `bun run gate` enchaîne. */
function maillonsDuComposite(): Set<string> {
  const pkg = JSON.parse(readFileSync(join(V3, 'package.json'), 'utf8')) as {
    scripts: Record<string, string>;
  };
  const gate = pkg.scripts.gate ?? '';
  return new Set([...gate.matchAll(/scripts\/([a-z0-9-]+\.mjs)/g)].map((m) => m[1]!));
}

/**
 * Les maillons que `ci.yml` EXÉCUTE — commentaires ôtés.
 *
 * Sans ce dépouillement, la prose du workflow suffirait à déclarer un maillon
 * couvert : `ci.yml` NOMME `check-utilities.mjs` dans un commentaire qui
 * explique ce qu'il garde. Un témoin qui compte des MENTIONS au lieu
 * d'exécutions passe au vert sur un fichier qui ne lance rien — c'est
 * exactement la forme du défaut qu'il est censé attraper.
 */
function maillonsDeLaCI(): Set<string> {
  const yml = readFileSync(CI, 'utf8')
    .split('\n')
    .filter((l) => !l.trim().startsWith('#'))
    .join('\n');
  const cites = [...yml.matchAll(/scripts\/([a-z0-9-]+\.mjs)/g)].map((m) => m[1]!);
  /* `ci.yml` lance AUSSI des scripts de la RACINE, écrits exactement pareil
     (`node scripts/check-lockfile-alignment.mjs`). Rien dans la ligne ne dit
     de quel dossier il s'agit : le seul discriminant est l'EXISTENCE du
     fichier sous `apps/web-v3/scripts/`. Sa validité tient à l'absence de nom
     partagé entre les deux dossiers — précondition gardée par le témoin
     ci-dessous, sans quoi ce filtre deviendrait faux en silence. */
  return new Set(cites.filter((n) => existsSync(join(V3, 'scripts', n))));
}

describe('les gardes du composite tournent en CI — sinon ils sont verts par omission', () => {
  /**
   * LA PRÉCONDITION DU FILTRE CI-DESSUS. `maillonsDeLaCI()` distingue un garde
   * de web-v3 d'un script de la racine par la seule existence du fichier. Un
   * nom présent des DEUX côtés rendrait ce départage faux — et faux en
   * silence, ce qui est la pire forme. Ce témoin échoue le jour où la
   * collision apparaît, plutôt que de laisser le témoin principal mentir.
   */
  test('aucun nom de script n’est partagé entre scripts/ (racine) et apps/web-v3/scripts/', () => {
    const nomsDe = (dir: string) =>
      existsSync(dir) ? readdirSync(dir).filter((n) => n.endsWith('.mjs')) : [];
    const racine = new Set(nomsDe(join(V3, '..', '..', 'scripts')));
    const partages = nomsDe(join(V3, 'scripts')).filter((n) => racine.has(n)).sort();
    expect(partages).toEqual([]);
  });

  test('l’inventaire n’est pas vide — sinon ce témoin ne garde rien', () => {
    expect(maillonsDuComposite().size).toBeGreaterThan(8);
    expect(maillonsDeLaCI().size).toBeGreaterThan(8);
  });

  test('TOUT maillon du composite est exécuté quelque part dans ci.yml', () => {
    const composite = maillonsDuComposite();
    const ci = maillonsDeLaCI();
    const orphelins = [...composite].filter((m) => !ci.has(m)).sort();
    expect(orphelins).toEqual([]);
  });

  /**
   * LE SENS INVERSE COMPTE AUSSI, et pour une raison différente : un maillon
   * retiré du composite mais laissé dans `ci.yml` est une étape MORTE qui coûte
   * du temps de runner à chaque poussée, et que personne ne relira — elle ne
   * rougit pas non plus.
   */
  test('aucune étape de ci.yml ne lance un garde absent du composite', () => {
    const composite = maillonsDuComposite();
    const ci = maillonsDeLaCI();
    const morts = [...ci].filter((m) => !composite.has(m)).sort();
    expect(morts).toEqual([]);
  });
});
