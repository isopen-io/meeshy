/**
 * #19755 — le coffre RETROUVE la clé de conversation que la base porte, au lieu
 * d'en forger une neuve à chaque démarrage.
 *
 * `ServerKeyVault.initialize()` chargeait la carte `conversationId → keyId` par
 * un balayage de table filtré `expiresAt: { equals: null }`. Sous MongoDB c'est
 * une ÉGALITÉ : elle n'apparie pas un document dont la clé est ABSENTE — et
 * **aucun des deux créateurs n'écrit `expiresAt`** (`ServerKeyVault.generateKey`,
 * `AttachmentEncryptionService.generateKey`). La carte partait donc VIDE à
 * chaque démarrage, quel que soit le nombre de clés en base, et le journal
 * l'affirmait à voix haute (`conversationKeysLoaded: 0`) sans que personne ne le
 * lise comme une anomalie.
 *
 * Ce que la carte vide coûte, mesuré : la carte n'est PAS une autorité de
 * lecture — un chiffré voyage avec son `keyId` et s'ouvre par sa ligne
 * (`loadKey` / `getKeyFor`), donc rien n'est devenu illisible. Son seul
 * consommateur est le chemin rapide de `getOrCreateConversationKey`, qui, sur un
 * manque, **forge et persiste une clé NEUVE**. Pour toute conversation dont
 * `serverEncryptionKeyId` est nul — celles d'avant la désignation, et celles que
 * la purge a détachées — c'était donc une ligne `ServerEncryptionKey` de plus
 * par processus et par démarrage, indéfiniment, avec l'historique éparpillé sur
 * autant de clés. Un cache froid ET une prolifération, jamais une perte.
 *
 * ─── POURQUOI LA FORME JUSTE N'EST PAS `unsetOrNull` SUR LE BALAYAGE ─────────
 *
 * Réparer le filtre en place rendrait le balayage de démarrage EFFICACE : il
 * lirait alors chaque clé de conversation de la base pour les tenir toutes dans
 * une `Map` sans borne ni éviction — un plein scan au premier chiffrement et une
 * rétention proportionnelle au nombre de conversations, là où `keyCache` (500) et
 * `designationCache` (2 000) sont bornés. C'est la dimension 3 (« que reste-t-il
 * en mémoire ? ») et la contrainte #9232 (« rien ne doit empêcher de monter à
 * 100 000 »). La carte étant un CACHE dont le manque se remplit en une lecture,
 * elle devient donc read-through et BORNÉE, et le démarrage ne lit plus rien.
 *
 * @jest-environment node
 */
import { describe, it, expect, afterAll } from '@jest/globals';
import type { PrismaClient } from '@meeshy/shared/prisma/client';
import { ServerKeyVault } from '../../../services/ServerKeyVault';
import { EncryptionService } from '../../../services/EncryptionService';
import { findManyIn, findUniqueIn, type MongoDocument } from '../../helpers/mongo-where';

const MASTER = Buffer.alloc(32, 7).toString('base64');
const CONV = '507f1f77bcf86cd799439011';
const OTHER_CONV = '507f1f77bcf86cd799439022';
const saved = process.env.ENCRYPTION_MASTER_KEY;

afterAll(() => {
  if (saved === undefined) delete process.env.ENCRYPTION_MASTER_KEY;
  else process.env.ENCRYPTION_MASTER_KEY = saved;
});

/**
 * Une ligne `ServerEncryptionKey` dans sa forme NOMINALE de production : ni
 * `expiresAt`, parce qu'aucun créateur ne l'écrit — c'est la forme sous laquelle
 * l'immense majorité des clés existent, et celle que le filtre fautif ne voyait
 * pas. `isActive` est en revanche TOUJOURS présente : Prisma écrit son
 * `@default(true)` à la création.
 */
const nominalKey = (id: string, overrides: MongoDocument = {}): MongoDocument => ({
  id,
  encryptedKey: 'x',
  iv: 'y',
  authTag: 'z',
  algorithm: 'aes-256-gcm',
  purpose: 'conversation',
  conversationId: CONV,
  createdAt: new Date('2026-01-01T00:00:00Z'),
  lastAccessedAt: new Date('2026-01-01T00:00:00Z'),
  isActive: true,
  ...overrides,
});

/**
 * Le monde : une table de clés qui ÉVALUE son `where` contre des DOCUMENTS
 * (`matchesMongoWhere`), donc qui distingue une clé absente d'une clé nulle. Un
 * double qui rend ses lignes quel que soit le filtre ne peut pas voir ce défaut
 * — c'est exactement ce qui l'a laissé vivre, la fixture d'`EncryptionService`
 * n'appariant que `purpose`.
 */
const world = (rows: readonly MongoDocument[], designation: string | null = null) => {
  const table = [...rows];
  const created: MongoDocument[] = [];
  const { findMany, calls } = findManyIn(table);
  const prisma = {
    conversation: {
      findUnique: async () => ({ id: CONV, serverEncryptionKeyId: designation }),
      updateMany: async () => ({ count: 1 }),
    },
    serverEncryptionKey: {
      findMany,
      findUnique: findUniqueIn(table),
      create: async ({ data }: { data: MongoDocument }) => {
        created.push(data);
        table.push({ ...data, isActive: true });
        return data;
      },
      update: async () => ({}),
      updateMany: async () => ({ count: 0 }),
    },
  } as unknown as PrismaClient;
  return { prisma, created, calls, table };
};

describe('#19755 — la clé de conversation que la base porte est RETROUVÉE', () => {
  it('rend la clé NOMINALE (aucune colonne `expiresAt`) plutôt que d’en forger une neuve', async () => {
    process.env.ENCRYPTION_MASTER_KEY = MASTER;
    const { prisma, created } = world([nominalKey('key-nominale')]);
    const service = new EncryptionService(prisma);
    await service.initialize();

    await expect(service.getOrCreateConversationKey(CONV)).resolves.toBe('key-nominale');
    expect(created).toEqual([]);

    await service.shutdown();
  });

  it('rend aussi la clé à `expiresAt: null` EXPLICITE — l’état minoritaire, celui qu’une fixture écrit à la main', async () => {
    process.env.ENCRYPTION_MASTER_KEY = MASTER;
    const { prisma, created } = world([nominalKey('key-nulle', { expiresAt: null })]);
    const service = new EncryptionService(prisma);
    await service.initialize();

    await expect(service.getOrCreateConversationKey(CONV)).resolves.toBe('key-nulle');
    expect(created).toEqual([]);

    await service.shutdown();
  });

  it('n’écrit plus sous une clé EXPIRÉE, ni sous une clé DÉSACTIVÉE, ni sous la clé d’une pièce jointe', async () => {
    process.env.ENCRYPTION_MASTER_KEY = MASTER;
    const { prisma, created } = world([
      nominalKey('key-expiree', { expiresAt: new Date('2026-02-01T00:00:00Z') }),
      nominalKey('key-eteinte', { isActive: false }),
      nominalKey('key-piece-jointe', { purpose: 'attachment' }),
    ]);
    const service = new EncryptionService(prisma);
    await service.initialize();

    const keyId = await service.getOrCreateConversationKey(CONV);

    expect(['key-expiree', 'key-eteinte', 'key-piece-jointe']).not.toContain(keyId);
    expect(created).toHaveLength(1);

    await service.shutdown();
  });

  it('ne rend jamais la clé d’une AUTRE conversation', async () => {
    process.env.ENCRYPTION_MASTER_KEY = MASTER;
    const { prisma } = world([nominalKey('key-voisine', { conversationId: OTHER_CONV })]);
    const service = new EncryptionService(prisma);
    await service.initialize();

    await expect(service.getOrCreateConversationKey(CONV)).resolves.not.toBe('key-voisine');

    await service.shutdown();
  });

  it('choisit la PLUS RÉCENTE quand la prolifération en a laissé plusieurs — deux instances s’accordent', async () => {
    process.env.ENCRYPTION_MASTER_KEY = MASTER;
    const rows = [
      nominalKey('key-ancienne', { createdAt: new Date('2026-01-01T00:00:00Z') }),
      nominalKey('key-recente', { createdAt: new Date('2026-03-01T00:00:00Z') }),
    ];
    const premiere = new ServerKeyVault(world(rows).prisma);
    const seconde = new ServerKeyVault(world([...rows].reverse()).prisma);

    await expect(premiere.conversationKeyId(CONV)).resolves.toBe('key-recente');
    await expect(seconde.conversationKeyId(CONV)).resolves.toBe('key-recente');
  });

  it('le DÉMARRAGE ne balaie plus la table — aucune lecture, bornée ou non', async () => {
    process.env.ENCRYPTION_MASTER_KEY = MASTER;
    const { prisma, calls } = world([nominalKey('key-nominale')]);
    const vault = new ServerKeyVault(prisma);

    await vault.initialize();

    expect(calls).toEqual([]);
  });

  it('une seconde demande est servie par la carte — un manque coûte UNE lecture, pas chacune', async () => {
    process.env.ENCRYPTION_MASTER_KEY = MASTER;
    const { prisma, calls } = world([nominalKey('key-nominale')]);
    const vault = new ServerKeyVault(prisma);

    await vault.conversationKeyId(CONV);
    await vault.conversationKeyId(CONV);

    expect(calls).toHaveLength(1);
  });

  /**
   * Les deux formes d'échec d'une lecture, et elles sont DISJOINTES : un client
   * injoignable REJETTE, un client qui n'expose pas la méthode jette
   * SYNCHRONEMENT — et une promesse jamais construite ne porte aucun `.catch`.
   * Le second n'est pas hypothétique : un double PARTIEL de la table des clés
   * l'a produit dès le premier passage de la suite complète.
   *
   * Les deux échouent OUVERT : la clé neuve est scellée, le message part. Fermer
   * refuserait un envoi que la production accepte aujourd'hui, et l'ouverture ne
   * coûte qu'une clé de plus — un chiffré s'ouvre par sa ligne, jamais par cette
   * carte.
   */
  it.each([
    ['une base qui REJETTE', () => Promise.reject(new Error('mongo down'))],
    ['un client qui JETTE synchronement', () => { throw new TypeError('findMany is not a function'); }],
  ])('échoue OUVERT sur %s — le message est scellé sous une clé neuve', async (_cas, findMany) => {
    process.env.ENCRYPTION_MASTER_KEY = MASTER;
    const { prisma, created } = world([nominalKey('key-invisible')]);
    (prisma as unknown as { serverEncryptionKey: { findMany: unknown } }).serverEncryptionKey.findMany = findMany;
    const service = new EncryptionService(prisma);
    await service.initialize();

    await expect(service.getOrCreateConversationKey(CONV)).resolves.toEqual(expect.any(String));
    expect(created).toHaveLength(1);

    await service.shutdown();
  });

  it('la carte est BORNÉE — réparer la lecture ne doit pas rendre la rétention proportionnelle au nombre de conversations', async () => {
    process.env.ENCRYPTION_MASTER_KEY = MASTER;
    const { prisma } = world([]);
    const vault = new ServerKeyVault(prisma);
    const carte = (vault as unknown as { conversationKeyMap: Map<string, string> }).conversationKeyMap;

    for (let i = 0; i < 2_600; i += 1) await vault.setConversationKey(`conv-${i}`, `key-${i}`);

    expect(carte.size).toBeLessThanOrEqual(2_000);
  });
});
