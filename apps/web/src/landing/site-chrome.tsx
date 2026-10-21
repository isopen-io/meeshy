import type { ReactNode } from 'react';

import { getLanguageInfo } from '@meeshy/shared/utils/languages';

import { BRAND_LOGO_PATH } from '@/lib/brand';

import type { LandingCopy } from './landing-copy';
import { LANDING_LANGUAGES, LANGUAGE_AUTONYMS, landingDirection, landingPath, type LandingLanguage } from './landing-languages';

/**
 * L'EN-TÊTE ET LE PIED DE meeshy.me (#10071) — posés par la landing (#10002),
 * portés par toutes les pages statiques : les sept pages institutionnelles
 * (prérendues) et `/download` (écran de l'application).
 *
 * Trois rendus, un markup : `react-dom/server` dans les deux prérendus, Preact
 * (alias de `react`) dans l'application. Le composant ne lit ni session, ni
 * réseau, ni magasin ; sa feuille est `src/styles/site-chrome.css`, importée
 * par chacune des trois feuilles qui le servent (`landing.css`,
 * `institutional.css`, et l'écran `/download` lui-même — jamais `app.css` : la
 * première peinture de l'application ne paie pas un en-tête qu'elle ne rend pas).
 *
 * `onLanding` distingue la seule chose qui change d'un hôte à l'autre : sur la
 * landing, les ancres (`#comment`, `#world`) sont dans la page ; ailleurs, elles
 * visent la landing de la langue de la page. Aucune porte « Entrer sans
 * compte » : l'entrée anonyme dans World Wide ne passe plus que par le QR de la
 * landing, flashé vers `/world` (#10784).
 * « Mes conversations » n'existe que sur la landing : c'est son script qui
 * reconnaît un compte avant la première peinture, et les pages statiques n'en
 * portent aucun — un compte y voit « Se connecter », que `/login` résout.
 */
export const GlobeIcon = ({ size }: { readonly size: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden="true">
    <circle cx="12" cy="12" r="9" />
    <path d="M3 12h18M12 3c2.5 2.6 3.8 5.6 3.8 9s-1.3 6.4-3.8 9c-2.5-2.6-3.8-5.6-3.8-9S9.5 5.6 12 3z" />
  </svg>
);

export type SiteHeaderProps = {
  readonly language: LandingLanguage;
  readonly copy: LandingCopy;
  readonly onLanding: boolean;
  readonly languageControl: ReactNode;
};

export function SiteHeader({ language, copy, onLanding, languageControl }: SiteHeaderProps) {
  const anchor = (id: string): string => (onLanding ? `#${id}` : `${landingPath(language)}#${id}`);
  return (
    <header className="ld-header">
      <div className="ld-wrap ld-bar">
        <a href={landingPath(language)} className="ld-brand">
          <img src={BRAND_LOGO_PATH} alt="" width={36} height={36} />
          <span className="ld-wordmark">Meeshy</span>
        </a>
        <nav className="ld-nav" aria-label={copy.navLabel}>
          <a href={anchor('comment')}>{copy.navHow}</a>
          <a href={anchor('world')}>{copy.navWorld}</a>
          <a href="/faq">{copy.navFaq}</a>
        </nav>
        <span className="ld-spacer" />
        {languageControl}
        <a href="/login" className="ld-btn ld-btn--ghost" data-session-visitor>
          {copy.signIn}
        </a>
        {onLanding ? (
          <a href="/chats" className="ld-btn ld-btn--primary" data-session-member data-my-conversations>
            {copy.myConversations}
          </a>
        ) : null}
      </div>
    </header>
  );
}

/**
 * LA LISTE DÉROULANTE DES LANGUES — un `<select>` natif dans sa pastille : la
 * liste est celle du navigateur ou du système (flottante, au clavier, au
 * lecteur d'écran, sur mobile, de droite à gauche), sans une ligne de script
 * pour l'ouvrir. Deux usages, un markup :
 *
 * - `purpose: 'page'` (défaut) — la langue de la PAGE : la landing (son script
 *   suit `data-landing-language`) et `/download` (traduite, qui passe
 *   `onSelect` : la page change de langue sur place) ;
 * - `purpose: 'reading'` (#10098) — la langue de LECTURE dans World Wide, posée
 *   avant « Entrer » sur `/world` (`onSelect`). Elle ne change pas la page. Chaque option
 *   commence par son drapeau (`getLanguageInfo(code).flag`, la source unique) :
 *   la pastille montre donc celui de la langue choisie à la place du globe,
 *   sans une ligne de script pour le suivre.
 */
export type LanguageSelectProps = {
  readonly language: LandingLanguage;
  /** Le nom accessible de la liste. */
  readonly label: string;
  readonly onSelect?: (language: LandingLanguage) => void;
  readonly purpose?: 'page' | 'reading';
  readonly describedBy?: string;
};

export function LanguageSelect({ language, label, onSelect, purpose = 'page', describedBy }: LanguageSelectProps) {
  const reading = purpose === 'reading';
  const options = LANDING_LANGUAGES.map((code) => (
    <option
      key={code}
      value={code}
      lang={code}
      dir={landingDirection(code) === 'rtl' ? 'rtl' : undefined}
    >
      {reading ? `${getLanguageInfo(code).flag} ${LANGUAGE_AUTONYMS[code]}` : LANGUAGE_AUTONYMS[code]}
    </option>
  ));
  const marker = reading
    ? { name: 'language', 'data-world-language': true }
    : onSelect === undefined
      ? { 'data-landing-language': true }
      : { 'data-download-language': true };
  return (
    <label className="ld-language">
      {reading ? null : <GlobeIcon size={16} />}
      <span className="ld-sr">{label}</span>
      {onSelect === undefined ? (
        <select {...marker} defaultValue={language} aria-describedby={describedBy}>
          {options}
        </select>
      ) : (
        <select
          {...marker}
          value={language}
          aria-describedby={describedBy}
          onChange={(event) => {
            const chosen = LANDING_LANGUAGES.find((code) => code === event.currentTarget.value);
            if (chosen !== undefined) onSelect(chosen);
          }}
        >
          {options}
        </select>
      )}
    </label>
  );
}

/**
 * LE SÉLECTEUR DES PAGES QUI NE SONT PAS TRADUITES (#10071) — les sept pages
 * institutionnelles, rédigées en français seulement.
 *
 * Il ne PRÉTEND pas traduire la page : chaque langue est un LIEN vers la
 * landing de cette langue, nommé par son autonyme et marqué `hreflang`, et il
 * fonctionne sans script (`<details>`), comme la page qui le porte. Choisir
 * « English » sur « Confidentialité » mène à meeshy.me/en, jamais à une
 * politique de confidentialité qui n'existe pas en anglais.
 */
export function LanguageMenu({ language, copy }: { readonly language: LandingLanguage; readonly copy: LandingCopy }) {
  return (
    <details className="ld-language-menu">
      <summary className="ld-language">
        <GlobeIcon size={16} />
        <span className="ld-sr">{copy.languageLabel}</span>
        <span lang={language}>{LANGUAGE_AUTONYMS[language]}</span>
      </summary>
      <ul>
        {LANDING_LANGUAGES.map((code) => (
          <li key={code}>
            <a href={landingPath(code)} hrefLang={code} lang={code}>
              {LANGUAGE_AUTONYMS[code]}
            </a>
          </li>
        ))}
      </ul>
    </details>
  );
}

const FOOTER_PAGES = ['about', 'help', 'faq', 'contact', 'partners', 'privacy', 'terms', 'download'] as const;

export type SitePage = (typeof FOOTER_PAGES)[number];

export type SiteFooterProps = {
  readonly language: LandingLanguage;
  readonly copy: LandingCopy;
  /** Sur la landing, le lien de sa propre langue est la page courante (`aria-current`) ; ailleurs, aucun ne l'est. */
  readonly onLanding: boolean;
  /** L'adresse d'une page statique : `/<page>` sur le web, l'origine publique dans la coque. */
  readonly pageHref?: (page: SitePage) => string;
  /** La rangée des landings par langue — absente là où l'en-tête change déjà la langue de la page. */
  readonly languageLinks?: boolean;
  readonly children?: ReactNode;
};

export function SiteFooter({ language, copy, onLanding, pageHref = (page) => `/${page}`, languageLinks = true, children }: SiteFooterProps) {
  return (
    <footer className="ld-footer">
      <div className="ld-wrap ld-footer-row">
        <span className="ld-footer-name">Meeshy</span>
        <nav aria-label={copy.footerLabel}>
          {FOOTER_PAGES.map((page) => (
            <a key={page} href={pageHref(page)}>
              {copy[page]}
            </a>
          ))}
        </nav>
        <span className="ld-spacer" />
        {languageLinks ? (
          <nav aria-label={copy.languageLabel}>
            {LANDING_LANGUAGES.map((code) => (
              <a key={code} href={landingPath(code)} hrefLang={code} lang={code} {...(onLanding && code === language ? { 'aria-current': 'page' as const } : {})}>
                {LANGUAGE_AUTONYMS[code]}
              </a>
            ))}
          </nav>
        ) : null}
        <span>© Meeshy</span>
      </div>
      {children}
    </footer>
  );
}
