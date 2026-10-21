import { useState, useSyncExternalStore, type ChangeEvent, type ReactNode } from 'react';

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
import { Link } from '@/routes/route-table';

import { BrandMark } from './brand-mark';
import { GlobeGlyph } from './globe-glyph';

/**
 * L'EN-TÊTE DES PAGES PUBLIQUES DE L'APPLICATION (#10007, planche « Login ») —
 * la marque qui ramène à l'accueil et le sélecteur des sept langues
 * d'interface. La landing prérendue porte le même en-tête
 * (`landing/landing-page.tsx`), rendu sans script applicatif, et y ajoute
 * « Se connecter » ; les deux lisent les mêmes noms de langue
 * (`LANGUAGE_AUTONYMS`) et la même liste (`SUPPORTED_INTERFACE_LANGUAGES`).
 *
 * « Se connecter » n'est pas répété ici : la connexion est l'écran lui-même, et
 * l'inscription en porte déjà DEUX sorties — sa croix et « Déjà un compte ? »
 * (`auth-screens.test.tsx` les compte).
 *
 * La marque est celle des pages d'accès — les TROIS TRAITS (`BrandMark`), jamais
 * l'icône d'application (revue de #5555). La connexion la tait : elle porte déjà
 * la sienne dans sa colonne (planche « Login » : l'en-tête n'y a que la langue).
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

export function PublicHeader({
  language,
  brand = true,
  leading,
  languageChoice = !__SHELL__,
}: {
  readonly language: InterfaceLanguage;
  /** La marque vers l'accueil — tue sur la connexion, qui porte la sienne. */
  readonly brand?: boolean;
  /** Ce que l'écran pose AVANT la marque — la croix qui referme l'inscription (D-72). */
  readonly leading?: ReactNode;
  /**
   * Le sélecteur des langues d'interface — celui du SITE. Une coque installée
   * suit la langue de l'appareil (`inline-interface-language-bootstrap`) : le
   * porteur l'a jugé inutile sur Android (2026-10-14), il n'y paraît donc pas.
   */
  readonly languageChoice?: boolean;
}) {
  if (!languageChoice && !brand && leading === undefined) return null;
  return (
    <header data-public-header className="flex w-full shrink-0 items-center gap-1 px-2 pt-1">
      {leading}
      {brand ? (
        <Link
          to="home"
          data-public-home
          aria-label={translate(language, 'publicHeader.home')}
          className="grid place-items-center rounded-chip"
          style={{ minHeight: 44, minWidth: 44, color: 'var(--color-ios-ink)' }}
        >
          <BrandMark size={32} lineWidth={3} />
        </Link>
      ) : null}
      <span className="flex-1" />
      {languageChoice ? <InterfaceLanguageSelect language={language} /> : null}
    </header>
  );
}
