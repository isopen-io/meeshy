import { translate, type InterfaceCatalogKey } from '@/lib/i18n-catalog';
import { appInstitutionalHref, type InstitutionalPage } from '@/lib/institutional-href';
import type { InterfaceLanguage } from '@/lib/interface-language';
import { APP_STORE_URL, GOOGLE_PLAY_URL } from '@/lib/store-links';

import { useInterfaceLanguage } from './public-header';

/**
 * LE PIED DU SITE SOUS LA CONNEXION ET L'INSCRIPTION (#16452) — sur le WEB
 * seulement : la coque Capacitor EST déjà l'application, lui proposer de la
 * télécharger n'aurait pas de sens.
 *
 * LES BADGES OFFICIELS des deux boutiques, tels qu'Apple et Google les
 * distribuent (`public/store-badges/`) : Google Play dans chacune des langues
 * d'interface, l'App Store en anglais — la seule déclinaison officielle que le
 * dépôt embarque. Le texte alternatif, lui, est toujours dans la langue de
 * l'interface (`download.appStore`, `download.googlePlay`). Leurs dimensions
 * sont posées (aucun décalage au chargement) et leurs fichiers chargés
 * paresseusement : ils vivent sous le pli sur un téléphone.
 *
 * PUIS LES PAGES INSTITUTIONNELLES — conditions, confidentialité, contact,
 * aide, à propos — que nginx sert au chemin relatif (`institutional-href.ts`).
 */
const LINKS: ReadonlyArray<readonly [InstitutionalPage, InterfaceCatalogKey]> = [
  ['terms', 'authFooter.terms'],
  ['privacy', 'authFooter.privacy'],
  ['contact', 'authFooter.contact'],
  ['help', 'authFooter.help'],
  ['about', 'authFooter.about'],
];

export const APP_STORE_BADGE_SRC = '/store-badges/app-store-en.svg';

export function googlePlayBadgeSrc(language: InterfaceLanguage): string {
  return `/store-badges/google-play-${language}.png`;
}

const BADGE_LINK = 'grid place-items-center rounded-[10px]';

export function AuthSiteFooter({ shell = __SHELL__ }: { readonly shell?: boolean }) {
  const language = useInterfaceLanguage();
  if (shell) return null;
  return (
    <footer data-auth-site-footer className="grid w-full shrink-0 justify-items-center gap-3 px-4 pt-6 pb-4">
      <ul aria-label={translate(language, 'authFooter.apps')} className="flex flex-wrap items-center justify-center gap-3">
        <li>
          <a href={APP_STORE_URL} target="_blank" rel="noopener noreferrer" data-store="app-store" className={BADGE_LINK} style={{ minHeight: 44 }}>
            <img src={APP_STORE_BADGE_SRC} alt={translate(language, 'download.appStore')} width={120} height={40} loading="lazy" decoding="async" />
          </a>
        </li>
        <li>
          <a href={GOOGLE_PLAY_URL} target="_blank" rel="noopener noreferrer" data-store="google-play" className={BADGE_LINK} style={{ minHeight: 44 }}>
            <img src={googlePlayBadgeSrc(language)} alt={translate(language, 'download.googlePlay')} width={134} height={52} loading="lazy" decoding="async" />
          </a>
        </li>
      </ul>
      <nav aria-label={translate(language, 'authFooter.links')}>
        <ul className="flex flex-wrap justify-center gap-x-1">
          {LINKS.map(([page, key]) => (
            <li key={page}>
              <a
                href={appInstitutionalHref(page)}
                data-auth-site-link={page}
                className="inline-flex items-center rounded-chip px-2 text-caption font-medium"
                style={{ minHeight: 44, color: 'var(--color-ios-ink-2)' }}
              >
                {translate(language, key)}
              </a>
            </li>
          ))}
        </ul>
      </nav>
    </footer>
  );
}
