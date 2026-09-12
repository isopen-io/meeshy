import { PendingScreen } from '@/components/pending-screen';
import { FEED_DESTINATION } from '@/lib/view/floating-menu';

/**
 * LE FLUX — destination du bouton flottant de GAUCHE, miroir `ThemedFeedOverlay` (`RootViewComponents.swift:111`). iOS le présente en surimpression ; le web lui donne une ADRESSE, parce qu'ici une surimpression sans adresse ne se partage pas, ne se recharge pas et ne revient pas au bouton système « précédent ».
 *
 * L'adresse existe AVANT le contenu (#6214) : sans elle, le barreau qui la
 * vise serait un contrôle qui ment. Le contenu arrive dans son issue à lui ;
 * cet écran-ci n'en préjuge rien et se contente de dire ce qui vient.
 */
export default function FeedScreen() {
  return <PendingScreen destination={FEED_DESTINATION} />;
}
