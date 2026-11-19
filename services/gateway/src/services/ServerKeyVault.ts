import { PrismaClient, type Prisma } from '@meeshy/shared/prisma/client';
import * as crypto from 'crypto';
import { enhancedLogger } from '../utils/logger-enhanced';
import { readMasterKey, ServerAtRestUnavailableError, type MasterKeyState } from './messaging/serverAtRest';
import { unsetOrNull } from '../utils/prisma-unset';
import { isAddressableConversationId } from '../socketio/queuedEventContract';

const logger = enhancedLogger.child({ module: 'EncryptionService' });

let masterKeyAbsenceLogged = false;

type WrappedKeyRow = { readonly encryptedKey: string; readonly iv: string; readonly authTag: string };

/** Désenveloppe une clé de données ; `null` quand la clé maîtresse n'est pas la sienne. */
export function unwrapDataKey(masterKey: Buffer, row: WrappedKeyRow): Buffer | null {
  try {
    const decipher = crypto.createDecipheriv('aes-256-gcm', masterKey, Buffer.from(row.iv, 'base64'));
    decipher.setAuthTag(Buffer.from(row.authTag, 'base64'));
    return Buffer.concat([decipher.update(Buffer.from(row.encryptedKey, 'base64')), decipher.final()]);
  } catch {
    return null;
  }
}

/** Dit au démarrage, une fois, que les modes `server`/`hybrid` refuseront tout (#11381). */
function logMasterKeyAbsenceOnce(state: MasterKeyState): void {
  if ('key' in state || masterKeyAbsenceLogged) return;
  masterKeyAbsenceLogged = true;
  logger.error('ENCRYPTION_MASTER_KEY absente ou invalide : les conversations server/hybrid refusent écriture et lecture', {
    reason: state.reason,
  });
}

/** Ce que le coffre rend d'une clé : son octet ET la conversation à laquelle elle appartient. */
export type LoadedKey =
  | { readonly status: 'ok'; readonly key: Buffer; readonly owner: string | null }
  /** Aucune ligne `ServerEncryptionKey` sous cet id. */
  | { readonly status: 'missing' }
  /** La ligne existe mais la clé maîtresse présente ne la désenveloppe pas (ancienne clé maîtresse). */
  | { readonly status: 'unwrap-failed' }
  /** Clé maîtresse absente, ou base injoignable : rien n'est conclu sur la clé. */
  | { readonly status: 'unavailable' };

const MAX_DESIGNATION_CACHE = 2000;
const MAX_CONVERSATION_KEY_CACHE = 2000;

/**
 * La clé de conversation sous laquelle le coffre peut encore SCELLER.
 *
 * `expiresAt` dit l'absence À CÔTÉ (#19755). Sous MongoDB `{ expiresAt: null }`
 * — et sa jumelle `{ equals: null }` — est une ÉGALITÉ : elle n'apparie pas un
 * document dont la clé est ABSENTE, et **aucun des deux créateurs de clés
 * n'écrit la colonne** (`generateKey` ici, `AttachmentEncryptionService.generateKey`).
 * L'absence est donc l'état de l'immense majorité des clés, et le filtre nu
 * n'en retenait aucune : la carte `conversationId → keyId` partait vide à
 * chaque démarrage, et le chemin rapide de `getOrCreateConversationKey` forgeait
 * une clé neuve pour une conversation qui en avait déjà une.
 *
 * Et ce prédicat dit « AUCUNE échéance », pas « non expirée » — il écarte donc
 * aussi une clé dont l'échéance est à VENIR. C'est délibéré, et c'est l'écart
 * assumé avec le chemin de LECTURE jumeau (`AttachmentEncryptionService`), qui ne
 * refuse qu'une échéance PASSÉE : on peut ouvrir un chiffré avec une clé qui
 * expire bientôt, on ne doit pas en SCELLER un neuf dessous. Un chemin
 * d'écriture a le droit d'être plus strict que son chemin de lecture ; l'inverse
 * serait un défaut.
 *
 * `isActive` reste une ÉGALITÉ NUE, et la raison n'est plus une affirmation : la
 * colonne est **REQUISE** au schéma (`isActive Boolean @default(true)`, pas
 * `Boolean?`), à la différence d'`expiresAt` et de `conversationId`. La
 * distinction n'est pas une lecture du schéma mais une MESURE du compilateur :
 * `differsOrUnset('isActive', false)` ne compile pas —
 * `TS2322: Type '{ isSet: false }' is not assignable to type 'boolean | BoolFilter'` —
 * parce que Prisma n'expose `isSet` que sur les colonnes OPTIONNELLES, celles
 * qui peuvent manquer du document. Le piège que ce lot répare n'existe donc PAS
 * sur cette colonne-là, et c'est le compilateur qui le dit.
 *
 * (La version d'abord livrée justifiait la même égalité par « Prisma écrit son
 * `@default(true)` à chaque création » — vrai, mais AFFIRMÉ : aucune base ici, et
 * la fixture CUISAIT la colonne en la posant à la main, donc aucun témoin ne
 * pouvait la falsifier. L'audit adversarial du cycle 181 l'a relevé comme le
 * défaut du lot reproduit sur la colonne voisine. La correction n'était pas de
 * changer le prédicat mais de trouver la mesure qui le fonde.)
 *
 * Ce qu'elle achète est en revanche DORMANT, et il faut le dire : `isActive: false`
 * n'est écrit que par `AttachmentKeyVault.deleteKey` et `cleanupExpiredKeys`,
 * dont aucun appelant de production n'existe aujourd'hui (la purge, elle,
 * SUPPRIME les lignes). Le filtre garde un chemin qui dort ; il ne garde rien
 * qui s'écrive.
 *
 * Le type n'est pas décoratif : extraire un filtre dans une constante le met
 * hors de portée du cliquet qui garde cette règle
 * (`__tests__/soft-state-equality-filter-guard.test.ts`, qui cherche un cadre
 * `where`), et l'annotation `Prisma.…WhereInput` est précisément ce qui le lui
 * redéclare. Un lot qui répare une égalité nue en la DÉPLAÇANT sortirait sinon
 * du champ de sa propre garde.
 */
const WRITABLE_CONVERSATION_KEY: Prisma.ServerEncryptionKeyWhereInput = {
  purpose: 'conversation',
  isActive: true,
  ...unsetOrNull('expiresAt'),
};

/**
 * Server Key Vault - Manages encryption keys with database persistence
 *
 * Keys are persisted to MongoDB using the ServerEncryptionKey model.
 * Uses envelope encryption: data keys are encrypted with a master key before storage.
 * Includes in-memory LRU cache for performance.
 */
export class ServerKeyVault {
  private prisma: PrismaClient;
  private masterKeyState: MasterKeyState;
  private keyCache: Map<string, { key: Buffer; lastAccessed: number; owner: string | null }> = new Map();
  private conversationKeyMap: Map<string, string> = new Map();
  /** `Conversation.serverEncryptionKeyId`, relu au besoin : la clé que l'ACTIVATION a désignée. */
  private designationCache: Map<string, string> = new Map();
  private readonly CACHE_TTL_MS = 30 * 60 * 1000; // 30 minutes
  private readonly MAX_CACHE_SIZE = 500;

  constructor(prisma: PrismaClient) {
    this.prisma = prisma;
    this.masterKeyState = readMasterKey(process.env.ENCRYPTION_MASTER_KEY);
    logMasterKeyAbsenceOnce(this.masterKeyState);
  }

  get masterKeyAvailable(): boolean {
    return this.masterKeyState.available;
  }

  /**
   * #11381 — sans clé maîtresse, la passerelle démarre et REFUSE : plus de
   * clé éphémère de développement, dont les chiffrés mouraient au redémarrage.
   */
  private requireMasterKey(): Buffer {
    const state = this.masterKeyState;
    if ('key' in state) return state.key;
    throw new ServerAtRestUnavailableError(state.reason);
  }

  /**
   * Prépare le coffre. Il ne LIT rien : la carte `conversationId → keyId` est un
   * cache read-through et BORNÉ (`conversationKeyId`), pas un index à charger.
   *
   * #19755 — ce démarrage balayait la table des clés de conversation pour les
   * tenir TOUTES dans une `Map` sans borne ni éviction. Le filtre était faux
   * (voir `WRITABLE_CONVERSATION_KEY`), donc le balayage ne chargeait rien et la
   * rétention ne s'est jamais vue ; le réparer en place l'aurait rendue
   * proportionnelle au nombre de conversations, et aurait fait du premier
   * chiffrement un plein scan. Un cache dont le manque se remplit en UNE lecture
   * n'a pas besoin d'être chargé d'avance.
   */
  async initialize(): Promise<void> {
    logger.info('ServerKeyVault ready', { cacheSize: this.keyCache.size });
  }

  /**
   * La clé sous laquelle cette conversation SCELLE, relue en base au premier
   * besoin ; `undefined` quand elle n'en a aucune encore.
   *
   * La carte n'est pas une autorité de lecture — un chiffré voyage avec son
   * `keyId` et s'ouvre par sa ligne (`loadKey`, `getKeyFor`) : elle évite de
   * forger une clé de plus là où la base en porte déjà une.
   *
   * L'ordre est un ordre TOTAL — `createdAt` décroissant, puis `id`, qui est un
   * UUID donc unique. `createdAt` seul n'aurait pas de départage, et l'égalité y
   * est le cas RÉALISTE : il n'existe aucun verrou inter-instances
   * (`keyGenerationLocks` est par processus), donc deux instances qui forgent la
   * première clé d'une conversation le font dans la même milliseconde. Ce que
   * l'ordre garantit est que deux instances élisent la MÊME clé sur un défaut de
   * cache ; il ne les rapproche pas une fois chacune servie par sa carte, qu'aucun
   * chemin n'invalide — deux processus peuvent sceller sous deux clés différentes,
   * ce qui ne perd rien (les deux lignes portent leur `conversationId`) mais n'est
   * pas de la cohérence.
   */
  async conversationKeyId(conversationId: string): Promise<string | undefined> {
    const cached = this.conversationKeyMap.get(conversationId);
    if (cached) return cached;

    const keyId = await this.readConversationKeyId(conversationId);
    if (keyId) this.rememberConversationKey(conversationId, keyId);
    return keyId;
  }

  /**
   * La lecture elle-même, fail-OUVERT : une base injoignable rend `undefined`,
   * donc l'appelant forge une clé neuve — exactement ce que faisait le chemin
   * d'avant, dont la carte était vide à CHAQUE fois.
   *
   * Fermer ici REFUSERAIT un message que la production accepte aujourd'hui
   * (`SERVER_AT_REST_UNAVAILABLE`), et le coût de l'ouverture est borné à une
   * clé de plus : un chiffré voyage avec son `keyId` et s'ouvre par sa ligne
   * (`loadKey`, `getKeyFor`), donc rien ne devient illisible. C'est l'arbitrage
   * du cycle 127 — fail-CLOSED sur une preuve, fail-OUVERT sur une absence de
   * preuve, ici une LIVRAISON et non un secret.
   *
   * `try`/`catch` et non `.catch` : un client qui n'expose pas la méthode jette
   * SYNCHRONEMENT, et une promesse jamais construite ne porte pas de `.catch`.
   * Les deux gardes sont disjointes, et c'est la décision ci-dessus qui exige
   * de couvrir les deux formes d'échec.
   */
  private async readConversationKeyId(conversationId: string): Promise<string | undefined> {
    // La garde de FORME va AVANT l'appel : `ServerEncryptionKey.conversationId`
    // est un `@db.ObjectId`, et un id qui n'en a pas la forme fait rendre au
    // moteur `Malformed ObjectID` — que le `catch` ci-dessous traduirait en « pas
    // de clé », donc en une clé forgée à CHAQUE appel, sans autre trace qu'un
    // `warn` indistinct. Un `catch` fail-ouvert ne peut pas réparer ce qu'il ne
    // peut pas ATTRIBUER (cf. `isAddressableConversationId`, #19690 / cycle 112) :
    // les deux refus ne s'arbitrent pas pareil, donc ils se journalisent à part.
    if (!isAddressableConversationId(conversationId)) {
      logger.warn('clé de conversation non cherchée : cet identifiant n’a pas la forme d’un ObjectId', {
        conversationId, reason: 'unaddressable-conversation-id',
      });
      return undefined;
    }

    try {
      const rows = await this.prisma.serverEncryptionKey.findMany({
        where: { conversationId, ...WRITABLE_CONVERSATION_KEY },
        select: { id: true },
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        take: 1,
      });
      return rows[0]?.id;
    } catch (error) {
      logger.warn('lecture de la clé de conversation impossible pour le moment : une clé neuve sera scellée', {
        conversationId, error: error instanceof Error ? error.message : 'unknown',
      });
      return undefined;
    }
  }

  /**
   * Generate a new encryption key and persist to database
   */
  async generateKey(conversationId?: string, purpose: string = 'message'): Promise<{ keyId: string; key: Buffer }> {
    const masterKey = this.requireMasterKey();
    const keyId = crypto.randomUUID();
    const key = crypto.randomBytes(32); // AES-256

    logger.debug('Generating new encryption key', { keyId, purpose, conversationId });

    // Encrypt the key with master key before storage (envelope encryption)
    const iv = crypto.randomBytes(12);
    const cipher = crypto.createCipheriv('aes-256-gcm', masterKey, iv);
    const encryptedKey = Buffer.concat([cipher.update(key), cipher.final()]);
    const authTag = cipher.getAuthTag();

    try {
      // Persist to database
      await this.prisma.serverEncryptionKey.create({
        data: {
          id: keyId,
          encryptedKey: encryptedKey.toString('base64'),
          iv: iv.toString('base64'),
          authTag: authTag.toString('base64'),
          algorithm: 'aes-256-gcm',
          purpose,
          conversationId: conversationId || null,
          createdAt: new Date(),
        },
      });

      // Cache the key in memory
      this.cacheKey(keyId, key, conversationId ?? null);

      logger.debug('Encryption key generated and persisted', { keyId, purpose });
      return { keyId, key };
    } catch (error) {
      logger.error('Failed to persist encryption key', error, { keyId });
      throw error;
    }
  }

  /**
   * Get a key by ID (from cache or database)
   */
  async getKey(keyId: string): Promise<Buffer | undefined> {
    const loaded = await this.loadKey(keyId);
    return loaded.status === 'ok' ? loaded.key : undefined;
  }

  /**
   * #11381 — la clé, SEULEMENT si elle appartient à cette conversation : sa
   * ligne la rattache à elle, ou la conversation la désigne
   * (`serverEncryptionKeyId`, posé par l'activation). Sans ce contrôle, une
   * enveloppe dont l'expéditeur choisit le `keyId` ferait déchiffrer à la
   * passerelle le chiffré d'une AUTRE conversation.
   */
  async getKeyFor(keyId: string, conversationId: string): Promise<Buffer | undefined> {
    const loaded = await this.loadKey(keyId);
    if (loaded.status !== 'ok') return undefined;
    if (loaded.owner === conversationId) return loaded.key;
    if ((await this.designatedKeyId(conversationId)) === keyId) {
      if (loaded.owner === null) await this.claimDesignatedKey(conversationId, keyId);
      return loaded.key;
    }
    logger.warn('clé de chiffrement au repos refusée : elle n’appartient pas à cette conversation', { keyId, conversationId });
    return undefined;
  }

  /** Ce que le coffre sait d'une clé, sans rien conclure d'une panne. */
  async loadKey(keyId: string): Promise<LoadedKey> {
    const cached = this.keyCache.get(keyId);
    if (cached) {
      cached.lastAccessed = Date.now();
      logger.trace('Key retrieved from cache', { keyId });
      return { status: 'ok', key: cached.key, owner: cached.owner };
    }

    if (!this.masterKeyState.available) return { status: 'unavailable' };
    const masterKey = this.masterKeyState.key;

    logger.debug('Loading key from database', { keyId });
    const keyRecord = await this.prisma.serverEncryptionKey.findUnique({ where: { id: keyId } }).catch((error: unknown) => {
      logger.error('Failed to load key from database', error, { keyId });
      return undefined;
    });
    if (keyRecord === undefined) return { status: 'unavailable' };
    if (keyRecord === null) {
      logger.warn('Key not found in database', { keyId });
      return { status: 'missing' };
    }

    const key = unwrapDataKey(masterKey, keyRecord);
    if (!key) {
      logger.warn('Data key does not unwrap under the current master key', { keyId });
      return { status: 'unwrap-failed' };
    }

    const owner = keyRecord.conversationId ?? null;
    this.cacheKey(keyId, key, owner);

    this.prisma.serverEncryptionKey.update({
      where: { id: keyId },
      data: { lastAccessedAt: new Date() },
    }).catch((err: Error) => {
      logger.warn('Failed to update key lastAccessedAt', { keyId, error: err.message });
    });

    logger.debug('Key loaded from database', { keyId });
    return { status: 'ok', key, owner };
  }

  /** La clé que la conversation désigne (`Conversation.serverEncryptionKeyId`), relue en base au premier besoin. */
  async designatedKeyId(conversationId: string): Promise<string | null> {
    const cached = this.designationCache.get(conversationId);
    if (cached) return cached;
    const conversation = await this.prisma.conversation.findUnique({
      where: { id: conversationId },
      select: { serverEncryptionKeyId: true },
    }).catch(() => null);
    const keyId = conversation?.serverEncryptionKeyId ?? null;
    if (keyId) this.rememberDesignation(conversationId, keyId);
    return keyId;
  }

  /**
   * Remplace la clé que la conversation désigne, en compare-et-échange : une
   * autre instance qui a déjà remplacé gagne, et sa clé est rendue.
   */
  async redesignate(conversationId: string, previousKeyId: string, nextKeyId: string): Promise<string> {
    const swapped = await this.prisma.conversation.updateMany({
      where: { id: conversationId, serverEncryptionKeyId: previousKeyId },
      data: { serverEncryptionKeyId: nextKeyId },
    });
    this.designationCache.delete(conversationId);
    const designated = swapped.count > 0 ? nextKeyId : await this.designatedKeyId(conversationId);
    if (designated) this.rememberDesignation(conversationId, designated);
    return designated ?? nextKeyId;
  }

  /**
   * #19755 — la carte des clés de conversation est BORNÉE, comme celle des
   * désignations : c'est un cache dont le manque coûte une lecture, et une
   * passerelle qui sert 100 000 conversations n'a pas à les tenir toutes.
   */
  private rememberConversationKey(conversationId: string, keyId: string): void {
    if (this.conversationKeyMap.size >= MAX_CONVERSATION_KEY_CACHE && !this.conversationKeyMap.has(conversationId)) {
      const oldest = this.conversationKeyMap.keys().next().value;
      if (oldest !== undefined) this.conversationKeyMap.delete(oldest);
    }
    this.conversationKeyMap.set(conversationId, keyId);
  }

  private rememberDesignation(conversationId: string, keyId: string): void {
    if (this.designationCache.size >= MAX_DESIGNATION_CACHE) {
      const oldest = this.designationCache.keys().next().value;
      if (oldest !== undefined) this.designationCache.delete(oldest);
    }
    this.designationCache.set(conversationId, keyId);
  }

  /**
   * #12822 (M1) — rattache à sa conversation une clé qu'elle DÉSIGNE et qui
   * n'a pas de propriétaire : l'activation d'avant #11381 créait sa clé sans
   * conversation (`conversationId: null`). Tant qu'elle n'est que désignée,
   * une re-désignation (réactivation, bascule) la rendrait muette, et avec
   * elle tous les messages scellés dessous. Rattachée, elle s'ouvre par sa
   * ligne, quelle que soit la désignation.
   *
   * Compare-et-échange sur l'absence de propriétaire : une clé déjà rattachée
   * à une AUTRE conversation n'est jamais reprise. Un échec n'empêche ni
   * l'écriture ni la lecture en cours (la désignation suffit encore) : il est
   * journalisé, et le prochain usage réessaie.
   */
  async claimDesignatedKey(conversationId: string, keyId: string): Promise<void> {
    try {
      const { count } = await this.prisma.serverEncryptionKey.updateMany({
        where: { id: keyId, OR: [{ conversationId: null }, { conversationId: { isSet: false } }] },
        data: { conversationId, purpose: 'conversation' },
      });
      if (count === 0) return;
      this.rememberConversationKey(conversationId, keyId);
      const cached = this.keyCache.get(keyId);
      if (cached) cached.owner = conversationId;
      logger.info('clé de conversation d’avant le chiffrement au repos rattachée à sa conversation', { conversationId, keyId });
    } catch (error) {
      logger.warn('rattachement de la clé désignée impossible pour le moment', {
        conversationId, keyId, error: error instanceof Error ? error.message : 'unknown',
      });
    }
  }

  /**
   * Set conversation to key mapping
   */
  async setConversationKey(conversationId: string, keyId: string): Promise<void> {
    this.rememberConversationKey(conversationId, keyId);
    const cached = this.keyCache.get(keyId);
    if (cached) cached.owner = conversationId;

    // Update database record with conversation association
    try {
      await this.prisma.serverEncryptionKey.update({
        where: { id: keyId },
        data: {
          conversationId,
          purpose: 'conversation',
        },
      });
      logger.debug('Conversation key mapping saved', { conversationId, keyId });
    } catch (error) {
      logger.warn('Failed to update conversation key mapping in database', { conversationId, keyId });
    }
  }

  /**
   * Get the key ID for a conversation
   */
  getConversationKeyId(conversationId: string): string | undefined {
    return this.conversationKeyMap.get(conversationId);
  }

  /**
   * Cache a key in memory with LRU eviction
   */
  private cacheKey(keyId: string, key: Buffer, owner: string | null): void {
    // Evict oldest entries if cache is full
    if (this.keyCache.size >= this.MAX_CACHE_SIZE) {
      this.evictOldestCacheEntries();
    }

    this.keyCache.set(keyId, { key, lastAccessed: Date.now(), owner });
  }

  /**
   * Evict oldest 10% of cache entries
   */
  private evictOldestCacheEntries(): void {
    const entries = Array.from(this.keyCache.entries());
    entries.sort((a, b) => a[1].lastAccessed - b[1].lastAccessed);

    const toEvict = Math.ceil(entries.length * 0.1);
    for (let i = 0; i < toEvict; i++) {
      this.keyCache.delete(entries[i][0]);
    }

    logger.debug('Evicted cache entries', { evicted: toEvict, remaining: this.keyCache.size });
  }

  /**
   * Clean up expired cache entries
   */
  cleanupCache(): void {
    const now = Date.now();
    let evicted = 0;

    for (const [keyId, entry] of this.keyCache.entries()) {
      if (now - entry.lastAccessed > this.CACHE_TTL_MS) {
        this.keyCache.delete(keyId);
        evicted++;
      }
    }

    if (evicted > 0) {
      logger.debug('Cleaned up expired cache entries', { evicted, remaining: this.keyCache.size });
    }
  }

  /**
   * Securely clear all keys from memory
   *
   * SECURITY: Zeroizes all cached keys and clears mappings
   * Should be called during graceful server shutdown
   */
  clearAllKeys(): void {
    logger.info('Clearing all encryption keys from memory');

    // Zeroize all cached keys
    for (const entry of this.keyCache.values()) {
      if (entry.key) {
        entry.key.fill(0); // Zeroize key data
      }
    }

    // Clear caches and mappings
    this.keyCache.clear();
    this.conversationKeyMap.clear();
    this.designationCache.clear();

    // Zeroize master key
    if (this.masterKeyState.available) {
      this.masterKeyState.key.fill(0);
    }

    logger.info('All encryption keys cleared from memory');
  }
}
