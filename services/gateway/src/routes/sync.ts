/**
 * Delta sync — coquille de ré-export.
 *
 * @deprecated L'implémentation vit dans `src/routes/sync/`.
 *
 * Ce fichier ne doit JAMAIS reprendre d'implémentation. `route-registration.ts`
 * importe `'./routes/sync'` (sans extension) — Node résout LOAD_AS_FILE avant
 * LOAD_AS_DIRECTORY, donc CE fichier gagne systématiquement sur
 * `routes/sync/index.ts` : sans cette coquille, le répertoire entier
 * deviendrait injoignable en silence (`__tests__/unit/routes/module-shadowing.test.ts`
 * garde cette paire ; `attachments.ts`, `users.ts`, `voice.ts` et
 * `communities.ts` portent le même patron — voir `communities.ts` pour le
 * récit du coût mesuré d'une scission inachevée : trois cycles de correctifs
 * atterris dans un répertoire que la production ne chargeait jamais).
 *
 * `routes/sync.ts` faisait 1035/1100 lignes avant l'issue #4171
 * (`SUPPORTED_COLLECTIONS` élargie à conversations/reactions/participants,
 * débit par compte) — extraction faite AVANT d'ajouter, par responsabilité :
 * codec de curseur (`cursor.ts`), budget de poids partagé (`budget.ts`),
 * identité (`identity.ts`), RLS + plancher d'historique partagés
 * (`membership.ts`), schémas de réponse partagés (`schema-shared.ts`), et une
 * collection par fichier (`messages.ts`, `conversations.ts`, `reactions.ts`,
 * `participants.ts`), orchestrées par `index.ts`.
 */

import type { FastifyRequest } from 'fastify';
import type { z } from 'zod';

export { SYNC_CHECKPOINT_LAG_MS, syncResponseSchema, syncRoutes, syncQuerySchema } from './sync/index';
export { SYNC_MAX_PAGE_BYTES } from './sync/budget';
export { type SyncCursor, encodeSyncCursor, decodeSyncCursor } from './sync/cursor';
export { SYNC_MESSAGE_RENDERABLE_KEYS, syncMessageSelect } from './sync/messages';

import { syncQuerySchema } from './sync/index';

// Fastify request typing helper for tests / callers that need the query shape.
export type SyncRequest = FastifyRequest<{
  Querystring: z.infer<typeof syncQuerySchema>;
}>;
