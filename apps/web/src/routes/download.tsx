import type { ReactNode } from 'react';

import { AuthAmbient, AuthTitle } from '@/components/auth-chrome';
import { translate, type InterfaceCatalogKey } from '@/lib/i18n-catalog';
import { appInstitutionalHref, type InstitutionalPage } from '@/lib/institutional-href';
import { currentInterfaceLanguage, type InterfaceLanguage } from '@/lib/interface-language';
import { Link } from '@/routes/route-table';

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
 * - **App Store** : la fiche RÉELLE, `id6760208591` (lookup iTunes
 *   `bundleId=me.meeshy.app`). L'adresse d'avant, `apps.apple.com/app/meeshy`,
 *   rendait 404 — le seul geste de la page menait à une erreur.
 * - **Google Play** : la coque Android n'est pas encore publiée. Le badge
 *   reste visible (le visiteur Android doit se reconnaître), dit « bientôt »,
 *   et mène à la version web — jamais à `play.google.com`, dont la fiche
 *   n'existe pas. Le jour de la publication, c'est `GOOGLE_PLAY_HREF` et une
 *   clé de catalogue.
 *
 * ## Les captures
 *
 * iOS : les captures App Store publiées, dans les sept langues
 * (`public/store-shots/ios/<langue>/`). Android : les vues de la coque web
 * (`public/store-shots/android/<langue>/`, clair et sombre), en français,
 * anglais et arabe ; les autres langues retombent sur l'anglais.
 *
 * Dans la coque, le serveur local ne porte pas ces fichiers (retirés par
 * `dropWebOnlyAssets`, `vite.config.ts`) : les captures s'y chargent depuis
 * l'origine publique, comme les pages institutionnelles (#8213).
 */

export const APP_STORE_URL = 'https://apps.apple.com/app/id6760208591';

const ASSET_ORIGIN = __SHELL__ ? 'https://meeshy.me' : '';

const ANDROID_SHOT_LANGUAGES: readonly InterfaceLanguage[] = ['fr', 'en', 'ar'];

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
  const androidLanguage = ANDROID_SHOT_LANGUAGES.includes(language) ? language : 'en';
  return {
    ios: IOS_ALTS.map((alt, index) => ({ src: `/store-shots/ios/${language}/${index + 1}.webp`, alt })),
    android: ANDROID_ALTS.map((alt, index) => ({
      src: `/store-shots/android/${androidLanguage}/${index + 1}.light.webp`,
      darkSrc: `/store-shots/android/${androidLanguage}/${index + 1}.dark.webp`,
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

function AppleLogo() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" width="26" height="26" fill="currentColor">
      <path d="M12.152 6.896c-.948 0-2.415-1.078-3.96-1.04-2.04.027-3.91 1.183-4.961 3.014-2.117 3.675-.546 9.103 1.519 12.09 1.013 1.454 2.208 3.09 3.792 3.039 1.52-.065 2.09-.987 3.935-.987 1.831 0 2.35.987 3.96.948 1.637-.026 2.676-1.48 3.676-2.948 1.156-1.688 1.636-3.325 1.662-3.415-.039-.013-3.182-1.221-3.22-4.857-.026-3.04 2.48-4.494 2.597-4.559-1.429-2.09-3.623-2.324-4.39-2.376-2-.156-3.675 1.09-4.61 1.09zM15.53 3.83c.843-1.012 1.4-2.427 1.245-3.83-1.207.052-2.662.805-3.532 1.818-.78.896-1.454 2.338-1.273 3.714 1.338.104 2.715-.688 3.559-1.701" />
    </svg>
  );
}

function GooglePlayLogo() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" width="24" height="24">
      <path fill="#4285F4" d="M3.61 1.81 13.4 12 3.61 22.19C3.24 22 3 21.6 3 21.1V2.9c0-.5.24-.9.61-1.09Z" />
      <path fill="#34A853" d="M3.61 1.81c.36-.19.82-.18 1.27.08l11.72 6.73L13.4 12Z" />
      <path fill="#EA4335" d="M3.61 22.19 13.4 12l3.2 3.38-11.72 6.73c-.45.26-.91.27-1.27.08Z" />
      <path fill="#FBBC04" d="m16.6 8.62 3.8 2.18c.9.52.9 1.88 0 2.4l-3.8 2.18L13.4 12Z" />
    </svg>
  );
}

const BADGE_CLASS =
  'inline-flex h-[52px] items-center gap-2.5 rounded-xl px-4 text-start text-white outline-offset-2 focus-visible:outline-2';
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
  soon,
  badge,
  note,
  children,
}: {
  readonly heading: string;
  readonly soon?: string;
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
      <div className="flex items-center gap-2">
        <h2 className="text-lg font-bold" style={{ color: 'var(--color-ios-ink)' }}>
          {heading}
        </h2>
        {soon === undefined ? null : (
          <span
            className="rounded-full px-2.5 py-0.5 text-caption font-semibold"
            style={{
              color: 'var(--color-ios-brand)',
              background: 'color-mix(in srgb, var(--color-ios-brand) 14%, transparent)',
            }}
          >
            {soon}
          </span>
        )}
      </div>
      <div>{badge}</div>
      <p className="text-caption" style={{ color: 'var(--color-ios-ink-2)' }}>
        {note}
      </p>
      {children}
    </section>
  );
}

const FOOTER_PAGES = ['about', 'help', 'faq', 'contact', 'privacy', 'terms'] as const satisfies readonly InstitutionalPage[];

export function DownloadPage({ language }: { readonly language: InterfaceLanguage }) {
  const t = (key: InterfaceCatalogKey) => translate(language, key);
  const shots = downloadShots(language);
  return (
    <div
      lang={language}
      dir={language === 'ar' ? 'rtl' : 'ltr'}
      className="relative flex h-dvh flex-col items-center overflow-y-auto pt-safe pb-safe"
    >
      <AuthAmbient />
      <main className="relative grid w-full max-w-5xl gap-8 px-4 py-10 sm:px-8">
        <header className="grid justify-items-center gap-3 text-center">
          <AuthTitle gradient="brand" />
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
            soon={t('download.android.soon')}
            note={t('download.android.note')}
            badge={
              <Link
                to="list"
                data-store="google-play"
                aria-label={t('download.android.badge')}
                className={BADGE_CLASS}
                style={BADGE_STYLE}
              >
                <GooglePlayLogo />
                <BadgeText caption={t('download.badge.googlePlay.caption')} name="Google Play" />
              </Link>
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
          <ActionLink to="list" tone="primary">
            {t('download.web')}
          </ActionLink>
          <p className="text-caption" style={{ color: 'var(--color-ios-ink-3)' }}>
            {t('download.otherPlatforms')}
          </p>
        </div>

        <nav aria-label={t('download.links')}>
          <ul className="flex flex-wrap justify-center gap-x-5 gap-y-2 text-caption">
            {FOOTER_PAGES.map((page) => (
              <li key={page}>
                <a
                  href={appInstitutionalHref(page)}
                  className="inline-flex min-h-[44px] items-center underline-offset-4 hover:underline"
                  style={{ color: 'var(--color-ios-ink-2)' }}
                >
                  {t(`download.link.${page}`)}
                </a>
              </li>
            ))}
          </ul>
        </nav>
      </main>
    </div>
  );
}

export default function DownloadScreen() {
  return <DownloadPage language={currentInterfaceLanguage()} />;
}
