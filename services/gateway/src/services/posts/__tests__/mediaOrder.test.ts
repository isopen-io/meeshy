/**
 * L'ORDRE des médias d'une publication.
 *
 * `PostMedia.order` est `@default(0)` au schéma, et AUCUN chemin de
 * téléversement ne l'écrit : le handler TUS énumère quinze champs sans lui.
 * La lecture, elle, trie par `order: 'asc'` (`postIncludes.ts`). Tous les
 * médias d'un post arrivaient donc à `0`, et un tri Mongo sur valeurs égales
 * n'est pas stable : l'ordre rendu était l'ordre d'ACHÈVEMENT des uploads —
 * trois volent en parallèle, donc un fichier lourd placé en premier atterrit
 * après un léger placé en quatrième.
 *
 * Le seul site qui CONNAÎT l'ordre voulu est la liste `mediaIds` de la
 * requête : elle porte l'ordre de sélection de l'utilisateur. Le handler
 * d'upload, lui, ne peut pas le savoir.
 *
 * @jest-environment node
 */

import { describe, it, expect, jest } from '@jest/globals';
import { applyMediaOrder } from '../mediaOrder';

function makeClient() {
  const updateMany = jest.fn<any>(async () => ({ count: 1 }));
  return { client: { postMedia: { updateMany } } as any, updateMany };
}

describe('applyMediaOrder', () => {
  it('pose le RANG de chaque média = sa position dans mediaIds', async () => {
    const { client, updateMany } = makeClient();

    await applyMediaOrder(client, 'post-1', ['m-a', 'm-b', 'm-c']);

    expect(updateMany.mock.calls.map((call: any[]) => call[0])).toEqual([
      { where: { id: 'm-a', postId: 'post-1' }, data: { order: 0 } },
      { where: { id: 'm-b', postId: 'post-1' }, data: { order: 1 } },
      { where: { id: 'm-c', postId: 'post-1' }, data: { order: 2 } },
    ]);
  });

  it('borne l’écriture au post qui vient de réclamer — jamais un id resté libre', async () => {
    // `postId` dans le `where` est la garde : un id que la réclamation a
    // REFUSÉ (autre uploadeur, déjà pris) n'est pas rattaché à ce post, donc
    // `updateMany` ne le touche pas. Pas de second contrôle de propriété à
    // dupliquer ici — exactement le raisonnement d'`applyMediaAlt`.
    const { client, updateMany } = makeClient();

    await applyMediaOrder(client, 'post-9', ['m-a']);

    expect(updateMany).toHaveBeenCalledWith({
      where: { id: 'm-a', postId: 'post-9' },
      data: { order: 0 },
    });
  });

  it('n’écrit RIEN sans média', async () => {
    const { client, updateMany } = makeClient();

    await applyMediaOrder(client, 'post-1', []);

    expect(updateMany).not.toHaveBeenCalled();
  });

  it('un id répété ne consomme qu’UN rang, et les suivants restent contigus', async () => {
    const { client, updateMany } = makeClient();

    await applyMediaOrder(client, 'post-1', ['m-a', 'm-b', 'm-a']);

    expect(updateMany.mock.calls.map((call: any[]) => call[0].data.order)).toEqual([0, 1]);
    expect(updateMany.mock.calls.map((call: any[]) => call[0].where.id)).toEqual(['m-a', 'm-b']);
  });
});
