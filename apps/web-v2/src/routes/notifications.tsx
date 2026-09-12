import { PendingScreen } from '@/components/pending-screen';
import { NOTIFICATIONS_DESTINATION } from '@/lib/view/floating-menu';

/**
 * NOTIFICATIONS — deuxième barreau, miroir `NotificationListView`. C'est la destination dont le bouton de droite porte la pastille de non-lus.
 *
 * L'adresse existe AVANT le contenu (#6214) : sans elle, le barreau qui la
 * vise serait un contrôle qui ment. Le contenu arrive dans son issue à lui ;
 * cet écran-ci n'en préjuge rien et se contente de dire ce qui vient.
 */
export default function NotificationsScreen() {
  return <PendingScreen destination={NOTIFICATIONS_DESTINATION} />;
}
