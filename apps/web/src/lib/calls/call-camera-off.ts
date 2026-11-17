/**
 * **LA CAMÉRA COUPÉE DE L'AUTRE, EN DUO** (G4, #17567) — la durée du fondu image ↔ avatar, en loi pure (miroir de
 * iOS `CallRemoteVideoFade`, Android `CallRemoteVideoFade`). Le moment de l'anneau n'est plus une loi d'ici : la
 * parole se lit au niveau audio reçu, par la loi à hystérésis du duo audio (`call-speaking.ts` › `hearing`, mesurée
 * par `peer-audio-level.ts`), jamais dans les sous-titres (#17637).
 */

/** G4.6 : une seule durée, pour l'image qui s'efface et pour l'anneau de parole. « Réduire les animations » garde le fondu, plus court, et ne déplace rien. */
export const cameraOffFadeMs = (reduceMotion: boolean): number => (reduceMotion ? 120 : 250);
