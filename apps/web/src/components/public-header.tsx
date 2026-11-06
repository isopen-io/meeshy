import { useState, useSyncExternalStore, type ChangeEvent } from 'react';

import { LANGUAGE_AUTONYMS } from '@/landing/landing-languages';
import { translate } from '@/lib/i18n-catalog';
import { SUPPORTED_INTERFACE_LANGUAGES } from '@/lib/inline-interface-language-bootstrap.js';
import {
  currentInterfaceLanguage,
  interfaceLanguageOf,
  setInterfaceLanguage,
  subscribeInterfaceLanguage,
  type InterfaceLanguage,
} from '@/lib/interface-language';
import { GlobeGlyph } from './globe-glyph';

/**
 * LE SÉLECTEUR DES SEPT LANGUES D'INTERFACE ET SA LECTURE (#10007). L'en-tête
 * qui le porte est celui des pages d'accès (`auth-header.tsx`, #16452) ; la
 * landing prérendue rend le sien sans script applicatif
 * (`landing/landing-page.tsx`). Les deux lisent les mêmes noms de langue
 * (`LANGUAGE_AUTONYMS`) et la même liste (`SUPPORTED_INTERFACE_LANGUAGES`).
 *
 * Choisir une langue la RETIENT et l'APPLIQUE sans rechargement
 * (`setInterfaceLanguage` : catalogue chargé, `lang`/`dir` posés, choix
 * persisté, abonnés prévenus — la racine de l'application se redessine).
 */

/** La langue d'interface COURANTE, relue à chaque changement — l'écran qui la
 * lit se redessine dans la langue choisie sans attendre la racine. */
export function useInterfaceLanguage(): InterfaceLanguage {
  return useSyncExternalStore(subscribeInterfaceLanguage, currentInterfaceLanguage, currentInterfaceLanguage);
}

/**
 * Le choix se MONTRE tout de suite (Optimistic Updates) : le catalogue de la
 * langue se charge avant qu'elle ne soit posée, et un `<select>` contrôlé par
 * la seule langue posée revenait à l'ancienne le temps du chargement. Un
 * chargement refusé (hors ligne, morceau introuvable) rend la langue posée,
 * sans rejet laissé sans réponse.
 */
export function InterfaceLanguageSelect({ language }: { readonly language: InterfaceLanguage }) {
  const [pending, setPending] = useState<InterfaceLanguage | null>(null);
  const shown = pending ?? language;

  function choose(event: ChangeEvent<HTMLSelectElement>) {
    const chosen = interfaceLanguageOf(event.currentTarget.value);
    if (chosen === null || chosen === shown) return;
    const settle = () => setPending((current) => (current === chosen ? null : current));
    setPending(chosen === language ? null : chosen);
    setInterfaceLanguage(chosen).then(settle, settle);
  }

  return (
    <label
      className="flex shrink-0 items-center gap-1.5 rounded-full px-3 text-caption"
      style={{
        minHeight: 44,
        backgroundColor: 'var(--color-ios-card)',
        border: '0.5px solid var(--color-edge)',
        color: 'var(--color-ios-ink-2)',
      }}
    >
      <GlobeGlyph size={16} />
      <span className="sr-only">{translate(language, 'publicHeader.language')}</span>
      <select
        data-interface-language
        value={shown}
        onChange={choose}
        className="bg-transparent text-input font-semibold outline-none"
        style={{ color: 'var(--color-ios-ink)', minHeight: 44 }}
      >
        {SUPPORTED_INTERFACE_LANGUAGES.map((code) => (
          <option key={code} value={code} lang={code}>
            {LANGUAGE_AUTONYMS[code]}
          </option>
        ))}
      </select>
    </label>
  );
}
