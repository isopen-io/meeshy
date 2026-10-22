import { apiConfig } from './config';

/**
 * L'ORIGINE de la passerelle, celle de la base d'API résolue : c'est sur elle
 * que s'adressent les fichiers de packs (`packAssets.byFile`, catalogue
 * `@meeshy/shared/api/endpoints/pack-assets`). Une base
 * malformée ne retombe JAMAIS sur l'origine de la PAGE : dans la coque
 * Capacitor elle vaudrait `https://localhost`, une origine qui composerait une
 * adresse FAUSSE plutôt qu'absente (#8385, même loi que `webOriginOf`) ; les
 * appelants dégradent proprement sur une origine vide.
 */
export const apiOrigin = (): string => {
  try {
    return new URL(apiConfig.base === '' ? location.href : apiConfig.base, location.href).origin;
  } catch {
    return '';
  }
};
