import * as packsEndpoints from '@meeshy/shared/api/endpoints/packs';

import type { ConversationsDeps } from './conversations';
import { listOf, loadInstalledOf, type PackDeps, type PackPort } from './packs';

/**
 * **LE DOMAINE `wallpaper` DU PORT GÉNÉRIQUE DES PACKS** (#10631, § 9) — la
 * boutique unique sert aussi les fonds de conversation : le sélecteur ne montre
 * que ce que le lecteur POSSÈDE et a INSTALLÉ (`/packs/wallpaper/installed`).
 * Les dessins des packs `builtin` sont embarqués (`appearance/wallpaper-catalog`) ;
 * le serveur ne dit ici que QUELS packs sont installés.
 *
 * Un ANCIEN serveur répond 404 : liste vide, le sélecteur se réduit à Signature,
 * la gamme et la photo (§ 11) — jamais une erreur.
 */
export type WallpaperPackRef = { readonly slug: string };

const decodeRef = (raw: unknown): WallpaperPackRef | null => {
  if (typeof raw !== 'object' || raw === null) return null;
  const slug = (raw as { readonly slug?: unknown }).slug;
  return typeof slug === 'string' && slug !== '' ? { slug } : null;
};

export const wallpaperPackPort: PackPort<WallpaperPackRef, WallpaperPackRef, WallpaperPackRef> = {
  catalogue: packsEndpoints.wallpaper,
  installed: packsEndpoints.wallpaperInstalled,
  bySlug: packsEndpoints.wallpaperBySlug,
  install: packsEndpoints.wallpaperBySlugInstall,
  decodeSummary: decodeRef,
  decodeInstalled: decodeRef,
  decodeDetail: decodeRef,
  absentMeansEmpty: true,
};

/** Les identifiants des packs de fonds installés, ou `null` quand la passerelle ne répond pas (le sélecteur garde alors les défauts). */
export async function loadInstalledWallpaperSlugs(deps: ConversationsDeps & { readonly signal?: AbortSignal }): Promise<ReadonlySet<string> | null> {
  const packDeps: PackDeps = deps;
  const result = await loadInstalledOf(wallpaperPackPort, packDeps);
  return result.ok ? new Set(listOf(result.data, decodeRef).map((pack) => pack.slug)) : null;
}

export const wallpaperInstalledQueryKey = ['packs', 'wallpaper', 'installed'] as const;
