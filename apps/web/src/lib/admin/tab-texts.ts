import { useEffect, useState } from 'react';

import type { AdminLanguage } from '@/lib/i18n-admin-catalog';

/**
 * **LES TEXTES D'UN ONGLET, À LA DEMANDE** (#11280, #20618) — le site unique des
 * onglets des statistiques dont les textes vivent HORS du catalogue
 * d'administration (`interface_catalogs_admin`, que chaque écran de la console
 * télécharge) : un `import()` par langue, gardé en mémoire une fois chargé.
 */
type Loaders<K extends string> = Readonly<Record<AdminLanguage, () => Promise<{ readonly default: Readonly<Record<K, string>> }>>>;

export type TabTexts<K extends string> = Readonly<Record<K, string>>;

const PLACEHOLDER = /\{(\w+)\}/g;

export function lazyTabTexts<K extends string>(loaders: Loaders<K>) {
  const loaded = new Map<AdminLanguage, TabTexts<K>>();

  const load = (language: AdminLanguage): Promise<TabTexts<K>> => {
    const known = loaded.get(language);
    if (known !== undefined) return Promise.resolve(known);
    return loaders[language]().then(({ default: texts }) => {
      loaded.set(language, texts);
      return texts;
    });
  };

  /** Les textes de la langue, ou `null` le temps de leur chargement. */
  const use = (language: AdminLanguage): TabTexts<K> | null => {
    const [, setReady] = useState(0);
    useEffect(() => {
      if (loaded.has(language)) return undefined;
      const alive = { current: true };
      void load(language).then(() => {
        if (alive.current) setReady((count) => count + 1);
      });
      return () => {
        alive.current = false;
      };
    }, [language]);
    return loaded.get(language) ?? null;
  };

  const text = (texts: TabTexts<K>, key: K, params?: Readonly<Record<string, string>>): string =>
    params === undefined ? texts[key] : texts[key].replace(PLACEHOLDER, (whole, name: string) => params[name] ?? whole);

  return { load, use, text };
}
