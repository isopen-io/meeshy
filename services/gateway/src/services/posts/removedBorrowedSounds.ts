/**
 * #9853 — un son RETIRÉ de la bibliothèque (`Sound.deletedAt`, #9848) ne part
 * plus dans une publication NEUVE.
 *
 * `recordBorrowed` refusait déjà l'usage et le crédit, mais le blob
 * `storyEffects` transporte la piste elle-même (`soundId`, `mediaURL`) et la
 * lecture passe par cette adresse, que `GET /static/:filename` sert encore
 * pour que les posts existants continuent de jouer. Un client qui gardait sa
 * liste en cache publiait donc un post neuf qui jouait le son retiré.
 *
 * Le retrait est SILENCIEUX : la piste quitte le blob, la publication réussit.
 * Un ancien client ne voit rien échouer — il publie sans la piste. Appliqué à
 * la seule création : une édition ou une republication d'un post qui le liait
 * déjà garde ce qu'il jouait.
 *
 * Trois logements d'un son emprunté, les mêmes que `extractCaptureTracks` :
 * les `audioPlayerObjects` v1, les objets `audio` des scènes v3 et le son de
 * scène v3 `sound.source = { t: 'library', soundId }`.
 */

import type { PrismaClient } from '@meeshy/shared/prisma/client';
import { extractCaptureTracks } from './captureTracks';
import { isCanvasV3OrNewer } from './storyEffectsV3';
import { storyEffectsWithoutCredits } from './repostCreditChips';

type Blob = Record<string, unknown>;

function asRecord(value: unknown): Blob | undefined {
  return typeof value === 'object' && value !== null && !Array.isArray(value) ? (value as Blob) : undefined;
}

function borrows(track: unknown, removed: ReadonlySet<string>): boolean {
  const soundId = asRecord(track)?.['soundId'];
  return typeof soundId === 'string' && removed.has(soundId);
}

function withoutRemovedV3(canvas: Blob, removed: ReadonlySet<string>): Blob {
  const scenes = Array.isArray(canvas['scenes'])
    ? canvas['scenes'].map((scene) => {
        const record = asRecord(scene);
        if (!record || !Array.isArray(record['objects'])) return scene;
        return {
          ...record,
          objects: record['objects'].filter((o) => {
            const object = asRecord(o);
            return !(object?.['kind'] === 'audio' && borrows(object['payload'], removed));
          }),
        };
      })
    : canvas['scenes'];
  const source = asRecord(asRecord(canvas['sound'])?.['source']);
  const sceneSoundRemoved = source?.['t'] === 'library' && borrows(source, removed);
  const { sound, ...rest } = canvas;
  return {
    ...rest,
    ...(canvas['scenes'] !== undefined ? { scenes } : {}),
    ...(sound !== undefined && !sceneSoundRemoved ? { sound } : {}),
  };
}

/** Le blob sans les pistes qui empruntent un son de `removed`. PURE. */
export function storyEffectsWithoutSounds(storyEffects: Blob, removed: ReadonlySet<string>): Blob {
  if (removed.size === 0) return storyEffects;
  if (isCanvasV3OrNewer(storyEffects)) return withoutRemovedV3(storyEffects, removed);
  const tracks = storyEffects['audioPlayerObjects'];
  if (!Array.isArray(tracks)) return storyEffects;
  return { ...storyEffects, audioPlayerObjects: tracks.filter((t) => !borrows(t, removed)) };
}

/**
 * Le blob d'une publication NEUVE, sans les sons retirés de la bibliothèque.
 * Ne lit la base que si le blob emprunte au moins un son.
 */
export async function storyEffectsWithoutRemovedSounds(
  prisma: { sound: Pick<PrismaClient['sound'], 'findMany'> },
  storyEffects: Blob,
): Promise<Blob> {
  const soundIds = [...new Set(extractCaptureTracks(storyEffects)
    .map((t) => t.soundId)
    .filter((id): id is string => Boolean(id)))];
  if (soundIds.length === 0) return storyEffects;
  const removed = await prisma.sound.findMany({
    where: { id: { in: soundIds }, deletedAt: { not: null } },
    select: { id: true, deletedAt: true },
  });
  const ids = new Set(removed.filter((s) => s.deletedAt).map((s) => s.id));
  return storyEffectsWithoutSounds(storyEffects, ids);
}

/**
 * Le blob d'une publication passée par `createPost` : jamais de puce de crédit
 * (#10524) et, hors republication, aucun son retiré (#9853).
 */
export async function newPublicationStoryEffects(
  prisma: { sound: Pick<PrismaClient['sound'], 'findMany'> },
  storyEffects: Blob,
  options: { readonly isRepost: boolean },
): Promise<Blob> {
  const withoutCredits = storyEffectsWithoutCredits(storyEffects);
  if (options.isRepost) return withoutCredits;
  return storyEffectsWithoutRemovedSounds(prisma, withoutCredits);
}
