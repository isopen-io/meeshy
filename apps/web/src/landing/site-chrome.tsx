import type { ReactNode } from 'react';

import { BRAND_LOGO_PATH } from '@/lib/brand';

import type { LandingCopy } from './landing-copy';
import { LANDING_LANGUAGES, LANGUAGE_AUTONYMS, landingPath, type LandingLanguage } from './landing-languages';

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
 * landing, les ancres (`#comment`, `#rejoindre`) sont dans la page et le script
 * de la landing (`landingBoot`) les anime ; ailleurs, elles visent la landing
 * de la langue de la page, où le formulaire d'entrée sans compte les attend.
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
          <>
            <a href="#rejoindre" className="ld-btn ld-btn--primary" data-session-visitor data-world-entry data-world-cta>
              {copy.enterWithoutAccount}
            </a>
            <a href="/chats" className="ld-btn ld-btn--primary" data-session-member data-my-conversations>
              {copy.myConversations}
            </a>
          </>
        ) : (
          <a href={anchor('rejoindre')} className="ld-btn ld-btn--primary">
            {copy.enterWithoutAccount}
          </a>
        )}
      </div>
    </header>
  );
}

/**
 * LE SÉLECTEUR D'UN DOCUMENT QUI SAIT CHANGER DE LANGUE — la landing (son
 * script suit `data-landing-language`) et `/download` (traduite, qui passe
 * `onSelect` : la page change de langue sur place).
 */
export function LanguageSelect({
  language,
  copy,
  onSelect,
}: {
  readonly language: LandingLanguage;
  readonly copy: LandingCopy;
  readonly onSelect?: (language: LandingLanguage) => void;
}) {
  const options = LANDING_LANGUAGES.map((code) => (
    <option key={code} value={code} lang={code}>
      {LANGUAGE_AUTONYMS[code]}
    </option>
  ));
  return (
    <label className="ld-language">
      <GlobeIcon size={16} />
      <span className="ld-sr">{copy.languageLabel}</span>
      {onSelect === undefined ? (
        <select data-landing-language defaultValue={language}>
          {options}
        </select>
      ) : (
        <select
          data-download-language
          value={language}
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
