import { publicAppOrigin } from '../../routes/links/unfurl';

/**
 * L'avatar et la bannière de World Wide (#10204) : deux fichiers que
 * l'application web sert à des chemins FIXES, et que la conversation porte en
 * adresses ABSOLUES — un client natif ne connaît pas l'origine du site, et une
 * adresse relative y serait résolue contre la passerelle.
 *
 * L'origine est celle des liens de partage (`FRONTEND_URL` : `meeshy.me` en
 * production, `staging.meeshy.me` en staging), lue par `publicAppOrigin`.
 * La migration `2026-10-11-world-wide-avatar-banner.mongodb.js` porte les
 * MÊMES chemins pour les bases déjà semées.
 */
export const WORLD_AVATAR_PATH = '/brand/world-wide/avatar.png';
export const WORLD_BANNER_PATH = '/brand/world-wide/banner.png';

export type WorldBranding = { readonly avatar: string; readonly banner: string };

export function worldBranding(appOrigin: string = publicAppOrigin()): WorldBranding {
  const origin = publicAppOrigin(appOrigin);
  return { avatar: `${origin}${WORLD_AVATAR_PATH}`, banner: `${origin}${WORLD_BANNER_PATH}` };
}

/** Ce qui MANQUE à la ligne, et seulement ça : une image posée à la main n'est jamais remplacée. */
export function missingWorldBranding(
  row: { readonly avatar?: string | null; readonly banner?: string | null },
  branding: WorldBranding,
): Partial<WorldBranding> {
  return {
    ...(row.avatar ? {} : { avatar: branding.avatar }),
    ...(row.banner ? {} : { banner: branding.banner }),
  };
}
