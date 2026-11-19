/**
 * **AUCUN COMMENTATEUR PRÉCÉDENT N'ÉTAIT JAMAIS PRÉVENU** (#19803).
 *
 * `services/notifications/fanout/story-comment.ts` lisait `PostComment` par
 * `deletedAt: null`. Sous Prisma + MongoDB c'est une ÉGALITÉ — elle exige la clé
 * PRÉSENTE — et les deux créateurs de `PostComment` ne l'écrivent pas. Le seau
 * `previousCommenterIds` était donc TOUJOURS vide : un nouveau commentaire sous
 * une story ne prévenait personne de ceux qui avaient déjà commenté.
 *
 * ─── CE TÉMOIN ASSERT SUR L'EFFET, PAS SUR LA FORME DE LA CLAUSE ────────────
 *
 * La première rédaction de ce lot ne gardait ce site que par deux assertions de
 * FORME — un `readFileSync` + `toContain('deletedAt: NOT_DELETED')`, et un
 * `matchesMongoWhere` contre une clause RÉÉCRITE à la main. L'audit adversarial
 * les a refusées, et il avait raison : aucune des deux n'appelle la fonction,
 * donc aucune ne peut dire qu'un commentateur est désormais prévenu. C'est la
 * famille que ce lot dénonçait par ailleurs — « un témoin qui recopie la clause
 * ne vérifie que sa propre copie » — commise à son propre site.
 *
 * Celui-ci APPELLE `getStoryNotificationRecipients` et assert sur
 * `previousCommenterIds`. Son double ÉVALUE le `where` contre des documents à la
 * forme nominale ; il n'en recopie jamais la clause.
 *
 * Le double n'est pas `findManyIn` (`helpers/mongo-where.ts`) parce que celui-ci
 * REJETTE `distinct`, que cette requête emploie — et c'est le bon comportement
 * d'un double qui ne sait pas (« toute autre forme jette »). `distinct` est donc
 * modélisé ici, explicitement, plutôt que contourné en retirant la clé.
 */

import { describe, it, expect, jest } from '@jest/globals';
import { matchesMongoWhere, type MongoDocument } from '../helpers/mongo-where';

jest.mock('../../services/notifications/fanout/entourage', () => ({
  resolveEntourage: jest.fn(async () => ({ ids: [], truncated: false })),
  thirdPartyEntourage: jest.fn(async () => ({ ids: [], truncated: false })),
  livingAmong: jest.fn(async () => new Set<string>()),
  mentionReceivers: jest.fn(async () => []),
}));

// eslint-disable-next-line @typescript-eslint/no-var-requires
import { getStoryNotificationRecipients } from '../../services/notifications/fanout/story-comment';

const at = (iso: string) => new Date(iso);

/**
 * Un double qui ÉVALUE le `where`, puis applique `orderBy`, `distinct`, `take`
 * et `select` dans l'ordre où Prisma les applique. Il JETTE sur tout argument
 * qu'il ne modélise pas : un double qui accepte un argument impossible rend
 * vert le test qu'il sert.
 */
const SUPPORTED = new Set(['where', 'select', 'orderBy', 'take', 'distinct']);

const model = (rows: readonly MongoDocument[]) => ({
  findMany: async (args: Record<string, unknown> = {}) => {
    const unknown = Object.keys(args).filter((key) => !SUPPORTED.has(key));
    if (unknown.length > 0) throw new Error(`double Mongo : argument non modélisé « ${unknown.join(', ')} »`);

    const matched = rows.filter((row) => matchesMongoWhere(row, args.where as MongoDocument));

    const orderBy = args.orderBy as Record<string, 'asc' | 'desc'> | undefined;
    const sorted = orderBy === undefined
      ? matched
      : [...matched].sort((a, b) => {
          const [key, dir] = Object.entries(orderBy)[0]!;
          const av = (a[key] as Date | undefined)?.getTime() ?? 0;
          const bv = (b[key] as Date | undefined)?.getTime() ?? 0;
          return dir === 'asc' ? av - bv : bv - av;
        });

    const distinct = args.distinct as readonly string[] | undefined;
    const deduped = distinct === undefined
      ? sorted
      : sorted.filter((row, index) => sorted.findIndex((other) => distinct.every((k) => other[k] === row[k])) === index);

    const taken = args.take === undefined ? deduped : deduped.slice(0, args.take as number);

    const select = args.select as Record<string, boolean> | undefined;
    return taken.map((row) =>
      select === undefined
        ? { ...row }
        : Object.fromEntries(Object.keys(select).filter((k) => select[k]).map((k) => [k, row[k]])),
    );
  },
});

const prismaWith = (comments: readonly MongoDocument[], reactions: readonly MongoDocument[] = []) =>
  ({ postComment: model(comments), postReaction: model(reactions) }) as never;

describe("l'éventail d'un commentaire de story prévient les commentateurs précédents (#19803)", () => {
  /**
   * LA FORME NOMINALE : un commentaire vivant n'a AUCUNE clé `deletedAt`, ce que
   * produisent ses deux créateurs. Un témoin écrit sur `deletedAt: null`
   * explicite ne pourrait pas tomber — les deux états sont indiscernables par la
   * valeur, et c'est précisément ce qui a laissé ce site mort.
   */
  it('rend le commentateur précédent dont la colonne n’est pas écrite', async () => {
    const prisma = prismaWith([
      { id: 'c1', postId: 'p1', authorId: 'u-ancien', createdAt: at('2026-11-10T10:00:00Z') },
    ]);

    const recipients = await getStoryNotificationRecipients(prisma, 'p1', 'u-auteur', 'u-nouveau');

    expect(recipients.previousCommenterIds).toEqual(['u-ancien']);
  });

  /**
   * ET LA RÉPARATION SE MESURE DANS LES DEUX SENS — sans quoi dire l'absence
   * aurait fait prévenir l'auteur d'un commentaire SUPPRIMÉ.
   */
  it('écarte le commentateur dont le commentaire est réellement supprimé', async () => {
    const prisma = prismaWith([
      { id: 'c1', postId: 'p1', authorId: 'u-ancien', createdAt: at('2026-11-10T10:00:00Z') },
      { id: 'c2', postId: 'p1', authorId: 'u-retire', createdAt: at('2026-11-11T10:00:00Z'), deletedAt: at('2026-11-12T10:00:00Z') },
    ]);

    const recipients = await getStoryNotificationRecipients(prisma, 'p1', 'u-auteur', 'u-nouveau');

    expect(recipients.previousCommenterIds).toEqual(['u-ancien']);
  });

  /**
   * LA POSTCONDITION TIENT TOUJOURS : ni l'auteur de la story ni le nouveau
   * commentateur ne se préviennent eux-mêmes, quelle que soit la clause du jour.
   */
  it('ne rend ni l’auteur de la story ni le nouveau commentateur', async () => {
    const prisma = prismaWith([
      { id: 'c1', postId: 'p1', authorId: 'u-auteur', createdAt: at('2026-11-10T10:00:00Z') },
      { id: 'c2', postId: 'p1', authorId: 'u-nouveau', createdAt: at('2026-11-11T10:00:00Z') },
      { id: 'c3', postId: 'p1', authorId: 'u-ancien', createdAt: at('2026-11-09T10:00:00Z') },
    ]);

    const recipients = await getStoryNotificationRecipients(prisma, 'p1', 'u-auteur', 'u-nouveau');

    expect(recipients.previousCommenterIds).toEqual(['u-ancien']);
  });

  /**
   * ET LE SEAU NE SORT PAS DU FIL : un commentaire d'une AUTRE story ne prévient
   * personne ici — la clause d'appartenance n'a pas bougé, et le témoin le
   * prouve plutôt que de l'affirmer.
   */
  it('ne rend jamais le commentateur d’une autre story', async () => {
    const prisma = prismaWith([
      { id: 'c1', postId: 'p1', authorId: 'u-ici', createdAt: at('2026-11-10T10:00:00Z') },
      { id: 'c2', postId: 'p2', authorId: 'u-ailleurs', createdAt: at('2026-11-11T10:00:00Z') },
    ]);

    const recipients = await getStoryNotificationRecipients(prisma, 'p1', 'u-auteur', 'u-nouveau');

    expect(recipients.previousCommenterIds).toEqual(['u-ici']);
  });

  /**
   * LE DISCRIMINANT, NU : les deux formes face au MÊME document nominal. C'est
   * la ligne qui explique les quatre témoins ci-dessus, et elle vaut pour les
   * sites `Post` / `PostComment` que le tri de #19748 n'a pas ouverts.
   */
  it('l’égalité nue n’apparie pas la forme nominale ; `{ isSet: false }` l’apparie', () => {
    const nominal: MongoDocument = { id: 'c1', postId: 'p1', authorId: 'u-1' };

    expect(matchesMongoWhere(nominal, { postId: 'p1', deletedAt: null })).toBe(false);
    expect(matchesMongoWhere(nominal, { postId: 'p1', deletedAt: { isSet: false } })).toBe(true);
  });
});
