/**
 * **LES SIÈGES D'UN COMPTE — un seul `where`, et une pagination qui a un témoin**
 * (#20129).
 *
 * ─── POURQUOI CES TÉMOINS EXISTENT ─────────────────────────────────────────
 *
 * La pagination est la moitié du lot que sa décision argumente le plus
 * longuement, et elle n'avait AUCUN témoin : le double du seul témoin de la
 * purge rendait UNE ligne, donc `rows.length < batchSize` sortait à la première
 * fournée et le chemin multi-fournées n'était jamais exercé. Mesuré par l'audit
 * adversarial : supprimer `skip += rows.length` — ce qui fait boucler la passe
 * horaire de maintenance INDÉFINIMENT sur la page 1 — laissait 58 témoins verts.
 *
 * Un argument de deux paragraphes sans témoin n'est pas une garde.
 *
 * @jest-environment node
 */

import { describe, it, expect, jest } from '@jest/globals';
import { accountSeatIdBatches, accountSeatIds } from '../accountParticipantIds';
import { uploadedByOfAccount } from '../../attachments/uploaderIdentity';

const USER_ID = '507f1f77bcf86cd799439011';

const seats = (count: number, prefix = 'p') =>
  Array.from({ length: count }, (_, index) => `${prefix}${String(index).padStart(4, '0')}`);

/** Un double qui honore `skip`/`take` comme Prisma, et peut lever à une page donnée. */
const prismaWith = (all: readonly string[], options: { failOnCall?: number } = {}) => {
  let calls = 0;
  const findMany = jest.fn<any>(async ({ skip = 0, take }: any) => {
    calls += 1;
    if (options.failOnCall === calls) throw new Error('replica lag');
    return all.slice(skip, take === undefined ? undefined : skip + take).map((id) => ({ id }));
  });
  return { prisma: { participant: { findMany } } as never, findMany };
};

const drain = async (gen: AsyncGenerator<{ readonly ids: readonly string[]; readonly complete: boolean }>) => {
  const batches: Array<{ ids: readonly string[]; complete: boolean }> = [];
  for await (const batch of gen) batches.push(batch);
  return batches;
};

describe('le `where` des sièges est le MÊME aux deux lectures, et il ne porte pas le `type`', () => {
  it('la lecture ENTIÈRE apparie la seule identité de compte, et ne demande que les ids', async () => {
    const { prisma, findMany } = prismaWith(['p-1', 'p-2']);

    await expect(accountSeatIds(prisma, USER_ID)).resolves.toEqual(['p-1', 'p-2']);
    expect(findMany).toHaveBeenCalledWith({ where: { userId: USER_ID }, select: { id: true } });
  });

  it('la lecture PAGINÉE apparie exactement le même `where`', async () => {
    const { prisma, findMany } = prismaWith(['p-1']);

    await drain(accountSeatIdBatches(prisma, USER_ID, 100));

    expect(findMany).toHaveBeenCalledWith({
      where: { userId: USER_ID },
      select: { id: true },
      orderBy: { id: 'asc' },
      take: 100,
      skip: 0,
    });
  });
});

describe('la pagination des sièges ne saute ni ne répète', () => {
  it('rend les 250 sièges en trois fournées, dans l’ordre, sans trou ni doublon', async () => {
    const all = seats(250);
    const { prisma } = prismaWith(all);

    const batches = await drain(accountSeatIdBatches(prisma, USER_ID, 100));

    expect(batches.map((batch) => batch.ids.length)).toEqual([100, 100, 50]);
    expect(batches.flatMap((batch) => [...batch.ids])).toEqual(all);
    expect(batches.every((batch) => batch.complete)).toBe(true);
  });

  it('un MULTIPLE EXACT de la fournée s’arrête sur une page vide, sans répéter la dernière', async () => {
    const all = seats(200);
    const { prisma, findMany } = prismaWith(all);

    const batches = await drain(accountSeatIdBatches(prisma, USER_ID, 100));

    expect(batches.flatMap((batch) => [...batch.ids])).toEqual(all);
    // Trois lectures : deux pleines, puis celle qui prouve la fin.
    expect(findMany).toHaveBeenCalledTimes(3);
  });

  it('un compte SANS siège rend une seule fournée vide, et elle est COMPLÈTE', async () => {
    const { prisma } = prismaWith([]);

    expect(await drain(accountSeatIdBatches(prisma, USER_ID, 100))).toEqual([{ ids: [], complete: true }]);
  });
});

describe('une lecture qui LÈVE arrête la descente et le DIT', () => {
  it('à la première page : une fournée vide, `complete: false`', async () => {
    const { prisma } = prismaWith(seats(250), { failOnCall: 1 });

    expect(await drain(accountSeatIdBatches(prisma, USER_ID, 100))).toEqual([{ ids: [], complete: false }]);
  });

  it('en COURS DE ROUTE : ce qui a été lu est rendu, et la perte est annoncée', async () => {
    const { prisma } = prismaWith(seats(250), { failOnCall: 2 });

    const batches = await drain(accountSeatIdBatches(prisma, USER_ID, 100));

    // La première fournée a servi — dire « le compte seul » ici serait faux.
    expect(batches.map((batch) => batch.ids.length)).toEqual([100, 0]);
    expect(batches.map((batch) => batch.complete)).toEqual([true, false]);
  });
});

/**
 * Le durcissement que le lot n'avait pas dit, et que l'audit a nommé : avant
 * #20129, `uploadedBy: userId` avec un `userId` falsy rendait
 * `uploadedBy: undefined`, que **Prisma IGNORE** — donc un `where` qui apparie
 * TOUT. Du côté de la purge, c'est la destruction de toutes les pièces jointes
 * du dépôt ; du côté de l'export, l'archive d'un compte contenant celle de tous
 * les autres.
 */
describe('un `userId` FALSY n’apparie RIEN, jamais TOUT', () => {
  it.each([['', 'chaîne vide'], [undefined, 'indéfini'], [null, 'nul']])(
    'rend une liste vide pour un identifiant %s (%s)',
    (identity) => {
      expect(uploadedByOfAccount(identity as string, [])).toEqual({ in: [] });
    }
  );

  it('ne garde pas non plus un siège vide passé par mégarde', () => {
    expect(uploadedByOfAccount(USER_ID, ['', 'p-1'])).toEqual({ in: [USER_ID, 'p-1'] });
  });

  it('dédoublonne quand un siège PORTE l’identité du compte', () => {
    expect(uploadedByOfAccount(USER_ID, [USER_ID, 'p-1'])).toEqual({ in: [USER_ID, 'p-1'] });
  });
});

/**
 * La borne de VIVACITÉ. Le `for (;;)` d'avant n'en avait aucune : une page qui
 * ne progresse pas y bouclait pour toujours, dans la passe HORAIRE de
 * maintenance. Son témoin PENDAIT au lieu de rougir — en CI, cela ne se
 * distingue pas d'un environnement cassé, donc ce n'était pas un témoin.
 */
describe('une page qui ne PROGRESSE pas s’arrête, et le dit', () => {
  it('rend la main au plafond de pages plutôt que de boucler, et annonce l’incomplétude', async () => {
    // Le double ignore `skip` : il rend toujours une fournée PLEINE. C'est
    // exactement ce que produit la mutation « `skip` n'avance pas ».
    const findMany = jest.fn<any>(async ({ take }: any) =>
      Array.from({ length: take ?? 0 }, (_, index) => ({ id: `p${index}` }))
    );
    const prisma = { participant: { findMany } } as never;

    const batches = await drain(accountSeatIdBatches(prisma, USER_ID, 100));

    expect(batches.at(-1)).toEqual({ ids: [], complete: false });
    expect(findMany.mock.calls.length).toBeLessThanOrEqual(500);
    expect(batches.length).toBeGreaterThan(1);
  }, 20000);
});

/**
 * Le cliquet du PRODUCTEUR. `uploaded-by-key-space-sweep` garde la forme du
 * FILTRE (`uploadedBy: uploadedByOfAccount(…)`) ; rien ne gardait qui PRODUIT la
 * liste de sièges qu'on lui passe, et c'est là que vivait la divergence des
 * trois `where`.
 *
 * **Son discriminant est le `select`, pas la table.** Une lecture de
 * `participant` qui ne demande QUE `id` ne peut répondre qu'à une question : « de
 * quels sièges ce compte dispose-t-il ? ». Une lecture qui demande autre chose en
 * pose une autre, et garde légitimement son `where` — la section `contacts` de
 * l'export lit les participations ACTIVES avec leur conversation et ses
 * co-participants, et son `isActive: true` est sa règle produit, pas une
 * divergence. Elle sort par CONSTRUCTION, pas par exemption : c'est la condition
 * « détenir n'est pas ÉMETTRE » des balayages de portes, portée à un `select`.
 *
 * Il garde l'absence : il n'y a pas de second producteur légitime de cette
 * liste. Quand il tombe, la réparation est d'appeler le site unique.
 */
describe('aucun consommateur ne RELIT la liste des sièges chez lui', () => {
  const CONSUMERS = [
    'routes/me/export.ts',
    'services/purgeDeletedAccountMedia.ts',
    'services/calls/callTelemetryPrivacy.ts',
  ];

  /** `participant.findMany({ … select: { id: true } })` — la liste des sièges, et rien d'autre. */
  const SEAT_ID_READ = /participant\.findMany\([\s\S]{0,300}?select:\s*\{\s*id:\s*true\s*,?\s*\}/;

  it('les trois passent par le site unique', async () => {
    const { readFileSync } = await import('fs');
    const { join } = await import('path');
    const srcRoot = join(__dirname, '../../..');
    const code = CONSUMERS.map((file) => ({ file, text: readFileSync(join(srcRoot, file), 'utf8') }));

    expect(code.filter(({ text }) => !/accountSeatIds|accountSeatIdBatches/.test(text)).map(({ file }) => file))
      .toEqual([]);
    expect(code.filter(({ text }) => SEAT_ID_READ.test(text)).map(({ file }) => file)).toEqual([]);
  });

  it('le discriminant VOIT une relecture de sièges, et ne voit pas la lecture de `contacts`', () => {
    expect(SEAT_ID_READ.test("prisma.participant.findMany({ where: { userId }, select: { id: true } })")).toBe(true);
    expect(SEAT_ID_READ.test("prisma.participant.findMany({\n  where: { userId },\n  select: { id: true },\n})")).toBe(true);
    expect(SEAT_ID_READ.test("prisma.participant.findMany({ where: { userId, isActive: true }, select: { conversationId: true, role: true } })")).toBe(false);
  });
});
