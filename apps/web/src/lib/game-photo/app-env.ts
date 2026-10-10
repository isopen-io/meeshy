import { browserPhotoEnv, type PhotoEnv } from './env';

/**
 * L'ENVIRONNEMENT PHOTO DE L'APPLICATION (#9382) — UN seul, créé au premier
 * besoin : la base du carnet ne s'ouvre qu'au premier geste (`lazyBackend`),
 * et l'écran Progression ne paie rien tant que personne ne photographie.
 */
let shared: PhotoEnv | null = null;

export const appPhotoEnv = (): PhotoEnv => {
  shared ??= browserPhotoEnv();
  return shared;
};
