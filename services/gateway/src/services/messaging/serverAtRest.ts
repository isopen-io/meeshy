/**
 * **UN MESSAGE DES MODES `server` ET `hybrid` EST CHIFFRÉ AU REPOS** (décision
 * porteur du 2026-10-24, #11374, #11381) — l'unique énoncé de la règle, pour
 * l'écriture (`MessageProcessor.saveMessage`) et pour la lecture (liste de
 * messages, message seul, ligne de liste des conversations, réponse d'envoi et
 * `message:new`).
 *
 * Ce que ces deux modes promettent, et rien de plus : le texte est stocké
 * chiffré dans MongoDB (AES-256-GCM, clé de données par conversation, elle-même
 * enveloppée par la clé maîtresse `ENCRYPTION_MASTER_KEY` que seul
 * l'environnement de la passerelle porte). La passerelle le déchiffre à la
 * lecture : la traduction et les fonctions serveur restent disponibles, et les
 * clients reçoivent du clair, exactement comme pour un message non chiffré,
 * `encryptionMode` compris. Ce N'EST PAS du bout en bout : le serveur lit.
 *
 * Modèle de menace couvert : une copie de la base (sauvegarde fuitée, Mongo
 * exposé, disque volé) SANS l'environnement de la passerelle ne livre aucun
 * texte de ces conversations. Non couvert : un serveur compromis, qui détient
 * la clé maîtresse et lit tout ce qu'il relaie.
 *
 * Le chiffré est LIÉ à sa conversation (données authentifiées additionnelles,
 * `aad: 'conversation:v1'`) : recopier une ligne d'une conversation à l'autre
 * en base la rend illisible au lieu de la faire parler ailleurs. Les lignes
 * d'avant cette liaison (sans `aad`) se lisent encore.
 *
 * FAIL-CLOSED, dans les deux sens. Sans clé maîtresse (absente ou de mauvaise
 * longueur), la passerelle DÉMARRE — un déploiement ne casse jamais pour ça —
 * mais refuse d'écrire un message `server`/`hybrid`
 * (`SERVER_AT_REST_UNAVAILABLE`), au lieu de l'écrire en clair comme le faisait
 * le repli d'avant. Une ligne qu'aucune clé n'ouvre (clé erronée, clé de
 * données perdue, ligne d'avant la décision stockée vide) est servie SCELLÉE :
 * contenu vide, `isEncrypted: true`, ni chiffré ni métadonnées sur le fil —
 * les clients y disent déjà « Message chiffré ». Rien ne la récupère.
 */

import * as crypto from 'crypto';
import { enhancedLogger } from '../../utils/logger-enhanced';

const logger = enhancedLogger.child({ module: 'serverAtRest' });

export const SERVER_AT_REST_UNAVAILABLE = 'SERVER_AT_REST_UNAVAILABLE';

export const SERVER_AT_REST_UNAVAILABLE_MESSAGE =
  'Le chiffrement sur le serveur est indisponible : cette conversation n’accepte aucun message pour le moment';

export const SERVER_AT_REST_UNREADABLE = 'SERVER_AT_REST_UNREADABLE';

export type MasterKeyAbsence = 'missing' | 'invalid-length';

export type MasterKeyState =
  | { readonly available: true; readonly key: Buffer }
  | { readonly available: false; readonly reason: MasterKeyAbsence };

/** L'écriture (ou la création de clé) est refusée : la clé maîtresse manque. */
export class ServerAtRestUnavailableError extends Error {
  readonly code = SERVER_AT_REST_UNAVAILABLE;

  constructor(readonly reason: MasterKeyAbsence | 'unknown-mode' | 'key-unavailable' | 'key-unwrap-failed') {
    super(SERVER_AT_REST_UNAVAILABLE_MESSAGE);
    this.name = 'ServerAtRestUnavailableError';
  }
}

/** Le chiffré ne s'ouvre pas : clé erronée, clé de données absente, ligne altérée. */
export class ServerAtRestUnreadableError extends Error {
  readonly code = SERVER_AT_REST_UNREADABLE;

  constructor(readonly reason: 'master-key-unavailable' | 'data-key-unavailable' | 'authentication-failed' | 'malformed') {
    super(`Contenu chiffré au repos illisible (${reason})`);
    this.name = 'ServerAtRestUnreadableError';
  }
}

export const isServerAtRestUnavailable = (error: unknown): error is ServerAtRestUnavailableError =>
  error instanceof ServerAtRestUnavailableError;

export const SERVER_AT_REST_CIPHERTEXT_REFUSED = 'SERVER_AT_REST_CIPHERTEXT_REFUSED';

export const SERVER_AT_REST_CIPHERTEXT_REFUSAL_MESSAGE =
  'Le chiffrement sur le serveur est l’affaire de la passerelle : envoyez ce message en clair';

/**
 * Un chiffré au repos ne s'écrit que par la passerelle. Un client qui en
 * apporte un choisit son `keyId` : la lecture le ferait ouvrir sous la clé
 * d'une autre conversation (oracle). Refusé, avec un code stable.
 */
export class ServerAtRestCiphertextRefusedError extends Error {
  readonly code = SERVER_AT_REST_CIPHERTEXT_REFUSED;

  constructor() {
    super(SERVER_AT_REST_CIPHERTEXT_REFUSAL_MESSAGE);
    this.name = 'ServerAtRestCiphertextRefusedError';
  }
}

export const isServerAtRestCiphertextRefusal = (error: unknown): error is ServerAtRestCiphertextRefusedError =>
  error instanceof ServerAtRestCiphertextRefusedError;

const MASTER_KEY_BYTES = 32;

export function readMasterKey(encoded: string | undefined): MasterKeyState {
  if (encoded === undefined || encoded.trim() === '') return { available: false, reason: 'missing' };
  const key = Buffer.from(encoded.trim(), 'base64');
  return key.length === MASTER_KEY_BYTES ? { available: true, key } : { available: false, reason: 'invalid-length' };
}

const SERVER_AT_REST_MODES: ReadonlySet<string> = new Set(['server', 'hybrid']);

/** Le mode arrive avec la casse de son émetteur, comme `isEndToEndMode`. */
export const isServerAtRestMode = (mode: string | null | undefined): boolean =>
  typeof mode === 'string' && SERVER_AT_REST_MODES.has(mode.toLowerCase());

export const AT_REST_AAD_V1 = 'conversation:v1';

export const atRestAad = (conversationId: string): Buffer =>
  Buffer.from(`meeshy:at-rest:v1:${conversationId}`, 'utf8');

/**
 * #12822 — la liaison d'une charge de file hors ligne : sa conversation ET son
 * message. Distincte de `conversation:v1` : recopiée dans une ligne `Message`,
 * une charge de file ne s'ouvre pas comme un texte au repos.
 */
export const DELIVERY_QUEUE_AAD_V1 = 'delivery-queue:v1';

export const deliveryQueueAad = (conversationId: string, messageId: string): Buffer =>
  Buffer.from(`meeshy:delivery-queue:v1:${conversationId}:${messageId}`, 'utf8');

export type SealedBytes = { readonly ciphertext: Buffer; readonly authTag: Buffer };

const ALGORITHM = 'aes-256-gcm';
const AUTH_TAG_BYTES = 16;

export function sealBytes(params: {
  readonly key: Buffer;
  readonly iv: Buffer;
  readonly plaintext: Buffer;
  readonly aad?: Buffer;
}): SealedBytes {
  const cipher = crypto.createCipheriv(ALGORITHM, params.key, params.iv, { authTagLength: AUTH_TAG_BYTES });
  if (params.aad) cipher.setAAD(params.aad);
  const ciphertext = Buffer.concat([cipher.update(params.plaintext), cipher.final()]);
  return { ciphertext, authTag: cipher.getAuthTag() };
}

export function openBytes(params: {
  readonly key: Buffer;
  readonly iv: Buffer;
  readonly ciphertext: Buffer;
  readonly authTag: Buffer;
  readonly aad?: Buffer;
}): Buffer {
  const decipher = crypto.createDecipheriv(ALGORITHM, params.key, params.iv, { authTagLength: AUTH_TAG_BYTES });
  if (params.aad) decipher.setAAD(params.aad);
  decipher.setAuthTag(params.authTag);
  return Buffer.concat([decipher.update(params.ciphertext), decipher.final()]);
}

/** Un chiffré au repos tel qu'il se range en base : base64 partout. */
export type AtRestEnvelope = {
  readonly ciphertext: string;
  readonly keyId: string;
  readonly iv: string;
  readonly authTag: string;
  readonly aad?: string;
};

/** Ce que la lecture demande à la passerelle : ouvrir un chiffré de cette conversation. */
export type AtRestKeyring = {
  openAtRest(envelope: AtRestEnvelope, conversationId: string): Promise<string>;
};

/**
 * Un trousseau qui n'est construit qu'au premier chiffré à ouvrir : une page
 * sans message `server`/`hybrid` ne touche jamais au coffre de clés.
 */
export function lazyKeyring(factory: () => Promise<AtRestKeyring>): AtRestKeyring {
  const state: { pending: Promise<AtRestKeyring> | null } = { pending: null };
  return {
    openAtRest: async (envelope, conversationId) => {
      state.pending = state.pending ?? factory();
      return (await state.pending).openAtRest(envelope, conversationId);
    },
  };
}

/** Les champs qu'une ligne `Message` doit porter pour être lue au repos. */
export type AtRestReadableRow = {
  readonly id?: string;
  readonly conversationId?: string | null;
  readonly content?: string | null;
  readonly isEncrypted?: boolean | null;
  readonly encryptionMode?: string | null;
  readonly encryptedContent?: string | null;
  readonly encryptionMetadata?: unknown;
  readonly translations?: unknown;
};

/** Les colonnes qu'un `select` doit ajouter pour que `revealAtRest` puisse ouvrir la ligne. */
export const AT_REST_MESSAGE_SELECT = {
  conversationId: true,
  isEncrypted: true,
  encryptionMode: true,
  encryptedContent: true,
  encryptionMetadata: true,
} as const;

const textField = (record: Record<string, unknown>, key: string): string | undefined => {
  const value = record[key];
  return typeof value === 'string' && value.length > 0 ? value : undefined;
};

const asRecord = (value: unknown): Record<string, unknown> | null =>
  typeof value === 'object' && value !== null && !Array.isArray(value) ? (value as Record<string, unknown>) : null;

/**
 * #12822 — une ligne qui porte un TEXTE en clair n'est pas scellée, même avec
 * un chiffré à côté : avant le chiffrement au repos, l'édition réécrivait
 * `content` sans toucher `encryptedContent`. Ouvrir le chiffré y ressusciterait
 * le texte d'AVANT l'édition. Le texte stocké fait foi, sans migration.
 */
const carriesStoredText = (row: AtRestReadableRow): boolean =>
  typeof row.content === 'string' && row.content.length > 0;

export const isSealedAtRest = (row: AtRestReadableRow): boolean =>
  row.isEncrypted === true
  && isServerAtRestMode(row.encryptionMode)
  && typeof row.encryptedContent === 'string'
  && row.encryptedContent.length > 0
  && !carriesStoredText(row);

const carriesStaleCiphertext = (row: AtRestReadableRow): boolean =>
  carriesStoredText(row) && (row.isEncrypted === true || (typeof row.encryptedContent === 'string' && row.encryptedContent.length > 0));

function envelopeOf(row: AtRestReadableRow): AtRestEnvelope | null {
  const metadata = asRecord(row.encryptionMetadata);
  const ciphertext = row.encryptedContent;
  if (!metadata || typeof ciphertext !== 'string') return null;
  const keyId = textField(metadata, 'keyId');
  const iv = textField(metadata, 'iv');
  const authTag = textField(metadata, 'authTag');
  if (!keyId || !iv || !authTag) return null;
  const aad = textField(metadata, 'aad');
  return { ciphertext, keyId, iv, authTag, ...(aad ? { aad } : {}) };
}

/**
 * Les traductions d'un message au repos (`MessageTranslationService`, via
 * `EncryptionHelper`) : une entrée `isEncrypted` s'ouvre par SA clé, ou sort.
 */
async function revealTranslations(
  translations: unknown,
  conversationId: string,
  keyring: AtRestKeyring
): Promise<unknown> {
  const map = asRecord(translations);
  if (!map) return translations;
  const entries = await Promise.all(
    Object.entries(map).map(async ([language, raw]): Promise<readonly [string, unknown] | null> => {
      const entry = asRecord(raw);
      if (!entry || entry['isEncrypted'] !== true) return [language, raw];
      const ciphertext = textField(entry, 'text');
      const keyId = textField(entry, 'encryptionKeyId');
      const iv = textField(entry, 'encryptionIv');
      const authTag = textField(entry, 'encryptionAuthTag');
      if (!ciphertext || !keyId || !iv || !authTag) return null;
      try {
        const text = await keyring.openAtRest({ ciphertext, keyId, iv, authTag }, conversationId);
        const { encryptionKeyId: _k, encryptionIv: _i, encryptionAuthTag: _t, ...served } = entry;
        return [language, { ...served, text, isEncrypted: false }];
      } catch {
        return null;
      }
    })
  );
  return Object.fromEntries(entries.filter((entry): entry is readonly [string, unknown] => entry !== null));
}

/**
 * La ligne SERVIE : le clair à la place du chiffré, comme un message non
 * chiffré — `encryptionMode` reste, le chiffré et ses métadonnées ne quittent
 * jamais la passerelle.
 */
export function servedClearAtRest<T extends AtRestReadableRow>(row: T, plaintext: string, translations?: unknown) {
  return {
    ...row,
    content: plaintext,
    isEncrypted: false,
    encryptedContent: null,
    encryptionMetadata: null,
    ...(translations === undefined ? {} : { translations }),
  };
}

/** Une ligne scellée ne sert aucune traduction : c'est une PROJECTION, jamais une écriture. */
const SEALED_TRANSLATIONS = null;

function servedSealed<T extends AtRestReadableRow>(row: T) {
  return {
    ...row,
    content: '',
    isEncrypted: true,
    encryptedContent: null,
    encryptionMetadata: null,
    ...('translations' in row ? { translations: SEALED_TRANSLATIONS } : {}),
  };
}

/**
 * Ouvre une ligne `Message` lue en base. Une ligne qui n'est pas au repos
 * (aucun chiffrement, `e2ee`) ressort TELLE QUELLE : le bout en bout ne se
 * touche pas ici.
 */
export async function revealAtRest<T extends AtRestReadableRow>(row: T, keyring: AtRestKeyring): Promise<T> {
  if (!isServerAtRestMode(row.encryptionMode) || !row.conversationId) return row;
  const conversationId = row.conversationId;
  const translations = 'translations' in row
    ? await revealTranslations(row.translations, conversationId, keyring)
    : undefined;
  if (carriesStaleCiphertext(row)) return servedClearAtRest(row, String(row.content), translations);
  if (!isSealedAtRest(row)) return translations === undefined ? row : { ...row, translations };
  const envelope = envelopeOf(row);
  if (!envelope) return logUnreadable(row, new ServerAtRestUnreadableError('malformed'));
  try {
    return servedClearAtRest(row, await keyring.openAtRest(envelope, conversationId), translations);
  } catch (error) {
    return logUnreadable(row, error);
  }
}

function logUnreadable<T extends AtRestReadableRow>(row: T, error: unknown): T {
  logger.warn('message chiffré au repos servi scellé', {
    messageId: row.id,
    conversationId: row.conversationId,
    code: error instanceof ServerAtRestUnreadableError ? error.code : SERVER_AT_REST_UNREADABLE,
    reason: error instanceof ServerAtRestUnreadableError ? error.reason : 'unexpected',
  });
  return servedSealed(row);
}

type WithQuote = AtRestReadableRow & { readonly replyTo?: AtRestReadableRow | null };

/** Une ligne, et la citation qu'elle porte. */
export async function revealAtRestWithQuote<T extends WithQuote>(row: T, keyring: AtRestKeyring): Promise<T> {
  const served = await revealAtRest(row, keyring);
  if (!row.replyTo) return served;
  return { ...served, replyTo: await revealAtRest(row.replyTo, keyring) };
}

/** Une page de lignes, et la citation que chacune porte. */
export function revealAtRestRows<T extends WithQuote>(rows: readonly T[], keyring: AtRestKeyring): Promise<T[]> {
  return Promise.all(rows.map((row) => revealAtRestWithQuote(row, keyring)));
}

type CiphertextColumn = 'encryptedContent' | 'encryptionMetadata';

const withoutCiphertext = <T extends AtRestReadableRow>(row: T): Omit<T, CiphertextColumn> => {
  const { encryptedContent: _ciphertext, encryptionMetadata: _metadata, ...served } = row;
  return served;
};

/**
 * #12822 — une page servie par une surface qui ne sert PAS le chiffré (fil,
 * citation) et ne le lit que pour ouvrir le repos : ouverte, puis délestée de
 * `encryptedContent`/`encryptionMetadata` quel que soit le régime, citation
 * comprise. Lire ces colonnes n'élargit donc pas ce que la surface servait.
 */
export async function revealAtRestRowsForWire<T extends WithQuote>(rows: readonly T[], keyring: AtRestKeyring) {
  const opened = await revealAtRestRows(rows, keyring);
  return opened.map((row) => ({
    ...withoutCiphertext(row),
    ...(row.replyTo ? { replyTo: withoutCiphertext(row.replyTo) } : {}),
  }));
}
