/**
 * CE QUE J'ÉCOUTE OU REGARDE, EN DIRECT (#13934, PRE-04, RG-30) — squelette du contrat.
 *
 * L'émetteur envoie UNE fois l'état courant ; le serveur le TRONQUE pour chaque
 * destinataire selon le niveau effectif ET le consentement de l'émetteur pour lui :
 * - Proche (`listening.category`) : la catégorie seule — jamais titre ni origine ;
 * - Sang (`listening.title`, consentement explicite du rituel) : titre et origine ;
 * - sous Proche : rien.
 * Rien n'est gardé au-delà de l'état courant (cache à durée de vie ≤ 15 min, effacé à
 * la pause), jamais en base, jamais dans un journal ni une notification.
 */
import { z } from 'zod';

export const NOW_PLAYING_CATEGORIES = ['music', 'video', 'browsing'] as const;
export type NowPlayingCategory = (typeof NOW_PLAYING_CATEGORIES)[number];

/** L'état courant ne vit pas plus longtemps que ça sans être renouvelé. */
export const NOW_PLAYING_TTL_MS = 15 * 60_000;

export const nowPlayingUpdatePayloadSchema = z.object({
  category: z.enum(NOW_PLAYING_CATEGORIES),
  title: z.string().trim().min(1).max(200).optional(),
  source: z.string().trim().min(1).max(64).optional(),
}).strict();
export type NowPlayingUpdatePayload = z.infer<typeof nowPlayingUpdatePayloadSchema>;

/** Ce qu'UN destinataire reçoit : `title` et `source` n'existent que pour un Sang qui y a consenti. */
export type NowPlayingChangedEventData = {
  readonly userId: string;
  readonly category: NowPlayingCategory;
  readonly title?: string;
  readonly source?: string;
  readonly updatedAt: string;
};

export type NowPlayingClearedEventData = { readonly userId: string };
