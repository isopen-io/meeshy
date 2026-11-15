import * as packAssetsEndpoints from '@meeshy/shared/api/endpoints/pack-assets';

/**
 * L'adresse d'un fichier de pack, seule : `lib/profile-decor` en a besoin dans
 * la première peinture du profil, alors que le magasin (`pack-asset-store`,
 * `dynamic_only` dans budgets.json) ne doit arriver que par `import()`.
 */
export const packAssetUrl = (src: string, origin: string): string => new URL(packAssetsEndpoints.byFile(src), origin).href;
