import type { FastifyInstance, FastifyRequest } from 'fastify';
import type { RelationLevel } from '@meeshy/shared/types/relation';
import { ADDRESS_MAX_COUNT, isAddressCircle, servedAddresses, type AddressColumns, type ServedAddress } from '@meeshy/shared/utils/profile-addresses';
import { readProfileCircleView } from '../../services/relations/profileCircleView';
import { profileViewerId } from './profile-block-gate';

/**
 * Ce que la fiche chargée devient une fois ses ADRESSES décidées (#18863).
 *
 * Le propriétaire lit toutes ses adresses affichées (avec leur cercle) ; tout autre lecteur ne
 * reçoit que celles de son cercle, sans cercle, position ni clics. Aucune lecture de relation
 * quand aucune adresse n'en dépend (toutes publiques, ou lecteur sans compte). Une lecture qui
 * échoue lève : l'appelant ferme. Aucune adresse ⇒ le champ est ABSENT (ancien contrat intact).
 */
export async function withServedAddresses<T extends { id: string }>(
  fastify: FastifyInstance,
  request: FastifyRequest,
  row: T,
): Promise<T & { addresses?: ServedAddress[] }> {
  const targetId = String(row.id);
  const rows = (await fastify.prisma.profileAddress.findMany({
    where: { userId: targetId, isShown: true },
    orderBy: { position: 'asc' },
    take: ADDRESS_MAX_COUNT,
  })) as AddressColumns[];
  if (rows.length === 0) return row;
  const viewerId = profileViewerId(request);
  const isSelf = viewerId !== undefined && viewerId === targetId;
  const needsRelation = !isSelf && viewerId !== undefined && rows.some((r) => isAddressCircle(r.circle) && r.circle !== 'PUBLIC');
  const viewerLevel: RelationLevel = needsRelation
    ? (await readProfileCircleView(fastify.prisma, { viewerId, targetId })).level
    : 'PUBLIC';
  const addresses = servedAddresses(rows, { isSelf, viewerLevel });
  return addresses.length === 0 ? row : { ...row, addresses };
}
