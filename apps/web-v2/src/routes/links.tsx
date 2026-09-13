import { PendingScreen } from '@/components/pending-screen';
import { LINKS_DESTINATION } from '@/lib/view/floating-menu';

/**
 * MES LIENS — premier barreau de l'échelle, miroir `LinksHubView`.
 *
 * L'adresse existe AVANT le contenu (#6214) : sans elle, le barreau qui la
 * vise serait un contrôle qui ment. Le contenu arrive dans son issue à lui ;
 * cet écran-ci n'en préjuge rien et se contente de dire ce qui vient.
 */
export default function LinksScreen() {
  return <PendingScreen destination={LINKS_DESTINATION} />;
}
