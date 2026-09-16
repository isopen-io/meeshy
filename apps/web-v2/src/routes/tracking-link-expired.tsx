import { translate } from '@/lib/i18n-catalog';
import { currentInterfaceLanguage, type InterfaceLanguage } from '@/lib/interface-language';

import { ActionLink, LinkPage, LinkText } from './link-page-parts';

/**
 * **`/l/:token/expired` — UN LIEN MORT LE DIT** (#6714). Un lien inconnu,
 * expiré, désactivé, ou dont la cible n'est pas une adresse web, aboutit ici.
 *
 * Une adresse À PART plutôt qu'un état de `/l/:token` : un rafraîchissement de
 * cette page ne recompte pas le clic, et l'adresse se partage telle quelle.
 *
 * **Aucun « continuer vers la destination ».** Le legacy le proposait ; or la
 * passerelle désactive elle-même les liens d'un contenu retiré
 * (`messageRemovalEffects.ts`) — rouvrir la cible contournerait la
 * modération. La page ne consulte donc pas la passerelle : elle n'a rien à
 * offrir de plus que le retour.
 */
export function TrackingLinkDead({ language }: { readonly language: InterfaceLanguage }) {
  return (
    <LinkPage
      glyph="linkSimple"
      tone="danger"
      title={translate(language, 'trackingLink.dead.title')}
      body={<LinkText>{translate(language, 'trackingLink.dead.body')}</LinkText>}
    >
      <ActionLink to="list" tone="primary">
        {translate(language, 'linkPage.home')}
      </ActionLink>
    </LinkPage>
  );
}

export default function TrackingLinkExpiredScreen() {
  return <TrackingLinkDead language={currentInterfaceLanguage()} />;
}
