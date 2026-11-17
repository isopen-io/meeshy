import { z } from 'zod';

/** Le corps FACULTATIF de `POST /communities/:id/join` (#19429) : par quelle porte on entre de soi-même. */
export const JoinCommunitySchema = z.object({
  via: z.enum(['self', 'link']).optional()
});
