import * as packsEndpoints from '@meeshy/shared/api/endpoints/packs';

import type { ConversationsDeps } from './conversations';
import { decodeDesignPackSummary, type DesignPackSummary } from '@/lib/profile-decor/pack-summary';
import { listOf, type PackPort } from './packs';

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

/**
 * L'état du domaine `wallpaper` chez CE serveur : `supported` dit s'il le
 * connaît (un ANCIEN serveur répond 404 — il ignorerait aussi un `PUT
 * appearance`, § 11), `slugs` les packs installés. `null` sur une panne : l'appelant
 * garde ses défauts sans conclure que le serveur est ancien.
 */
export type WallpaperInstallState = {
  readonly supported: boolean;
  readonly slugs: ReadonlySet<string>;
  /** Les résumés installés (origine, possession, adresse du contrat) : un pack officiel non embarqué ou tiers se peint depuis son contrat servi (#10737). */
  readonly packs: readonly DesignPackSummary[];
};

const decodeWallpaperSummary = decodeDesignPackSummary('wallpaper');

export async function loadWallpaperInstallState(deps: ConversationsDeps & { readonly signal?: AbortSignal }): Promise<WallpaperInstallState | null> {
  const result = await deps.transport.request<unknown>({
    method: 'GET',
    path: wallpaperPackPort.installed,
    ...(deps.signal === undefined ? {} : { signal: deps.signal }),
  });
  if (result.ok) return { supported: true, slugs: new Set(listOf(result.data, decodeRef).map((pack) => pack.slug)), packs: listOf(result.data, decodeWallpaperSummary) };
  return result.status === 404 ? { supported: false, slugs: new Set(), packs: [] } : null;
}

export const wallpaperInstalledQueryKey = ['packs', 'wallpaper', 'installed'] as const;
