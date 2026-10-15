import { useQuery, useQueryClient } from '@tanstack/react-query';
import type { AppearanceDesign } from '@meeshy/shared/types/appearance-design';
import { useEffect, useState } from 'react';

import { bindAppearanceLive } from '@/lib/api/conversation-appearance';
import type { ConversationsDeps } from '@/lib/api/conversations';
import { apiDeps } from '@/lib/api/deps';
import { useColorScheme } from '@/lib/use-color-scheme';

import { useServedWallpapers } from './use-picker';
import { findServedDesign } from './wallpaper-served';

import { loadPhotoSource } from './photo-source';

/** Le schéma peint (`:root.light`), suivi quand l'utilisateur ou le système le bascule — aucun réglage propre au fond. */
export const useScheme = useColorScheme;

/** Une préférence d'accessibilité du système (`prefers-reduced-transparency`, `prefers-reduced-motion`). */
export function useMediaFlag(query: string): boolean {
  const [matches, setMatches] = useState(() => typeof window !== 'undefined' && typeof window.matchMedia === 'function' && window.matchMedia(query).matches);
  useEffect(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return undefined;
    const list = window.matchMedia(query);
    const onChange = (): void => setMatches(list.matches);
    onChange();
    list.addEventListener?.('change', onChange);
    return () => list.removeEventListener?.('change', onChange);
  }, [query]);
  return matches;
}

/**
 * Le dessin d'un modèle de pack — chargé À LA DEMANDE (le catalogue embarqué ne
 * pèse pas sur le démarrage). `undefined` tant qu'il n'est pas là : le fond
 * montre Signature, puis le dessin quand il arrive.
 */
export function useWallpaperDesign(ref: { readonly pack: string; readonly design: string } | null): AppearanceDesign | undefined {
  const [found, setFound] = useState<{ readonly key: string; readonly design: AppearanceDesign | undefined } | null>(null);
  const key = ref === null ? null : `${ref.pack}/${ref.design}`;
  useEffect(() => {
    if (ref === null || key === null) return undefined;
    let live = true;
    void import('./wallpaper-catalog').then(
      ({ findWallpaperDesign }) => {
        if (live) setFound({ key, design: findWallpaperDesign(ref.pack, ref.design) });
      },
      () => undefined,
    );
    return () => {
      live = false;
    };
  }, [key]); // eslint-disable-line react-hooks/exhaustive-deps -- `ref` n'est lu que par sa clé
  const builtin = found !== null && found.key === key ? found.design : undefined;
  /* Un modèle hors du JSON embarqué (officiel non embarqué, tiers) se peint depuis son contrat servi (#10737). */
  const settledWithoutBuiltin = found !== null && found.key === key && builtin === undefined;
  const served = useServedWallpapers(apiDeps, settledWithoutBuiltin);
  if (builtin !== undefined || ref === null || !settledWithoutBuiltin) return builtin;
  return findServedDesign({ installed: served.installed, contracts: served.contracts, pack: ref.pack, design: ref.design });
}

function preload(src: string, onDone: (ok: boolean) => void): () => void {
  if (typeof Image === 'undefined') {
    onDone(false);
    return () => undefined;
  }
  const image = new Image();
  image.onload = () => onDone(true);
  image.onerror = () => onDone(false);
  image.src = src;
  return () => {
    image.onload = null;
    image.onerror = null;
  };
}

/** Une heure : l'adresse d'une pièce ordinaire est stable ; la relire rattrape un départ de la conversation. */
const PHOTO_STALE_MS = 60 * 60 * 1000;

/**
 * La photo d'un fond, de la vignette à la pleine définition. `undefined` tant
 * que rien n'est lisible, et si la pièce a disparu ou n'est plus accessible :
 * le fond reste Signature, sans spinner ni erreur (§ 11). La source (galerie en
 * cache, sinon métadonnées) est une requête mise en cache : un fil rouvert la
 * relit sans réseau.
 */
export function useBackdropPhoto(params: { readonly conversationId: string; readonly attachmentId: string | null; readonly deps: ConversationsDeps }): string | undefined {
  const queryClient = useQueryClient();
  const { conversationId, attachmentId, deps } = params;
  const source = useQuery({
    queryKey: ['appearance', 'photo', conversationId, attachmentId ?? ''],
    queryFn: () => loadPhotoSource({ queryClient, deps, conversationId, attachmentId: attachmentId ?? '' }),
    enabled: attachmentId !== null,
    staleTime: PHOTO_STALE_MS,
  }).data;
  const thumb = source?.thumb ?? null;
  const full = source?.full ?? null;
  const [ready, setReady] = useState<{ readonly id: string; readonly src: string } | null>(null);
  useEffect(() => {
    if (attachmentId === null || full === null) return undefined;
    let live = true;
    let fullShown = false;
    const cancels: (() => void)[] = [];
    const show = (src: string): void => {
      if (live) setReady({ id: attachmentId, src });
    };
    if (thumb !== null) cancels.push(preload(thumb, (ok) => ok && !fullShown && show(thumb)));
    cancels.push(
      preload(full, (ok) => {
        if (!ok) return;
        fullShown = true;
        show(full);
      }),
    );
    return () => {
      live = false;
      for (const cancel of cancels) cancel();
    };
  }, [attachmentId, thumb, full]);
  return source === null || ready === null || ready.id !== attachmentId ? undefined : ready.src;
}

/** Un autre appareil du lecteur change le fond ou l'accent : la liste et le fil le relisent du cache. */
export function useAppearanceLive(enabled: boolean): void {
  const queryClient = useQueryClient();
  useEffect(() => {
    if (!enabled) return undefined;
    let live = true;
    let stop: (() => void) | null = null;
    void import('@/lib/api/realtime').then(
      ({ watchLiveSocket }) => {
        if (live) stop = watchLiveSocket((socket) => bindAppearanceLive({ socket, queryClient }));
      },
      () => undefined,
    );
    return () => {
      live = false;
      stop?.();
    };
  }, [enabled, queryClient]);
}
