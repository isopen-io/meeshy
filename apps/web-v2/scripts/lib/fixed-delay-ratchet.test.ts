import { describe, expect, test } from 'bun:test';
import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * **UN DÉLAI SUIVI D'UNE LECTURE EST UN PARI SUR LA VITESSE DE LA MACHINE**
 * (#7176) — et ce pari se perd en intégration continue, où la machine est
 * chargée.
 *
 * ## LE FAIT QUI A OUVERT CE CLIQUET
 *
 * `Peaux web-v2` a rougi deux fois de suite sur `dev`, **sur trois gates
 * différents en deux passages du MÊME commit**. Le symptôme de la seconde
 * tentative nommait la cause :
 *
 * ```
 * · [light] … avec le texte corrigé — « Lo probé esta mañana, aguanta bien.Lo probé esta mañana, aguanta perfectamente. »
 * ```
 *
 * Le texte de la passerelle portait la valeur AVANT édition **concaténée** à
 * celle d'après : `page.fill` avait écrit pendant que React posait encore la
 * valeur initiale du champ. Le gate attendait `waitForTimeout(400)` — 400 ms
 * qui suffisent sur un poste et pas sur un agent partagé. Mesuré : le même
 * gate, sur le même code, `exit=0` en local.
 *
 * ## POURQUOI UN CLIQUET, ET NON ZÉRO
 *
 * Le motif compte **123 sites** dans les gates au moment où cette garde est
 * écrite. Les corriger d'un lot serait imprudent : chacun demande de savoir
 * QUEL fait attendre, et se tromper de fait rend un gate qui verdit sans rien
 * mesurer — plus dangereux que le délai qu'il remplace.
 *
 * Ce cliquet fait donc deux choses, et rien d'autre : il **arrête
 * l'hémorragie** (pas un site de plus), et il rend la dette **visible et
 * chiffrée** au lieu de la laisser se découvrir un rouge à la fois. La
 * résorption est un chantier à part.
 *
 * ## CE QU'IL COMPTE, ET CE QU'IL NE COMPTE PAS
 *
 * Il ne compte pas les `waitForTimeout` — il y en a 314, et beaucoup sont
 * légitimes : un GESTE dont la durée EST l'entrée (l'appui long de
 * `check-thread-states.mjs`), une animation qu'on laisse finir, une pause
 * entre deux frappes. Un délai n'est un défaut que lorsqu'un VERDICT se lit
 * juste après : c'est cette paire — délai, puis lecture dans les trois lignes
 * — qui est comptée.
 *
 * ## LA LISTE EST DÉRIVÉE, JAMAIS ÉCRITE
 *
 * La garde voisine (`no-fixed-delays.test.ts`) nomme quatre fichiers, et
 * l'assume : elle garde le gate des états du fil, pas les autres. C'est
 * précisément ce qui a laissé passer celui-ci — `check-post-comments.mjs`
 * n'était dans aucune liste. Ici le répertoire est PARCOURU : un gate ajouté
 * demain entre sous garde sans que personne y pense (leçon 640 — « quand une
 * règle s'applique à N choses, demander qui tient la liste des N »).
 */

const SCRIPTS = fileURLToPath(new URL('..', import.meta.url));

/**
 * CE QUI COMPTE COMME UNE LECTURE : tout ce par quoi un gate RAMÈNE un état de
 * la page pour en juger. `count()` en fait partie — « combien de nœuds » est un
 * verdict comme un autre.
 */
const LECTURE = /\.(evaluate|\$eval|\$\$eval|textContent|getAttribute|innerText|count)\b/;

/** Trois lignes : de quoi couvrir `const x = await page.evaluate((…) => {` sans
 *  ramasser le bloc suivant. */
const PORTEE_LIGNES = 3;

const fichiersMjs = async (dir: string): Promise<readonly string[]> => {
  const out: string[] = [];
  for (const entree of await readdir(dir, { withFileTypes: true })) {
    const chemin = join(dir, entree.name);
    if (entree.isDirectory()) out.push(...(await fichiersMjs(chemin)));
    else if (entree.name.endsWith('.mjs')) out.push(chemin);
  }
  return out;
};

const sitesDangereux = async (): Promise<readonly string[]> => {
  const sites: string[] = [];
  for (const chemin of [...(await fichiersMjs(SCRIPTS))].sort()) {
    const lignes = (await readFile(chemin, 'utf8')).split('\n');
    lignes.forEach((ligne, index) => {
      if (!ligne.includes('waitForTimeout')) return;
      const suite = lignes.slice(index + 1, index + 1 + PORTEE_LIGNES).join('\n');
      if (LECTURE.test(suite)) sites.push(`${chemin.slice(SCRIPTS.length)}:${index + 1}`);
    });
  }
  return sites;
};

/**
 * LE COMPTE DU JOUR (#7176). Il ne DESCEND que par un lot qui remplace un délai
 * par un fait — et alors il se grave plus bas dans le même commit. Il ne monte
 * jamais.
 */
const PLAFOND = 123;

describe('aucun gate n’ajoute de délai fixe suivi d’une lecture', () => {
  test(`le motif ne dépasse pas son plafond de ${PLAFOND} sites`, async () => {
    const sites = await sitesDangereux();
    /* Le message NOMME les sites : un cliquet qui dit seulement « 124 > 123 »
       oblige à refaire la mesure à la main pour savoir lequel est nouveau. */
    expect({ compte: sites.length, plafond: PLAFOND, sites: sites.length > PLAFOND ? sites : [] }).toEqual({
      compte: sites.length,
      plafond: PLAFOND,
      sites: [],
    });
    expect(sites.length).toBeLessThanOrEqual(PLAFOND);
  });

  /**
   * LE CLIQUET SE RESSERRE. Sans ce second témoin, le plafond pourrait rester
   * gravé au-dessus du compte réel après un lot de résorption, et rouvrirait
   * en silence la place qu'on vient de gagner — la dette remonterait sans
   * qu'aucun gate ne rougisse.
   */
  test('le plafond gravé COLLE au compte réel — aucune marge dormante', async () => {
    const sites = await sitesDangereux();
    expect(sites.length).toBe(PLAFOND);
  });

  /**
   * LA GARDE SE MESURE ELLE-MÊME : si le parcours ne trouvait plus aucun
   * fichier (répertoire déplacé, extension changée), les deux témoins
   * ci-dessus verdiraient sur un ensemble VIDE — verts en ne mesurant rien.
   */
  test('le parcours atteint bien les gates — il n’est pas vide', async () => {
    const fichiers = await fichiersMjs(SCRIPTS);
    expect(fichiers.length).toBeGreaterThan(30);
  });
});
