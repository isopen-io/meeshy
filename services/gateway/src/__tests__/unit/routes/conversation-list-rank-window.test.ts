/**
 * **LA FENÊTRE DES DEUX FLUX DU RANG DE LISTE** (#19836).
 *
 * `loadRankedConversationPage` sert le top-K par rang — `max(lastMessageAt,
 * lastActivityAt)` — en lisant DEUX flux bornés, parce qu'un `max` de deux
 * colonnes ne s'écrit pas en `orderBy` Prisma. Son doc-comment porte la preuve
 * qui rend la fusion correcte :
 *
 *   > Le top-K par rang est inclus dans top-K(A) ∪ top-K(B)
 *
 * Cette preuve suppose TROIS choses, et c'est ce que ce témoin garde :
 *
 *  1. **K = `offset + limit`**, sur les DEUX flux. Lire `limit` lignes suffit
 *     pour une première page et perd la page suivante.
 *  2. **Le flux B ne SKIPPE pas.** Son ordre est `lastActivityAt`, pas le rang :
 *     sauter `offset` lignes dans SON ordre jette des lignes qui appartiennent à
 *     la fenêtre du rang.
 *  3. **La borne du flux B porte sur les DEUX colonnes.**
 *     `{ lastMessageAt: { lt: bound } }` est logiquement redondante avec le
 *     filtre `isLifted` qui suit — une ligne dont `lastActivityAt < bound ≤
 *     lastMessageAt` n'est jamais « remontée ». Elle ne l'est pas pour la
 *     FENÊTRE : sans elle, les K places du flux B se remplissent de lignes de la
 *     page 1, qu'`isLifted` écarte TROP TARD, et une ligne réellement remontée de
 *     la page 2 en est évincée.
 *
 * Aucun témoin du dépôt n'exerçait ces trois clauses : avec cinq lignes de
 * fixture et `limit: 10`, la fenêtre ne peut pas se saturer. Le retrait de
 * `{ lastMessageAt: { lt: bound } }` laissait les neuf témoins de rang VERTS
 * (mesuré par l'audit de #19800).
 *
 * **Le moteur HONORE `skip`** — c'est ce qui rend la mutation 2 détectable, et
 * c'est pour cela qu'il est désormais UNIQUE pour les cinq suites de rang
 * (`__tests__/helpers/list-rank-engine.ts`). Les quatre doubles d'avant
 * divergeaient sur ce qu'ils honoraient, et celui qui fixait `skip` à zéro
 * rendait cette mutation invisible — au compilateur comme au témoin, `skip`
 * n'étant pas déclaré dans `RankedPagePrisma`.
 *
 * @jest-environment node
 */
import { describe, it, expect } from '@jest/globals';
import { loadRankedConversationPage, type ListRankRow, type RowsQuery } from '../../../routes/conversations/utils/list-rank';
import { listRankFromColumns } from '@meeshy/shared/utils/conversation-list-rank';
import type { MongoDocument } from '../../helpers/mongo-where';
import { moteurDeRang } from '../../helpers/list-rank-engine';

const at = (iso: string) => new Date(iso);
type Ligne = ListRankRow & MongoDocument;

const rang = (row: ListRankRow) => listRankFromColumns(row)!.getTime();
const parRang = (lignes: readonly Ligne[]) => [...lignes].sort((x, y) => rang(y) - rang(x)).map((r) => r.id);

const page = (
  lignes: readonly Ligne[],
  { curseur, limit, offset }: { curseur: unknown; limit: number; offset: number },
) => {
  const moteur = moteurDeRang(lignes);
  return loadRankedConversationPage({
    prisma: moteur.prisma as never,
    readRows: moteur.readRows as never,
    where: {}, curseur: curseur as never, deltaOrder: false, limit, offset,
  }).then((s) => s.map((r) => r.id));
};

const sansCurseur = { genre: 'absent' } as const;
const borneSur = (ligne: Ligne) => ({ genre: 'borne', rang: listRankFromColumns(ligne)!, id: ligne.id }) as const;

describe('la fenêtre du flux « par activité » (#19836)', () => {
  /**
   * `p1-haut` est en page 1 par son dernier MESSAGE, et porte une activité
   * ANTÉRIEURE à la borne : il entre dans le flux B si la borne n'y regarde que
   * `lastActivityAt`, et il y occupe la seule place de la fenêtre (`limit: 1`).
   * `x-remontee` — la ligne réellement remontée de la page 2 — en est évincée.
   */
  const lignes: readonly Ligne[] = [
    { id: 'p1-haut', lastMessageAt: at('2026-11-20T10:00:00Z'), lastActivityAt: at('2026-11-14T10:00:00Z') },
    { id: 'x-remontee', lastMessageAt: at('2026-11-01T10:00:00Z'), lastActivityAt: at('2026-11-13T10:00:00Z') },
    { id: 'y-msg', lastMessageAt: at('2026-11-12T10:00:00Z') },
  ];
  const p1Haut = lignes[0];
  const xRemontee = lignes[1];

  it('la page 2 sert la ligne REMONTÉE, pas la ligne de message qui la suit au rang', async () => {
    expect(parRang(lignes)).toEqual(['p1-haut', 'x-remontee', 'y-msg']);
    expect(await page(lignes, { curseur: sansCurseur, limit: 1, offset: 0 })).toEqual(['p1-haut']);
    expect(await page(lignes, { curseur: borneSur(p1Haut), limit: 1, offset: 0 })).toEqual(['x-remontee']);
  });

  it('la marche par curseur à K=1 ne perd aucune ligne et n’en sert aucune deux fois', async () => {
    const p1 = await page(lignes, { curseur: sansCurseur, limit: 1, offset: 0 });
    const p2 = await page(lignes, { curseur: borneSur(p1Haut), limit: 1, offset: 0 });
    const p3 = await page(lignes, { curseur: borneSur(xRemontee), limit: 1, offset: 0 });
    const marche = [...p1, ...p2, ...p3];
    expect(marche).toEqual(parRang(lignes));
    expect(new Set(marche).size).toBe(lignes.length);
  });
});

describe('le dimensionnement de la fenêtre (#19836)', () => {
  /**
   * Deux lignes REMONTÉES occupent les deux premiers rangs. La page demandée est
   * la SECONDE (`offset: 1`, `limit: 1`), donc la fenêtre vaut 2 — et c'est la
   * deuxième ligne du flux B qui la sert.
   *
   * `take: limit` ne lit que la première : la réponse devient `c-msg`.
   * `skip: offset` saute la première et prend les deux suivantes dans l'ordre de
   * B, ce qui est le même sinistre par l'autre bout : la ligne gardée n'est plus
   * celle que le rang demande.
   */
  const deuxRemontees: readonly Ligne[] = [
    { id: 'a-lift', lastMessageAt: at('2026-11-01T10:00:00Z'), lastActivityAt: at('2026-11-20T10:00:00Z') },
    { id: 'b-lift', lastMessageAt: at('2026-11-02T10:00:00Z'), lastActivityAt: at('2026-11-19T10:00:00Z') },
    { id: 'c-msg', lastMessageAt: at('2026-11-10T10:00:00Z') },
    { id: 'd-msg', lastMessageAt: at('2026-11-09T10:00:00Z') },
  ];

  it('le flux B lit offset + limit lignes, sans en sauter aucune', async () => {
    expect(parRang(deuxRemontees)).toEqual(['a-lift', 'b-lift', 'c-msg', 'd-msg']);
    expect(await page(deuxRemontees, { curseur: sansCurseur, limit: 1, offset: 1 })).toEqual(['b-lift']);
  });

  /**
   * Le symétrique sur le flux A : une seule ligne remontée tient le premier
   * rang, et la page demandée est la TROISIÈME (`offset: 2`). La fenêtre du flux
   * A doit porter trois clés pour que le tri par rang ait de quoi servir la
   * position 2 — `take: limit` n'en lit qu'une et rend une page VIDE.
   */
  const uneRemontee: readonly Ligne[] = [
    { id: 'a-lift', lastMessageAt: at('2026-11-01T10:00:00Z'), lastActivityAt: at('2026-11-20T10:00:00Z') },
    { id: 'b-msg', lastMessageAt: at('2026-11-15T10:00:00Z') },
    { id: 'c-msg', lastMessageAt: at('2026-11-14T10:00:00Z') },
    { id: 'd-msg', lastMessageAt: at('2026-11-13T10:00:00Z') },
  ];

  it('le flux A lit offset + limit clés, et les lignes manquantes sont relues', async () => {
    expect(parRang(uneRemontee)).toEqual(['a-lift', 'b-msg', 'c-msg', 'd-msg']);
    expect(await page(uneRemontee, { curseur: sansCurseur, limit: 1, offset: 2 })).toEqual(['c-msg']);
  });

  it('la page profonde entière se recompose dans l’ordre du rang', async () => {
    const pages = await Promise.all(
      [0, 1, 2, 3].map((offset) => page(uneRemontee, { curseur: sansCurseur, limit: 1, offset })),
    );
    expect(pages.flat()).toEqual(parRang(uneRemontee));
  });
});
