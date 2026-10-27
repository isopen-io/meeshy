/**
 * #13100 — LES FICHIERS D'UNE PIÈCE JOINTE `server` / `hybrid` SONT SCELLÉS AU
 * REPOS. Ce module tient les trois gestes qui touchent un fichier scellé :
 * le SCELLER (`sealStoredFile`), savoir s'il l'EST (`AtRestFileAccess.lookup`),
 * et l'OUVRIR pour qui a le droit de le lire (`openSealedStoredBytes`,
 * `readStoredFileBytes`).
 *
 * La source de vérité est la ligne `AttachmentFileAtRest` de la CLÉ DE
 * STOCKAGE, écrite par la passerelle seule. Ni un nom de fichier ni un
 * en-tête ne se croient : un client qui dépose un fichier commençant comme un
 * fichier scellé ne fait rien ouvrir, et le chiffré d'une conversation recopié
 * ailleurs ne s'ouvre que sous SA liaison (conversation, pièce, rôle, clé).
 *
 * Modèle de menace couvert : une copie du volume des dépôts, du seau S3 ou de
 * la base, SANS l'environnement de la passerelle (`ENCRYPTION_MASTER_KEY`), ne
 * livre aucun octet d'une pièce scellée. Non couvert : un serveur compromis,
 * qui détient la clé maîtresse et lit ce qu'il relaie (ce n'est pas du bout en
 * bout), et le clair d'un envoi PAS ENCORE rattaché à un message (le fichier
 * déposé ne connaît pas sa conversation avant l'envoi).
 */
import { createReadStream, promises as fs } from 'fs';
import { open as openFile } from 'fs/promises';
import path from 'path';
import { Readable } from 'stream';
import { createHash, hkdfSync, randomBytes } from 'crypto';
import type { PrismaClient } from '@meeshy/shared/prisma/client';
import {
  DEFAULT_CIPHERTEXT_SEGMENT_SIZE,
  SEALED_FILE_FORMAT,
  ciphertextSizeFor,
  openSealedRange,
  sealSegments,
} from './sealedFileFormat';

/** Ce qu'un fichier scellé EST, et à qui : ses données associées. */
export type SealedFileBinding = {
  readonly conversationId: string;
  readonly attachmentId: string;
  readonly role: string;
  readonly storageKey: string;
};

export const SEALED_FILE_DOMAIN = 'meeshy:attachment-file:v1';

/** Un tableau JSON : aucun séparateur ne peut se confondre avec un champ. */
/**
 * La clé de données d'une conversation chiffre aussi ses TEXTES (AES-GCM,
 * `EncryptionService`). Les fichiers n'en prennent jamais la valeur telle
 * quelle : ils la dérivent sous leur propre étiquette (HKDF-SHA256, RFC 5869,
 * sel vide), puis Tink Streaming dérive encore une clé par fichier.
 */
export const FILE_KEY_INFO = 'meeshy:at-rest-file-key:v1';
export const fileMainKeyOf = (dataKey: Buffer): Buffer =>
  Buffer.from(hkdfSync('sha256', dataKey, Buffer.alloc(0), FILE_KEY_INFO, 32));

export const associatedDataOf = (binding: SealedFileBinding): Buffer =>
  Buffer.from(JSON.stringify([SEALED_FILE_DOMAIN, binding.conversationId, binding.attachmentId, binding.role, binding.storageKey]), 'utf8');

export type AtRestFileRecord = SealedFileBinding & {
  readonly keyId: string;
  readonly plaintextSize: number;
  readonly format: string;
  readonly segmentSize: number;
  /** La clé claire que ce fichier remplace ; `null` pour un scellement en place. */
  readonly replacedKey: string | null;
};

/** La part du coffre de clés qu'un fichier demande (`EncryptionService`). */
export type AtRestFileKeyring = {
  fileSealingKey(conversationId: string): Promise<{ readonly keyId: string; readonly key: Buffer }>;
  fileOpeningKey(keyId: string, conversationId: string): Promise<Buffer>;
};

export type AtRestFileStore = {
  find(storageKey: string): Promise<AtRestFileRecord | null>;
  /** Le fichier scellé qui a remplacé cette clé claire — de ce rôle seulement, s'il est donné. */
  byReplacedKey?(replacedKey: string, role?: string): Promise<AtRestFileRecord | null>;
  save(record: AtRestFileRecord): Promise<void>;
  remove(storageKey: string): Promise<void>;
  /** Les fichiers scellés d'une pièce. */
  ofAttachment(attachmentId: string): Promise<readonly AtRestFileRecord[]>;
  /** Les pièces dont un fichier a remplacé une clé claire depuis `since` (balayage). */
  /** Les pièces dont un clair remplacé attend encore son effacement, de la plus ancienne à la plus récente. */
  replacingSince(since: Date): Promise<readonly string[]>;
  /** L'effacement des clairs remplacés de cette pièce est terminé. */
  markReplacedErased?(attachmentId: string): Promise<void>;
};

/** Le verrou d'un fichier d'origine (`sealLock.ts`) : `busy` quand un autre le tient. */
export type FileSealLock = (filePath: string) => Promise<{ readonly release: () => Promise<void> } | 'busy'>;

export type AtRestFileAccess = {
  readonly store: AtRestFileStore;
  readonly keyring: AtRestFileKeyring;
  /** Le verrou partagé des scellements (Redis) ; absent : un seul processus scelle. */
  readonly lock?: FileSealLock;
};

/**
 * #13100 — l'interrupteur du scellement : `AT_REST_FILE_SEALING=off` arrête
 * tout NOUVEAU scellement (envoi, rendu, piste, balayage) ; les fichiers déjà
 * scellés se lisent toujours. C'est la première étape d'un retour arrière : la
 * migration inverse refuse de s'appliquer tant qu'il est allumé.
 */
export const atRestFileSealingEnabled = (env: Readonly<Record<string, string | undefined>> = process.env): boolean =>
  (env.AT_REST_FILE_SEALING ?? '').trim().toLowerCase() !== 'off';

/**
 * Les SEULES clés qui se scellent, et les seules que la lecture interroge : la
 * forme datée des dépôts (`AAAA/MM/<auteur>/<nom>`) et les pistes traduites.
 * Une clé hors de cette forme reste en clair des deux côtés.
 */
export const SEALABLE_STORAGE_KEY = /^(?:\d{4}\/\d{2}\/[^/]+\/[^/]+|translated\/[^/]+)$/;
export const isSealableStorageKey = (key: string): boolean => SEALABLE_STORAGE_KEY.test(key);

export class AtRestFileUnreadableError extends Error {
  constructor(readonly reason: 'unknown-format' | 'no-access') {
    super(`Fichier scellé au repos illisible (${reason})`);
    this.name = 'AtRestFileUnreadableError';
  }
}

type AtRestFileRow = {
  readonly storageKey: string;
  readonly conversationId: string;
  readonly attachmentId: string;
  readonly keyId: string;
  readonly role: string;
  readonly plaintextSize: number;
  readonly format: string;
  readonly segmentSize: number;
  readonly replacedKey: string | null;
};

const RECORD_SELECT = {
  storageKey: true, conversationId: true, attachmentId: true, keyId: true, role: true,
  plaintextSize: true, format: true, segmentSize: true, replacedKey: true,
} as const;

/** Le magasin des scellements, par Prisma. */
export function prismaAtRestFileStore(prisma: Pick<PrismaClient, 'attachmentFileAtRest'>): AtRestFileStore {
  return {
    find: async (storageKey) => {
      const row: AtRestFileRow | null = await prisma.attachmentFileAtRest.findUnique({ where: { storageKey }, select: RECORD_SELECT });
      return row ? { ...row, replacedKey: row.replacedKey ?? null } : null;
    },
    ofAttachment: async (attachmentId) => {
      const rows: readonly AtRestFileRow[] = await prisma.attachmentFileAtRest.findMany({ where: { attachmentId }, select: RECORD_SELECT });
      return rows.map((row) => ({ ...row, replacedKey: row.replacedKey ?? null }));
    },
    byReplacedKey: async (replacedKey, role) => {
      const row: AtRestFileRow | null = await prisma.attachmentFileAtRest.findFirst({ where: { replacedKey, ...(role ? { role } : {}) }, select: RECORD_SELECT });
      return row ? { ...row, replacedKey: row.replacedKey ?? null } : null;
    },
    replacingSince: async (since) => {
      const rows = await prisma.attachmentFileAtRest.findMany({
        where: {
          createdAt: { gte: since },
          role: 'original',
          replacedKey: { not: null },
          OR: [{ replacedErasedAt: null }, { replacedErasedAt: { isSet: false } }],
        },
        orderBy: { createdAt: 'asc' },
        select: { attachmentId: true },
      });
      return [...new Set(rows.map((row) => row.attachmentId))];
    },
    markReplacedErased: async (attachmentId) => {
      await prisma.attachmentFileAtRest.updateMany({ where: { attachmentId, replacedKey: { not: null } }, data: { replacedErasedAt: new Date() } });
    },
    save: async (record) => {
      // Un rescellement qui remplace un clair rouvre son effacement en attente.
      const update = record.replacedKey !== null ? { ...record, replacedErasedAt: null } : record;
      await prisma.attachmentFileAtRest.upsert({ where: { storageKey: record.storageKey }, create: record, update });
    },
    remove: async (storageKey) => {
      await prisma.attachmentFileAtRest.deleteMany({ where: { storageKey } });
    },
  };
}

const state: { access: AtRestFileAccess | null } = { access: null };

/** Posé au démarrage de la passerelle : sans lui, aucun fichier scellé ne s'ouvre. */
export function configureAtRestFileAccess(access: AtRestFileAccess | null): void {
  state.access = access;
}

export function processAtRestFileAccess(): AtRestFileAccess | null {
  return state.access;
}

/**
 * Le fichier vient d'être effacé : sa ligne de scellement part avec lui. Elle
 * ne porte aucun secret, mais une clé de stockage effacée ne doit plus rien
 * dire d'une pièce disparue. Un échec est journalisé, jamais levé.
 */
export async function forgetSealing(absolutePath: string, uploadRoot: string, access: AtRestFileAccess | null = processAtRestFileAccess()): Promise<void> {
  const key = storageKeyOfPath(absolutePath, uploadRoot);
  if (!access || !key) return;
  await access.store.remove(key).catch(() => undefined);
}

/** La clé de stockage d'un chemin absolu sous la racine des dépôts, ou `null`. */
export function storageKeyOfPath(absolutePath: string, uploadRoot: string): string | null {
  const root = path.resolve(uploadRoot);
  const resolved = path.resolve(absolutePath);
  if (!resolved.startsWith(root + path.sep)) return null;
  return path.relative(root, resolved).split(path.sep).join('/');
}

async function* readChunks(absolutePath: string): AsyncGenerator<Buffer> {
  for await (const chunk of createReadStream(absolutePath)) yield chunk as Buffer;
}

/**
 * Scelle le fichier `sourceKey` sous `targetKey` (la même pour un scellement
 * en place). Le chiffré s'écrit à côté sous un nom CACHÉ — jamais servi —, la
 * ligne de scellement s'inscrit, puis le chiffré prend sa place d'un `rename`.
 * Le clair d'origine n'est PAS effacé ici quand la cible diffère : l'appelant
 * l'efface une fois les lignes de pièce jointe repointées.
 */
export async function sealStoredFile(params: {
  readonly uploadRoot: string;
  readonly sourceKey: string;
  readonly targetKey: string;
  readonly binding: Omit<SealedFileBinding, 'storageKey'>;
  readonly access: AtRestFileAccess;
  readonly segmentSize?: number;
  /** La clé claire remplacée, quand le scellé prend une clé neuve. */
  readonly replacedKey?: string | null;
}): Promise<AtRestFileRecord> {
  const segmentSize = params.segmentSize ?? DEFAULT_CIPHERTEXT_SEGMENT_SIZE;
  const source = path.join(params.uploadRoot, params.sourceKey);
  const target = path.join(params.uploadRoot, params.targetKey);
  const temporary = atRestTemporaryPath(params.uploadRoot, 'sealing');
  const inPlace = params.sourceKey === params.targetKey;
  const binding: SealedFileBinding = { ...params.binding, storageKey: params.targetKey };
  const { keyId, key } = await params.access.keyring.fileSealingKey(binding.conversationId);
  const plaintextSize = (await fs.stat(source)).size;

  await fs.mkdir(path.dirname(target), { recursive: true });
  await fs.mkdir(path.dirname(temporary), { recursive: true, mode: 0o700 });
  const handle = await openFile(temporary, 'wx', 0o600);
  try {
    for await (const part of sealSegments(readChunks(source), { mainKey: fileMainKeyOf(key), associatedData: associatedDataOf(binding), ciphertextSegmentSize: segmentSize })) {
      await handle.write(part);
    }
    await handle.sync();
  } catch (error) {
    await handle.close().catch(() => undefined);
    await fs.unlink(temporary).catch(() => undefined);
    throw error;
  }
  await handle.close();

  const written = (await fs.stat(temporary)).size;
  if (written !== ciphertextSizeFor(plaintextSize, segmentSize)) {
    await fs.unlink(temporary).catch(() => undefined);
    throw new Error('sealed size mismatch: the source changed while it was sealed');
  }
  const record: AtRestFileRecord = {
    ...binding, keyId, plaintextSize, format: SEALED_FILE_FORMAT, segmentSize,
    replacedKey: params.replacedKey && params.replacedKey !== params.targetKey ? params.replacedKey : null,
  };
  // Sous une clé NEUVE, le chiffré prend sa place AVANT que la ligne ne
  // l'annonce : interrompu entre les deux, il reste un chiffré orphelin
  // qu'aucune ligne ne désigne, jamais une ligne qui désigne un absent. En
  // PLACE, la ligne précède : interrompu, elle pèse sur un clair de la taille
  // inscrite, que le scellement suivant reconnaît et rescelle.
  if (inPlace) await saveThenRename(params.access, record, temporary, target);
  else await renameThenSave(params.access, record, temporary, target);
  await fs.chmod(target, 0o644).catch(() => undefined);
  return record;
}

/** Le dossier des temporaires du scellement, sous la racine (même volume, `rename` atomique), balayé après une heure. */
export const AT_REST_TEMPORARY_DIR = '.at-rest-tmp';

export function atRestTemporaryPath(uploadRoot: string, kind: 'sealing' | 'unsealing' | 'track'): string {
  return path.join(uploadRoot, AT_REST_TEMPORARY_DIR, `.${kind}-${randomBytes(8).toString('hex')}`);
}

async function saveThenRename(access: AtRestFileAccess, record: AtRestFileRecord, temporary: string, target: string): Promise<void> {
  try {
    await access.store.save(record);
  } catch (error) {
    await fs.unlink(temporary).catch(() => undefined);
    throw error;
  }
  try {
    await fs.rename(temporary, target);
  } catch (error) {
    await access.store.remove(record.storageKey).catch(() => undefined);
    await fs.unlink(temporary).catch(() => undefined);
    throw error;
  }
}

async function renameThenSave(access: AtRestFileAccess, record: AtRestFileRecord, temporary: string, target: string): Promise<void> {
  try {
    await fs.rename(temporary, target);
  } catch (error) {
    await fs.unlink(temporary).catch(() => undefined);
    throw error;
  }
  try {
    await access.store.save(record);
  } catch (error) {
    await fs.unlink(target).catch(() => undefined);
    throw error;
  }
}

/** Le fichier scellé de cette ligne est-il en place, à la taille exacte de son chiffré ? */
export async function sealedFileIsInPlace(uploadRoot: string, record: AtRestFileRecord): Promise<boolean> {
  const stats = await fs.stat(path.join(uploadRoot, record.storageKey)).catch(() => null);
  return stats !== null && stats.size === ciphertextSizeFor(record.plaintextSize, record.segmentSize);
}

/** Les octets d'un fichier stocké tels qu'une route les décrit (`routes/attachments/storedBytes.ts`). */
export type OpenableBytes = {
  readonly size: number;
  readonly etag: string;
  readonly open: (range?: { readonly start: number; readonly end: number }) => Promise<Readable | null>;
};

async function collect(stream: Readable): Promise<Buffer> {
  const parts: Buffer[] = [];
  for await (const part of stream) parts.push(part as Buffer);
  return Buffer.concat(parts);
}

/**
 * Les octets CLAIRS d'un fichier scellé, sur le support qui porte le chiffré
 * (disque ou seau) : même interface, taille du clair, plages du clair. La clé
 * ne s'obtient que pour la conversation inscrite au scellement.
 */
export function openSealedStoredBytes(cipher: OpenableBytes, record: AtRestFileRecord, keyring: AtRestFileKeyring): OpenableBytes {
  if (record.format !== SEALED_FILE_FORMAT) throw new AtRestFileUnreadableError('unknown-format');
  const readCiphertext = async (start: number, end: number): Promise<Buffer> => {
    if (end <= start) return Buffer.alloc(0);
    const last = Math.min(end, cipher.size) - 1;
    if (last < start) return Buffer.alloc(0);
    const stream = await cipher.open({ start, end: last });
    return stream ? collect(stream) : Buffer.alloc(0);
  };
  return {
    size: record.plaintextSize,
    etag: cipher.etag,
    open: async (range) => {
      const mainKey = fileMainKeyOf(await keyring.fileOpeningKey(record.keyId, record.conversationId));
      const opened = openSealedRange({
        mainKey,
        associatedData: associatedDataOf(record),
        ciphertextSegmentSize: record.segmentSize,
        plaintextSize: record.plaintextSize,
        readCiphertext,
        ...(range ? { range } : {}),
      });
      const first = await opened.next();
      return Readable.from(withFirst(first, opened), { objectMode: false });
    },
  };
}

/**
 * Le premier segment est ouvert AVANT que la route ne décrive sa réponse : une
 * clé refusée, un en-tête altéré ou une première étiquette fausse rendent une
 * erreur, jamais un 200 suivi d'un flux coupé.
 */
async function* withFirst(first: IteratorResult<Buffer>, rest: AsyncGenerator<Buffer>): AsyncGenerator<Buffer> {
  if (first.done) return;
  yield first.value;
  yield* rest;
}

/**
 * Le CLAIR d'un fichier du volume des dépôts, scellé ou non — pour la
 * passerelle seule (trames binaires vers le translator, profil vocal,
 * retraduction). Un fichier scellé sans accès configuré n'est jamais rendu.
 */
export async function readStoredFileBytes(absolutePath: string, options: {
  readonly uploadRoot: string;
  readonly access?: AtRestFileAccess | null;
}): Promise<Buffer> {
  return (await readStoredFile(absolutePath, options)).bytes;
}

/** Le clair, et s'il venait d'un fichier SCELLÉ : son contenu ne doit alors se ranger nulle part (#13102). */
export async function readStoredFile(absolutePath: string, options: {
  readonly uploadRoot: string;
  readonly access?: AtRestFileAccess | null;
}): Promise<{ readonly bytes: Buffer; readonly sealed: boolean }> {
  const access = options.access === undefined ? processAtRestFileAccess() : options.access;
  const storageKey = storageKeyOfPath(absolutePath, options.uploadRoot);
  const record = storageKey && access ? await access.store.find(storageKey) : null;
  if (!record) {
    if (storageKey && !access && isSealedStorageKey(storageKey)) throw new AtRestFileUnreadableError('no-access');
    return { bytes: await fs.readFile(absolutePath), sealed: false };
  }
  const stats = await fs.stat(absolutePath);
  const cipher: OpenableBytes = {
    size: stats.size,
    etag: '',
    open: async (range) => (range ? createReadStream(absolutePath, { start: range.start, end: range.end }) : createReadStream(absolutePath)),
  };
  const stream = await openSealedStoredBytes(cipher, record, access!.keyring).open();
  return { bytes: stream ? await collect(stream) : Buffer.alloc(0), sealed: true };
}

/**
 * La forme d'une clé que SEUL le scellement produit : `AAAA/MM/<auteur>/` puis
 * 32 hexadécimaux sans tiret, un suffixe de dérivé facultatif, une extension.
 * Tout envoi produit `<nom>_<uuid avec tirets>.<ext>` (multipart et TUS) : un
 * fichier déposé ne prend jamais cette forme. Elle sert à SIGNER les adresses
 * d'une pièce scellée et à refuser l'adresse nue sans requête ; elle ne fait
 * jamais OUVRIR un fichier — seule la ligne de scellement le fait.
 */
export const SEALED_STORAGE_KEY_SHAPE = /^\d{4}\/\d{2}\/[^/]+\/[0-9a-f]{32}(?:_[a-z0-9]+)?\.[a-z0-9]+$/;

export const isSealedStorageKey = (key: string): boolean => SEALED_STORAGE_KEY_SHAPE.test(key);

/**
 * La base opaque d'une pièce scellée, dans le dossier de son original :
 * l'empreinte de l'ancienne clé. Déterministe (deux scellements concurrents
 * convergent) et muette : l'ancienne clé porte un UUID v4, l'empreinte ne
 * rend donc pas le nom d'origine.
 */
export function opaqueBaseFor(originalKey: string): string {
  const directory = path.posix.dirname(originalKey);
  const digest = createHash('sha256').update(`meeshy:at-rest-opaque-name:v1\n${originalKey}`, 'utf8').digest('hex').slice(0, 32);
  return `${directory}/${digest}`;
}
