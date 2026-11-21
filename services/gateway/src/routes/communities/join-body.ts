import { z } from 'zod';

/**
 * Le corps FACULTATIF de `POST /communities/:id/join` (#19429) : par quelle
 * porte on entre de soi-même, et si le client sait lire une demande en
 * attente (202 `{ status: 'pending', requestId }`). Sans `acceptsPending`, une
 * communauté qui valide chaque entrée répond 409 `COMMUNITY_JOIN_PENDING`.
 */
export const JoinCommunitySchema = z.object({
  via: z.enum(['self', 'link']).optional(),
  acceptsPending: z.boolean().optional()
});
