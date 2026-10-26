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
  isSealedStorageKey,
  opaqueBaseFor,
  sealStoredFile,
  type AtRestFileAccess,
  type AtRestFileRecord,
} from './atRestFiles';

const logger = enhancedLogger.child({ module: 'sealAttachmentFiles' });

export type SealAttachmentDeps = {
  readonly prisma: Pick<PrismaClient, 'messageAttachment' | 'message'>;
  readonly uploadRoot: string;
  readonly access: AtRestFileAccess;
  /** Efface la copie du seau d'un fichier effacé du disque (`eraseMirroredCopy`). */
  readonly eraseMirrored?: (absolutePath: string) => Promise<void>;
};

export type SealOutcome =
  | { readonly status: 'sealed'; readonly files: number; readonly rows: number }
  | { readonly status: 'already-sealed' }
  | { readonly status: 'skipped'; readonly reason: 'not-found' | 'end-to-end' | 'pending' | 'not-at-rest' };

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

  const rows: readonly SealRow[] = await deps.prisma.messageAttachment.findMany({ where: { filePath: seed.filePath }, select: ROW_SELECT });
  if (rows.some(isEndToEnd)) return { kind: 'skip', outcome: { status: 'skipped', reason: 'end-to-end' } };

  const unique = new Map<string, Slot>();
  rows.flatMap(slotsOf).forEach((slot) => { if (!unique.has(slot.key)) unique.set(slot.key, slot); });
  const found = await Promise.all([...unique.values()].map(async (slot) => ({ slot, record: await deps.access.store.find(slot.key) })));
  const present = await Promise.all(
    found.filter(({ record }) => record === null).map(async ({ slot }) => ({ slot, present: await exists(path.join(deps.uploadRoot, slot.key)) }))
  );
  const toSeal = present.filter(({ present: onDisk }) => onDisk).map(({ slot }) => slot);
  return toSeal.length === 0 ? { kind: 'skip', outcome: { status: 'already-sealed' } } : { kind: 'seal', seed, rows, toSeal };
}

/**
 * Scelle les fichiers de la pièce `attachmentId` et de ses copies sous la clé
 * de `conversationId`. L'appelant a jugé que la pièce DOIT l'être
 * (`sealAttachmentIfAtRest`).
 */
export async function sealAttachmentFiles(
  deps: SealAttachmentDeps,
  input: { readonly attachmentId: string; readonly conversationId: string }
): Promise<SealOutcome> {
  const plan = await planAttachmentSealing(deps, input.attachmentId);
  if (plan.kind === 'skip') return plan.outcome;
  const { seed, rows, toSeal } = plan;

  const originalBase = seed.filePath.slice(0, seed.filePath.length - path.posix.extname(seed.filePath).length);
  const opaqueBase = isSealedStorageKey(seed.filePath) ? originalBase : opaqueBaseFor(seed.filePath);
  const binding = { conversationId: input.conversationId, attachmentId: seed.id };

  const sealed: Array<{ readonly slot: Slot; readonly record: AtRestFileRecord }> = [];
  for (const slot of toSeal) {
    const targetKey = slot.inPlace || isSealedStorageKey(slot.key) ? slot.key : opaqueKeyFor(slot, originalBase, opaqueBase);
    const record = await sealStoredFile({
      uploadRoot: deps.uploadRoot,
      sourceKey: slot.key,
      targetKey,
      binding: { ...binding, role: slot.role },
      access: deps.access,
    });
    sealed.push({ slot, record });
  }

  const moved = new Map(sealed.filter(({ slot, record }) => record.storageKey !== slot.key).map(({ slot, record }) => [slot.key, record.storageKey] as const));
  if (moved.size > 0) {
    await Promise.all(
      rows.map((row) => deps.prisma.messageAttachment.updateMany({ where: { id: row.id, filePath: row.filePath }, data: rowWrites(row, moved) }))
    );
  }

  await Promise.all([...moved.keys()].map((oldKey) => eraseAt(deps, oldKey)));
  await Promise.all(sealed.filter(({ slot }) => !moved.has(slot.key)).map(({ slot }) => deps.eraseMirrored?.(path.join(deps.uploadRoot, slot.key)) ?? Promise.resolve()));
  logger.info('pièce jointe scellée au repos', { attachmentId: seed.id, files: sealed.length, rows: rows.length });
  return { status: 'sealed', files: sealed.length, rows: rows.length };
}

async function eraseAt(deps: SealAttachmentDeps, key: string): Promise<void> {
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
  return (await deps.access.store.find(row.filePath))?.conversationId ?? null;
}

/** Scelle la pièce si elle doit l'être (`atRestConversationFor`). */
export async function sealAttachmentIfAtRest(deps: SealAttachmentDeps, attachmentId: string): Promise<SealOutcome> {
  const conversationId = await atRestConversationFor(deps, attachmentId);
  if (!conversationId) return { status: 'skipped', reason: 'not-at-rest' };
  return sealAttachmentFiles(deps, { attachmentId, conversationId });
}
