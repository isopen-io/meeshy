import { useQueryClient } from '@tanstack/react-query';
import type { AppearanceDesign } from '@meeshy/shared/types/appearance-design';
import { useEffect, useState } from 'react';

import { bindAppearanceLive } from '@/lib/api/conversation-appearance';
import { currentScheme, type ColorScheme } from '@/lib/scheme';

import { photoSourceOf } from './photo-source';

/** Le schéma peint (`:root.light`), suivi quand l'utilisateur ou le système le bascule — aucun réglage propre au fond. */
export function useScheme(): ColorScheme {
  const [scheme, setScheme] = useState<ColorScheme>(() => (typeof document === 'undefined' ? 'dark' : currentScheme()));
  useEffect(() => {
    if (typeof document === 'undefined' || typeof MutationObserver === 'undefined') return undefined;
    const observer = new MutationObserver(() => setScheme(currentScheme()));
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });
    setScheme(currentScheme());
    return () => observer.disconnect();
  }, []);
  return scheme;
}

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
  return found !== null && found.key === key ? found.design : undefined;
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

/**
 * La photo d'un fond, de la vignette à la pleine définition. `undefined` tant
 * que rien n'est lisible, et si la pièce a disparu ou n'est plus accessible :
 * le fond reste Signature, sans spinner ni erreur (§ 11).
 */
export function useBackdropPhoto(params: { readonly conversationId: string; readonly attachmentId: string | null }): string | undefined {
  const queryClient = useQueryClient();
  const { conversationId, attachmentId } = params;
  const [ready, setReady] = useState<{ readonly id: string; readonly src: string } | null>(null);
  useEffect(() => {
    if (attachmentId === null) return undefined;
    const source = photoSourceOf(queryClient, conversationId, attachmentId);
    let live = true;
    const cancels: (() => void)[] = [];
    const show = (src: string): void => {
      if (live) setReady({ id: attachmentId, src });
    };
    if (source.thumb !== null) cancels.push(preload(source.thumb, (ok) => ok && show(source.thumb ?? '')));
    cancels.push(preload(source.full, (ok) => ok && show(source.full)));
    return () => {
      live = false;
      for (const cancel of cancels) cancel();
    };
  }, [queryClient, conversationId, attachmentId]);
  return ready !== null && ready.id === attachmentId ? ready.src : undefined;
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
