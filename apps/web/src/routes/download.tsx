import type { ReactNode } from 'react';

import '@/styles/site-chrome.css';

import { AuthAmbient } from '@/components/auth-chrome';
import { LANDING_COPY } from '@/landing/landing-copy';
import { AppleLogo, GooglePlayLogo } from '@/landing/store-logos';
import { LanguageSelect, SiteFooter, SiteHeader, type SitePage } from '@/landing/site-chrome';
import { translate, type InterfaceCatalogKey } from '@/lib/i18n-catalog';
import { appInstitutionalHref, appSiteHref } from '@/lib/institutional-href';
import { currentInterfaceLanguage, setInterfaceLanguage, type InterfaceLanguage } from '@/lib/interface-language';
import { APP_STORE_URL, GOOGLE_PLAY_URL } from '@/lib/store-links';

import { ActionLink } from './link-page-parts';

/**
 * **`/download` — LE PREMIER CONTACT AVEC MEESHY** (#7297, #8801).
 *
 * C'est l'adresse que l'app publiée envoie par SMS quand on invite quelqu'un
 * de son répertoire (`DiscoverViewModel.swift:285`,
 * `PhonebookViewModel.swift:282`) et que l'e-mail d'invitation cite
 * (`routes/invitations.ts`). L'adresse vit dans un binaire déjà distribué :
 * elle ne se corrige que ici.
 *
 * ## Une PAGE, pas une redirection vers l'App Store
 *
 * Le destinataire est sur un appareil INCONNU — l'expéditeur a choisi un
 * numéro, pas une plateforme. La page montre donc les DEUX plateformes côte à
 * côte, chacune avec son badge et ses captures (demande porteur 2026-09-30).
 *
 * ## Ce que chaque badge promet
 *
 * Les deux mènent à leur fiche RÉELLE, dont les adresses vivent dans
 * `lib/store-links.ts`, que la landing lit aussi (#15120).
 *
 * - **App Store** : `id6760208591` (lookup iTunes `bundleId=me.meeshy.app`).
 *   L'adresse d'avant, `apps.apple.com/app/meeshy`, rendait 404 — le seul
 *   geste de la page menait à une erreur.
 * - **Google Play** : la fiche de l'app Android NATIVE, `me.meeshy.app`,
 *   publique depuis qu'elle l'a reprise à la coque (#13619). Le badge disait
 *   « bientôt » et menait à la version web tant qu'aucune fiche n'existait.
 *
 * ## Les captures
 *
 * iOS : les captures App Store publiées, dans les sept langues
 * (`public/store-shots/ios/<langue>/`). Android : quatre vues de la coque web
 * — langue, Meeshy Global, story, amis — en clair et en sombre, dans les sept
 * langues (`public/store-shots/android/<langue>/`, #8804).
 *
 * Dans la coque, le serveur local ne porte pas ces fichiers (retirés par
 * `dropWebOnlyAssets`, `vite.config.ts`) : les captures s'y chargent depuis
 * l'origine publique, comme les pages institutionnelles (#8213).
 *
 * ## L'en-tête et le pied de meeshy.me (#10071)
 *
 * Ceux de la landing (`landing/site-chrome.tsx`), dans la langue de la page.
 * La page est TRADUITE : son sélecteur de langue la change sur place
 * (`setInterfaceLanguage`, retenu pour l'application), il ne renvoie pas vers
 * une landing. Leur feuille (`styles/site-chrome.css`) est importée ICI, dans
 * le morceau de cet écran — jamais dans `app.css`, que paie la première
 * peinture de toutes les autres adresses.
 */

const ASSET_ORIGIN = __SHELL__ ? 'https://meeshy.me' : '';

export type DownloadShot = { readonly src: string; readonly alt: InterfaceCatalogKey };
export type AndroidShot = DownloadShot & { readonly darkSrc: string };

const IOS_ALTS = [
  'download.shot.ios.1',
  'download.shot.ios.2',
  'download.shot.ios.3',
  'download.shot.ios.4',
  'download.shot.ios.5',
] as const satisfies readonly InterfaceCatalogKey[];

const ANDROID_ALTS = [
  'download.shot.android.1',
  'download.shot.android.2',
  'download.shot.android.3',
  'download.shot.android.4',
] as const satisfies readonly InterfaceCatalogKey[];

export function downloadShots(language: InterfaceLanguage): {
  readonly ios: readonly DownloadShot[];
  readonly android: readonly AndroidShot[];
} {
  return {
    ios: IOS_ALTS.map((alt, index) => ({ src: `/store-shots/ios/${language}/${index + 1}.webp`, alt })),
    android: ANDROID_ALTS.map((alt, index) => ({
      src: `/store-shots/android/${language}/${index + 1}.light.webp`,
      darkSrc: `/store-shots/android/${language}/${index + 1}.dark.webp`,
      alt,
    })),
  };
}

const SHOT_WIDTH = 400;
const SHOT_HEIGHT = 866;
const SHOT_CLASS = 'block h-auto w-36 rounded-[1.25rem] sm:w-40';

function ShotStrip({ label, children }: { readonly label: string; readonly children: ReactNode }) {
  return (
    <ul
      aria-label={label}
      className="-mx-5 flex snap-x snap-mandatory gap-3 overflow-x-auto px-5 pb-2"
      style={{ scrollbarWidth: 'thin' }}
    >
      {children}
    </ul>
  );
}

function ShotImage({ src, alt, eager }: { readonly src: string; readonly alt: string; readonly eager: boolean }) {
  return (
    <img
      src={`${ASSET_ORIGIN}${src}`}
      alt={alt}
      width={SHOT_WIDTH}
      height={SHOT_HEIGHT}
      loading={eager ? 'eager' : 'lazy'}
      decoding="async"
      className={SHOT_CLASS}
      style={{ boxShadow: '0 8px 24px color-mix(in srgb, var(--color-ios-ink) 14%, transparent)' }}
    />
  );
}

const BADGE_CLASS =
  // harmony-exempt: badge de magasin, noir et blanc imposés par Apple et Google
  'inline-flex h-[52px] items-center gap-2.5 rounded-xl px-4 text-start text-white outline-offset-2 focus-visible:outline-2';
// harmony-exempt: badge de magasin, noir et gris imposés par Apple et Google
const BADGE_STYLE = { background: '#000', border: '1px solid #a6a6a6', outlineColor: 'var(--color-ios-brand)' };

function BadgeText({ caption, name }: { readonly caption: string; readonly name: string }) {
  return (
    <span className="grid leading-none">
      <span className="text-[0.6875rem] tracking-wide">{caption}</span>
      <span className="text-[1.3125rem] font-semibold tracking-tight">{name}</span>
    </span>
  );
}

function PlatformCard({
  heading,
  badge,
  note,
  children,
}: {
  readonly heading: string;
  readonly badge: ReactNode;
  readonly note: string;
  readonly children: ReactNode;
}) {
  return (
    <section
      className="grid min-w-0 content-start gap-4 overflow-hidden rounded-3xl p-5"
      style={{
        background: 'var(--color-ios-card)',
        border: '1px solid color-mix(in srgb, var(--color-ios-ink-3) 22%, transparent)',
      }}
    >
      <h2 className="text-lg font-bold" style={{ color: 'var(--color-ios-ink)' }}>
        {heading}
      </h2>
      <div>{badge}</div>
      <p className="text-caption" style={{ color: 'var(--color-ios-ink-2)' }}>
        {note}
      </p>
      {children}
    </section>
  );
}

/** `/download` est un écran de l'application, servi sur place partout ; une page institutionnelle s'ouvre, dans la coque, sur l'origine publique (#8213). */
const sitePageHref = (page: SitePage): string => (page === 'download' ? '/download' : appInstitutionalHref(page));

const chooseLanguage = (language: InterfaceLanguage): void => {
  void setInterfaceLanguage(language);
};

export function DownloadPage({ language }: { readonly language: InterfaceLanguage }) {
  const t = (key: InterfaceCatalogKey) => translate(language, key);
  const shots = downloadShots(language);
  const copy = LANDING_COPY[language];
  return (
    <div className="relative flex h-dvh flex-col overflow-y-auto">
      <AuthAmbient />
      <SiteHeader
        language={language}
        copy={copy}
        onLanding={false}
        languageControl={<LanguageSelect language={language} label={copy.languageLabel} onSelect={chooseLanguage} />}
        siteHref={appSiteHref}
      />
      <main className="relative mx-auto grid w-full max-w-5xl grow content-start gap-8 px-4 py-10 sm:px-8 md:py-14">
        <header className="grid justify-items-center gap-3 text-center">
          <h1 className="text-screen font-bold" style={{ color: 'var(--color-ios-ink)' }}>
            {t('download.title')}
          </h1>
          <p className="max-w-md" style={{ color: 'var(--color-ios-ink-2)' }}>
            {t('download.body')}
          </p>
        </header>

        <div className="grid gap-5 md:grid-cols-2">
          <PlatformCard
            heading={t('download.ios.heading')}
            note={t('download.ios.note')}
            badge={
              <a
                href={APP_STORE_URL}
                target="_blank"
                rel="noopener noreferrer"
                data-store="app-store"
                aria-label={t('download.appStore')}
                className={BADGE_CLASS}
                style={BADGE_STYLE}
              >
                <AppleLogo />
                <BadgeText caption={t('download.badge.appStore.caption')} name="App Store" />
              </a>
            }
          >
            <ShotStrip label={t('download.shots.ios')}>
              {shots.ios.map((shot, index) => (
                <li key={shot.src} className="shrink-0 snap-start">
                  <ShotImage src={shot.src} alt={t(shot.alt)} eager={index < 2} />
                </li>
              ))}
            </ShotStrip>
          </PlatformCard>

          <PlatformCard
            heading={t('download.android.heading')}
            note={t('download.android.note')}
            badge={
              <a
                href={GOOGLE_PLAY_URL}
                target="_blank"
                rel="noopener noreferrer"
                data-store="google-play"
                aria-label={t('download.googlePlay')}
                className={BADGE_CLASS}
                style={BADGE_STYLE}
              >
                <GooglePlayLogo />
                <BadgeText caption={t('download.badge.googlePlay.caption')} name="Google Play" />
              </a>
            }
          >
            <ShotStrip label={t('download.shots.android')}>
              {shots.android.map((shot, index) => (
                <li key={shot.src} className="shrink-0 snap-start">
                  <picture>
                    <source media="(prefers-color-scheme: dark)" srcSet={`${ASSET_ORIGIN}${shot.darkSrc}`} />
                    <ShotImage src={shot.src} alt={t(shot.alt)} eager={index < 2} />
                  </picture>
                </li>
              ))}
            </ShotStrip>
          </PlatformCard>
        </div>

        <div className="mx-auto grid w-full max-w-sm gap-3 text-center">
          <ActionLink to="home" tone="primary">
            {t('download.web')}
          </ActionLink>
          <p className="text-caption" style={{ color: 'var(--color-ios-ink-3)' }}>
            {t('download.otherPlatforms')}
          </p>
        </div>

      </main>
      <SiteFooter language={language} copy={copy} onLanding={false} pageHref={sitePageHref} languageLinks={false} />
    </div>
  );
}

export default function DownloadScreen() {
  return <DownloadPage language={currentInterfaceLanguage()} />;
}
