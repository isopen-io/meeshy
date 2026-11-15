/**
 * L'ÉCOUTE PARTAGÉE — ce que j'écoute ou regarde arrive en direct à mes Proches (la
 * catégorie) et à mes Sangs (le titre et l'origine) (#13934, #16686 ; spec cercles
 * § 1.3, § 1.5, § 4).
 *
 * UN contrat, lu par la passerelle et par les trois clients :
 *
 * 1. `now-playing:update` {@link NowPlayingUpdatePayload} → accusé {@link NowPlayingAck} :
 *    l'émetteur envoie UNE fois l'état COMPLET. Le serveur le garde, scellé au repos,
 *    le temps de sa durée de vie ;
 * 2. chaque lecteur reçoit `now-playing:changed` ({@link NowPlayingChangedEventData}),
 *    TRONQUÉ à son niveau effectif et aux consentements de l'émetteur : rien sous
 *    Proche, la catégorie seule pour un Proche, le titre et l'origine pour un Sang
 *    qui a reçu ce partage au rituel ;
 * 3. `now-playing:clear` (pause, fin, app exclue) → `now-playing:cleared` ;
 * 4. quand un lien MONTE, le détail conservé remonte aussitôt chez le lecteur, sans
 *    nouvel envoi ; quand il baisse, qu'un blocage tombe ou qu'un partage est retiré,
 *    le lecteur reçoit `now-playing:cleared` ;
 * 5. `GET /relations/now-playing` rattrape, à la connexion, les états servis.
 *
 * Le web reçoit sans émettre. Ce qu'une plateforme ne sait pas lire est DIT par son
 * interface, jamais simulé.
 */
import { z } from 'zod';

import {
  NOW_PLAYING_CATEGORIES,
  NOW_PLAYING_SOURCE_MAX,
  NOW_PLAYING_TITLE_MAX,
  type NowPlayingCategory,
  type NowPlayingErrorCode,
} from './now-playing-constants.js';

export * from './now-playing-constants.js';

export const nowPlayingUpdatePayloadSchema = z
  .object({
    category: z.enum(NOW_PLAYING_CATEGORIES),
    title: z.string().trim().min(1).max(NOW_PLAYING_TITLE_MAX).optional(),
    source: z.string().trim().min(1).max(NOW_PLAYING_SOURCE_MAX).optional(),
  })
  .strict();
export type NowPlayingUpdatePayload = z.infer<typeof nowPlayingUpdatePayloadSchema>;

export type NowPlayingAck =
  | { readonly success: true; readonly data: { readonly expiresAt: string } }
  | { readonly success: false; readonly error: string; readonly code: NowPlayingErrorCode };

export type NowPlayingClearAck =
  | { readonly success: true }
  | { readonly success: false; readonly error: string; readonly code: NowPlayingErrorCode };

/**
 * Ce qu'UN lecteur reçoit. `title` et `source` ne sont PRÉSENTS que pour un lecteur qui
 * a le droit de les voir : pour un Proche, les clés n'existent pas (ni vides, ni nulles).
 */
export type NowPlayingChangedEventData = {
  readonly userId: string;
  readonly category: NowPlayingCategory;
  readonly title?: string;
  readonly source?: string;
  readonly updatedAt: string;
  readonly expiresAt: string;
};

export type NowPlayingClearedEventData = { readonly userId: string };

/** `GET /relations/now-playing` : les écoutes servies au lecteur, déjà tronquées. */
export type NowPlayingSnapshot = { readonly items: readonly NowPlayingChangedEventData[] };
