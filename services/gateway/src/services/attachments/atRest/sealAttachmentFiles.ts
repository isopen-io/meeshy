/**
 * #13100 — sceller TOUS les fichiers d'une pièce jointe d'une conversation
 * `server` / `hybrid` : l'original, la vignette, les variantes WebP et AVIF,
 * les rendus (H.264, original HEIC) et les pistes TTS. Le même site sert le
 * rattachement à un message, la fin d'un rendu différé, l'arrivée d'une piste
 * traduite et la migration de rattrapage : il est IDEMPOTENT, et ne scelle que
 * ce qui ne l'est pas encore.
 *
 * Le nom d'origine ne figure plus dans le chemin : l'original et ses dérivés
 * prennent une base OPAQUE (`<32 hexadécimaux>`), dans le dossier de
 * l'original, en gardant les suffixes de dérivé (`_thumb`, `_640w`, `_h264`…)
 * qui relient une variante à sa pièce (`fileRouteVerdict`). Une piste TTS
 * (`translated/<id>_<langue>`) ne porte aucun nom : elle est scellée en place.
 *
 * Toutes les lignes qui partagent les octets (copies de transfert et de
 * diffusion) sont repointées, chacune en compare-et-échange sur l'ancien
 * `filePath`. La base opaque est DÉTERMINISTE (empreinte de l'ancien chemin,
 * dont l'UUID rend le nom introuvable) : deux scellements concurrents écrivent
 * les mêmes clés sous la même liaison, et le dernier `rename` laisse un
 * fichier que la ligne de l'un comme de l'autre ouvre. Le clair n'est effacé
 * qu'une fois les lignes repointées ; un scellement interrompu se rejoue.
 *
 * Une pièce chiffrée de bout en bout (`e2ee`, `isEncrypted`) n'est jamais
 * touchée ; une pièce dont le rendu est encore en cours (`pending`) attend la
 * fin de son rendu.
 */
import { promises as fs } from 'fs';
import path from 'path';
import type { Prisma, PrismaClient } from '@meeshy/shared/prisma/client';
import { enhancedLogger } from '../../../utils/logger-enhanced';
import { storageKeyFromMediaUrl } from '../mediaStorageKey';
import { sealsAtRest } from '../../messaging/atRestWrite';
import {
  atRestFileSealingEnabled,
  isSealableStorageKey,
  isSealedStorageKey,
  opaqueBaseFor,
  sealStoredFile,
  type AtRestFileAccess,
  type AtRestFileRecord,
  type FileSealLock,
  sealedFileIsInPlace,
} from './atRestFiles';
import { ciphertextSizeFor } from './sealedFileFormat';

const logger = enhancedLogger.child({ module: 'sealAttachmentFiles' });

export type SealAttachmentDeps = {
  readonly prisma: Pick<PrismaClient, 'messageAttachment' | 'message'>;
  readonly uploadRoot: string;
  readonly access: AtRestFileAccess;
  /** Efface la copie du seau d'un fichier effacé du disque (`eraseMirroredCopy`). */
  readonly eraseMirrored?: (absolutePath: string) => Promise<void>;
  /**
   * Le verrou d'un fichier d'origine, partagé par tous les processus (Redis) :
   * deux scellements d'une même pièce sous deux liaisons ne se croisent jamais.
   * `busy` : un autre scelle, celui-ci cède (le balayage reprendra). Absent :
   * un seul processus scelle (tests).
   */
  readonly lock?: SealLock;
};

export type SealLock = FileSealLock;

export const SERVER_AT_REST_SEAL_LOCK_UNAVAILABLE = 'SERVER_AT_REST_SEAL_LOCK_UNAVAILABLE';

/**
 * Le verrou d'un fichier d'origine. Injoignable (Redis en panne) vaut
 * « occupé » — sans lui, deux scellements pourraient se croiser — et se dit
 * en ERREUR : la pièce reste en clair jusqu'au prochain balayage.
 */
export async function acquireSealLock(
  lock: SealLock | undefined,
  filePath: string
): Promise<{ readonly release: () => Promise<void> } | 'busy' | null> {
  if (!lock) return null;
  return lock(filePath).catch((error: unknown) => {
    logger.error('verrou de scellement injoignable : la pièce reste en clair jusqu’au balayage', undefined, {
      code: SERVER_AT_REST_SEAL_LOCK_UNAVAILABLE,
      reason: error instanceof Error ? error.name : 'unknown',
    });
    return 'busy' as const;
  });
}

export type SealOutcome =
  | { readonly status: 'sealed'; readonly files: number; readonly rows: number }
  | { readonly status: 'already-sealed' }
  | { readonly status: 'skipped'; readonly reason: 'not-found' | 'end-to-end' | 'pending' | 'not-at-rest' | 'busy' | 'suspended' | 'unsealable-key' };

const ROW_SELECT = {
  id: true,
  filePath: true,
  fileUrl: true,
  thumbnailPath: true,
  thumbnailUrl: true,
  imageVariants: true,
  avifVariants: true,
  renditions: true,
  translations: true,
  isEncrypted: true,
  encryptionMode: true,
  processingState: true,
} as const;

type SealRow = {
  readonly id: string;
  readonly filePath: string;
  readonly fileUrl: string;
  readonly thumbnailPath: string | null;
  readonly thumbnailUrl: string | null;
  readonly imageVariants: unknown;
  readonly avifVariants: unknown;
  readonly renditions: unknown;
  readonly translations: unknown;
  readonly isEncrypted: boolean;
  readonly encryptionMode: string | null;
  readonly processingState: string | null;
};

type Slot = { readonly key: string; readonly role: string; readonly inPlace: boolean };

const isRecord = (value: unknown): value is Readonly<Record<string, unknown>> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const keyOf = (url: unknown): string | null => (typeof url === 'string' && url.length > 0 ? storageKeyFromMediaUrl(url) : null);

const safeRole = (value: unknown): string => String(value ?? '').toLowerCase().replace(/[^a-z0-9]/g, '') || 'x';

function arraySlots(value: unknown, prefix: string, labelOf: (entry: Readonly<Record<string, unknown>>, index: number) => unknown): Slot[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((entry, index) => {
    if (!isRecord(entry)) return [];
    const key = keyOf(entry.url);
    return key ? [{ key, role: `${prefix}-${safeRole(labelOf(entry, index))}`, inPlace: false }] : [];
  });
}

/** Les fichiers d'UNE ligne, chacun avec son rôle (données associées). */
function slotsOf(row: SealRow): readonly Slot[] {
  return allSlotsOf(row).filter((slot) => isSealableStorageKey(slot.key));
}

function allSlotsOf(row: SealRow): readonly Slot[] {
  const tracks = isRecord(row.translations)
    ? Object.entries(row.translations).flatMap(([language, track]) => {
        const key = isRecord(track) ? keyOf(track.url) : null;
        return key ? [{ key, role: `track-${safeRole(language)}`, inPlace: true }] : [];
      })
    : [];
  return [
    { key: row.filePath, role: 'original', inPlace: false },
    ...(row.thumbnailPath ? [{ key: row.thumbnailPath, role: 'thumbnail', inPlace: false }] : []),
    ...arraySlots(row.imageVariants, 'webp', (entry, index) => entry.width ?? index),
    ...arraySlots(row.avifVariants, 'avif', (entry, index) => entry.width ?? index),
    ...arraySlots(row.renditions, 'rendition', (entry, index) => entry.codec ?? index),
    ...tracks,
  ];
}

const extensionOf = (key: string): string => {
  const ext = path.posix.extname(key).slice(1).toLowerCase();
  return /^[a-z0-9]+$/.test(ext) ? ext : 'bin';
};

/**
 * La clé opaque d'un fichier : la base opaque, le suffixe de dérivé que la clé
 * d'origine porte après la base de l'original (`_thumb`, `_640w`…), et
 * l'extension en minuscules. Une clé hors de cette convention reçoit son rôle.
 */
function opaqueKeyFor(slot: Slot, originalBase: string, opaqueBase: string): string {
  const ext = extensionOf(slot.key);
  if (slot.role === 'original') return `${opaqueBase}.${ext}`;
  const withoutExt = slot.key.slice(0, slot.key.length - path.posix.extname(slot.key).length);
  const suffix = withoutExt.startsWith(originalBase) ? withoutExt.slice(originalBase.length) : '';
  const derived = /^_[a-z0-9]+$/.test(suffix.toLowerCase()) ? suffix.toLowerCase() : `_${slot.role.replace(/[^a-z0-9]/g, '')}`;
  return `${opaqueBase}${derived}.${ext}`;
}

/** Une adresse repointée : la nouvelle clé nue, la forme que la base doit porter. */
const remap = (url: unknown, moved: ReadonlyMap<string, string>): unknown => {
  const key = keyOf(url);
  return key !== null && moved.has(key) ? moved.get(key) : url;
};

const remapArray = (value: unknown, moved: ReadonlyMap<string, string>): Prisma.InputJsonValue | undefined =>
  Array.isArray(value)
    ? (value.map((entry) => (isRecord(entry) ? { ...entry, url: remap(entry.url, moved) } : entry)) as Prisma.InputJsonValue)
    : undefined;

function rowWrites(row: SealRow, moved: ReadonlyMap<string, string>): Prisma.MessageAttachmentUpdateManyMutationInput {
  const filePath = moved.get(row.filePath) ?? row.filePath;
  return {
    filePath,
    fileUrl: remap(row.fileUrl, moved) as string,
    fileName: path.posix.basename(filePath),
    ...(row.thumbnailPath ? { thumbnailPath: moved.get(row.thumbnailPath) ?? row.thumbnailPath } : {}),
    ...(row.thumbnailUrl ? { thumbnailUrl: remap(row.thumbnailUrl, moved) as string } : {}),
    ...(Array.isArray(row.imageVariants) ? { imageVariants: remapArray(row.imageVariants, moved) } : {}),
    ...(Array.isArray(row.avifVariants) ? { avifVariants: remapArray(row.avifVariants, moved) } : {}),
    ...(Array.isArray(row.renditions) ? { renditions: remapArray(row.renditions, moved) } : {}),
  };
}

const isEndToEnd = (row: Pick<SealRow, 'isEncrypted' | 'encryptionMode'>): boolean =>
  row.isEncrypted === true || row.encryptionMode?.toLowerCase() === 'e2ee';

async function exists(absolute: string): Promise<boolean> {
  return fs.stat(absolute).then(() => true, () => false);
}

/**
 * L'état d'un fichier : absent, en clair, scellé — ou `stale` : une ligne de
 * scellement pèse sur un fichier qui a EXACTEMENT la taille du clair inscrit,
 * jamais celle d'un chiffré (processus tué entre la ligne et le `rename`). Il
 * est rescellé.
 */
async function slotState(absolute: string, record: AtRestFileRecord | null): Promise<'absent' | 'plain' | 'sealed' | 'stale'> {
  const stats = await fs.stat(absolute).catch(() => null);
  if (!stats) return 'absent';
  if (!record) return 'plain';
  const plainSized = stats.size === record.plaintextSize && stats.size !== ciphertextSizeFor(record.plaintextSize, record.segmentSize);
  return plainSized ? 'stale' : 'sealed';
}

/** Ce qu'un scellement ferait, sans rien écrire : la migration à blanc le compte. */
export type SealingPlan =
  | { readonly kind: 'skip'; readonly outcome: SealOutcome }
  | { readonly kind: 'seal'; readonly seed: SealRow; readonly rows: readonly SealRow[]; readonly toSeal: readonly Slot[] };

/** LECTURE SEULE : lignes, scellements existants, présence sur le disque. */
export async function planAttachmentSealing(
  deps: Pick<SealAttachmentDeps, 'prisma' | 'uploadRoot' | 'access'>,
  attachmentId: string
): Promise<SealingPlan> {
  const seed = await deps.prisma.messageAttachment.findUnique({ where: { id: attachmentId }, select: ROW_SELECT });
  if (!seed) return { kind: 'skip', outcome: { status: 'skipped', reason: 'not-found' } };
  if (isEndToEnd(seed)) return { kind: 'skip', outcome: { status: 'skipped', reason: 'end-to-end' } };
  if (seed.processingState === 'pending') return { kind: 'skip', outcome: { status: 'skipped', reason: 'pending' } };
  if (!isSealableStorageKey(seed.filePath)) return { kind: 'skip', outcome: { status: 'skipped', reason: 'unsealable-key' } };

  const rows: readonly SealRow[] = await deps.prisma.messageAttachment.findMany({ where: { filePath: seed.filePath }, select: ROW_SELECT });
  if (rows.some(isEndToEnd)) return { kind: 'skip', outcome: { status: 'skipped', reason: 'end-to-end' } };

  const unique = new Map<string, Slot>();
  rows.flatMap(slotsOf).forEach((slot) => { if (!unique.has(slot.key)) unique.set(slot.key, slot); });
  const found = await Promise.all([...unique.values()].map(async (slot) => ({ slot, record: await deps.access.store.find(slot.key) })));
  const present = await Promise.all(
    found.map(async ({ slot, record }) => ({ slot, state: await slotState(path.join(deps.uploadRoot, slot.key), record) }))
  );
  const toSeal = present.filter(({ state }) => state === 'plain' || state === 'stale').map(({ slot }) => slot);
  return toSeal.length === 0 ? { kind: 'skip', outcome: { status: 'already-sealed' } } : { kind: 'seal', seed, rows, toSeal };
}

/**
 * Scelle les fichiers de la pièce `attachmentId` et de ses copies sous la clé
 * de `conversationId`. L'appelant a jugé que la pièce DOIT l'être
 * (`sealAttachmentIfAtRest`). Sous le verrou de son fichier d'origine, le plan
 * est relu : ce qui a été scellé par un autre entre-temps ne l'est pas deux fois.
 */
export async function sealAttachmentFiles(
  deps: SealAttachmentDeps,
  input: { readonly attachmentId: string; readonly conversationId: string }
): Promise<SealOutcome> {
  if (!atRestFileSealingEnabled()) return { status: 'skipped', reason: 'suspended' };
  const head = await deps.prisma.messageAttachment.findUnique({ where: { id: input.attachmentId }, select: { filePath: true } });
  if (!head) return { status: 'skipped', reason: 'not-found' };
  const held = await acquireSealLock(deps.lock ?? deps.access.lock, head.filePath);
  if (held === 'busy') return { status: 'skipped', reason: 'busy' };
  try {
    return await sealUnderLock(deps, input);
  } finally {
    await held?.release().catch(() => undefined);
  }
}

async function sealUnderLock(
  deps: SealAttachmentDeps,
  input: { readonly attachmentId: string; readonly conversationId: string }
): Promise<SealOutcome> {
  // Une copie faite avant le repointage d'un scellement désigne encore l'ancien
  // original : elle se repointe sur ce qui l'a remplacé (M3).
  const head = await deps.prisma.messageAttachment.findUnique({ where: { id: input.attachmentId }, select: { filePath: true } });
  // Une réparation : son échec ne retient jamais le scellement lui-même.
  const replacement = head && deps.access.store.byReplacedKey ? await deps.access.store.byReplacedKey(head.filePath, 'original').catch(() => null) : null;
  if (replacement && replacement.attachmentId !== input.attachmentId) {
    await erasePendingUnderHeldLock(deps, replacement.attachmentId);
  }
  const plan = await planAttachmentSealing(deps, input.attachmentId);
  if (plan.kind === 'skip') {
    if (plan.outcome.status === 'already-sealed') await erasePendingUnderHeldLock(deps, input.attachmentId);
    return plan.outcome;
  }
  const { seed, rows, toSeal } = plan;

  const originalBase = seed.filePath.slice(0, seed.filePath.length - path.posix.extname(seed.filePath).length);
  const opaqueBase = isSealedStorageKey(seed.filePath) ? originalBase : opaqueBaseFor(seed.filePath);
  const binding = { conversationId: input.conversationId, attachmentId: seed.id };

  const sealed: Array<{ readonly slot: Slot; readonly record: AtRestFileRecord }> = [];
  for (const slot of toSeal) {
    // Relu juste avant : une piste écrite et scellée entre le plan et ici
    // (T5) ne se rescelle pas par-dessus son propre chiffré.
    const current = await deps.access.store.find(slot.key);
    if ((await slotState(path.join(deps.uploadRoot, slot.key), current)) === 'sealed') continue;
    const targetKey = slot.inPlace || isSealedStorageKey(slot.key) ? slot.key : opaqueKeyFor(slot, originalBase, opaqueBase);
    const record = await sealStoredFile({
      uploadRoot: deps.uploadRoot,
      sourceKey: slot.key,
      targetKey,
      binding: { ...binding, role: slot.role },
      access: deps.access,
      replacedKey: targetKey === slot.key ? null : slot.key,
    });
    sealed.push({ slot, record });
  }

  const moved = new Map(sealed.filter(({ slot, record }) => record.storageKey !== slot.key).map(({ slot, record }) => [slot.key, record.storageKey] as const));
  if (moved.size > 0) {
    await Promise.all(
      rows.map((row) => deps.prisma.messageAttachment.updateMany({ where: { id: row.id, filePath: row.filePath }, data: rowWrites(row, moved) }))
    );
  }
  // T8 — la pièce a été effacée PENDANT le scellement (vue unique brûlée) :
  // plus aucune ligne ne désigne ses octets, ce qui vient d'être écrit part.
  const carriers = await deps.prisma.messageAttachment.findMany({ where: { filePath: moved.get(seed.filePath) ?? seed.filePath }, select: { id: true } });
  const stragglers = moved.has(seed.filePath) ? await deps.prisma.messageAttachment.findMany({ where: { filePath: seed.filePath }, select: { id: true } }) : [];
  if (carriers.length === 0 && stragglers.length === 0) {
    await Promise.all(sealed.map(async ({ slot, record }) => {
      await eraseAt(deps, record.storageKey);
      await deps.access.store.remove(record.storageKey).catch(() => undefined);
      if (record.storageKey !== slot.key) await eraseAt(deps, slot.key);
    }));
    logger.info('pièce effacée pendant son scellement : ce qui venait d’être scellé est effacé', { attachmentId: seed.id });
    return { status: 'skipped', reason: 'not-found' };
  }
  await Promise.all(sealed.filter(({ slot }) => !moved.has(slot.key)).map(({ slot }) => deps.eraseMirrored?.(path.join(deps.uploadRoot, slot.key)) ?? Promise.resolve()));
  // Les lignes de scellement relues ET celles que ce passage vient d'écrire :
  // une pièce effacée entre-temps a emporté les siennes, son clair doit partir quand même.
  const known = await deps.access.store.ofAttachment(seed.id);
  await eraseReplaced(deps, [...known, ...sealed.map(({ record }) => record).filter((record) => !known.some((k) => k.storageKey === record.storageKey))]);
  logger.info('pièce jointe scellée au repos', { attachmentId: seed.id, files: sealed.length, rows: rows.length });
  return { status: 'sealed', files: sealed.length, rows: rows.length };
}

/**
 * Le clair remplacé ne s'efface que quand PLUS AUCUNE ligne ne désigne
 * l'ancien original : toute ligne qui le désigne encore — copie de transfert
 * créée pendant le scellement, repointage interrompu — est d'abord repointée
 * sur les fichiers scellés (la ligne de scellement garde `replacedKey`). Rejouable
 * à volonté : le balayage la rejoue, et une ligne retardataire, même apparue
 * APRÈS l'effacement, se repointe encore — rien ne se perd.
 */
export type PendingErasureOutcome = { readonly erased: number; readonly repointed: number; readonly busy?: true };

/**
 * Hors du scellement (balayage) : sous le MÊME verrou que le scellement, pris
 * sur l'ancien original. Un scellement en cours tient ce verrou : le balayage
 * cède (`busy`) plutôt que de repointer à moitié des lignes que le
 * scellement n'a pas fini d'écrire.
 */
export async function finishPendingErasures(
  deps: Pick<SealAttachmentDeps, 'prisma' | 'uploadRoot' | 'access' | 'eraseMirrored' | 'lock'>,
  attachmentId: string
): Promise<PendingErasureOutcome> {
  const replacing = (await deps.access.store.ofAttachment(attachmentId)).filter((record) => record.replacedKey !== null);
  const oldOriginal = replacing.find((record) => record.role === 'original')?.replacedKey;
  if (!oldOriginal) return { erased: 0, repointed: 0 };
  const held = await acquireSealLock(deps.lock ?? deps.access.lock, oldOriginal);
  if (held === 'busy') return { erased: 0, repointed: 0, busy: true };
  try {
    return await erasePendingUnderHeldLock(deps, attachmentId);
  } finally {
    await held?.release().catch(() => undefined);
  }
}

/** Le scellement, qui tient déjà le verrou de l'ancien original, termine ici ses effacements. */
async function erasePendingUnderHeldLock(
  deps: Pick<SealAttachmentDeps, 'prisma' | 'uploadRoot' | 'access' | 'eraseMirrored'>,
  attachmentId: string
): Promise<PendingErasureOutcome> {
  return eraseReplaced(deps, await deps.access.store.ofAttachment(attachmentId));
}

/**
 * Repointe les retardataires puis efface les clairs remplacés — seulement si
 * CHAQUE fichier scellé qui les remplace est en place, à la taille exacte de
 * son chiffré : jamais une ligne repointée vers un absent, jamais le seul
 * exemplaire effacé.
 */
async function eraseReplaced(
  deps: Pick<SealAttachmentDeps, 'prisma' | 'uploadRoot' | 'access' | 'eraseMirrored'>,
  records: readonly AtRestFileRecord[]
): Promise<PendingErasureOutcome> {
  const replacing = records.filter((record) => record.replacedKey !== null);
  const oldOriginal = replacing.find((record) => record.role === 'original')?.replacedKey;
  if (!oldOriginal) return { erased: 0, repointed: 0 };
  const newOriginal = replacing.find((record) => record.role === 'original')?.storageKey ?? oldOriginal;
  const [onOld, onNew] = await Promise.all([
    deps.prisma.messageAttachment.findMany({ where: { filePath: oldOriginal }, select: { id: true } }),
    deps.prisma.messageAttachment.findMany({ where: { filePath: newOriginal }, select: { id: true } }),
  ]);
  if (onOld.length === 0 && onNew.length === 0) {
    // La pièce est partie (vue unique brûlée, suppression) : ses clairs aussi.
    const gone = [...new Set(replacing.map((record) => record.replacedKey as string))];
    await Promise.all(gone.map((key) => eraseAt(deps, key)));
    return { erased: gone.length, repointed: 0 };
  }
  const inPlace = await Promise.all(replacing.map((record) => sealedFileIsInPlace(deps.uploadRoot, record)));
  if (inPlace.some((present) => !present)) {
    logger.warn('scellé absent ou incomplet : rien n’est repointé ni effacé', { attachmentId: replacing[0].attachmentId });
    return { erased: 0, repointed: 0 };
  }
  const moved = new Map(replacing.map((record) => [record.replacedKey as string, record.storageKey] as const));

  const stragglers: readonly SealRow[] = await deps.prisma.messageAttachment.findMany({ where: { filePath: oldOriginal }, select: ROW_SELECT });
  const repointed = await Promise.all(
    stragglers.map((row) => deps.prisma.messageAttachment.updateMany({ where: { id: row.id, filePath: row.filePath }, data: rowWrites(row, moved) }))
  );
  const remaining = await deps.prisma.messageAttachment.findMany({ where: { filePath: oldOriginal }, select: { id: true } });
  if (remaining.length > 0) return { erased: 0, repointed: repointed.reduce((sum, { count }) => sum + count, 0) };

  const present = await Promise.all([...moved.keys()].map(async (key) => ((await exists(path.join(deps.uploadRoot, key))) ? key : null)));
  const toErase = present.filter((key): key is string => key !== null);
  await Promise.all(toErase.map((key) => eraseAt(deps, key)));
  return { erased: toErase.length, repointed: repointed.reduce((sum, { count }) => sum + count, 0) };
}

async function eraseAt(deps: Pick<SealAttachmentDeps, 'uploadRoot' | 'eraseMirrored'>, key: string): Promise<void> {
  const absolute = path.join(deps.uploadRoot, key);
  await fs.unlink(absolute).catch((error: unknown) => {
    if ((error as { code?: string }).code !== 'ENOENT') logger.warn('clair d’origine non effacé après scellement', { code: (error as { code?: string }).code });
  });
  await deps.eraseMirrored?.(absolute);
}

type RegimeRow = {
  readonly isEncrypted: boolean;
  readonly encryptionMode: string | null;
  readonly filePath: string;
  readonly message: {
    readonly conversationId: string;
    readonly conversation: { readonly encryptionMode: string | null; readonly encryptionEnabledAt: Date | null } | null;
  } | null;
};

/**
 * La conversation sous laquelle sceller les fichiers de cette pièce, ou `null`
 * s'ils restent en clair. Celle de son message quand elle est `server` /
 * `hybrid` activée — ou celle de son original s'il est déjà scellé (une piste
 * arrivée après une désactivation suit les octets qu'elle traduit). Jamais une
 * pièce chiffrée de bout en bout.
 */
export async function atRestConversationFor(
  deps: Pick<SealAttachmentDeps, 'prisma' | 'access'>,
  attachmentId: string
): Promise<string | null> {
  const row: RegimeRow | null = await deps.prisma.messageAttachment.findUnique({
    where: { id: attachmentId },
    select: {
      isEncrypted: true,
      encryptionMode: true,
      filePath: true,
      message: { select: { conversationId: true, conversation: { select: { encryptionMode: true, encryptionEnabledAt: true } } } },
    },
  });
  if (!row || isEndToEnd(row)) return null;
  if (row.message !== null && sealsAtRest(row.message.conversation)) return row.message.conversationId;
  const sealedOriginal = await deps.access.store.find(row.filePath);
  if (sealedOriginal) return sealedOriginal.conversationId;
  // Une copie qui désigne encore le clair qu'un scellement a remplacé (M3).
  return (await deps.access.store.byReplacedKey?.(row.filePath, 'original').catch(() => null))?.conversationId ?? null;
}

/** Scelle la pièce si elle doit l'être (`atRestConversationFor`). */
export async function sealAttachmentIfAtRest(deps: SealAttachmentDeps, attachmentId: string): Promise<SealOutcome> {
  const conversationId = await atRestConversationFor(deps, attachmentId);
  if (!conversationId) return { status: 'skipped', reason: 'not-at-rest' };
  return sealAttachmentFiles(deps, { attachmentId, conversationId });
}
