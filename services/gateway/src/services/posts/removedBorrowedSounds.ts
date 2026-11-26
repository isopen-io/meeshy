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
 * la seule création : une édition d'un post qui le liait déjà garde ce qu'il
 * jouait, une republication garde ce que sa SOURCE jouait.
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

function borrowedSoundIds(storyEffects: unknown): string[] {
  const blob = asRecord(storyEffects);
  if (!blob) return [];
  return [...new Set(extractCaptureTracks(blob)
    .map((t) => t.soundId)
    .filter((id): id is string => Boolean(id)))];
}

type SoundsReader = { sound: Pick<PrismaClient['sound'], 'findMany'> };
type SourceReader = { post: Pick<PrismaClient['post'], 'findFirst'> };

/**
 * Le blob d'une publication NEUVE, sans les sons retirés de la bibliothèque.
 * Ne lit la base que si le blob emprunte au moins un son. `keep` : les sons
 * que la publication a le droit de garder (ceux que sa source liait déjà).
 */
export async function storyEffectsWithoutRemovedSounds(
  prisma: SoundsReader,
  storyEffects: Blob,
  keep: () => Promise<ReadonlySet<string>> = async () => new Set(),
): Promise<Blob> {
  const soundIds = borrowedSoundIds(storyEffects);
  if (soundIds.length === 0) return storyEffects;
  const removed = await prisma.sound.findMany({
    where: { id: { in: soundIds }, deletedAt: { not: null } },
    select: { id: true, deletedAt: true },
  });
  const removedIds = removed.filter((s) => s.deletedAt).map((s) => s.id);
  if (removedIds.length === 0) return storyEffects;
  const kept = await keep();
  return storyEffectsWithoutSounds(storyEffects, new Set(removedIds.filter((id) => !kept.has(id))));
}

/**
 * Le blob d'une publication passée par `createPost` : jamais de puce de crédit
 * (#10524) et aucun son retiré (#9853) — sauf, pour une republication, ceux
 * que la SOURCE liait déjà : le blob vient du client, qui peut y AJOUTER une
 * piste ; seule celle que la source jouait se garde. La source n'est relue
 * que si le blob emprunte un son retiré.
 */
export async function newPublicationStoryEffects(
  prisma: SoundsReader & SourceReader,
  storyEffects: Blob,
  options: { readonly repostOfId?: string },
): Promise<Blob> {
  const withoutCredits = storyEffectsWithoutCredits(storyEffects);
  const { repostOfId } = options;
  const linkedBySource = async (): Promise<ReadonlySet<string>> => {
    if (!repostOfId) return new Set();
    const source = await prisma.post.findFirst({ where: { id: repostOfId }, select: { storyEffects: true } });
    return new Set(borrowedSoundIds(source?.storyEffects));
  };
  return storyEffectsWithoutRemovedSounds(prisma, withoutCredits, linkedBySource);
}
