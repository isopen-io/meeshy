import type { CallCaption } from './call-captions';
import { speakingPeers } from './call-speaking';

/**
 * **LA CAMÉRA COUPÉE DE L'AUTRE, EN DUO** (G4, #17567) — les décisions de la
 * scène noire, en lois pures : la durée du fondu image ↔ avatar (miroir de iOS
 * `CallRemoteVideoFade`, Android `CallRemoteVideoFade`) et le moment de l'anneau.
 */

/** G4.6 : une seule durée, pour l'image qui s'efface et pour l'anneau de parole. « Réduire les animations » garde le fondu, plus court, et ne déplace rien. */
export const cameraOffFadeMs = (reduceMotion: boolean): number => (reduceMotion ? 120 : 250);

/** G4.2 : l'anneau et le halo n'existent qu'à la parole, jamais au repos. Faute d'un niveau audio sur le web, « parle » se lit comme pour les compagnons : un segment de sous-titre encore en cours. */
export const peerSpeakingOnCameraOff = (captions: readonly CallCaption[], userId: string | undefined): boolean => userId !== undefined && speakingPeers(captions).has(userId);
