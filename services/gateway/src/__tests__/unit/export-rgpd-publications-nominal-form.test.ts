/**
 * **L'EXPORT RGPD NE RENDAIT NI POST, NI STORY, NI COMMENTAIRE** (#19909).
 *
 * Les trois sections de publication de `routes/me/export-sections.ts` portaient
 * `deletedAt: null`. Sous Prisma + MongoDB c'est une ÉGALITÉ — elle exige la clé
 * PRÉSENTE — et aucun des quatre créateurs de `Post` / `PostComment` ne l'écrit.
 * Les trois clauses n'appariaient donc AUCUNE ligne, pour aucun compte.
 *
 * ─── POURQUOI LE `total` EST LA MOITIÉ QUI COMPTE ───────────────────────────
 *
 * Le `where` est partagé par `findMany` ET `count`, donc l'archive servait
 * `items: []` AVEC `total: 0` : elle ne se présentait pas comme tronquée mais
 * comme « vous n'avez rien publié » — indistinguable d'un compte vide. Un
 * témoin qui n'assert que `items` laisserait passer la moitié du défaut qui le
 * rend invisible ; les trois témoins nominaux assertent donc les DEUX.
 *
 * ─── POURQUOI CES TÉMOINS SONT ÉCRITS SUR LA FORME NOMINALE ─────────────────
 *
 * La forme nominale d'une publication est **aucune clé** `deletedAt`. Un témoin
 * écrit sur `deletedAt: null` explicite ne pourrait pas tomber : les deux états
 * sont indiscernables par la VALEUR, et c'est exactement ce qui a laissé ces
 * trois sites vivre. Le double ÉVALUE le `where` (`matchesMongoWhere`) contre
 * des documents nus — il ne recopie jamais la clause, ce qui attesterait le
 * défaut au lieu de l'exercer.
 */

import { describe, it, expect } from '@jest/globals';
import { matchesMongoWhere, type MongoDocument } from '../helpers/mongo-where';
import {
  exportComments,
  exportPosts,
  exportStories,
  type ExportPage,
} from '../../routes/me/export-sections';

const page: ExportPage = { limit: 50, offset: 0 };
const at = (iso: string) => new Date(iso);

/** Un double qui ÉVALUE le `where` et honore `skip`/`take`, comme Prisma. */
const model = (rows: readonly MongoDocument[]) => {
  const matched = (where: MongoDocument) => rows.filter((row) => matchesMongoWhere(row, where));
  return {
    findMany: async ({ where, skip = 0, take }: { where: MongoDocument; skip?: number; take?: number }) =>
      matched(where).slice(skip, take === undefined ? undefined : skip + take),
    count: async ({ where }: { where: MongoDocument }) => matched(where).length,
  };
};

describe("l'export RGPD rend les publications à la forme nominale (#19909)", () => {
  it('rend le post et le reel d’un compte dont la colonne n’est pas écrite, et les COMPTE', async () => {
    const prisma = {
      post: model([
        { id: 'p1', authorId: 'u-1', type: 'POST' },
        { id: 'p2', authorId: 'u-1', type: 'REEL' },
      ]),
    } as never;

    const section = await exportPosts(prisma, 'u-1', page);

    expect(section.items).toHaveLength(2);
    expect(section.total).toBe(2);
  });

  it('rend la story et le statut à la forme nominale, et les COMPTE', async () => {
    const prisma = {
      post: model([
        { id: 's1', authorId: 'u-1', type: 'STORY' },
        { id: 's2', authorId: 'u-1', type: 'STATUS' },
      ]),
    } as never;

    const section = await exportStories(prisma, 'u-1', page);

    expect(section.items).toHaveLength(2);
    expect(section.total).toBe(2);
  });

  it('rend le commentaire à la forme nominale, et le COMPTE', async () => {
    const prisma = {
      postComment: model([{ id: 'c1', authorId: 'u-1', postId: 'p1', content: 'bonjour' }]),
    } as never;

    const section = await exportComments(prisma, 'u-1', page);

    expect(section.items).toHaveLength(1);
    expect(section.total).toBe(1);
  });

  /**
   * ET LA RÉPARATION SE MESURE DANS LES DEUX SENS — sans quoi dire l'absence
   * aurait fait entrer dans l'archive ce que l'auteur a supprimé. Une
   * publication réellement supprimée reste dehors, et le `total` le dit aussi.
   */
  it('écarte toujours une publication réellement supprimée, et ne la compte pas', async () => {
    const prisma = {
      post: model([
        { id: 'p-vivant', authorId: 'u-1', type: 'POST' },
        { id: 'p-supprime', authorId: 'u-1', type: 'POST', deletedAt: at('2026-11-18T10:00:00Z') },
      ]),
    } as never;

    const section = await exportPosts(prisma, 'u-1', page);

    expect(section.items.map((row) => (row as { id: string }).id)).toEqual(['p-vivant']);
    expect(section.total).toBe(1);
  });

  /**
   * ET L'EXPORT RESTE CELUI DE SON AUTEUR : la clause d'appartenance n'a pas
   * bougé, et le témoin le prouve plutôt que de l'affirmer — élargir un `where`
   * pour réparer un filtre mort est le risque propre à ce genre de correctif.
   */
  it('ne rend jamais la publication d’un AUTRE compte', async () => {
    const prisma = {
      post: model([
        { id: 'p-moi', authorId: 'u-1', type: 'POST' },
        { id: 'p-autre', authorId: 'u-2', type: 'POST' },
      ]),
    } as never;

    const section = await exportPosts(prisma, 'u-1', page);

    expect(section.items.map((row) => (row as { id: string }).id)).toEqual(['p-moi']);
    expect(section.total).toBe(1);
  });

  /**
   * LE DISCRIMINANT, NU : les deux formes face au MÊME document nominal. C'est
   * la ligne qui explique les cinq témoins ci-dessus, et elle vaut pour les dix
   * sites `Post` / `PostComment` que le tri de #19748 n'a pas ouverts.
   */
  it('l’égalité nue n’apparie pas la forme nominale ; `{ isSet: false }` l’apparie', () => {
    const nominal: MongoDocument = { id: 'c1', authorId: 'u-1' };

    expect(matchesMongoWhere(nominal, { authorId: 'u-1', deletedAt: null })).toBe(false);
    expect(matchesMongoWhere(nominal, { authorId: 'u-1', deletedAt: { isSet: false } })).toBe(true);
  });
});
