import { PendingScreen } from '@/components/pending-screen';
import { COMMUNITIES_DESTINATION } from '@/lib/view/floating-menu';

/**
 * COMMUNAUTÉS — cinquième barreau, miroir `CommunityListView`.
 *
 * L'adresse existe AVANT le contenu (#6214) : sans elle, le barreau qui la
 * vise serait un contrôle qui ment. Le contenu arrive dans son issue à lui ;
 * cet écran-ci n'en préjuge rien et se contente de dire ce qui vient.
 */
export default function CommunitiesScreen() {
  return <PendingScreen destination={COMMUNITIES_DESTINATION} />;
}
