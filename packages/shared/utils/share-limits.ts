import { MAX_POST_MEDIA } from '../types/attachment.js';

/**
 * LES PLAFONDS COMMUNS DU PARTAGE (D10, #10949, porteur 2026-10-18 ; révisés
 * par le porteur le 2026-10-25, #12974 — 20 fichiers et 500 Mo auparavant) —
 * les mêmes sur iOS (app et extension), sur le web et dans la coque Android :
 *
 * - `maxFiles` : un partage emporte au plus 100 fichiers ;
 * - `maxTotalBytes` : 5 Go en tout (Gio, comme l'extension iOS compte —
 *   `ShareLimits.swift`).
 *
 * Ce sont des plafonds de PARTAGE, pas de la passerelle : un fichier y reste
 * borné par `UPLOAD_LIMITS` (4 Go, `types/attachment.ts`) et un message par
 * `MAX_ATTACHMENTS_PER_MESSAGE` (199) ;
 * - `maxRecipients` : 10 destinataires, publications comprises ;
 * - `maxPublicationMedia` : une publication porte au plus 10 médias — la borne
 *   que la passerelle applique déjà aux posts (`MAX_POST_MEDIA`), citée, jamais
 *   redite.
 *
 * Miroirs : `ShareLimits` (`SharePlan.swift`, iOS app et extension),
 * `ShareLimits.kt` (Android natif), `ShareIntentRules.java` (coque Android) et
 * `public/sw-share-target.js` (PWA) ; toute évolution les touche tous.
 */
export const SHARE_LIMITS = {
  maxFiles: 100,
  maxTotalBytes: 5 * 1024 * 1024 * 1024,
  maxRecipients: 10,
  maxPublicationMedia: MAX_POST_MEDIA,
} as const;
