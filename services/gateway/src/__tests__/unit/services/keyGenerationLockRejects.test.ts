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
import { ConversationKeyGenerationFailedError } from '../../../services/messaging/serverAtRest';
import { isRetryableMessageWrite } from '../../../services/messaging/retryableWrite';

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

    await expect(premier).rejects.toBeInstanceOf(ConversationKeyGenerationFailedError);
    await expect(settlesWithin(second, 400)).resolves.toBe('settled');
    await expect(second).rejects.toBeInstanceOf(ConversationKeyGenerationFailedError);

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
   * rejeter sans écouteur est un rejet NON OBSERVÉ. **En PRODUCTION cela ne fait
   * pas tomber la passerelle** — `server.ts` enregistre son propre
   * `process.on('unhandledRejection')`, dont le `process.exit(1)` est
   * explicitement commenté : l'effet serait une ligne de journal de crash par
   * échec de génération, ce qui est déjà de trop. **Sous jest, le worker MEURT** :
   * sans la garde, ce fichier rend « Tests: 0 total » (mesuré). C'est la règle du
   * dépôt sur `void p` (§ Critical Gotchas), prise par l'autre bout — et elle se
   * prouve au RUNTIME, pas par le retour de l'appelant.
   */
  it('un appelant SEUL dont la génération échoue ne laisse aucun rejet non géré', async () => {
    process.env.ENCRYPTION_MASTER_KEY = MASTER;
    const service = new EncryptionService(worldWhereCreationFails());
    await service.initialize();

    const unhandled: unknown[] = [];
    const capture = (reason: unknown) => { unhandled.push(reason); };
    process.on('unhandledRejection', capture);

    await expect(service.getOrCreateConversationKey(CONV)).rejects.toBeInstanceOf(ConversationKeyGenerationFailedError);
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

    await expect(service.getOrCreateConversationKey(CONV)).rejects.toBeInstanceOf(ConversationKeyGenerationFailedError);
    await expect(service.getOrCreateConversationKey(CONV)).rejects.toBeInstanceOf(ConversationKeyGenerationFailedError);

    expect(create).toHaveBeenCalledTimes(2);

    await service.shutdown();
  });
});

/**
 * AUDIT ADVERSARIAL DE #19786, constat 1 — le minuteur de libération doit être
 * lié au verrou qu'il a ARMÉ.
 *
 * Le `finally` arme un `guardedTimeout` de 100 ms qui ne capturait que le
 * `conversationId`. Un essai qui ÉCHOUE retire son verrou aussitôt (le `catch`),
 * puis son minuteur tire 100 ms plus tard et supprimait, inconditionnellement,
 * le verrou de l'essai SUIVANT — encore en vol. Le suivant du suivant ne voyait
 * donc plus aucun verrou et repartait en génération : **deux clés pour une
 * conversation**, sous un verrou dont le commentaire dit « prevents TOCTOU race
 * condition ».
 *
 * Ce n'est pas #19786 qui a introduit le `delete` nu — mais #19786 le rend
 * ATTEIGNABLE : avant lui, un échec laissait les attendants PENDUS, donc
 * personne n'arrivait après. Le lot qui fait du réessai le cas nominal réveille
 * un danger dormant, et c'est à lui de le fermer.
 *
 * Le témoin tombe sous la version inconditionnelle : `create` y est appelé
 * TROIS fois et deux `keyId` distincts sont persistés.
 */
describe('#19786 (audit) — le minuteur ne libère QUE le verrou qu’il a armé', () => {
  it('un essai échoué ne supprime pas le verrou d’un essai suivant encore en vol', async () => {
    process.env.ENCRYPTION_MASTER_KEY = MASTER;

    const persisted: string[] = [];
    let attempt = 0;
    const create = jest.fn<any>(async ({ data }: { data: { id?: string } }) => {
      attempt += 1;
      // Mongo convalescent : le premier essai échoue, les suivants réussissent
      // LENTEMENT — la fenêtre exacte où le minuteur du premier tire.
      if (attempt === 1) throw new Error('mongo down');
      await new Promise<void>((resolve) => { setTimeout(resolve, 300); });
      const id = data?.id ?? `key-${attempt}`;
      persisted.push(id);
      return { id };
    });

    const prisma = worldWhereCreationFails();
    (prisma as unknown as { serverEncryptionKey: { create: unknown } }).serverEncryptionKey.create = create;
    const service = new EncryptionService(prisma);
    await service.initialize();

    // t=0 — A prend le verrou et échoue aussitôt : son minuteur est armé.
    await expect(service.getOrCreateConversationKey(CONV)).rejects.toBeInstanceOf(ConversationKeyGenerationFailedError);

    // t≈20 — C entre, ne voit aucun verrou, pose le sien, `create` part (300 ms).
    const c = service.getOrCreateConversationKey(CONV);

    // t≈150 — le minuteur de A a tiré. D entre : il doit S'ABONNER au verrou de
    // C, jamais relancer une génération.
    await new Promise<void>((resolve) => { setTimeout(resolve, 150); });
    const d = service.getOrCreateConversationKey(CONV);

    await expect(c).resolves.toEqual(await d);
    expect(create).toHaveBeenCalledTimes(2);
    expect(new Set(persisted).size).toBe(1);

    await service.shutdown();
  });
});

/**
 * AUDIT ADVERSARIAL DE #19786, constat 2 — l'erreur qui voyage désormais
 * jusqu'aux appelants doit être CLASSÉE.
 *
 * #19786 a fait d'une pendaison une erreur propagée : c'est le bon sens (#9223,
 * « un envoi sans réponse est pire qu'un envoi refusé »). Mais l'erreur propagée
 * était l'erreur de base BRUTE, qu'aucun prédicat de `MessagingService` ne
 * reconnaît : elle tombait dans la branche terminale « erreur interne », servie
 * en **HTTP 400** — que `outcomeOf` (`apps/web/src/lib/api/outcome.ts`,
 * `RETRYABLE_CLIENT_STATUSES = {408, 425, 429}`) classe `permanent`, donc SANS
 * bouton « Réessayer ». La pendaison d'avant finissait, elle, en `TIMEOUT` après
 * 15 s, c'est-à-dire en transitoire RETRYABLE.
 *
 * Le lot échangeait donc un mauvais transport contre une PIRE issue produit, sur
 * une panne qui ne durera pas. Un échec de génération ne porte que ce qu'il
 * sait : **rien n'a été écrit, le même envoi rejoué aboutit.**
 */
describe('#19786 (audit) — un échec de génération de clé est un refus REJOUABLE', () => {
  it('l’erreur propagée est classée, porte sa conversation, et garde sa cause', async () => {
    process.env.ENCRYPTION_MASTER_KEY = MASTER;
    const service = new EncryptionService(worldWhereCreationFails());
    await service.initialize();

    const error = await service.getOrCreateConversationKey(CONV).catch((e: unknown) => e);

    expect(error).toBeInstanceOf(ConversationKeyGenerationFailedError);
    expect((error as ConversationKeyGenerationFailedError).conversationId).toBe(CONV);
    expect((error as ConversationKeyGenerationFailedError).underlying).toMatchObject({ message: 'mongo down' });

    await service.shutdown();
  });

  it('`isRetryableMessageWrite` la reconnaît — l’erreur BRUTE, non (contrôle)', async () => {
    expect(isRetryableMessageWrite(new ConversationKeyGenerationFailedError(CONV, new Error('mongo down')))).toBe(true);
    expect(isRetryableMessageWrite(new Error('mongo down'))).toBe(false);
  });

  /**
   * Un refus de clé MAÎTRESSE dit autre chose : il durera tant que l'exploitant
   * n'agira pas, et il a déjà son code et son 503. Le classement ne doit pas
   * l'avaler — sans quoi un envoi se verrait promettre un rejeu qui échouera
   * identiquement, indéfiniment.
   */
  it('un refus de clé maîtresse traverse TEL QUEL, il n’est pas reclassé', async () => {
    delete process.env.ENCRYPTION_MASTER_KEY;
    const service = new EncryptionService(worldWhereCreationFails());
    await service.initialize();

    const error = await service.getOrCreateConversationKey(CONV).catch((e: unknown) => e);

    expect(error).not.toBeInstanceOf(ConversationKeyGenerationFailedError);
    expect(error).toMatchObject({ code: 'SERVER_AT_REST_UNAVAILABLE', reason: 'missing' });
    expect(isRetryableMessageWrite(error)).toBe(false);

    await service.shutdown();
  });
});
