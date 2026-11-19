/**
 * #19786 — quand la génération d'une clé de conversation ÉCHOUE, les appelants
 * en attente du verrou reçoivent l'échec. Avant ce lot, ils ne recevaient RIEN.
 *
 * `getOrCreateConversationKey` sérialise la génération par un verrou de
 * processus : le premier appelant crée la promesse, les suivants la rendent
 * (`return existingLock.promise`). La promesse n'était construite qu'avec son
 * `resolve` ; son `catch` supprimait l'entrée de la carte et RELANÇAIT, sans
 * jamais la régler. Tout appelant entré par ce chemin détenait donc une promesse
 * qui ne se réglerait **jamais** — ni résolue, ni rejetée, aucun minuteur pour la
 * libérer. Sur une requête HTTP, c'est une réponse qui n'arrive pas.
 *
 * Et le commentaire du `catch` ANNONÇAIT le contraire — « On error, reject
 * waiting promises with a new generation attempt ». Un commentaire qui énonce un
 * comportement est une AFFIRMATION, et celle-ci était fausse depuis l'origine
 * (cycle 94).
 *
 * **Pourquoi maintenant.** #19755 fait échouer OUVERT la relecture de la clé en
 * base : pendant un incident Mongo, la lecture rend `undefined` pour toute la
 * salve, le premier appelant prend le verrou, `create` échoue — et tous les
 * envois concurrents de cette conversation pendent. Le scénario demandait avant
 * deux envois simultanés ; il est devenu le mode nominal d'un incident. Au
 * regard de #9223, **un envoi sans réponse est pire qu'un envoi refusé.**
 *
 * @jest-environment node
 */
import { describe, it, expect, afterAll, jest } from '@jest/globals';
import type { PrismaClient } from '@meeshy/shared/prisma/client';
import { EncryptionService } from '../../../services/EncryptionService';

const MASTER = Buffer.alloc(32, 11).toString('base64');
const CONV = '507f1f77bcf86cd799439011';
const saved = process.env.ENCRYPTION_MASTER_KEY;

afterAll(() => {
  if (saved === undefined) delete process.env.ENCRYPTION_MASTER_KEY;
  else process.env.ENCRYPTION_MASTER_KEY = saved;
});

/** Une base où la LECTURE ne trouve rien et où la CRÉATION échoue — l'incident. */
const worldWhereCreationFails = () => ({
  conversation: { findUnique: async () => ({ id: CONV, serverEncryptionKeyId: null }), updateMany: async () => ({ count: 0 }) },
  serverEncryptionKey: {
    findMany: async () => [],
    findUnique: async () => null,
    create: async () => { throw new Error('mongo down'); },
    update: async () => ({}),
    updateMany: async () => ({ count: 0 }),
  },
} as unknown as PrismaClient);

/**
 * Une promesse qui PEND est indistinguable d'une promesse lente : il faut une
 * borne. 400 ms est deux fois le délai de libération du verrou (100 ms) et deux
 * ordres de grandeur au-dessus de ce que ces chemins prennent en test.
 */
const settlesWithin = async (promise: Promise<unknown>, ms: number): Promise<'settled' | 'PENDU'> => {
  let timer: NodeJS.Timeout | undefined;
  const verdict = await Promise.race([
    promise.then(() => 'settled' as const, () => 'settled' as const),
    new Promise<'PENDU'>((resolve) => { timer = setTimeout(() => resolve('PENDU'), ms); }),
  ]);
  if (timer) clearTimeout(timer);
  return verdict;
};

describe('#19786 — une génération de clé qui échoue RÈGLE les appelants en attente', () => {
  it('le SECOND appelant reçoit l’échec au lieu de pendre indéfiniment', async () => {
    process.env.ENCRYPTION_MASTER_KEY = MASTER;
    const service = new EncryptionService(worldWhereCreationFails());
    await service.initialize();

    const premier = service.getOrCreateConversationKey(CONV);
    const second = service.getOrCreateConversationKey(CONV);

    await expect(premier).rejects.toThrow('mongo down');
    await expect(settlesWithin(second, 400)).resolves.toBe('settled');
    await expect(second).rejects.toThrow('mongo down');

    await service.shutdown();
  });

  it('dix appelants concurrents reçoivent TOUS l’échec — aucun n’est abandonné', async () => {
    process.env.ENCRYPTION_MASTER_KEY = MASTER;
    const service = new EncryptionService(worldWhereCreationFails());
    await service.initialize();

    const verdicts = await Promise.allSettled(
      Array.from({ length: 10 }, () => service.getOrCreateConversationKey(CONV))
    );

    expect(verdicts.map((one) => one.status)).toEqual(Array.from({ length: 10 }, () => 'rejected'));

    await service.shutdown();
  });

  /**
   * La garde que le correctif EXIGE, et qui n'a rien de cosmétique : la promesse
   * du verrou peut n'avoir AUCUN attendant (cas nominal — un seul appelant). La
   * rejeter sans écouteur termine le PROCESS sous le
   * `--unhandled-rejections=throw` par défaut de Node 22 : toute la passerelle
   * tombée pour une clé qui n'a pas pu être créée. C'est la règle du dépôt sur
   * `void p` (§ Critical Gotchas), prise par l'autre bout — et elle se prouve au
   * RUNTIME, pas par le retour de l'appelant.
   */
  it('un appelant SEUL dont la génération échoue ne laisse aucun rejet non géré', async () => {
    process.env.ENCRYPTION_MASTER_KEY = MASTER;
    const service = new EncryptionService(worldWhereCreationFails());
    await service.initialize();

    const unhandled: unknown[] = [];
    const capture = (reason: unknown) => { unhandled.push(reason); };
    process.on('unhandledRejection', capture);

    await expect(service.getOrCreateConversationKey(CONV)).rejects.toThrow('mongo down');
    // Franchir la phase « check » : un rejet non géré n'est signalé qu'après.
    await new Promise<void>((resolve) => { setImmediate(resolve); });
    await new Promise<void>((resolve) => { setImmediate(resolve); });

    process.off('unhandledRejection', capture);
    expect(unhandled).toEqual([]);

    await service.shutdown();
  });

  it('un appelant TARDIF, après libération du verrou, refait le chemin complet', async () => {
    process.env.ENCRYPTION_MASTER_KEY = MASTER;
    const prisma = worldWhereCreationFails();
    const create = jest.fn<any>(async () => { throw new Error('mongo down'); });
    (prisma as unknown as { serverEncryptionKey: { create: unknown } }).serverEncryptionKey.create = create;
    const service = new EncryptionService(prisma);
    await service.initialize();

    await expect(service.getOrCreateConversationKey(CONV)).rejects.toThrow('mongo down');
    await expect(service.getOrCreateConversationKey(CONV)).rejects.toThrow('mongo down');

    expect(create).toHaveBeenCalledTimes(2);

    await service.shutdown();
  });
});
