import type { FastifyInstance, FastifyRequest } from 'fastify';
import { readOpenCommunities, type OpenCommunity } from '../../services/profile-communities/open-communities';
import { ownerIsActive } from '../../services/profile-addresses/address-link-gate';
import { profileViewerId } from './profile-block-gate';

/**
 * La fiche chargée, avec « Ses communautés ouvertes » (#19274). Un propriétaire sans compte
 * actif n'en montre aucune ; aucune ⇒ le champ est ABSENT (le client se tait).
 */
export async function withOpenCommunities<T extends { id: string }>(
  fastify: FastifyInstance,
  request: FastifyRequest,
  row: T,
): Promise<T & { openCommunities?: OpenCommunity[] }> {
  const targetId = String(row.id);
  const viewerId = profileViewerId(request);
  const openCommunities = await readOpenCommunities(fastify.prisma, { viewerId, targetId });
  if (openCommunities.length === 0) return row;
  if (viewerId !== targetId && !(await ownerIsActive(fastify.prisma, targetId))) return row;
  return { ...row, openCommunities };
}
