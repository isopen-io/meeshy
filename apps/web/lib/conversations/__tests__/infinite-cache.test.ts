import type { Conversation } from '@/types';
import {
  rebuildInfiniteConversationPages,
  type InfiniteConversationData,
  type InfiniteConversationPage,
} from '../infinite-cache';

// `rebuildInfiniteConversationPages` ne lit AUCUN champ des conversations — il
// tranche les tableaux par longueur et par position. Une conversation de test
// n'a donc besoin que d'un `id` distinct pour être traçable dans les pages
// reconstruites.
const conversation = (id: string): Conversation => ({ id }) as unknown as Conversation;

// Une page STOCKÉE ne porte que `conversations` + `pagination` : les métadonnées
// d'enveloppe delta (`deletedConversationIds`…) ne vivent jamais dans le cache.
const page = (
  ids: readonly string[],
  pagination: InfiniteConversationPage['pagination']
): InfiniteConversationPage => ({
  conversations: ids.map(conversation),
  pagination,
});

// Cache de départ : deux pages de 2, paginées par OFFSET (limit 2), la seconde
// étant la dernière fenêtre chargée (`hasMore: false`). `pageParams` est
// parallèle aux `pages` — l'invariant `InfiniteData` de React Query.
const twoFullPages = (): InfiniteConversationData => ({
  pages: [
    page(['a', 'b'], { limit: 2, offset: 0, total: 4, hasMore: true }),
    page(['c', 'd'], { limit: 2, offset: 2, total: 4, hasMore: false }),
  ],
  pageParams: [0, 2],
});

const flatIds = (data: InfiniteConversationData): string[] =>
  data.pages.flatMap((p) => p.conversations.map((c) => c.id));

describe('rebuildInfiniteConversationPages — contrat InfiniteData (pages ↔ pageParams parallèles)', () => {
  it('garde `pages` et `pageParams` de longueur égale quand aucune ligne n’est ajoutée', () => {
    const old = twoFullPages();
    const updated = old.pages.flatMap((p) => p.conversations); // même longueur

    const result = rebuildInfiniteConversationPages(old, updated);

    expect(result.pages).toHaveLength(2);
    expect(result.pageParams).toHaveLength(result.pages.length);
    expect(result.pageParams).toEqual([0, 2]);
  });

  it('ajoute un `pageParam` parallèle quand une ligne neuve crée une page de surplus', () => {
    const old = twoFullPages();
    // Une conversation neuve arrivée par socket/delta : la liste à plat grandit
    // d'un cran, poussant un élément au-delà des frontières d'origine.
    const updated = [...old.pages.flatMap((p) => p.conversations), conversation('e')];

    const result = rebuildInfiniteConversationPages(old, updated);

    // Une page de surplus est bien créée…
    expect(result.pages).toHaveLength(3);
    // …et `pageParams` reste parallèle (c’était le défaut : 3 pages / 2 params).
    expect(result.pageParams).toHaveLength(result.pages.length);
    // Le param de la page de surplus est son offset de départ — cohérent avec
    // `pagination.offset` posé sur cette même page (le curseur = 4 ici).
    expect(result.pages[2].pagination.offset).toBe(4);
    expect(result.pageParams[2]).toBe(4);
    // Aucune ligne perdue.
    expect(flatIds(result)).toEqual(['a', 'b', 'c', 'd', 'e']);
  });

  it('ne laisse PAS le désync s’élargir sur des insertions répétées sans refetch', () => {
    // Chaque arrivée de conversation neuve rebâtit le cache depuis le précédent.
    // Le défaut historique retournait `pageParams: old.pageParams` inchangé, si
    // bien que `pages.length - pageParams.length` grandissait à chaque insertion.
    let data = twoFullPages();
    for (const id of ['e', 'f', 'g']) {
      const updated = [...flatIds(data).map(conversation), conversation(id)];
      data = rebuildInfiniteConversationPages(data, updated);
      expect(data.pageParams).toHaveLength(data.pages.length);
    }
    expect(flatIds(data)).toEqual(['a', 'b', 'c', 'd', 'e', 'f', 'g']);
  });

  it('ne fabrique aucune métadonnée d’enveloppe delta sur les pages reconstruites', () => {
    // Les pages stockées ne portent QUE `conversations` + `pagination` ; les
    // champs `deletedConversationIds` sont des métadonnées de batch delta,
    // consommées à la volée et jamais persistées. Le rebuild ne doit pas les
    // ressusciter — y compris sur la page de surplus.
    const old = twoFullPages();
    const updated = [...old.pages.flatMap((p) => p.conversations), conversation('e')];

    const result = rebuildInfiniteConversationPages(old, updated);

    for (const rebuilt of result.pages) {
      expect(Object.keys(rebuilt).sort()).toEqual(['conversations', 'pagination']);
    }
  });
});
