import { useEffect, useState } from 'react';

import type { AdminLanguage } from '@/lib/i18n-admin-catalog';
import type { PlaybackTextKey } from '@/lib/interface-catalogs/admin/analytics-playback-fr';

/**
 * **LES TEXTES DE L'ONGLET LECTURE, À LA DEMANDE** (#11280) — sortis du catalogue
 * d'administration (`interface_catalogs_admin`, que chaque écran de la console
 * télécharge) : seul l'onglet « Lecture » des statistiques les lit. Un `import()`
 * par langue, gardé en mémoire une fois chargé.
 */
export type PlaybackTexts = Readonly<Record<PlaybackTextKey, string>>;

const LOADERS: Readonly<Record<AdminLanguage, () => Promise<{ readonly default: PlaybackTexts }>>> = {
  fr: () => import('@/lib/interface-catalogs/admin/analytics-playback-fr'),
  en: () => import('@/lib/interface-catalogs/admin/analytics-playback-en'),
  es: () => import('@/lib/interface-catalogs/admin/analytics-playback-es'),
  pt: () => import('@/lib/interface-catalogs/admin/analytics-playback-pt'),
};

const loaded = new Map<AdminLanguage, PlaybackTexts>();

export function loadPlaybackTexts(language: AdminLanguage): Promise<PlaybackTexts> {
  const known = loaded.get(language);
  if (known !== undefined) return Promise.resolve(known);
  return LOADERS[language]().then(({ default: texts }) => {
    loaded.set(language, texts);
    return texts;
  });
}

/** Les textes de la langue, ou `null` le temps de leur chargement. */
export function usePlaybackTexts(language: AdminLanguage): PlaybackTexts | null {
  const [, setReady] = useState(0);
  useEffect(() => {
    if (loaded.has(language)) return undefined;
    const alive = { current: true };
    void loadPlaybackTexts(language).then(() => {
      if (alive.current) setReady((count) => count + 1);
    });
    return () => {
      alive.current = false;
    };
  }, [language]);
  return loaded.get(language) ?? null;
}

const PLACEHOLDER = /\{(\w+)\}/g;

export const playbackText = (texts: PlaybackTexts, key: PlaybackTextKey, params?: Readonly<Record<string, string>>): string =>
  params === undefined ? texts[key] : texts[key].replace(PLACEHOLDER, (whole, name: string) => params[name] ?? whole);
