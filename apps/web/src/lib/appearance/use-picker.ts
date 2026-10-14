import { useQuery } from '@tanstack/react-query';
import { useEffect, useState } from 'react';

import type { ConversationsDeps } from '@/lib/api/conversations';
import { loadWallpaperInstallState, wallpaperInstalledQueryKey } from '@/lib/api/packs-wallpaper';
import { isAppearanceCatalogLoaded, loadAppearanceCatalog } from '@/lib/i18n-appearance-catalog';
import type { InterfaceLanguage } from '@/lib/interface-language';

import type { WallpaperNames, WallpaperPack } from './wallpaper-catalog';

/** Le catalogue des libellés du sélecteur (chargé avec la feuille, jamais au démarrage). */
export function useAppearanceCatalog(language: InterfaceLanguage): boolean {
  const [ready, setReady] = useState(() => isAppearanceCatalogLoaded(language));
  useEffect(() => {
    if (isAppearanceCatalogLoaded(language)) {
      setReady(true);
      return undefined;
    }
    let live = true;
    setReady(false);
    void loadAppearanceCatalog(language).then(
      () => live && setReady(true),
      () => undefined,
    );
    return () => {
      live = false;
    };
  }, [language]);
  return ready;
}

/**
 * Les packs de fonds MONTRÉS et leurs noms : le catalogue embarqué (à la
 * demande), filtré par ce que la passerelle déclare installé. Cache d'abord :
 * sans réponse (hors ligne, ancien serveur) le sélecteur montre les Essentiels.
 */
export function useWallpaperPacks(params: { readonly deps: ConversationsDeps; readonly language: InterfaceLanguage }): {
  readonly packs: readonly WallpaperPack[];
  readonly names: WallpaperNames | null;
  readonly supported: boolean | null;
} {
  const { deps, language } = params;
  const [loaded, setLoaded] = useState<{ readonly packs: readonly WallpaperPack[]; readonly names: WallpaperNames; readonly visible: (slugs: ReadonlySet<string>) => readonly WallpaperPack[] } | null>(null);
  useEffect(() => {
    let live = true;
    void Promise.all([import('./wallpaper-catalog'), import('./wallpaper-catalog').then((m) => m.loadWallpaperNames(language))]).then(
      ([catalog, names]) => live && setLoaded({ packs: catalog.WALLPAPER_PACKS, names, visible: catalog.visibleWallpaperPacks }),
      () => undefined,
    );
    return () => {
      live = false;
    };
  }, [language]);
  const state = useQuery({
    queryKey: wallpaperInstalledQueryKey,
    queryFn: () => loadWallpaperInstallState(deps),
    enabled: deps.source === 'gateway',
    staleTime: 60_000,
  });
  const slugs = state.data?.slugs ?? new Set<string>();
  return {
    packs: loaded === null ? [] : loaded.visible(slugs),
    names: loaded === null ? null : loaded.names,
    supported: deps.source !== 'gateway' ? true : state.data === undefined || state.data === null ? null : state.data.supported,
  };
}

/**
 * Le serveur sait-il enregistrer une apparence ? (§ 11) Oui s'il a servi la clé
 * `appearance` sur cette conversation, ou si `/packs/wallpaper` répond. Un
 * ANCIEN serveur ignorerait le `PUT` : l'entrée « Fond et couleur » ne se montre
 * alors pas (un contrôle sans effet n'existe pas). En attendant la réponse,
 * l'entrée reste cachée — jamais promise puis retirée.
 */
export function useAppearanceSupported(params: { readonly deps: ConversationsDeps; readonly servedKey: boolean }): boolean {
  const { deps, servedKey } = params;
  const state = useQuery({
    queryKey: wallpaperInstalledQueryKey,
    queryFn: () => loadWallpaperInstallState(deps),
    enabled: deps.source === 'gateway' && !servedKey,
    staleTime: 60_000,
  });
  if (deps.source !== 'gateway') return true;
  return servedKey || state.data?.supported === true;
}
