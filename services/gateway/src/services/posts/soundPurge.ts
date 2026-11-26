/**
 * #9854 — le FICHIER d'un son retiré de la bibliothèque (`Sound.deletedAt`,
 * #9848) quitte le volume `gateway_sounds` quand plus aucune publication ne
 * l'utilise (`SoundUsage` tombé à zéro : suppression ou expiration des posts).
 *
 * Ce qui ne bouge jamais :
 * - la LIGNE `Sound` reste, pour que `@@unique([uploaderId, contentHash])`
 *   empêche une extraction suivante de recréer le son retiré ;
 * - un son COUPÉ (`mutedAt`, DMCA, modération) garde son fichier : c'est la
 *   preuve de ce qui a été coupé ;
 * - un son vivant, ou retiré mais encore joué par une publication, garde le
 *   sien — `GET /static/:filename` le sert toujours aux posts existants.
 *
 * Fail-closed : l'usage est recompté juste avant la suppression, une adresse
 * qui ne désigne pas un fichier audio du volume est ignorée, et un fichier
 * qu'une autre ligne `Sound` cite encore est gardé. Le retrait se revérifie
 * DANS le processus sur la ligne lue (`deletedAt` daté, `mutedAt` nul), en plus
 * de `isSet: true` + `not: null` dans la requête : le connecteur peut passer par
 * un pipeline d'agrégation où l'absence suit l'ordre BSON (mesuré sur
 * `ExpiredMessagesCleanupService`), et l'erreur coûterait le fichier d'un son
 * vivant, sans retour.
 *
 * Idempotente : un fichier déjà absent compte pour rien, donc un rejeu ne
 * supprime rien de plus. Best-effort : un fichier qui résiste n'arrête pas
 * les suivants et n'est pas retenté dans la même passe (curseur sur l'id :
 * les lignes restent éligibles après purge, la passe ne peut donc pas boucler).
 *
 * Coupée par défaut (`SOUND_FILE_PURGE_ENABLED`) : la première passe sur des
 * données de production attend le feu vert du porteur.
 */

import { promises as fsp } from 'fs';
import path from 'path';
import type { PrismaClient } from '@meeshy/shared/prisma/client';
import { ALLOWED_AUDIO_EXT, NOT_MUTED_WHERE, STATIC_URL_PREFIX } from './soundFormats';

export type SoundFileRemoval = 'removed' | 'absent';

export interface SoundFileStore {
  remove(filename: string): Promise<SoundFileRemoval>;
}

export type SoundFilePurgeResult = { readonly removed: number; readonly failed: number };

export type PurgeRemovedSoundFilesOptions = {
  prisma: PrismaClient;
  store: SoundFileStore;
  batchSize?: number;
};

const DEFAULT_BATCH_SIZE = 200;

export function soundFilePurgeEnabled(env: NodeJS.ProcessEnv = process.env): boolean {
  return env['SOUND_FILE_PURGE_ENABLED'] === 'true';
}

export function soundsVolumeStore(soundsDir: string = process.env.UPLOAD_DIR ?? '/app/sounds'): SoundFileStore {
  return {
    remove: async (filename) => {
      try {
        await fsp.unlink(path.join(soundsDir, filename));
        return 'removed';
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code === 'ENOENT') return 'absent';
        throw error;
      }
    },
  };
}

export function soundVolumeFilename(fileUrl: string): string | null {
  if (!fileUrl.startsWith(STATIC_URL_PREFIX)) return null;
  const rest = fileUrl.slice(STATIC_URL_PREFIX.length);
  if (rest.length === 0 || rest !== path.basename(rest)) return null;
  return ALLOWED_AUDIO_EXT.has(path.extname(rest).toLowerCase()) ? rest : null;
}

const REMOVED_UNUSED_SOUND_WHERE = {
  AND: [{ deletedAt: { isSet: true } }, { deletedAt: { not: null } }, NOT_MUTED_WHERE],
  usages: { none: {} },
};

type Candidate = { id: string; fileUrl: string; deletedAt: Date | null; mutedAt: Date | null };

const isRemovedAndNotMuted = (candidate: Candidate): boolean =>
  candidate.deletedAt instanceof Date && candidate.mutedAt === null;

async function purgeOne(prisma: PrismaClient, store: SoundFileStore, candidate: Candidate): Promise<SoundFileRemoval | 'kept'> {
  if (!isRemovedAndNotMuted(candidate)) return 'kept';
  const filename = soundVolumeFilename(candidate.fileUrl);
  if (!filename) return 'kept';
  const [usages, otherRows] = await Promise.all([
    prisma.soundUsage.count({ where: { soundId: candidate.id } }),
    prisma.sound.count({ where: { fileUrl: candidate.fileUrl, id: { not: candidate.id } } }),
  ]);
  if (usages > 0 || otherRows > 0) return 'kept';
  return store.remove(filename);
}

export async function purgeRemovedSoundFiles(options: PurgeRemovedSoundFilesOptions): Promise<SoundFilePurgeResult> {
  const { prisma, store, batchSize = DEFAULT_BATCH_SIZE } = options;
  let after: string | undefined;
  let removed = 0;
  let failed = 0;

  for (;;) {
    const batch: Candidate[] = await prisma.sound.findMany({
      where: { ...REMOVED_UNUSED_SOUND_WHERE, ...(after ? { id: { gt: after } } : {}) },
      select: { id: true, fileUrl: true, deletedAt: true, mutedAt: true },
      orderBy: { id: 'asc' },
      take: batchSize,
    });
    if (batch.length === 0) break;
    for (const candidate of batch) {
      after = candidate.id;
      try {
        if ((await purgeOne(prisma, store, candidate)) === 'removed') removed += 1;
      } catch {
        failed += 1;
      }
    }
  }

  return { removed, failed };
}

export async function runSoundFilePurgeIfEnabled(
  options: Partial<Pick<PurgeRemovedSoundFilesOptions, 'store' | 'batchSize'>> & {
    prisma: PrismaClient;
    env?: NodeJS.ProcessEnv;
  },
): Promise<SoundFilePurgeResult | null> {
  if (!soundFilePurgeEnabled(options.env)) return null;
  return purgeRemovedSoundFiles({
    prisma: options.prisma,
    store: options.store ?? soundsVolumeStore(),
    ...(options.batchSize !== undefined ? { batchSize: options.batchSize } : {}),
  });
}
