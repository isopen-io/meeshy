/** @jest-environment node */
import { describe, it, expect, jest } from '@jest/globals';
import { accountParticipantIdBatches, uploadedByOfAccount } from '../../services/attachments/uploaderIdentity';

const UID = '507f1f77bcf86cd799439011';

const ids = (n: number, prefix = 'p') => Array.from({ length: n }, (_, i) => `${prefix}${String(i).padStart(4, '0')}`);

const prismaWith = (all: readonly string[], failOnCall?: number) => {
  let calls = 0;
  return {
    participant: {
      findMany: jest.fn<any>(async ({ skip = 0, take }: any) => {
        calls += 1;
        if (failOnCall !== undefined && calls === failOnCall) throw new Error('replica lag');
        return all.slice(skip, take === undefined ? undefined : skip + take).map((id) => ({ id }));
      }),
    },
  } as never;
};

describe('probe — accountParticipantIdBatches', () => {
  it('pagine sans trou ni doublon sur 3 fournées', async () => {
    const all = ids(250);
    const seen: string[] = [];
    for await (const batch of accountParticipantIdBatches(prismaWith(all), UID, 100)) seen.push(...batch);
    expect(seen).toEqual(all);
  });

  it('exactement un multiple de la fournée : ne saute pas, ne répète pas', async () => {
    const all = ids(200);
    const seen: string[] = [];
    for await (const batch of accountParticipantIdBatches(prismaWith(all), UID, 100)) seen.push(...batch);
    expect(seen).toEqual(all);
  });

  it("une PANNE au MILIEU abandonne les participations restantes en silence", async () => {
    const all = ids(250);
    const seen: string[] = [];
    for await (const batch of accountParticipantIdBatches(prismaWith(all, 2), UID, 100)) seen.push(...batch);
    // 100 vus, 150 perdus — aucune exception, aucun signal au niveau supérieur
    expect(seen).toHaveLength(100);
  });

  it('uploadedByOfAccount : un userId vide rend un filtre qui apparie RIEN', () => {
    expect(uploadedByOfAccount(undefined as never, [])).toEqual({ in: [] });
  });

  it('uploadedByOfAccount dédoublonne', () => {
    expect(uploadedByOfAccount(UID, [UID, 'a', 'a'])).toEqual({ in: [UID, 'a'] });
  });
});
