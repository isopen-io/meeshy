import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, test } from 'bun:test';

/**
 * **TOUT ÉCRAN QUI MONTE LA CARTE OFFRE LE COMPTEUR QUI MÈNE AU FIL** (#7113).
 *
 * `FeedPostCard` ne rend le compteur de commentaires en BOUTON que si son hôte
 * porte `onComment` — sans hôte, un `<span>` inerte, et c'est juste (loi 4 :
 * un bouton sans effet mentirait). Mais cette prudence a un revers exact :
 * **un écran qui oublie de câbler le rappel ne rougit nulle part.** Il rend une
 * carte complète, bien peinte, dont le chiffre des commentaires ne fait rien —
 * et c'est précisément le défaut que cette issue nomme.
 *
 * Il a déjà été payé deux fois. `user-profile.tsx` l'a porté jusqu'à ce qu'un
 * lot de revue le voie (« la fonction MANQUAIT », doc-comment du fichier), et
 * `hashtag.tsx` — quatrième hôte de la carte, arrivé après — l'a porté
 * jusqu'ici. Aucun témoin unitaire ne pouvait l'attraper : chacun mesure la
 * carte, et la carte est irréprochable.
 *
 * C'est une garde d'INVENTAIRE, et elle ne prétend qu'à ce qu'elle mesure :
 * que tout fichier montant la carte NOMME `onComment`. Elle ne dit pas que la
 * valeur câblée est la bonne — ça, c'est le témoin de `usePostGesture`, qui
 * mesure l'adresse produite. Les deux ensemble couvrent « qui l'offre » et
 * « où il mène » ; séparément, ni l'un ni l'autre.
 *
 * Écrite sur les FICHIERS plutôt que sur une liste recopiée : une liste
 * d'écrans tenue ici serait une troisième lecture, et la plus dangereuse — le
 * cinquième hôte y manquerait par construction.
 */

const SRC = join(dirname(fileURLToPath(import.meta.url)), '..');

/** Les sources écrites à la main, hors témoins — un témoin monte la carte sans
 * hôte EXPRÈS (c'est le témoin de la loi 4), et l'exiger ici l'interdirait. */
function handWrittenSources(): readonly string[] {
  const walk = (directory: string): readonly string[] =>
    readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
      const path = join(directory, entry.name);
      if (entry.isDirectory()) return walk(path);
      if (!/\.tsx?$/.test(entry.name) || /\.test\.tsx?$/.test(entry.name)) return [];
      return [path];
    });
  return walk(SRC);
}

const MOUNTS_CARD = /<FeedPostCard\b/;

describe('le compteur de commentaires est offert partout où la carte est montée', () => {
  test('chaque hôte de `FeedPostCard` câble `onComment` — aucun chiffre inerte', () => {
    const manquants = handWrittenSources()
      .map((path) => ({ path, source: readFileSync(path, 'utf8') }))
      .filter(({ source }) => MOUNTS_CARD.test(source) && !source.includes('onComment'))
      .map(({ path }) => path.slice(SRC.length + 1));

    expect(manquants).toEqual([]);
  });

  /**
   * LA CONTRE-ÉPREUVE, dans le témoin plutôt qu'à côté : sans elle, un
   * inventaire qui ne trouverait PLUS AUCUN hôte (un glob cassé, un
   * renommage du composant) rendrait la même liste vide, et cette garde
   * deviendrait verte pour toujours en ayant cessé de regarder.
   */
  test('l’inventaire VOIT bien les hôtes de la carte — une liste vide serait un inventaire mort', () => {
    const hotes = handWrittenSources()
      .filter((path) => MOUNTS_CARD.test(readFileSync(path, 'utf8')))
      .map((path) => path.slice(SRC.length + 1))
      .sort();

    expect(hotes.length).toBeGreaterThanOrEqual(4);
    expect(hotes).toContain('routes/feed.tsx');
    expect(hotes).toContain('routes/hashtag.tsx');
    expect(hotes).toContain('routes/post.tsx');
    expect(hotes).toContain('routes/user-profile.tsx');
  });
});

/**
 * **TOUT ÉCRAN QUI MONTE LA CARTE OUVRE LA PUBLICATION** (#7284), second
 * inventaire, même motif — et la raison pour laquelle il a une autre FORME que
 * celui du compteur mérite d'être dite, parce que c'est elle qui supprime le
 * défaut plutôt que de le surveiller.
 *
 * Le compteur de commentaires DÉPEND d'un rappel : sans hôte, la carte rend un
 * `<span>` inerte, et deux écrans sur quatre l'ont oublié. Le geste
 * d'ouverture, lui, n'a besoin de RIEN de l'hôte — la carte connaît
 * `model.id`, et l'adresse `/post/$post` se compose sans lui (même choix que
 * le lien du RÉEL, `FeedReelCard`, et que l'avatar qui mène au profil). Elle
 * le porte donc elle-même : **un hôte ne peut pas l'oublier, il peut seulement
 * le RETIRER**, et la seule raison légitime de le retirer est d'ÊTRE la
 * destination.
 *
 * Cette garde mesure exactement ça : `isDetail` n'est déclaré que par
 * `routes/post.tsx`. Un cinquième hôte qui le recopierait — par imitation,
 * parce qu'il monte la carte « comme le détail » — rendrait une carte dont le
 * corps ne mène nulle part, et c'est le seul chemin qui reste vers le défaut
 * que #7284 nomme.
 */
describe('le geste d’ouverture est offert partout où la carte est montée', () => {
  test('seule la FICHE se déclare destination — aucun autre hôte ne retire le geste', () => {
    const retirent = handWrittenSources()
      .map((path) => ({ path, source: readFileSync(path, 'utf8') }))
      .filter(({ source }) => MOUNTS_CARD.test(source) && source.includes('isDetail'))
      .map(({ path }) => path.slice(SRC.length + 1))
      .sort();

    expect(retirent).toEqual(['routes/post.tsx']);
  });

  /**
   * LA CONTRE-ÉPREUVE, ici aussi : sans elle, la liste ci-dessus deviendrait
   * verte le jour où `isDetail` serait renommé — plus aucun hôte ne le
   * nommerait, et `[]` ne vaudrait pas `['routes/post.tsx']`… mais un
   * renommage qui retirerait AUSSI la ligne de `post.tsx` passerait. On exige
   * donc que la carte PORTE encore la porte de sortie qu'on prétend garder.
   */
  test('la carte porte encore le lien et sa porte de sortie — une garde sans sujet ne garde rien', () => {
    const carte = readFileSync(join(SRC, 'components/feed-post-card.tsx'), 'utf8');

    expect(carte).toContain('isDetail');
    expect(carte).toContain('to="post"');
    expect(carte).toContain('data-feed-post-open');
  });
});
