import { MAX_POST_MEDIA } from '../types/attachment.js';

/**
 * LES PLAFONDS COMMUNS DU PARTAGE (D10, #10949, porteur 2026-10-18) — les
 * mêmes sur iOS (app et extension), sur le web et dans la coque Android :
 *
 * - `maxFiles` : un partage emporte au plus 20 fichiers ;
 * - `maxTotalBytes` : 500 Mo en tout (Mio, comme l'extension iOS l'a toujours
 *   compté — `ShareLimits.swift`) ;
 * - `maxRecipients` : 10 destinataires, publications comprises ;
 * - `maxPublicationMedia` : une publication porte au plus 10 médias — la borne
 *   que la passerelle applique déjà aux posts (`MAX_POST_MEDIA`), citée, jamais
 *   redite.
 *
 * Miroir Swift attendu : `ShareLimits` (extension) et l'écran de partage de
 * l'app lisent ces valeurs ; toute évolution touche les deux.
 */
export const SHARE_LIMITS = {
  maxFiles: 20,
  maxTotalBytes: 500 * 1024 * 1024,
  maxRecipients: 10,
  maxPublicationMedia: MAX_POST_MEDIA,
} as const;
