/**
 * LA PRÉSENCE D'UN PACK SUR L'APPAREIL (#10148, § 5.10.6).
 */
import * as z from 'zod/mini';

/**
 * Où en sont les octets d'un pack sur CET appareil. Les transitions sont
 * écrites une fois par plateforme (`apps/web/src/lib/packs/presence.ts`,
 * `PackPresence.swift`) et rejouent les MÊMES vecteurs,
 * `packages/shared/design/packs/presence-vectors.json`. Un cadre ne se peint
 * que si son pack est `ready` ou `stale`.
 *
 * `queued.reason` : `network` attend le réseau ou son tour dans la file,
 * `wifi` attend un réseau non restreint, `user` attend un geste (annulé).
 * `failed.retryAt` : `next-session` (intégrité, jamais en boucle), `backoff`
 * (réseau), `space-freed` (plus de place).
 */
export const PACK_QUEUE_REASONS = ['network', 'wifi', 'user'] as const;
export const PACK_FAILURE_CAUSES = ['integrity', 'network', 'space'] as const;
export const PACK_RETRY_AT = ['next-session', 'backoff', 'space-freed'] as const;

export type PackPresence =
  | { readonly state: 'absent' }
  | { readonly state: 'queued'; readonly reason: (typeof PACK_QUEUE_REASONS)[number] }
  | { readonly state: 'downloading'; readonly doneBytes: number; readonly totalBytes: number }
  | { readonly state: 'ready'; readonly version: number }
  | { readonly state: 'stale'; readonly version: number; readonly next: number }
  | { readonly state: 'failed'; readonly cause: (typeof PACK_FAILURE_CAUSES)[number]; readonly retryAt: (typeof PACK_RETRY_AT)[number] };

const bytesSchema = z.int().check(z.minimum(0));
const versionSchema = z.int().check(z.minimum(1));

export const PackPresenceSchema = z.discriminatedUnion('state', [
  z.object({ state: z.literal('absent') }),
  z.object({ state: z.literal('queued'), reason: z.enum(PACK_QUEUE_REASONS) }),
  z
    .object({ state: z.literal('downloading'), doneBytes: bytesSchema, totalBytes: bytesSchema })
    .check(z.refine((p) => p.doneBytes <= p.totalBytes)),
  z.object({ state: z.literal('ready'), version: versionSchema }),
  z.object({ state: z.literal('stale'), version: versionSchema, next: versionSchema }).check(z.refine((p) => p.next > p.version)),
  z.object({ state: z.literal('failed'), cause: z.enum(PACK_FAILURE_CAUSES), retryAt: z.enum(PACK_RETRY_AT) }),
]);

/** Un cadre de ce pack peut-il se peindre ? */
export const isPackPaintable = (presence: PackPresence): boolean => presence.state === 'ready' || presence.state === 'stale';
