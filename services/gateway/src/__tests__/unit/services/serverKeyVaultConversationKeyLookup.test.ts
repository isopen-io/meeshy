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
import type { Prisma } from '@meeshy/shared/prisma/client';
import { differsOrUnset, unsetOrNull } from '../../../utils/prisma-unset';

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

/**
 * Le piège de ce lot — « `{ champ: null }` ne retient pas un document dont la clé
 * est ABSENTE » — n'existe que sur une colonne OPTIONNELLE. Les deux colonnes du
 * filtre ne sont donc pas de la même espèce, et la différence se MESURE au
 * compilateur plutôt que se lire au schéma.
 *
 * L'audit adversarial du cycle 181 avait raison de refuser l'affirmation « Prisma
 * écrit son `@default(true)` » : elle n'était pas mesurée, et la fixture la
 * cuisait. Voici la mesure. Le jour où `isActive` passerait `Boolean?`,
 * `@ts-expect-error` cesse d'avoir une erreur à attendre et CE témoin tombe — ce
 * qui est exactement le moment où l'égalité nue deviendrait un défaut.
 */
describe('les deux colonnes du filtre ne sont pas de la même espèce, et le compilateur le dit', () => {
  it('`expiresAt` est OPTIONNELLE : le prédicat d’absence compile, donc le piège existe sur elle', () => {
    const predicat: Prisma.ServerEncryptionKeyWhereInput = unsetOrNull('expiresAt');

    expect(predicat).toEqual({ OR: [{ expiresAt: null }, { expiresAt: { isSet: false } }] });
  });

  it('`isActive` est REQUISE : Prisma n’expose aucun `isSet` dessus, donc elle ne peut pas manquer', () => {
    // @ts-expect-error `{ isSet: false }` n'est pas assignable à `boolean | BoolFilter` :
    // la colonne est REQUISE au schéma, donc jamais absente du document.
    const impossible: Prisma.ServerEncryptionKeyWhereInput = differsOrUnset('isActive', false);

    expect(impossible).toBeDefined();
  });
});

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

  /**
   * Constat E de l'audit : la garde de FORME va AVANT l'appel. Un identifiant qui
   * n'a pas la forme d'un ObjectId fait rendre au moteur `Malformed ObjectID`, que
   * le `catch` fail-ouvert traduirait en « pas de clé » — donc une clé forgée à
   * CHAQUE appel, avec pour seule trace un `warn` indistinct d'une panne de base.
   * Un `catch` ne peut pas réparer ce qu'il ne peut pas ATTRIBUER : la base n'a
   * pas répondu, ou nous ne lui avons jamais posé de question valide.
   */
  it('ne POSE PAS la question quand l’identifiant n’a pas la forme d’un ObjectId', async () => {
    process.env.ENCRYPTION_MASTER_KEY = MASTER;
    const { prisma, calls } = world([nominalKey('key-nominale')]);
    const vault = new ServerKeyVault(prisma);

    await expect(vault.conversationKeyId('ma-conversation-lisible')).resolves.toBeUndefined();
    expect(calls).toEqual([]);
  });

  /**
   * Constat G : `createdAt` seul n'a pas de départage, et l'égalité est le cas
   * RÉALISTE — il n'existe aucun verrou inter-instances, donc deux instances qui
   * forgent la première clé d'une conversation le font dans la même milliseconde.
   * L'ordre total (`createdAt`, puis `id`) est ce qui les fait élire la même.
   */
  it('départage DEUX clés du même instant — sans quoi « deux instances s’accordent » est faux là où ça compte', async () => {
    process.env.ENCRYPTION_MASTER_KEY = MASTER;
    const instant = new Date('2026-03-01T00:00:00Z');
    const rows = [nominalKey('key-aaa', { createdAt: instant }), nominalKey('key-zzz', { createdAt: instant })];
    const premiere = new ServerKeyVault(world(rows).prisma);
    const seconde = new ServerKeyVault(world([...rows].reverse()).prisma);

    await expect(premiere.conversationKeyId(CONV)).resolves.toBe('key-zzz');
    await expect(seconde.conversationKeyId(CONV)).resolves.toBe('key-zzz');
  });

  /**
   * Constat H : le prédicat dit « AUCUNE échéance », pas « non expirée ». Le
   * témoin d'origine portait une échéance PASSÉE, donc il n'attestait rien de
   * l'intention — qui est délibérément plus stricte que le chemin de LECTURE
   * jumeau : on peut OUVRIR un chiffré sous une clé qui expire bientôt, on ne
   * doit pas en SCELLER un neuf dessous.
   */
  it('refuse aussi une clé dont l’échéance est à VENIR — un chemin d’écriture a le droit d’être plus strict', async () => {
    process.env.ENCRYPTION_MASTER_KEY = MASTER;
    const demain = new Date(Date.now() + 86_400_000);
    const { prisma, created } = world([nominalKey('key-bientot-expiree', { expiresAt: demain })]);
    const service = new EncryptionService(prisma);
    await service.initialize();

    await expect(service.getOrCreateConversationKey(CONV)).resolves.not.toBe('key-bientot-expiree');
    expect(created).toHaveLength(1);

    await service.shutdown();
  });

  /**
   * Constat K1 : le lot déplace un `await` DEVANT le verrou de génération. La
   * TOCTOU n'est pas rouverte — le check-and-set qui suit reste SYNCHRONE — mais
   * rien ne l'attestait, et le symptôme d'une inversion serait une prolifération
   * silencieuse, c'est-à-dire le défaut même que ce lot répare.
   */
  it('dix appels CONCURRENTS sur une base vide ne forgent qu’UNE clé — le verrou survit à l’`await` posé devant lui', async () => {
    process.env.ENCRYPTION_MASTER_KEY = MASTER;
    const { prisma, created } = world([]);
    const lent = prisma.serverEncryptionKey.findMany;
    (prisma as unknown as { serverEncryptionKey: { findMany: unknown } }).serverEncryptionKey.findMany =
      async (args: never) => { for (let tick = 0; tick < 3; tick += 1) await Promise.resolve(); return lent(args); };
    const service = new EncryptionService(prisma);
    await service.initialize();

    const ids = await Promise.all(Array.from({ length: 10 }, () => service.getOrCreateConversationKey(CONV)));

    expect(new Set(ids).size).toBe(1);
    expect(created).toHaveLength(1);

    await service.shutdown();
  });

  /**
   * Constat K2 : la surface vivante de cette lecture est « une conversation dont
   * la DÉSIGNATION est nulle ». Quand la conversation en désigne une, les trois
   * chemins d'écriture passent `preferredKeyId` et la carte n'est jamais
   * consultée — c'est ce qui borne l'effet du lot, et aucun témoin ne le disait.
   */
  it('une conversation qui DÉSIGNE une clé scelle sous SA désignation, sans consulter la carte', async () => {
    process.env.ENCRYPTION_MASTER_KEY = MASTER;
    const { prisma, calls } = world([]);
    const service = new EncryptionService(prisma);
    await service.initialize();

    // Une clé RÉELLE — enveloppée sous la clé maîtresse, donc qui s'ouvre. Une
    // ligne de fixture aux octets inventés ferait refuser l'envoi
    // (`unwrap-failed`, fail-closed), ce qui est le bon comportement et pas ce
    // que ce témoin interroge.
    const designee = await service.getOrCreateConversationKey(CONV);
    const lecturesAvantLeScellement = calls.length;

    const sealed = await service.sealAtRest({ plaintext: 'bonjour', conversationId: CONV, preferredKeyId: designee });

    expect(sealed.metadata.keyId).toBe(designee);
    expect(calls).toHaveLength(lecturesAvantLeScellement);

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
