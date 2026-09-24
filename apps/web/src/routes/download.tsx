import { AuthColumn } from '@/components/auth-column';
import { AuthTitle } from '@/components/auth-chrome';
import { translate } from '@/lib/i18n-catalog';
import { currentInterfaceLanguage, type InterfaceLanguage } from '@/lib/interface-language';

import { ActionAnchor, ActionLink } from './link-page-parts';

/**
 * **`/download` — LE PREMIER CONTACT AVEC MEESHY** (#7297).
 *
 * C'est l'adresse que l'app publiée envoie par SMS quand on invite quelqu'un
 * de son répertoire (`DiscoverViewModel.swift:285`,
 * `PhonebookViewModel.swift:282`, gardée côté iOS par
 * `DiscoverViewModelTests.swift:271` — le lien est intentionnel, pas une
 * coquille). Elle n'était servie par RIEN : ni la table des routes, ni le
 * préchauffage institutionnel, ni `nginx.conf`. La toute première chose que
 * voyait un invité était donc « adresse inconnue », et le parrain ne l'a jamais
 * su. L'adresse vit dans un binaire déjà distribué : elle ne se corrige que
 * ici.
 *
 * ## Une PAGE, pas une redirection vers l'App Store
 *
 * Le destinataire est sur un appareil INCONNU — l'expéditeur a choisi un
 * numéro, pas une plateforme. Une redirection vers la fiche iOS enverrait un
 * visiteur Android ou de bureau vers une boutique qui n'a rien pour lui.
 *
 * ## Une ROUTE de la v2, pas un sixième document institutionnel
 *
 * Trois raisons, dans cet ordre :
 *
 *   1. **Les sept langues.** Les documents institutionnels portent leur texte
 *      en dur, en français (`src/institutional/about.ts` et ses voisins). Une
 *      page d'invitation qui s'ouvre chez un inconnu, dans le pays de son
 *      choix, est la dernière du produit à pouvoir se permettre une seule
 *      langue : elle lit le catalogue d'interface, comme tout le reste de
 *      l'application.
 *   2. **Elle CHANGERA.** Le préchauffage est réservé à des documents qui « ne
 *      changent que très rarement » (directive porteur 2026-09-07) ; celle-ci
 *      gagnera un bouton le jour où la coque Android sera publiée.
 *   3. **La forme.** `ContentPage` décrit un DOCUMENT — sections, cartes,
 *      encadrés. Cette page est deux gestes et trois lignes.
 *
 * ## Ce qu'elle promet, et rien de plus
 *
 * La fiche App Store, qui existe (`UpgradeGateView.defaultStoreURL`,
 * `utils/appVersion.ts` — la même adresse dans tout le dépôt), et le web, que
 * meeshy.me sert aujourd'hui. **Aucun lien Play Store** : la coque Android
 * n'est pas publiée, et pointer une fiche absente répéterait exactement le
 * défaut qu'on corrige. Le jour où elle l'est, c'est un `ActionAnchor` de plus
 * et une clé de catalogue — la structure l'attend.
 */

/** La fiche iOS, telle que le reste du dépôt la nomme — `UpgradeGateView.swift:24`
 *  et `services/gateway/src/utils/appVersion.ts` portent la MÊME adresse. */
export const APP_STORE_URL = 'https://apps.apple.com/app/meeshy';

export function DownloadPage({ language }: { readonly language: InterfaceLanguage }) {
  return (
    <AuthColumn className="justify-center gap-6 px-8 text-center">
      <div className="grid justify-items-center gap-1">
        <AuthTitle gradient="brand" />
      </div>
      <div className="grid gap-3">
        <h2 className="text-screen font-bold" style={{ color: 'var(--color-ios-ink)' }}>
          {translate(language, 'download.title')}
        </h2>
        <p style={{ color: 'var(--color-ios-ink-2)' }}>{translate(language, 'download.body')}</p>
      </div>
      <div className="grid gap-3">
        <ActionAnchor href={APP_STORE_URL}>{translate(language, 'download.appStore')}</ActionAnchor>
        <ActionLink to="list" tone="secondary">
          {translate(language, 'download.web')}
        </ActionLink>
      </div>
      <p className="text-caption" style={{ color: 'var(--color-ios-ink-3)' }}>
        {translate(language, 'download.otherPlatforms')}
      </p>
    </AuthColumn>
  );
}

export default function DownloadScreen() {
  return <DownloadPage language={currentInterfaceLanguage()} />;
}
