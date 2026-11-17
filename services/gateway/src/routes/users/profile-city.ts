import type { FastifyInstance, FastifyRequest } from 'fastify';
import type { RelationLevel } from '@meeshy/shared/types/relation';
import { isCityCircle, servedCity } from '@meeshy/shared/utils/profile-city';
import { readProfileCircleView } from '../../services/relations/profileCircleView';
import { profileViewerId } from './profile-block-gate';
import { logError } from '../../utils/logger';

type CityRow = { id: string; city?: string | null; cityCircle?: string | null };

/**
 * Ce que la ligne chargée devient une fois la VILLE décidée (#18862).
 *
 * `city` et `cityCircle` sont toujours RETIRÉS de la ligne, puis `city` n'est reposé que si le
 * cercle choisi par la personne le permet ; `cityCircle` (le réglage) ne part qu'à son
 * propriétaire. Un cercle PUBLIC ne demande aucune lecture de relation, et un lecteur sans
 * compte n'a jamais mieux que le niveau PUBLIC. Une lecture de relation qui échoue ferme la
 * VILLE seule : elle ne part pas, et la fiche reste servie (une donnée facultative ne fait pas
 * tomber la porte qui la porte).
 */
export async function withServedCity<T extends CityRow>(
  fastify: FastifyInstance,
  request: FastifyRequest,
  row: T,
): Promise<Omit<T, 'city' | 'cityCircle'> & { city?: string; cityCircle?: string | null }> {
  const { city, cityCircle, ...rest } = row;
  const viewerId = profileViewerId(request);
  const isSelf = viewerId !== undefined && viewerId === String(row.id);
  const needsRelation = !isSelf && viewerId !== undefined && isCityCircle(cityCircle) && cityCircle !== 'PUBLIC' && !!city;
  const viewerLevel: RelationLevel | null = needsRelation
    ? await readViewerLevel(fastify, { viewerId, targetId: String(row.id) })
    : 'PUBLIC';
  const served = viewerLevel === null ? null : servedCity({ city, cityCircle }, { isSelf, viewerLevel });
  return {
    ...rest,
    ...(served === null ? {} : { city: served }),
    ...(isSelf && 'cityCircle' in row ? { cityCircle: cityCircle ?? null } : {}),
  };
}

/** Le niveau du lecteur, ou `null` quand la loi d'accès ne répond pas : la ville se ferme alors. */
async function readViewerLevel(
  fastify: FastifyInstance,
  pair: { readonly viewerId: string; readonly targetId: string },
): Promise<RelationLevel | null> {
  try {
    return (await readProfileCircleView(fastify.prisma, pair)).level;
  } catch (error) {
    logError(fastify.log, '[PROFILE_CITY] relation read failed, city withheld', error);
    return null;
  }
}

/** « Voir comme » : la ville telle que la lirait un lecteur de ce cercle. */
export const cityAsReaderOf = (row: CityRow, level: RelationLevel): string | null =>
  servedCity({ city: row.city, cityCircle: row.cityCircle }, { isSelf: false, viewerLevel: level });
