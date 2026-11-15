import { withKeptSignal } from './app-alerts';
import { browserPhotoEnv, type PhotoEnv } from './env';

/**
 * L'ENVIRONNEMENT PHOTO DE L'APPLICATION (#9382) — UN seul, créé au premier
 * besoin : la base du carnet ne s'ouvre qu'au premier geste (`lazyBackend`),
 * et l'écran Progression ne paie rien tant que personne ne photographie. Garder une photo y signale l'étape
 * immortalisée au registre partagé (D22 b, `withKeptSignal`) : l'identifiant seul, jamais l'image.
 */
let shared: PhotoEnv | null = null;

export const appPhotoEnv = (): PhotoEnv => {
  shared ??= withKeptSignal(browserPhotoEnv());
  return shared;
};
