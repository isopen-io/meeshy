/**
 * **LE COFFRE LISAIT LA MÊME CLÉ N FOIS QUAND N LIGNES L'OUVRAIENT ENSEMBLE**
 * (#20163, relevé par l'audit adversarial du lot).
 *
 * `loadKey` vérifie `keyCache` de façon SYNCHRONE puis `await` la base. Sous un
 * `Promise.all` de N lignes — ce que fait `revealAtRestRows`, et ce que l'export
 * RGPD étend à `MESSAGES_LIMIT = 10 000` — les N appels franchissent tous la
 * vérification avant que le premier ne résolve. **Le cache (500 entrées) n'en
 * absorbe AUCUN**, quel que soit le nombre de clés distinctes : ce n'est pas un
 * réglage, c'est la forme du code.
 *
 * Le coût mesuré par l'audit sur 10 000 lignes scellées sous UNE clé :
 * 10 000 `findUnique` **et** 10 000 `update` de `lastAccessedAt` sur le MÊME
 * document — sur MongoDB, autant d'écritures concurrentes sur un document unique
 * se sérialisent avec reprises sur `WriteConflict`, à travers le PrismaClient
 * PARTAGÉ de toute la passerelle (aucun `connection_limit` n'est configuré, donc
 * le défaut Prisma s'applique et une seule requête HTTP peut affamer le pool).
 *
 * ─── CE QUE CE TÉMOIN GARDE, ET CE QU'IL NE PEUT PAS GARDER ─────────────────
 *
 * Il compte les APPELS, qui sont une propriété du code. Les latences, les
 * conflits d'écriture et les `P2024` de pool ne sont PAS mesurés — il n'y a ni
 * MongoDB ni Docker dans les conteneurs de session.
 *
 * Le remède est une mémoïsation de la PROMESSE, oubliée dès qu'elle est résolue :
 * le verdict rendu à chaque appelant est identique, et le contrôle
 * d'appartenance (`getKeyFor`, `owner === conversationId`) reste par appel —
 * partager la LECTURE ne partage aucune autorisation.
 *
 * @jest-environment node
 */
import { describe, it, expect, afterAll } from '@jest/globals';
import type { PrismaClient } from '@meeshy/shared/prisma/client';
import { ServerKeyVault } from '../../../services/ServerKeyVault';

const MASTER = Buffer.alloc(32, 7).toString('base64');
const KEY_ID = '507f1f77bcf86cd799430001';
const OTHER_KEY_ID = '507f1f77bcf86cd799430002';
const saved = process.env.ENCRYPTION_MASTER_KEY;

afterAll(() => {
  if (saved === undefined) delete process.env.ENCRYPTION_MASTER_KEY;
  else process.env.ENCRYPTION_MASTER_KEY = saved;
});

/** Un coffre dont la base COMPTE ce qu'on lui demande, et qui répond au tour suivant de la boucle. */
const vaultCountingReads = () => {
  const reads: string[] = [];
  const writes: string[] = [];
  const prisma = {
    serverEncryptionKey: {
      findUnique: async ({ where }: { where: { id: string } }) => {
        reads.push(where.id);
        await new Promise((resolve) => setImmediate(resolve));
        return { id: where.id, encryptedKey: 'x', iv: 'y', authTag: 'z', algorithm: 'aes-256-gcm', conversationId: null };
      },
      update: async ({ where }: { where: { id: string } }) => {
        writes.push(where.id);
        return {};
      },
    },
  } as unknown as PrismaClient;
  process.env.ENCRYPTION_MASTER_KEY = MASTER;
  return { vault: new ServerKeyVault(prisma), reads, writes };
};

describe('le coffre ne lit pas la même clé N fois quand N lignes l’ouvrent ENSEMBLE (#20163)', () => {
  it('cinquante ouvertures simultanées de la MÊME clé ne font qu’UNE lecture', async () => {
    const { vault, reads } = vaultCountingReads();

    await Promise.all(Array.from({ length: 50 }, () => vault.loadKey(KEY_ID)));

    expect(reads).toEqual([KEY_ID]);
  });

  it('deux clés distinctes restent deux lectures — la mémoïsation est PAR clé', async () => {
    const { vault, reads } = vaultCountingReads();

    await Promise.all([
      ...Array.from({ length: 20 }, () => vault.loadKey(KEY_ID)),
      ...Array.from({ length: 20 }, () => vault.loadKey(OTHER_KEY_ID)),
    ]);

    expect([...reads].sort()).toEqual([KEY_ID, OTHER_KEY_ID].sort());
  });

  it('rend à CHAQUE appelant le même verdict — partager la lecture ne change pas la réponse', async () => {
    const { vault } = vaultCountingReads();

    const verdicts = await Promise.all(Array.from({ length: 10 }, () => vault.loadKey(KEY_ID)));

    expect(new Set(verdicts.map((verdict) => verdict.status)).size).toBe(1);
  });

  it('la promesse partagée est OUBLIÉE après coup : une ouverture plus tardive relit, elle ne reçoit pas un verdict périmé', async () => {
    const { vault, reads } = vaultCountingReads();

    await Promise.all(Array.from({ length: 5 }, () => vault.loadKey(KEY_ID)));
    await vault.loadKey(KEY_ID);

    expect(reads).toEqual([KEY_ID, KEY_ID]);
  });
});
