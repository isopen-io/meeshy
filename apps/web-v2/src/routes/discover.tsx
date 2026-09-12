import { PendingScreen } from '@/components/pending-screen';
import { DISCOVER_DESTINATION } from '@/lib/view/floating-menu';

/**
 * DÉCOUVRIR — quatrième barreau, miroir `PeopleDiscoveryView`.
 *
 * L'adresse existe AVANT le contenu (#6214) : sans elle, le barreau qui la
 * vise serait un contrôle qui ment. Le contenu arrive dans son issue à lui ;
 * cet écran-ci n'en préjuge rien et se contente de dire ce qui vient.
 */
export default function DiscoverScreen() {
  return <PendingScreen destination={DISCOVER_DESTINATION} />;
}
