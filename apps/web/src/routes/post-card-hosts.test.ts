import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { QueryClient, type QueryKey } from '@tanstack/react-query';
import { describe, expect, test } from 'bun:test';

import { authorPostsInfiniteOptions } from '@/lib/api/author-posts';
import { bookmarkedPostsQuery } from '@/lib/api/bookmarked-posts';
import { updateCardPost } from '@/lib/api/card-caches';
import { feedQuery } from '@/lib/api/feed';
import type { FeedPost } from '@/lib/api/feed-pages';
import { hashtagInfiniteOptions } from '@/lib/api/hashtag-posts';
import type { HttpTransport } from '@/lib/api/http';
import { postQueryOptions } from '@/lib/api/publication-detail';
import { reelsQuery } from '@/lib/api/reels';

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

    expect(hotes.length).toBeGreaterThanOrEqual(5);
    expect(hotes).toContain('routes/bookmarks.tsx');
    expect(hotes).toContain('routes/feed.tsx');
    expect(hotes).toContain('routes/hashtag.tsx');
    expect(hotes).toContain('routes/post.tsx');
    expect(hotes).toContain('routes/user-profile.tsx');
  });
});

/**
 * **TOUT ÉCRAN QUI MONTE LA CARTE OFFRE LE BOUTON QUI REPARTAGE** (#6278 c,
 * T11) — même motif que `onComment` ci-dessus : `repostCount` ne devient un
 * bouton que si son hôte porte `onRepost` (loi 4), et l'oubli ne rougirait
 * nulle part sans cette garde d'INVENTAIRE.
 */
describe('le bouton de repartage est offert partout où la carte est montée', () => {
  test('chaque hôte de `FeedPostCard` câble `onRepost` — aucun chiffre inerte', () => {
    const manquants = handWrittenSources()
      .map((path) => ({ path, source: readFileSync(path, 'utf8') }))
      .filter(({ source }) => MOUNTS_CARD.test(source) && !source.includes('onRepost'))
      .map(({ path }) => path.slice(SRC.length + 1));

    expect(manquants).toEqual([]);
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

/**
 * **TOUT ÉCRAN QUI MONTE LA CARTE LA PEINT DEPUIS UNE CAISSE DU REGISTRE**
 * (#7341), troisième inventaire, même motif.
 *
 * La page d'un hashtag et les publications d'un profil montaient la carte
 * depuis LEUR caisse, qu'aucun geste ni aucun écho n'écrivait : le cœur y
 * partait au serveur et la carte ne bougeait pas. Aucun témoin ne pouvait le
 * voir — la carte est irréprochable, le geste aussi ; le défaut était ENTRE
 * l'écran et la liste des caisses que le geste parcourt.
 *
 * La garde tient trois affirmations, chacune mesurée :
 *  1. les hôtes de la carte (`<FeedPostCard` ou `<ReelPage`, trouvés dans les
 *     FICHIERS) sont EXACTEMENT ceux que la table déclare — un septième écran
 *     qui monterait la carte rougit ici tant qu'il n'a pas dit d'où il la lit ;
 *  2. chaque hôte NOMME bien la requête que la table lui prête ;
 *  3. la clé que cette requête sert est ATTEINTE par le registre : une carte
 *     posée à cette clé bascule quand `updateCardPost` passe — une mesure de
 *     comportement, pas une comparaison de chaînes.
 *
 * **CE QU'ELLE NE MESURE PAS, DIT À VOIX HAUTE** : qu'un hôte ne lise pas, EN
 * PLUS de la requête déclarée, une seconde caisse de cartes qu'il ne nomme
 * pas ; et que `useFeed` / `usePost` (`lib/api/query.ts`) servent bien
 * `feedQuery` / `postQueryOptions`. La table est un fil de déclenchement, pas
 * une preuve d'exhaustivité.
 */
describe('toute caisse qui peint une carte est atteinte par le registre', () => {
  const deps = { source: 'fixtures' as const, transport: {} as HttpTransport };

  type Source = { readonly names: string; readonly queryKey: QueryKey; readonly holds: 'pages' | 'card' };

  const PAINTS_FROM: Readonly<Record<string, readonly Source[]>> = {
    'routes/feed.tsx': [{ names: 'useFeed', queryKey: feedQuery(deps).queryKey, holds: 'pages' }],
    'routes/reels.tsx': [
      { names: 'feedQuery', queryKey: feedQuery(deps).queryKey, holds: 'pages' },
      { names: 'postQueryOptions', queryKey: postQueryOptions({ ...deps, postId: 'p' }).queryKey, holds: 'card' },
      { names: 'reelsQuery', queryKey: reelsQuery(deps, 'graine').queryKey, holds: 'pages' },
    ],
    'routes/post.tsx': [{ names: 'usePost', queryKey: postQueryOptions({ ...deps, postId: 'p' }).queryKey, holds: 'card' }],
    'routes/bookmarks.tsx': [{ names: 'bookmarkedPostsQuery', queryKey: bookmarkedPostsQuery(deps).queryKey, holds: 'pages' }],
    'routes/hashtag.tsx': [{ names: 'hashtagInfiniteOptions', queryKey: hashtagInfiniteOptions({ ...deps, tag: 'voyage' }).queryKey, holds: 'pages' }],
    'routes/user-profile.tsx': [
      { names: 'authorPostsInfiniteOptions', queryKey: authorPostsInfiniteOptions({ ...deps, authorId: 'u' }).queryKey, holds: 'pages' },
    ],
  };

  const PAINTS_CARD = /<(FeedPostCard|ReelPage)\b/;

  test('les hôtes de la carte sont EXACTEMENT ceux que la table déclare', () => {
    const hotes = handWrittenSources()
      .filter((path) => PAINTS_CARD.test(readFileSync(path, 'utf8')))
      .map((path) => path.slice(SRC.length + 1))
      .sort();

    expect(hotes).toEqual(Object.keys(PAINTS_FROM).sort());
  });

  test('chaque hôte nomme la requête d’où la table dit qu’il peint', () => {
    const muets = Object.entries(PAINTS_FROM).flatMap(([host, sources]) => {
      const source = readFileSync(join(SRC, host), 'utf8');
      return sources.filter(({ names }) => !source.includes(names)).map(({ names }) => `${host} › ${names}`);
    });

    expect(muets).toEqual([]);
  });

  test('une carte posée à chacune de ces clés bascule quand le registre passe', () => {
    const card: FeedPost = { id: 'p', type: 'POST', createdAt: '2026-09-21T10:00:00.000Z', likeCount: 0 };
    const inertes = Object.entries(PAINTS_FROM).flatMap(([host, sources]) =>
      sources
        .filter(({ queryKey, holds }) => {
          const queryClient = new QueryClient();
          queryClient.setQueryData(queryKey, holds === 'card' ? card : { pages: [{ posts: [card] }], pageParams: [undefined] });
          updateCardPost(queryClient, 'p', (post) => ({ ...post, likeCount: 1 }));
          const held = queryClient.getQueryData<FeedPost | { readonly pages: readonly { readonly posts: readonly FeedPost[] }[] }>(queryKey);
          const painted = held !== undefined && 'pages' in held ? held.pages[0]?.posts[0] : held;
          return painted?.likeCount !== 1;
        })
        .map(({ names }) => `${host} › ${names}`),
    );

    expect(inertes).toEqual([]);
  });
});
