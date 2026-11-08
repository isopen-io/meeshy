import { useEffect, useState } from 'react';
import { useStore } from 'zustand/react';

import type { NowPlayingCategory } from '@meeshy/shared/types/now-playing-constants';

import { isCirclesCatalogLoaded, loadCirclesCatalog, translateCircles } from '@/lib/i18n-circles-catalog';
import type { InterfaceLanguage } from '@/lib/interface-language';

import { listeningStore, type ListeningEntry, type ListeningStoreApi } from './listening-live';

/**
 * **LE BANDEAU QUI DÉFILE SUR L'AVATAR** (#16729, demande du porteur du
 * 2026-11-07) — ce qu'une personne écoute ou regarde, au détail que son cercle
 * ouvre : la CATÉGORIE pour un Proche, le TITRE et l'ORIGINE pour un Sang. Ce
 * détail ne se décide pas ici : il est ce que la passerelle a servi
 * (`now-playing:changed`, tronqué par lecteur), et un titre absent n'est jamais
 * deviné.
 */

export type ListeningBand = {
  /** Le glyphe de la catégorie, décoratif. */
  readonly glyph: string;
  /** Ce qui défile. */
  readonly text: string;
  /** Ce que le lecteur d'écran entend avec le nom de la personne. */
  readonly spoken: string;
};

const GLYPHS: Readonly<Record<NowPlayingCategory, string>> = { music: '🎵', video: '🎬', browsing: '🧭' };

const CATEGORY_KEYS = {
  music: 'listening.category.music',
  video: 'listening.category.video',
  browsing: 'listening.category.browsing',
} as const satisfies Readonly<Record<NowPlayingCategory, string>>;

export function listeningBandOf(entry: Pick<ListeningEntry, 'category' | 'title' | 'source'> | null, language: InterfaceLanguage): ListeningBand | null {
  if (entry === null) return null;
  const text =
    entry.title === undefined
      ? translateCircles(language, CATEGORY_KEYS[entry.category])
      : entry.source === undefined
        ? entry.title
        : `${entry.title} · ${entry.source}`;
  return { glyph: GLYPHS[entry.category], text, spoken: translateCircles(language, 'listening.spoken', { activity: text }) };
}

/**
 * L'écoute servie de cette personne, prête à peindre. Le catalogue des cercles ne
 * se charge QUE si quelqu'un écoute : un en-tête de conversation sans écoute n'en
 * paie rien.
 */
export function useListeningBand(userId: string | undefined, language: InterfaceLanguage, store: ListeningStoreApi = listeningStore): ListeningBand | undefined {
  const entry = useStore(store, (state) => (userId === undefined ? null : (state.byUser[userId] ?? null)));
  const [, setLoaded] = useState<InterfaceLanguage | null>(null);
  const ready = isCirclesCatalogLoaded(language);
  const listening = entry !== null;
  useEffect(() => {
    if (!listening || ready) return undefined;
    let live = true;
    loadCirclesCatalog(language).then(
      () => {
        if (live) setLoaded(language);
      },
      () => undefined,
    );
    return () => {
      live = false;
    };
  }, [listening, ready, language]);
  return ready ? (listeningBandOf(entry, language) ?? undefined) : undefined;
}
